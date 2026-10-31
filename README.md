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
