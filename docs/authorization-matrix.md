# Matriz de rotas e perfis do Billing

Quais rotas o Billing expõe, quais são protegidas e quem pode chamar cada uma. A fonte é
`src/frameworks/http/routes/`; toda rota montada em `src/app.ts` aparece aqui.

O Billing não emite token. Ele valida os dois tokens que já existem no sistema, com o mesmo segredo de
assinatura do OS Service e da função de autenticação, então não precisa chamar outro serviço para saber
quem está chamando. Os fluxos de emissão estão descritos na matriz do OS Service, em
`docs/architecture/authorization-matrix.md` do repositório `fiap-tech-challenge`.

| Token | Emissor | Claims usadas aqui |
|---|---|---|
| Funcionário | `POST /auth/login` no OS Service | `type: "staff"`, `userId`, `role` |
| Cliente | `POST /auth/cpf` na função de autenticação | `type: "customer"`, `sub` (id do cliente), `cpf` |

Token sem `type`, com `type` desconhecido ou sem o identificador do ator é recusado com 401.

## Rotas

| Método | Rota | Público | Funcionário | Cliente dono | Outro cliente |
|---|---|---|---|---|---|
| GET | `/health` | sim | sim | sim | sim |
| GET | `/ready` | sim | sim | sim | sim |
| GET | `/metrics` | sim | sim | sim | sim |
| GET | `/docs` | sim | sim | sim | sim |
| GET | `/service-orders/{id}/budget` | 401 | sim | sim | 403 |
| PATCH | `/service-orders/{id}/budget` | 401 | 403 | sim | 403 |

## Regras da decisão do orçamento

As mesmas que o OS Service aplicava antes de a rota mudar de dono:

- **Titularidade.** O cliente só decide o orçamento da própria ordem, comparando o `sub` do token com o
  cliente do orçamento. A verificação vem antes de qualquer outra, para que outro cliente não descubra nem o
  status do orçamento.
- **Código de confirmação.** Os quatro primeiros dígitos do CPF, comparados com a claim `cpf` do token.
- **Uma decisão só.** Orçamento que não está pendente responde 400.
- **Limite de tentativas.** Cinco por hora, por IP e ordem de serviço; a sexta responde 429.
