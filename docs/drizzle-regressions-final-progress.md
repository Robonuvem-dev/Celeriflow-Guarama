# Regressões residuais — Drizzle nativo

## Recorte entregue

- Convertidos os oito testes: `active-debt-collection-chain`, `configured-license-signature`, `configured-licenses`, `economic-events-vehicles`, `simples-option-files`, `tax-accounting-movements`, `tax-annual-batches`, `tax-annual-options-rollover`.
- Nova `tests/helpers/tax-residual-drizzle-fixture.ts`: conexão Neon/Drizzle real sobre loopback, replay integral do histórico por `createTaxationDrizzleFixture`, seed SQL explícito de atores, UG/ente/jurisdição, exercício, empresa, contribuinte, banco e regras contábeis. Sem DMMF, ORM emulado ou URL remota. Os serviços transacionais recebem `connection`; leituras e inserts recebem o executor `db`.
- Operações Prisma substituídas individualmente por queries Drizzle tipadas; valores exatos usam `Decimal`, registros pai/filho contábeis são inseridos em transação real, e as alterações deliberadamente inválidas continuam exercitando os triggers físicos.
- `financeDatabaseError` verifica a causa PostgreSQL das rejeições físicas mantendo os mesmos regex originais; impede que texto SQL ou parâmetros sejam confundidos com erro do guard.
- História de consulta contábil agora insere a receita canônica antes do vínculo de arrecadação, satisfazendo a FK histórica que a fixture anterior não instalava.

## Fixture financeira e seis consumidores

`tests/fixtures/finance-legacy-stories.sql` vincula UG e exercício 2026 a `finance-stories-entity` por `PlanningEntityScope`/`PlanningEntityUnit`. O helper verifica explicitamente que dotação, UG e exercício apontam para o mesmo ente. Os exercícios 2099/2100 do RAP também recebem esse ente; o teste preserva segregação, valores, sucessor e ausência de pagamento.

`financeiro-lagoaseca` autoriza a UG efetiva do ator; os seletores de exercício em Lagoa Seca, política de compras e fechamento usam o ente explícito. `revenue-lifecycle` informa a UG no lançamento sem banco. As três contas bancárias têm contas analíticas **distintas**, respeitando `BankAccount_accountingPlanId_key`, e a conta de receita possui permissão explícita para as duas fontes da redistribuição. A transferência tem uma regra de referência ativa própria. Nenhuma constraint, FK, trigger ou guard de produção foi alterado.

Os outros dois consumidores, `financial-documents` e `commitment-protocol-gate`, já usam dados/atores compatíveis e foram executados no recorte.

## Preservação dos oráculos

Comparação AST read-only contra HEAD: todas as contagens de chamadas `assert.*` foram preservadas:

| Teste | Antes → depois |
| --- | ---: |
| active-debt-collection-chain | 40 → 40 |
| configured-license-signature | 16 → 16 |
| configured-licenses | 32 → 32 |
| economic-events-vehicles | 9 → 9 |
| simples-option-files | 12 → 12 |
| tax-accounting-movements | 20 → 20 |
| tax-annual-batches | 34 → 34 |
| tax-annual-options-rollover | 8 → 8 |
| accounting-close-workflow | 25 → 25 |
| financeiro-lagoaseca | 99 → 99 |
| procurement-origin-policy | 6 → 6 |
| revenue-lifecycle | 14 → 14 |

O helper financeiro acrescenta uma pré-condição de coerência de escopo. Zero skips adicionados. Os títulos, valores esperados, concorrência por `Promise.all` e falhas injetadas por triggers foram mantidos.

## Validação

- TypeScript via `createProgram` com opções do projeto, raízes restritas aos testes/helpers alterados, sem emit/incremental: **zero diagnósticos nos arquivos e no grafo importado**.
- ESLint final dos oito testes tributários, quatro consumidores financeiros alterados e dois helpers: **zero erros e zero warnings**.
- Runtime aprovado: dívida ativa EXECUTIVE/LEGISLATIVE e lote anual EXECUTIVE/LEGISLATIVE (4/4); alvarás configurados, evento/veículo, Simples TXT e calendário bissexto (4/4); assinatura privada/PDF/integridade (1/1).
- Consulta contábil: EXECUTIVE e LEGISLATIVE aprovados (2/2), incluindo receita ausente de exercício, FK canônica, recortes, estorno e rejeições de autorização.
- Runtime financeiro: protocolo, documentos e políticas aprovados (3/3); execução final de receitas aprovada (1/1); execução final de fechamento e Lagoa Seca aprovada (12/12).
- **Resultado acumulado do recorte: 27 casos aprovados, zero skips** (11 tributários + 16 financeiros, em comandos separados). O resultado não representa execução das demais suítes do workspace.
- Execuções intermediárias sofreram `Fatal process out of memory: Zone` em workers durante concorrência de verificações do workspace, inclusive com heap de 512 MB. Reexecuções financeiras sequenciais com heap de **256 MB** concluíram com sucesso; falhas OOM não foram contabilizadas como aprovação.

Comando do recorte em geral:

```powershell
node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-concurrency=1 <arquivos-do-recorte>
```

Execuções finais financeiras que resolveram as pendências:

```powershell
node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/financeiro/__tests__/revenue-lifecycle.test.ts
node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-concurrency=1 src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts src/lib/financeiro/__tests__/accounting-close-workflow.test.ts
```

Sem build global, commit ou push. `src/lib/tributacao/index.ts` e `scope.ts` pertencem ao outro agente e não foram editados nesta entrega.
