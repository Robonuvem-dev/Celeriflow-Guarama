# Migração final — ensaio de suprimentos Aurora

## Escopo concluído nesta rodada

- `scripts/verify-aurora-procurement-journey.ts` migrou integralmente para consultas e inserções Drizzle nativas, usando os schemas existentes.
- Foram removidos o import de `@prisma/client`, o import dinâmico inexistente de `src/lib/prisma`, os delegates Prisma e o proxy de transações.
- Reutilizados `withDatabaseTransaction` e `inDatabaseTransactionScope`; nenhum helper novo foi necessário.
- A transação externa permanece `serializable`, com timeout de 120 segundos e erro sentinela para rollback deliberado. Transações dos serviços usam savepoints PostgreSQL nativos.
- A conexão passada aos serviços contém `db: tx` e o pool original. Isso também mantém leituras diretas via `connection.db` — inclusive a leitura do recebimento antes de criar a despesa — dentro da transação do ensaio. Essa mesma conexão é a chave do escopo transacional.
- As assinaturas dos serviços consumidos foram conferidas nos módulos de compras, financeiro, tributação, patrimônio e catálogo contábil. Nenhuma assinatura exportada foi alterada.

## Cobertura preservada

Os dois escopos (`exe` e `leg`) continuam exercitados em todos os modos:

1. Exigir solicitações em `Rascunho` antes de operá-las; aprovar e formar processo com três itens.
2. Criar contrato/documento transitórios; receber separadamente consumo e patrimônio; conferir replay idempotente do recebimento e três itens recebidos.
3. Conferir estoque físico de papel em 10 unidades; criar requisição e item por inserts explícitos na mesma transação; aprovar e entregar duas unidades; exigir status `Atendida` e saldo final de 8.

Com `--financial` (também habilitado por `--payments`):

4. Solicitar/aprovar despesa do recebimento, reservar orçamento, empenhar e liquidar R$ 3.500,00; conferir vínculo entre empenho e recebimento.
5. Exigir duas transações contábeis, duas partidas em cada, entidade/UG de origem corretas, snapshots congelados com entidade, UG e natureza de informação `O`, e valor Decimal de R$ 3.500,00 em cada partida.
6. Rejeitar classificação fora da UG adotante; incorporar o bem recebido e conferir UG e valor de aquisição Decimal.

Com `--payments`:

7. Configurar mapeamento tributário transitório; copiar perfil contábil por UG quando necessário; obter/criar contribuinte; lançar IPTU, gerar guia e confirmar pagamento tributário nativo de R$ 3.500,00.
8. Conferir acréscimo de caixa sobre o saldo inicial; criar ordem de pagamento; rejeitar confirmação sem UG autorizada; confirmar e repetir a confirmação.
9. Conferir entidade/UG, duas partidas, crédito na conta de pagamento pelo valor exato e um único movimento `PAYMENT_CONFIRMED`; conferir retorno ao saldo inicial após pagar.
10. Estornar pagamento com justificativa; conferir duas partidas de estorno ligadas à postagem original e devolução de R$ 3.500,00 ao caixa.

Após rollback, inclusive quando ocorre falha intermediária:

- Comparar antes/depois das 18 contagens originais: processos, contratos, recebimentos, estoques, movimentos, requisições, despesas, empenhos, liquidações, pagamentos, tesouraria, receitas, lançamentos tributários, pagamentos tributários, registros tributários, bens, transações e partidas contábeis.
- Comparar integralmente os mapeamentos financeiros tributários e perfis `ACCOUNTING_PROFILE`, ordenados por ID.
- Exigir novamente `Rascunho` nas duas solicitações.
- Emitir evidências e falha no JSON e propagar falhas após as conferências; encerrar o pool em `finally`.

Os limites declarados nas evidências permanecem: reconhecimento contábil patrimonial, valoração monetária de estoque, custos e saldos de abertura dependem de validações próprias.

## Checks leves executados

- `npx --no-install eslint scripts/verify-aurora-procurement-journey.ts` — passou.
- Parse/transpilação isolada com `typescript.transpileModule`, sem execução do script — passou.
- Resolução estática de 27 imports, conferência dos named exports locais e resolução do import dinâmico do cliente — passaram. O verificador trata módulos nativos `node:` separadamente.
- Busca por `Prisma`, `prisma`, `Proxy`, delegates antigos e métodos transacionais Prisma no script — sem ocorrências.
- `git diff --check -- scripts/verify-aurora-procurement-journey.ts` — passou, com aviso de normalização LF/CRLF do Git.

Esses checks não constituem validação de tipos global nem evidência de execução/rollback no banco.

## Rodada central e runtime pendentes

Os comandos abaixo são pendências para execução central em ambiente de ensaio autorizado, com os fixtures Aurora correspondentes e configuração contábil compatível com os catálogos instalados. O script realiza escritas transitórias antes do rollback; não foi executado contra banco remoto nesta rodada.

```powershell
npx --no-install tsx --conditions=react-server scripts/verify-aurora-procurement-journey.ts
npx --no-install tsx --conditions=react-server scripts/verify-aurora-procurement-journey.ts --financial
npx --no-install tsx --conditions=react-server scripts/verify-aurora-procurement-journey.ts --payments
```

Confirmar em cada execução: ausência de falha, evidências dos dois escopos, `rollbackVerified: true`, igualdade das contagens e restauração dos mapeamentos/perfis/rascunhos. A validação global de tipos e `npm run build` ficam para a rodada final central. Nenhum commit, push ou troca de branch foi realizado nesta responsabilidade.
