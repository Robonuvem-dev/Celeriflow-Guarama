# S4 — operações fiscais / NFS-e em Drizzle

## Estado da entrega

Implementação exclusiva de `src/lib/tributacao/s4-service.ts` migrada, mantendo seus **14 exports**. A varredura direta do serviço e dos repositórios exclusivos não encontra import, delegate, cliente ou transação legados. A integração ainda depende da migração de `scope.ts`/`index.ts` e das adaptações nominais dos consumidores abaixo.

**Cobertura preparada, não executada.** Nesta frente foram realizados somente ESLint, parse de sintaxe, conferência dos exports/imports e comparação com o catálogo físico. Esses resultados não constituem aprovação dos fluxos fiscais, financeiros ou contábeis.

Arquivos desta missão:

- `src/lib/tributacao/s4-service.ts`;
- `src/db/schema/tax-inspection-operations.ts`;
- `src/lib/contracts/tax-inspection-operations.ts`;
- `src/db/repositories/tax-inspection-operations/{records,snapshot,test-fixture}.ts`;
- `tests/drizzle-tax-inspection-operations.test.ts`;
- este handoff.

As entregas S9/Economic anteriores continuam retidas para os diagnósticos e testes centrais já registrados nos respectivos handoffs.

## Contratos de persistência

| Export do serviço | Primeiro argumento | Responsabilidade |
| --- | --- | --- |
| `requestNfseCredential` | `DatabaseConnection` | Solicitação e evento na mesma transação |
| `decideNfseCredential` | `DatabaseConnection` | Lock da solicitação, decisão e evento atômicos |
| `emitNfse` | `DatabaseConnection` | Dono da transação de emissão |
| `substituteNfse` | `DatabaseConnection` | Reversão, emissão substituta e vínculos/eventos atômicos |
| `cancelNfse` | `DatabaseConnection` | Prazo/decisão, reversão e evento atômicos |
| `createCorrectionLetter` | `DatabaseConnection` | Carta e evento na transação da nota bloqueada |
| `receiveRpsBatch` | `DatabaseConnection` | Lote e itens atômicos; replay serializado por chave |
| `updateRpsItem` | `DatabaseConnection` | Lock e transição do RPS |
| `createDmsDeclaration` | `DatabaseConnection` | Retificação e nova declaração atômicas |
| `createDeductionCredit` | `DatabaseExecutor` | Leitura de escopo e insert único com autor; aceita tx fornecida |
| `createOccasionalRequest` | `DatabaseConnection` | Dono da transação da solicitação |
| `createOccasionalRequestInTransaction` | `DatabaseTransaction` | Participa diretamente da tx do portal |
| `approveOccasionalRequest` | `DatabaseConnection` | Aprovação, lançamento, guia e memória na tx de origem |
| `releaseOccasionalRequest` | `DatabaseConnection` | Liberação e emissão na mesma tx, sem segundo lançamento |

`emitNfseInTransaction` e `reverseNfseWriting` continuam internos, recebendo `DatabaseTransaction`. Os leitores exclusivos `inspectionProviderActivities`/`inspectionServiceTaxes` recebem `DatabaseExecutor`; numeração e eventos recebem a transação existente. Nenhum desses participantes adquire conexão ou inicia transação.

Os nomes, a ordem dos argumentos de negócio, os campos de entrada, o comportamento de erro por exceção do serviço e os retornos consumidos foram preservados. Os wrappers de actions continuam responsáveis por capturar erros e devolver `{ error }` à UI. Em RPS, a primeira recepção retorna o lote com `items`; o replay retorna a linha do lote, como antes.

## Catálogo e histórico

Fonte independente: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`, confrontada com `prisma/migrations-ibema/**/migration.sql`.

O schema exclusivo projeta dez tabelas físicas existentes:

1. `NfseCredentialRequest`;
2. `NfseCredentialEvent`;
3. `NfseRpsBatch`;
4. `NfseRpsItem`;
5. `NfseDmsDeclaration`;
6. `NfseOccasionalRequest`;
7. `NfseDeductionCredit`;
8. `NfseDeductionConsumption`;
9. `TaxServiceActivity`;
10. `TaxDeclaration`.

Comparação leve: **124 colunas, zero divergências de nome físico, tipo e nulabilidade**; `timestamp without time zone` foi normalizado apenas para a comparação. Reutilizam-se as projeções existentes de notas/eventos/cartas, lançamentos/guias, financeiro, registro fiscal e sequência documental. Não há migration nova ou DDL de instalação nesta entrega.

A fixture própria exige exatamente **156 diretórios de migração**, ordena e executa seus SQLs completos. Utiliza `createLocalDrizzleDatabase`: Neon/WebSocket → socket PostgreSQL → PGlite local, com Drizzle de produção. Não usa metadados gerados, DMMF ou fixture fiscal legada. Cada fila fecha a fixture antes da próxima; `pool.max = 1` respeita o backend único do PGlite. Chamadas concorrentes nessas filas verificam replay/atomicidade enfileirados, não contenção entre sessões PostgreSQL independentes.

## Invariantes mantidos na implementação

- Escopo é resolvido no executor/tx recebido; permissões de UG vazias não ampliam acesso. Prestador, tomador, inscrição, atividade e tributo mantêm as verificações originais.
- Credenciamento mantém termos `DEMO-1`, aceite, análise, habilitação/rejeição e autores. As duas gravações de cada operação compartilham a tx; a análise bloqueia a solicitação.
- Emissão seleciona parâmetro ativo e vigente para a competência, mantém alíquota de seis casas, prazo de cancelamento congelado, memória de cálculo, autenticidade e evidência das relações municipais.
- `Decimal` independente preserva a precisão dos numerics; `Number` é usado nos espelhos Float históricos de `Invoice`, como na origem. DMS converte os números de entrada por string antes do mapper numeric.
- Competência continua `MM/AAAA`, convertida com `Date.UTC(..., 1, 12)`. Prazos em dias, numeração anual UTC, vigências e vencimento da guia avulsa conservam as regras originais.
- Datas das linhas são lidas por colunas `timestamp` tipadas de Drizzle. Não se introduziu DTO raw com timestamp; qualquer adaptação futura que use timestamp raw deve passar por `databaseTimestamp`.
- JSON preserva datas ISO, Decimal textual, null e omissão de membros `undefined`. JSON null de payload RPS usa `JsonNull`, distinto de SQL NULL. Arrays da cláusula SQL manual usam `sql.param(array)`; filtros de array de Drizzle usam `inArray`/`notInArray`.
- Créditos são bloqueados em ordem de ID. Consumo, saldo/status, notas, escriturações e lançamento compartilham a mesma tx. A restauração preserva o consumo como evidência histórica e rejeita saldo acima da origem.
- Cancelamento/substituição bloqueiam a nota, percorrem lançamentos em ordem de ID e conservam bloqueios de arrecadação, dívida ativa e compensação. Guia cancelada, ajuste patrimonial, evento de extinção e saldo zero são atômicos.
- Substituição conserva alíquota da memória original, checa mudança de roteamento e mantém os vínculos entre notas. Reexecução exige os mesmos dados/fundamento; cancelamento reexecutado exige o mesmo fundamento.
- RPS mantém hash sobre o conteúdo original, unicidade de lote/itens, política de assinatura e proibição de regularizar RPS convertido fora da NFS-e. Advisory lock transacional por lote evita corrida do replay.
- DMS mantém aliases prestado/tomado, finitude/valores não negativos, sem movimento, proteção da origem automática e identidade/UG/ente/competência da retificação.
- Avulsa mantém sequência, comparação da alíquota na aprovação, lançamento/guia de origem, soma Decimal dos pagamentos confirmados e replay da liberação. A liberação bloqueia lançamento antes da solicitação e reutiliza o débito aprovado.
- Auditoria de lançamento/guia e ajuste patrimonial continua nos helpers canônicos chamados com a tx de S4; os eventos S4 são inseridos nessa mesma tx. Não existe substituto local dos writers compartilhados.

## Handoff nominal — TaxActions / APIs / portal / testes reservados

Antes de alterar as assinaturas foram lidos todos os consumidores encontrados por imports e pelo grep dos 14 símbolos. A revisão estática confirmou os cinco arquivos consumidores abaixo.

### `src/app/app-domain/tributacao/nfse/actions.ts`

Trocar somente o primeiro argumento nestas quatro chamadas:

| Wrapper | Chamada | Adaptação |
| --- | --- | --- |
| `requestCredentialAction` | `requestNfseCredential` | `ctx.database` → `ctx.connection` |
| `decideCredentialAction` | `decideNfseCredential` | `ctx.database` → `ctx.connection` |
| `correctionLetterAction` | `createCorrectionLetter` | `ctx.database` → `ctx.connection` |
| `receiveRpsAction` | `receiveRpsBatch` | `ctx.database` → `ctx.connection` |

As demais chamadas desse arquivo já fornecem `ctx.connection` aos donos de transação ou `ctx.database` ao insert de crédito. Preservar `done()`, `invoiceId`, autorização e revalidação dos wrappers.

### `src/app/api/tributacao/nfse/rps/route.ts`

Importar `databaseConnection` de `@/db/client` e passá-la a `receiveRpsBatch` em lugar de `db`. O contrato da API continua `{ protocol, status, batchId }`/202, com token e mensagens atuais.

### Consumidores já alinhados

- `src/app/api/tributacao/nfse/dms/route.ts`: já passa `databaseConnection` a `createDmsDeclaration`.
- `src/lib/portal-cidadao/tax-executors.ts`: já passa `DatabaseTransaction` a `createOccasionalRequestInTransaction`. Manter a tx do processo/portal; o participante S4 não abre outra conexão.

### `tests/tax-document-integration.test.ts` — owner dos testes reservados

A chamada negativa de `emitNfse(f.db, { ...f.actor, allowedBudgetUnitIds: [] }, input)` deve receber `f.connection`, permitindo que a verificação real de autorização execute dentro da tx. As demais chamadas aos donos de tx já usam `f.connection`; `createDeductionCredit(f.db, ...)` está correto. A fixture e os helpers externos também precisam estar integrados ao core migrado antes da regressão central.

## Handoff nominal — owner Tax (`scope.ts` / `index.ts`)

S4 chama diretamente os contratos abaixo. As implementações reservadas ainda legadas são bloqueadores de runtime/tipagem da integração:

| Função | Contrato requerido por S4 | Fluxos |
| --- | --- | --- |
| `resolveTaxAssessmentScope` | `DatabaseExecutor`, actor, taxId, snapshot JSON independente | credenciamento, emissão, correção, cancelamento/substituição, DMS e avulsa |
| `resolveTaxFinancialYear` | `DatabaseExecutor`, ano, escopo, `requireOpen` | reversão fiscal e writers canônicos de lançamento/guia/contabilidade |
| `createTaxAssessmentInTransaction` | `DatabaseTransaction`; valores compatíveis com Decimal independente | emissão própria/retida e aprovação avulsa |
| `generateTaxGuideInTransaction` | `DatabaseTransaction` existente | aprovação avulsa com pagamento |
| `taxAssessmentCompensatedValue` | `DatabaseExecutor` existente | guarda de extinção/liberação; overload Drizzle já disponível |
| `taxScopeSnapshot` | JSON independente/nulo, sem cast de compatibilidade | memórias, eventos e replays; contrato estrutural já disponível |

O núcleo canônico precisa conservar reconhecimento patrimonial, auditoria, numeração, regras de exercício e guia na **mesma tx recebida de S4**, sem wrapper que abra conexão ou transação substituta. `postTaxAssessmentAdjustment`, `assertAccountingPeriodOpen` e `readMunicipalServiceRelationships` já aceitam o executor/tx tipado utilizado aqui, mas dependências transitivas do core também precisam estar integradas.

## Testes preparados e comandos centrais

Arquivo: `tests/drizzle-tax-inspection-operations.test.ts`; **16 subtestes em três filas**.

1. `S4: núcleo RPS, créditos e numeração sobre todo o SQL histórico` — cinco subtestes sem chamadas aos helpers legados de scope/index: replay/hash, JSON null/UTC/Decimal, rollback do lote, transições RPS, crédito/tx recebida, filtros de UG e sequência transacional.
2. `S4 integração: credenciamento, NFS-e, DMS e avulsa na transação de origem` — seis subtestes: termos/eventos/rollback, emissão com ISS zero/escrituração e falha após inserts, carta/evento, DMS/retificação concorrente, tx do portal/aprovação/release e soma Decimal integral dos pagamentos.
3. `S4 integração patrimonial: substituição, extinção, competência e auditoria atômicas` — cinco subtestes: emissão inválida sem resíduos, substituição com falha tardia/replay e memória histórica, retenção/período fechado, prazo histórico/UG/ente/vigência e bloqueios de origem arrecadada/inscrita/compensada.

Os pagamentos usados na guarda de liberação são linhas confirmadas semeadas explicitamente na fixture; esse cenário verifica o leitor/controle de S4. A confirmação financeira canônica e seu estorno permanecem cobertos pela regressão reservada de documentos/cadeia financeira, a ser executada centralmente. Triggers de falha existem apenas no banco local temporário dos testes para comprovar rollback.

Fila própria, após liberação central:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-name-pattern="^S4: núcleo" tests/drizzle-tax-inspection-operations.test.ts
```

Depois das adaptações de scope/index e consumidores:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-inspection-operations.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/tax-document-integration.test.ts
npm run typecheck
npm run build
```

## Evidência leve desta frente

- ESLint dos sete arquivos TS: passou sem erros/avisos.
- Parse TypeScript: sete arquivos sem diagnósticos de sintaxe.
- Os 14 nomes exportados do serviço coincidem com o snapshot anterior à edição.
- 64 imports nomeados de schema nos sete arquivos, incluindo testes, resolvidos estaticamente; todos os imports locais também resolvidos.
- 16 inserts SQL da fixture conferidos contra os nomes de coluna do catálogo original, sem divergências.
- Catálogo: dez projeções/124 colunas, zero divergências de nome/tipo/nulabilidade.
- Histórico: 156 diretórios de migração confirmados; execução integral preparada na fixture.
- Scan direcionado de legado/casts de compatibilidade: zero no serviço e repositórios exclusivos.

PGlite, testes de integração, typecheck e build não foram executados nesta frente. O resultado integrado e eventuais correções de diagnósticos ficam pendentes da execução central.

## Adendo — cinco regressões transferidas da frente CoreTax

Nova missão exclusiva concluída nestes cinco arquivos, revisados e adaptados individualmente:

| Arquivo em `tests/` | Testes preservados | Chamadas configuráveis | Asserções anteriores → atuais |
| --- | --- | --- | --- |
| `configurable-fiscal-cadastres.test.ts` | 1 | 24 | 23 → 24 |
| `economic-activity-registry.test.ts` | 1 | 2 | 24 → 24 |
| `economic-profile.test.ts` | 1 | 2 | 47 → 48 |
| `tax-channel-financial-integrity.test.ts` | 2 | 1 | 31 → 31 |
| `tax-cadastral-migration-chain.test.ts` | 1 | 1 | 20 → 22 |

São **30 invocações em 29 linhas** de `publishFiscalCatalog`/`saveConfiguredFiscalRecord`; o `Promise.allSettled` contém duas chamadas na mesma linha. Todas recebem agora `f.connection`, de acordo com as assinaturas `DatabaseConnection` dos wrappers configuráveis. Seus participantes `*InTransaction` continuam responsabilidade dos serviços, usando a `DatabaseTransaction` de origem.

### Persistência, fixture e preservação

- Os cinco testes usam `createTaxChainDatabase`, de `tests/helpers/tax-chain-database.ts`, com seu histórico SQL completo e seus `db`/`connection` nativos. Os campos necessários já existem; o helper reservado ao owner OriginalTaxcore não foi alterado.
- Seeds, leituras, updates e tentativas de violar a imutabilidade usam diretamente as projeções Drizzle existentes. Contagens e predicados JSON usam `countTaxRows`/`sql`, com identificadores separados dos valores. Nenhum DTO raw com timestamp foi introduzido: as datas continuam vindo das colunas tipadas.
- Donos de transação recebem `f.connection`. As duas chamadas de `selectDebtNoticeTargets`, cujo contrato é `DatabaseExecutor`, continuam usando `f.db`. A ponte adicional `connectFinanceDrizzleFixture` de `economic-profile` foi substituída pela conexão que a fixture já fornece.
- Os espelhos Float continuam numéricos e os numerics usam `Decimal` independente; os valores de negócio, percentuais, áreas, coordenadas, limites, versões, datas e operações de auditoria permanecem nos cenários originais. Os seeds de lançamento explicitam `status: "Lançado"`.
- As **145 chamadas de asserção originais** foram preservadas, incluindo seus resultados esperados, padrões de erro, relações de propriedade e autoria. Acrescentaram-se quatro guardas de forma/presença ao retirar casts JSON e verificar `guideId`: total atual de 149 chamadas de asserção no AST, sem contar repetições de loops/callbacks.
- As **135 chamadas às bibliotecas de negócio** conservam seus argumentos além do handle de persistência; comparação AST removeu apenas as anotações de tipo para essa conferência. Os seis títulos de teste e a chamada concorrente `Promise.allSettled` também coincidem com os snapshots anteriores.
- `pool.options.max = 1` mantém as entradas concorrentes enfileiradas no PGlite. O cenário conserva a exigência de exatamente uma gravação bem-sucedida; sua execução central não demonstra contenção entre sessões PostgreSQL independentes.
- As rejeições por trigger usam `financeDatabaseError` para conferir a causa PostgreSQL, preservando o regex original sem aceitar texto da query como evidência de erro. O trigger local de falha tardia da unificação é removido em `finally`; o rollback de perfil, CNAE, catálogo urbanístico e evento continua exigido antes da repetição bem-sucedida.
- Nos cenários com arrecadação/estorno, `tax-channel-financial-integrity` e `tax-cadastral-migration-chain` delimitam e restauram `CELERIFLOW_ACCOUNTING_MODE=POC`, necessário às contas e regras de referência da fixture isolada. As chamadas canônicas de pagamento, receita, contabilização, caixa e estorno permanecem na cadeia. Essa fixture não estabelece homologação de matriz contábil municipal nem validação de margem orçamentária de LOA; esses resultados dependem das regressões centrais próprias.

### Dependências nominais do core tributário reservado (`index.ts`/`scope.ts`)

Na leitura das assinaturas, nove chamadas diretas ainda dependem de quatro wrappers legados de `src/lib/tributacao/index.ts`. Os testes já fornecem a conexão de destino, sem casts para encobrir a incompatibilidade:

| Wrapper a migrar para `DatabaseConnection` | Arquivos consumidores desta missão | Chamadas |
| --- | --- | --- |
| `configureTaxFinancialMapping` | `economic-activity-registry`, `tax-channel-financial-integrity`, `tax-cadastral-migration-chain` | 3 |
| `configureTaxServiceActivity` | `economic-activity-registry` | 1 |
| `evaluateTaxCertificateSituation` | `economic-profile` | 4 |
| `confirmTaxPayment` | `tax-cadastral-migration-chain` | 1 |

Também precisam estar integrados os helpers canônicos transitivos de escopo/exercício/lançamento/guia/pagamento, incluindo `confirmTaxPaymentInTransaction` chamado pela cadeia de retorno. Participantes devem reutilizar a tx recebida, preservando numeração, contabilização, auditoria e transação raiz. A adaptação dos testes não elimina esses bloqueadores de runtime/tipagem do core reservado.

### Matriz S4 para TaxActions — encaminhamento pelo parent

Para o owner TaxActions (`sess…d113`), a matriz nominal é:

| Arquivo / wrapper | Serviço | Handle requerido |
| --- | --- | --- |
| `src/app/app-domain/tributacao/nfse/actions.ts` / `requestCredentialAction` | `requestNfseCredential` | `ctx.connection` |
| Mesmo arquivo / `decideCredentialAction` | `decideNfseCredential` | `ctx.connection` |
| Mesmo arquivo / `correctionLetterAction` | `createCorrectionLetter` | `ctx.connection` |
| Mesmo arquivo / `receiveRpsAction` | `receiveRpsBatch` | `ctx.connection` |
| `src/app/api/tributacao/nfse/rps/route.ts` / `POST` | `receiveRpsBatch` | `databaseConnection` de `@/db/client` |

**Estado observado ao concluir este adendo:** as cinco chamadas já aparecem alinhadas nos arquivos reservados, por trabalho do owner. A tabela anterior de adaptações S4 permanece como registro do handoff original; não houve edição desses consumidores por esta frente.

### Evidência leve e fila central

- ESLint dos cinco testes: passou sem erros/avisos.
- Parse: cinco arquivos sem diagnósticos de sintaxe.
- AST: zero delegates/imports Prisma e zero casts; seis testes, 30 chamadas configuráveis e argumentos de negócio preservados.
- Imports: 40 bindings nomeados de schema resolvidos; imports locais conferidos.
- Catálogo independente: **21 tabelas/290 colunas**, zero divergências de nome físico, tipo e nulabilidade.

Execução a cargo do parent, sequencialmente, após integrar os bloqueadores do core:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/configurable-fiscal-cadastres.test.ts tests/economic-activity-registry.test.ts tests/economic-profile.test.ts tests/tax-channel-financial-integrity.test.ts tests/tax-cadastral-migration-chain.test.ts
```

Somente lint, parse, AST e comparação de catálogo foram realizados nesta missão. As seis regressões foram preparadas, não executadas; PGlite, typecheck e build permanecem na fila central do parent, junto das entregas S4/S9/Economic retidas.
