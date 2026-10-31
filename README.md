# Billing Service

Orçamento e pagamento das ordens de serviço da oficina. É um dos três microsserviços do Tech Challenge
da Fase 4, ao lado do OS Service e do Execution Service.

O serviço gera o orçamento de uma ordem a partir das linhas que o OS Service envia, registra a decisão
do cliente e cobra o orçamento aprovado pelo Mercado Pago. Ele conversa com os outros serviços só pelas
filas da saga; as rotas HTTP são as que o cliente, os funcionários e o provedor de pagamento chamam.

> Este README cresce junto com o serviço. A documentação de arquitetura do sistema inteiro, com as
> decisões e os diagramas, fica no repositório do OS Service, em `docs/architecture/`.

## Repositórios

| Repositório | Papel |
|---|---|
| [fiap-tech-challenge](https://github.com/diandria/fiap-tech-challenge) | OS Service e documentação central |
| fiap-tech-challenge-billing | Este serviço |
| [fiap-tech-challenge-execution](https://github.com/diandria/fiap-tech-challenge-execution) | Execution Service |
| [fiap-tech-challenge-infra-k8s](https://github.com/diandria/fiap-tech-challenge-infra-k8s) | Cluster, gateway, filas e observabilidade |
| [fiap-tech-challenge-infra-db](https://github.com/diandria/fiap-tech-challenge-infra-db) | Banco do OS Service |
| [fiap-tech-challenge-lambda](https://github.com/diandria/fiap-tech-challenge-lambda) | Funções de autenticação e notificação |

## Execução local

Pré-requisitos: Docker e Node.js 22.

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:migrate
```

Sobe `app` (porta 3001), `postgres` (porta 5433) e `localstack` (porta 4567). As portas são diferentes
das do OS Service, para os dois poderem rodar juntos.

| Rota | Para que serve |
|---|---|
| `GET /health` | Vivacidade; não consulta o banco |
| `GET /ready` | Prontidão; responde 503 se o banco não responde |
| `GET /metrics` | Métricas no formato do Prometheus |
| `GET /docs` | Swagger |
| `GET /service-orders/{id}/budget` | Orçamento da ordem, para o cliente dono ou para funcionários |
| `PATCH /service-orders/{id}/budget` | Aprovação ou rejeição do orçamento pelo cliente dono |
| `POST /payments/notifications` | Notificação de pagamento do Mercado Pago, aceita só com assinatura válida |
| `POST /payments/mock/{serviceOrderId}` | Pagamento simulado, só com `PAYMENT_PROVIDER=mock` e token de admin |

Quem pode chamar cada rota está em [docs/authorization-matrix.md](docs/authorization-matrix.md).

## Pagamento

O orçamento aprovado é cobrado pelo Checkout Pro do Mercado Pago. Quando o OS manda `RequestPayment`, o
Billing cria a preferência com o total do orçamento e guarda o link de pagamento, que o cliente vê em
`GET /service-orders/{id}/budget`.

| Variável | Para que serve |
|---|---|
| `MERCADO_PAGO_CLIENT_ID` e `MERCADO_PAGO_CLIENT_SECRET` | Credenciais da aplicação, trocadas por um token de curta duração (`client_credentials`) |
| `MERCADO_PAGO_NOTIFICATION_URL` | Endereço público de `POST /payments/notifications`, chamado pelo Mercado Pago |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Segredo do webhook da aplicação, usado para conferir a assinatura de cada notificação |

Quando chega uma notificação assinada, o Billing consulta o pagamento na API e responde à saga com
`PaymentConfirmed` ou `PaymentFailed`. Pagamento aprovado com valor diferente do orçamento conta como
recusa (`AMOUNT_MISMATCH`).

Sem nenhuma delas o serviço sobe sem provedor de pagamento, e os pedidos de cobrança falham até um ser
configurado. Com só parte delas, o serviço não sobe.

### Pagamento simulado

Com `PAYMENT_PROVIDER=mock`, um provedor simulado substitui o Mercado Pago, e o `docker compose` local já
sobe assim. Só muda quem diz "pago" ou "recusado": orçamento, cobrança, confirmação, outbox e resposta à
saga são os mesmos de produção. O link de pagamento aponta para `POST /payments/mock/{serviceOrderId}`, que
um admin chama com `{ "status": "approved" }` ou `{ "status": "rejected" }`. Essa rota só existe no modo
simulado, e o webhook do Mercado Pago só existe no modo real; o serviço registra um aviso ao subir no modo
simulado.

`PAYMENT_PROVIDER` aceita `mercado-pago` ou `mock`; outro valor impede o serviço de subir. Sem a variável, o
serviço usa o Mercado Pago quando as variáveis dele estão definidas.

O link guardado é o `init_point` da preferência. A API também devolve um `sandbox_init_point`; qual dos dois
abre a compra de teste com credenciais de teste ainda precisa ser confirmado no sandbox.

## Avisos ao cliente

Depois de gerar o orçamento, o Billing publica `BUDGET_READY`; depois de criar a cobrança, publica
`PAYMENT_REQUESTED` com o link de pagamento. Os dois vão para o tópico de notificações da Fase 3, no
contrato do ADR-003 estendido pelo ADR-015, e a função de notificações entrega ao cliente.

| Variável | Para que serve |
|---|---|
| `NOTIFICATION_CHANNEL` | `console` (padrão) só registra o aviso no log; `sns` publica no tópico |
| `SNS_TOPIC_ARN` | Tópico de notificações; obrigatório com `NOTIFICATION_CHANNEL=sns` |

O aviso é melhor esforço: sai depois do commit, e uma falha no envio fica no log e na métrica
`integration_failures_total`, sem desfazer o orçamento nem a cobrança.

## Infraestrutura

O banco do Billing é provisionado por este repositório, na pasta `terraform/`, com estado próprio
(`billing/terraform.tfstate`, no mesmo bucket dos outros repositórios). Um `apply` aqui nunca toca o banco
do OS Service, e o contrário também vale. Filas, cluster e registro de imagens são plataforma
compartilhada e ficam no `infra-k8s`.

| Recurso | Detalhe |
|---|---|
| RDS PostgreSQL 16 `car-repair-shop-billing-db` | `db.t3.micro`, criptografado, sem acesso público |
| Security group | Porta 5432 aberta só para a faixa da VPC |
| Senha | Gerada pelo Terraform e guardada no SSM em `/car-repair-shop/billing/db/password` |

As pipelines de infraestrutura só rodam quando `terraform/` muda:

| Workflow | Quando | O que faz |
|---|---|---|
| `Infra CI` | Pull request | `fmt`, `validate`, `tflint`, `trivy` e a checagem de entrada pública; não precisa de credencial |
| `Infra CD` | Merge na `main` | `apply` e confirmação de que a instância está disponível e privada |
| `Infra destroy` | Manual, digitando `production` | `destroy` do ambiente |

O `Infra CD` e o `Infra destroy` usam os segredos `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e
`AWS_SESSION_TOKEN` do repositório. As credenciais do Learner Lab expiram a cada sessão, então é preciso
atualizá-las antes de rodar.

Para validar localmente:

```bash
cd terraform
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
tflint --init && tflint
python3 ../scripts/check-no-public-ingress.py
trivy config .
```

## Testes

```bash
npm test                # unitários e de integração (o Testcontainers sobe Postgres e LocalStack)
npm run test:coverage   # com relatório de cobertura; o mínimo é 80%
```

Os testes de integração seguem o padrão GIVEN / WHEN / THEN.
