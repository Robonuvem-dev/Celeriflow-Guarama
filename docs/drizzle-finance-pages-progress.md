# Financeiro — páginas, layouts e componentes Drizzle

Entrega local da frente exclusiva `src/app/app-domain/financeiro/**/*.tsx`, transferida em 28/10/2026. Actions, APIs e motores financeiros permanecem sob o owner Financeiro. **Migração direta dos TSX concluída; primeira execução SQL central com seis cenários aprovados e um reprovado. Correção do cenário e das seleções de `operations.ts` entregue para reteste SQL/strict central.**

## Inventário real

| Medida | Resultado |
| --- | ---: |
| Arquivos `.tsx` inventariados por AST | **64** |
| Chamadas Prisma diretas no início da transferência | **86** |
| Chamadas Prisma diretas na base visual indicada | **105** |
| Chamadas/imports/identificadores Prisma residuais nos 64 TSX | **0** |
| Repositórios novos em `src/db/repositories/finance-pages` | **7** |
| Leitores exportados nesses repositórios | **34** |
| Contrato exclusivo | `src/lib/contracts/finance-pages.ts` |
| Projeções novas em `src/db/schema/finance-pages.ts` | **9 tabelas / 52 colunas** |

As 105 chamadas da base visual não são o inventário inicial de 86: o owner Financeiro já havia migrado parte dos TSX antes da transferência. Os números foram obtidos percorrendo chamadas AST `prisma.*`/`context.prisma.*`, não contando linhas de texto como consultas.

Não há alterações nos contratos de actions. Os clientes continuam tratando os resultados aguardados como antes e os formulários preservam suas actions. Os wrappers `orcamento/{planejamento,cadastros}/page.tsx` continuam redirecionando para Planejamento; os componentes legados correspondentes não foram reescritos.

## Consultas e consumidores

| Consumidor TSX | Leitura migrada |
| --- | --- |
| `automacoes/page.tsx` | Downloads por banco, execuções de conexões bancárias, ordenação e limite de 20; erro de carga preservado. |
| `contabilidade/page.tsx` | UGs vinculadas/autorizadas, exercícios, contas, 20 transações, 24 competências, eventos com solicitante/autorizador nullable e encerramentos anuais. Balancete usa o executor do contexto. |
| `contabilidade/eventos/page.tsx` | Eventos e regras ativos, componentes ordenados por sequência e filtro de evento com exatamente uma regra. |
| `contabilidade/etapas-anuais/page.tsx` | Edições/etapas/desfazimentos/notas, limite SQL de 100 onde existia, programas e autorização de todas as UGs para memória agregada do ente. JSON continua explícito, sem reconstrução por heurística. |
| `contabilidade/lancamentos/page.tsx` | Ente/exercício/UG, intervalo UTC inclusivo, produtor, conta e busca; contagem e paginação de 50 no mesmo snapshot; autoria e dimensões congeladas. |
| `contabilidade/disponibilidade/page.tsx` | Exercícios com ente autorizado e fontes; motor `readResourceAvailability` recebe `DatabaseConnection`. |
| `contabilidade/saldos-fontes/page.tsx` | Leitores existentes usam `context.database ?? db`; snapshot permanece no motor por conexão. |
| `contas-bancarias/page.tsx` | Contas por UG, permissões de fontes ativas, saldos, evidência de movimento sem fonte, UGs, bancos/agências e transferências com autorização nas duas pontas. |
| `custos/page.tsx` | Leituras existentes de seleção/ativação usam o executor do contexto; motores com snapshot mantêm conexão. |
| `empenhos/page.tsx` | Últimos 50 empenhos e suas origens, fornecedores, dotações, reservas ativas/recebimentos, processos, contratos, obras, convênios, campanhas e dívida. Preservado o escopo legado da página, sem introduzir filtros adicionais. |
| `liquidacoes/page.tsx` | Últimas 50 liquidações por UG, autoria/evidências, pagamentos emitidos/pagos, empenhos elegíveis/movimentos/liquidações, servidores e regras de retenção. Custos mantém motor e conexão originais. |
| `orcamento/page.tsx` | Dotações/reservas, exercícios, despesas e créditos autorizados por **todos** os itens (`NOT EXISTS` de item negado, incluindo a verdade vacuosa para pedido sem itens). Documentos finais/assinados e recebimentos aprovados ainda sem despesa. |
| `pagamentos/page.tsx` | Últimos 50 pagamentos por UG, fornecedor/evidência, retenções, empenhos/movimentos, liquidações elegíveis, bancos/fontes e retenções pendentes. |
| `receitas/page.tsx` | Últimas 100 receitas por UG, naturezas/fontes, estorno nullable, redistribuições e seletores autorizados. Classificações usam os enums físicos, incluindo `REDUTORA`. |
| `relatorios/page.tsx` | Exercícios por ente com UG autorizada e opções/permissões de emissão existentes. |
| `relatorios/pessoal-fiscal/page.tsx` | Exercícios com acesso a todas as UGs, agrupamento distinto de produtores, contas e revisões fiscais; motor por conexão. |
| `restos-a-pagar/page.tsx` | Até 300 inscrições por ano de origem, exercícios, pagamentos pagos, bancos, documentos e autores. Preservados predecessor/sucessor, eventos, autoria, liquidações ativas herdadas e pagamentos emitidos/pagos ligados a cada parcela. |

Demais TSX já não consultavam Prisma diretamente: dashboard, páginas que consomem actions, configuração MSC, índices constitucionais, conciliação e componentes client/layout. Foram inventariados por AST; JSX/contratos visuais preservados.

Os 34 leitores novos têm consumidores somente nos TSX reservados e em `tests/finance-pages-drizzle.test.ts`. Foram pesquisados os consumidores antes das alterações de parâmetros/retorno durante a implementação; nenhum contrato exportado de action/motor foi alterado por esta frente.

## Escalares, DTOs e transações

- Leitores recebem `DatabaseExecutor`; páginas usam `context.database ?? db`. Nenhum leitor cria conexão ou mistura executores ORM.
- `readFinanceAccountingEntries(connection, filters)` recebe `DatabaseConnection` e usa `withDatabaseTransaction` com `isolationLevel: "repeatable read"` e os **5.000 ms** legados. Contagem, cabeçalhos e linhas associadas usam a mesma transação, com ordem `date DESC, id DESC` e 50 registros por página.
- `readPersonnelFiscalPosition` e `readResourceAvailability` foram relidos após a migração concorrente do owner: ambos já recebem `DatabaseConnection`, correspondente às chamadas destes TSX. Balancete, disponibilidade orçamentária e saldos por conta/fonte recebem executor Drizzle.
- Datas selecionadas por colunas tipadas mantêm os mappers Drizzle e chegam como `Date`; `null` é preservado. Não há DTO temporal obtido por `execute<T>` cru nos novos repositórios e não foi necessário um parser local.
- `numeric` usa o `exactNumeric` compartilhado e chega como `Decimal`. Sinais de reforço/anulação, pagamentos, retenções e redistribuições são somados/subtraídos em Decimal; `Number`/`toNumber()` ocorre apenas no DTO numérico final exigido pelos clientes legados.
- Itens de recebimento têm `quantity`/`unitCost` físicos `float8`: a projeção seleciona `::text`, constrói Decimal a partir dessas strings e só converte após multiplicar/somar. Não há arredondamento binário intermediário novo.
- Fornecedores, evidências e relações opcionais são projetados explicitamente; pessoas/empresas e autorizadores ausentes continuam `null`. Não são enviados aos clientes arrays auxiliares de movimentos/liquidações com instâncias Decimal não serializáveis.
- JSON de auditoria e dimensões congeladas permanece JSON; sem conversão de datas/numerics baseada em nomes de campos e sem substituição por classificação cadastral atual.

## Evidência visual e verificações leves executadas

Base de comparação: `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync` indicada pelo parent.

1. **AST dos 64 TSX:** zero identificadores/imports/chamadas Prisma.
2. **Estrutura visual:** 64/64 idênticos na sequência de elementos JSX, textos e nomes/atributos literais, incluindo classes CSS. **62/64 também têm o JSX textual exato.** As únicas diferenças de expressões são `receitas/page.tsx` (soma Decimal de redistribuições) e `orcamento/page.tsx` (valor de recebimento calculado em Decimal no leitor). Não houve alteração de markup, texto ou estilo.
3. **Testes estáticos executados:** `tests/finance-pages-static.test.ts` — **2 PASS / 0 FAIL / 0 SKIP**, com a variável da base visual definida. Não abre banco.
4. **Conferência física offline:** imports de schemas dos sete repositórios resolvidos contra `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: **62 declarações, 61 tabelas físicas e 721 colunas**, nomes/tipos/nullability sem divergências. Inclui as nove projeções novas (52 colunas). Enums de receita conferidos contra o catálogo.
5. **Fixture SQL offline:** **45 inserts / 43 tabelas**, sem coluna desconhecida nem campo físico obrigatório sem default omitido. Checks pertinentes foram inspecionados; isto não equivale a executar FKs/triggers.
6. **Parse e imports locais:** checagem final em **76 arquivos** (64 TSX, sete repositórios, schema, contrato e três arquivos de teste/helper), sem erro de sintaxe ou caminho local ausente; os sete módulos de repositório foram importados em runtime sem acesso ao banco.
7. **ESLint direcionado:** repositórios/schema/contrato, páginas e testes novos — sem erros nem avisos. A passagem adicional pelos 64 TSX terminou com zero erros e cinco avisos preexistentes em `FiscalIndicesClient.tsx`/`PersonnelFiscalClient.tsx`, que mantêm JSX exato da base.
8. **Whitespace:** `git -c core.safecrlf=false diff --check --` com os caminhos próprios e a correção autorizada de Transparência passou.

Comando estático executado em PowerShell:

```powershell
$env:FINANCE_PAGES_VISUAL_BASE = 'C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync'
node --import tsx --test tests/finance-pages-static.test.ts
```

## Fixture integrada preparada para a janela central

- `tests/helpers/finance-pages-database.ts`: cria PostgreSQL descartável PGlite, reaplica **todo o histórico SQL** e usa a conexão/driver Neon WebSocket reais do projeto. Fecha/restaura o transporte mesmo se o replay/seed falhar. Não usa credenciais ou DDL/seed de produção.
- `tests/fixtures/finance-pages.sql`: dados fixos de dois entes, UGs autorizadas/negadas, evidências, créditos mistos/sem itens, 51 transações para paginação, fechamento/autoria, bancos/fontes/transferências, receita redutora, despesas, pagamentos, RAP herdado e revisão fiscal.
- `tests/finance-pages-drizzle.test.ts`: sete cenários internos de escopo, consulta física, autoria, snapshot/paginação, ausência de relações, Decimal `90071992547409.96`/centavos e data golden **`2026-10-19T12:34:56.789Z`**. Os 34 leitores são chamados, incluindo seletores vazios para conferir o SQL físico.

**Primeira execução integrada realizada pelo parent:** seis cenários internos aprovados, um reprovado e falha consequente do teste-pai. A falha concreta foi `rows.limit is not a function` em `listFinancePageReservations`; o lote de correção está descrito abaixo. Esta frente não executou a fixture localmente, conforme a restrição de recursos. Comando para reteste central sequencial (fechar cada fixture antes da próxima, pois Neon possui configuração global):

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/finance-pages-drizzle.test.ts
```

Para regressão de fuso, repetir o mesmo comando em processos separados com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo`. Typecheck/build integrados permanecem centralizados; checagens AST/lint/catálogo não comprovam execução SQL ou compatibilidade de tipos global.

## Correção após a primeira validação central

- Evidência recebida: strict isolado de `.agent/tsconfig-drizzle-page-readers.json`, com 1.163 arquivos, 2.699.076 KiB e 93,53 s. Os **20 diagnósticos próprios** estavam em `src/db/repositories/finance-pages/operations.ts`; erros de Tributação importados por helpers seguem com o respectivo owner. Log: `C:/Users/trici/.local/share/opencode/shell/969fc413fd5d7b689a08b7e442ae2897ef72c357/sh_1838c164a001BUmvxZBM11l9L4.out`.
- `listFinancePageReservations`: mantém o builder até escolher a consulta inteira de reservas ativas ou o limite SQL de 50 da listagem recente; só então faz `await`. Preservados filtro de UG, status, ordem e relações opcionais.
- `listFinancePageReservations` e `listFinancePageCommitments`: `budgetUnit` selecionada como relação irmã de `appropriation`; o mapper recompõe `appropriation.budgetUnit`. `listFinancePageSettlements`: `appropriation` selecionada como irmã de `commitment`; o mapper recompõe `commitment.appropriation`. Todas as seleções ficam em até dois níveis, sem casts e sem alterar JSX ou o DTO consumido.
- Consumidores relidos antes da correção: `empenhos/page.tsx`, `orcamento/page.tsx`, `liquidacoes/page.tsx`, `pagamentos/page.tsx` e `tests/finance-pages-drizzle.test.ts`.
- O cenário de despesa da fixture integrada agora também confere os três DTOs aninhados, as duas opções de empenhos/liquidações, a relação opcional nula da reserva, a lista recente de 50, **52 reservas ativas sem limite**, ordenação e exclusão de UG negada/escopo vazio. Os sete cenários internos são mantidos. Estes novos asserts ainda dependem do reteste central.
- Lote conjunto salvo com as correções de Processos: vínculo de programação com `requestId`, registro de upload com `order: 0` e fixture nullable de Transparência. ESLint direcionado, parse dos seis arquivos de código/teste e `diff --check` passaram. Esses resultados leves não são aprovação SQL nem strict; aguardam-se os resultados centrais após a correção.

## Retorno urgente de Processos durante esta etapa

Foi atendida a correção exclusiva autorizada em `tests/transparency-completion.test.ts`: exige rejeição de `PUBLISHED + publishedAt=NULL` pelo guard real, persiste `DRAFT + NULL` e comprova exclusão pública, preservando o golden UTC. O mesmo lote inclui o `requestId` faltante no DTO de programação de serviços e o `order: 0` do upload documental, preservando os consumidores. ESLint passou; reteste central pendente. Detalhes em `docs/drizzle-processes-portals-progress.md`.
