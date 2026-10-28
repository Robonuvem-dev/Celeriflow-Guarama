# Saúde — páginas de Farmácia: entrega exclusiva Drizzle

## Escopo e referência

Recorte concluído nos **17 TSX** atuais de `src/app/app-domain/saude/farmacia/**`: o inventário real contém **9 páginas com consultas** e **8 componentes auxiliares**. As 9 páginas foram migradas; os 8 componentes foram auditados e permanecem integralmente iguais à referência.

Antes do código foi lido o guia instalado `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`. As consultas continuam nos Server Components, após `getTenantContextForModule("SAUDE")`, com os mesmos contratos assíncronos de `searchParams`.

Os fingerprints JSX foram capturados **antes da primeira edição**, da referência main-sync informada como inalterada em Farmácia em relação ao commit original **`5cfa75dfe20a6d3fcc20dce33e818585cb8b9954`**. O AST test contém esses fingerprints fixos; não os recalcula a partir da implementação migrada. Não depende de Git, diretório de worktree, catálogo privado, caminho Windows ou SKIP no CI.

### Arquivos entregues

- Alterados somente os 9 `page.tsx`: raiz, `catalogo`, `chamadas`, `dispensacoes`, `inventario`, `judicial`, `kits`, `notas` e `requisicoes`.
- Auditados sem alteração: `HealthReceiptForm`, `InvoiceImportForm`, `DispensationHistoryCard`, `JudicialCaseForm`, `JudicialDispensationForm`, `KitCompositionForm`, `CareProgramForms` e `PharmacyRequestForm`.
- Novos leitores exclusivos em `src/db/repositories/health-pharmacy-pages/`: `common.ts`, `stock.ts`, `catalog.ts`, `calls.ts`, `inventory.ts`, `dispensations.ts`, `judicial.ts`, `kits.ts`, `requests.ts`.
- Novos `src/db/schema/health-pharmacy-pages.ts` e `src/lib/contracts/health-pharmacy-pages.ts`.
- Novos `tests/drizzle-health-pharmacy-pages.test.ts` e `tests/drizzle-health-pharmacy-pages-ast.test.ts`.

Foram conferidos os imports/usos dos oito componentes e seus props, os nomes das actions e os padrões de resultado nos formulários client antes da migração. Nenhuma assinatura pública existente, parâmetro de action, contrato de resultado ou JSX foi alterado. Os leitores novos mantêm nomes/campos usados pelos callbacks originais e os DTOs dos componentes, incluindo quantidades `number` e datas `Date` reais.

## Contrato de conexão, escopo e leitura

Todas as páginas injetam **`context.database ?? db`**. Todos os leitores recebem **`DatabaseExecutor`** e usam exclusivamente esse executor, inclusive para relações aninhadas. Os repositórios não importam cliente global, não abrem conexão/transação e não emulam delegates. Contagem, paginação e leituras paralelas preservam a sequência original; o antigo `Promise.all` não foi convertido em uma transação proprietária. Quando o caller fornece a tx original, todas as leituras permanecem nela.

Mantida literalmente nas páginas a derivação original:

```ts
context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined
```

`undefined` continua significando ausência da restrição por unidades; `[]` continua negando os registros sujeitos a esse filtro. Os leitores não acrescentam política de UG, atividade do funcionário, unidade de referência ou vínculo profissional onde a consulta original não a exigia. Mantido também `assertHealthUnitAccess(context.user, params.unitId)` antes da consulta de dispensações com unidade explícita.

| Leitura | Regra original preservada |
| --- | --- |
| Estoque principal/opções e entradas | Perfil de saúde ativo; estoque com unidade de saúde ou unidade autorizada. A lista principal não exige material/warehouse ativo nem saldo positivo. |
| Opções de warehouses | Ativo e vinculado a unidade de saúde/autorizada. |
| Opções de pacientes | `status = Ativo` e unidade de referência autorizada somente quando existe escopo. |
| Disponibilidade em dispensações | Saldo positivo, sem bloqueio, validade nula ou futura, warehouse ativo e medicamento ativo. |
| Disponibilidade judicial | Mesmas condições físicas e warehouse ativo; não acrescenta filtro de medicamento/perfil. |
| Disponibilidade de requisições | Mesmas condições físicas e warehouse ativo, perfil ativo e material opcional. |
| Disponibilidade de kits | Mesmas condições físicas e unidade de saúde/autorizada; não exige warehouse ativo. |
| Entregas de kit e chamadas/pedidos do painel | Unidade autorizada quando há escopo; sem esse escopo, não acrescenta `healthUnitId IS NOT NULL`. |
| Transferências em trânsito | Acesso pela unidade de origem **OU** destino, preservando a outra ponta da transferência no DTO. |
| Processos judiciais | Escopo da unidade do caso; menu de protocolos pelo paciente ativo/unidade de referência original. |
| Profissionais | Ativo; funcionário também ativo somente no menu judicial. A listagem comum não ganha esse filtro adicional. |
| Pessoas retirantes/advogados, fornecedores, compras e catálogos de referência | Escopos originais, sem nova restrição de unidade/UG. |

Arrays SQL são enviados em **um parâmetro ligado** por `ANY($n::text[])`, incluindo o array vazio. Buscas `ILIKE`, seleção exata de nome do estoque, filtros opcionais e tratamento de whitespace continuam específicos de cada tela. A busca insensível de código/ID de receita usa o padrão original, sem acrescentar `%`; preserva a semântica PostgreSQL dos caracteres de padrão. A política de recebimento mantém `LIKE` case-sensitive pelo prefixo original.

## Ordenação, limites, tipos e relações

- Mantidos os filtros por status validados pelos mesmos mapas `states` das páginas; o filtro inválido continua omitido. O catálogo mantém RENAME/REMUME, material e perfil ativos.
- Estoque: validade **ASC NULLS LAST**, criação DESC, página de **20**, opções de **500**. Catálogo: nome ASC + id ASC. Dispensações: data DESC + id DESC. Demais listas e eventos mantêm suas ordenações originais, inclusive a ausência de ordenação onde não havia.
- Mantidos limites de **30** entradas; **100** receitas; **200** pacientes/itens/fornecedores/compras/chamadas de pedido onde aplicável; **500** pacientes da raiz/protocolos; **1000** disponibilidades/itens de receita; **50** pessoas; **20** históricos e páginas. Não foram acrescentados desempates às consultas que não os tinham.
- As contagens consideram o filtro de pais, sem multiplicação por itens. Relações são carregadas por IDs de pais já selecionados; `EXISTS` preserva o filtro por material/nome em pedidos sem duplicar sua contagem.
- Datas são selecionadas por colunas `timestamp` Drizzle com decoder real, não por genéricos SQL falsamente anotados como `Date`. Não há seleção raw de timestamp nos leitores; portanto não existe raw timestamp sem `databaseTimestamp`. Os limites de dia de dispensação continuam **00:00 -03:00** e término exclusivo + **86400000** ms, após o mesmo `z.iso.date().safeParse`.
- Campos físicos Float continuam `number`, incluindo frações de quantidade/custo/conversão. Os `numeric` de movimentos continuam pelo `exactNumeric`/`Decimal` já existente, sem conversão intermediária para Number.
- JSONB permanece JSON, preservando null, strings numéricas, arrays e snapshots; não há parse duplicado, cast de persistência ou normalização de evidência.
- Preservadas relações nullable, pacientes/pessoas, origem/destino, recebedor, lotes, composição e versão, documentos, eventos e somente dispensações **ACTIVE** nos saldos de receita/caso judicial. Movimentos/fulfillments de pedidos mantêm Float, Decimal e vínculos de transferência/estoque originais.

## Mapping físico

Reutilizados os mappings existentes de estoque, Farmácia, prescrições, cadastro, unidades/profissionais, programas, regulação, identidade, pessoas, fornecedores, processos, compras, documentos, localidades e configuração. Não houve edição de nenhum desses schemas.

Apenas **2 projeções complementares / 6 colunas** foram necessárias no novo schema exclusivo:

- `HealthStockReceipt`: `id`, `entryType` obrigatório e `donorName` nullable.
- `HealthStockReceiptItem`: `id`, `expirationDate` TIMESTAMP(3) nullable e `manufacturerName` nullable.

Elas complementam os mappings de recibo já existentes por join de ID. Conferidas contra o catálogo físico original e o SQL histórico: baseline `20261009232000_baseline` e `20261015010000_health_internal_receipt_observation`. São projeções de leitura; não registram DDL ou migração.

Após disponibilizada pela frente externa, a fixture pública versionada `tests/fixtures/installed-physical-catalog.json` também foi usada para auditoria pura: **53 projeções reutilizadas/exclusivas, 610 colunas**, com nomes, tipos físicos e nullability conferidos. Origem pinned `bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d`, catálogo SHA-256 `1b6ca54c94a3aa6638ad61324483b32773ceb45efbd90020a49e6dce9b5497cb`; o digest do catálogo foi conferido. Essa fixture não foi criada nem alterada por esta frente.

O mapping test da suíte real faz introspecção do catálogo **do replay descartável**, sem depender de captura privada ou dessa fixture externa no CI.

## Evidência executada a 128 MB

- **PASS:** AST test portátil, **1 teste / 0 FAIL / 0 SKIP**, comparando os **17 JSX ASTs** e os **8 componentes completos**, além de conexão injetada, guard do módulo/escopo e limites de data.
- **PASS:** parser TypeScript dos **30 TS/TSX** desta entrega, resolução dos imports relativos e scan nominal dos 17 TSX e da infraestrutura exclusiva sem Prisma, delegates ou casts de persistência.
- **PASS:** import puro dos **9 módulos** de repositório, sem abrir conexão, importar fixture de banco ou serviços compartilhados.
- **PASS:** auditoria física pura das 53 projeções / 610 colunas descrita acima.
- **PASS:** auditoria dos **54 INSERTs nominais** preparados no teste contra as colunas físicas públicas originais, incluindo todos os campos obrigatórios sem default SQL. Essa verificação detectou e corrigiu o `createdByUsuarioId` obrigatório da transferência antes do handoff.
- **ESLint normal:** 29 arquivos passam; um unused import apontado foi removido e rechecado. A página raiz excede o heap de 128 MB na análise do React Compiler, também isoladamente. **Lint leve da raiz PASS, 0 erros/0 avisos**, com apenas as análises do React Compiler desligadas no comando temporário; `rules-of-hooks`, `exhaustive-deps` e demais regras normais permanecem. Nenhuma configuração do projeto foi alterada. Não equivale a PASS do lint completo da raiz.

Não foi executado PGlite, replay, tsc ou build nesta reserva. Os resultados estáticos não são apresentados como aprovação strict/runtime.

## Suíte real preparada para a central

`tests/drizzle-health-pharmacy-pages.test.ts` cria banco e dataset próprios. Reutiliza somente o transporte genérico `createLocalDrizzleDatabase`, com **Neon/Drizzle reais**, servidor PGlite **máximo 10 conexões** e pool de produção **máximo 5**. Executa a autoridade real `loadMigrationSet` / `openMigrationConnection` / `runDatabaseMigrations(..., { command: "replay" })`, exige **156 históricos** e inclui o conjunto futuro atual. Não deriva seed/DDL dos mappings da implementação, nem usa fixture do owner Farmácia.

São **10 grupos + teste pai**, preparados e **ainda não executados**:

1. Mapping físico por introspecção do replay.
2. Estoque: oráculo SQL literal independente, contagem/ordem/nulls, filtros, unidade vazia/irrestrita, perfil versus material/warehouse ativo, ponta OR da transferência, recibo/evidência/política.
3. Catálogo/NF-e: DTOs, DCB/CAS, relações, Float de conversão e fornecedor/CNPJ.
4. Dispensações: código/ID, trim/padrões, somente ACTIVE no saldo, limites -03, Date real, cancelamento, eventos e retirantes, mais oráculo SQL independente da disponibilidade.
5. Judicial: unidade, paciente/advogado distintos, saldo ACTIVE, documento, datas e seleção de funcionário ativo.
6. Kits: composição, JSON preservado, estoque/dispensação nullable, vínculos programáticos e elegibilidade original de warehouse inativo; acesso irrestrito não exclui estoque geral da entrega.
7. Pedidos: EXISTS de material/nome, demandas versus pedidos entre estoques, transferência entre unidades, fulfillment, Decimal exato e disponibilidade.
8. Inventário/painéis: contagem NULL, criador/aprovador, identidade, escopo vazio e acesso irrestrito original, inclusive pedido de estoque geral no painel.
9. Mesmo executor tx: visibilidade de dado não commitado e rollback; todos os 9 leitores dentro de transação read-only, sem conexão secundária.
10. Contagem/página final e limites reais 20/500/1000/200/50 com dataset nominal adicional.

Comandos, sequenciais, para a fila central:

```powershell
node --max-old-space-size=128 --import tsx --test tests/drizzle-health-pharmacy-pages-ast.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-health-pharmacy-pages.test.ts
```

**PENDENTE CENTRAL:** execução da suíte real, integração strict dos 17 TSX com os leitores/contratos e checks globais quando a fila permitir. O contexto de plataforma e as actions/serviços ainda podem ter dependências transitivas pertencentes a outros owners; o resultado zero legado aqui cobre os **17 TSX e a infraestrutura exclusiva**, sem ocultar essas dependências.

Não houve edição de `health-pages/**`, schemas/contracts existentes, `health-pharmacy/**`, actions/APIs `.ts`, shared writers, package/lockfiles, CI, docs globais ou SQL histórico. Nenhum Git, commit/push ou DDL/DML remoto foi executado. Toda escrita/replay descrita na suíte é código preparado para banco local descartável na execução central.
