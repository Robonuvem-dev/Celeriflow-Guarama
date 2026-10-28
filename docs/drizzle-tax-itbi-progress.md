# Drizzle — auxiliares ITBI (handoff exclusivo)

## Estado em 28/10/2026

- **20/20 `src/lib/tributacao/itbi-*.ts` migrados; zero referências diretas a Prisma**, `$transaction`, `$queryRaw` ou `GetPayload` nesses arquivos.
- Os **54 símbolos exportados** mantêm os nomes e os formatos de resposta. O argumento de persistência foi substituído conforme a responsabilidade transacional descrita abaixo.
- Mapeamento de escrita exclusivo: `src/db/schema/tax-itbi.ts` (cinco tabelas físicas já instaladas). Repositório: `src/db/repositories/tax-itbi/records.ts`. DTO completo: `src/lib/contracts/tax-itbi.ts`.
- Quatro testes ITBI existentes convertidos individualmente para SQL histórico + Neon/Drizzle/PGlite, com fixture independente. Acrescentados testes de auxiliares, contrato AST e smoke físico Neon somente leitura.
- **Aceitação integrada pendente:** os testes de banco, typecheck e build não foram executados por esta frente, conforme reserva da fila central. As dependências externas abaixo ainda precisam aceitar o executor/transação Drizzle do ownerTax.

## Contratos de chamada para ownerTax/parent

### Funções que recebem `DatabaseConnection`

São donas da transação (ou delegam a transação de ingestão ao GED). Passe a conexão da instância/contexto, não apenas seu `.db`:

`publishItbiEntryPolicy`, `saveItbiTransactionType`, `requestItbiContestation`, `decideItbiContestation`, `configureItbiCorrespondence`, `publishItbiExpiryPolicy`, `cancelOverdueItbiProcesses`, `decideItbiFiscalTreatment`, `publishItbiDocumentModel`, `issueConfiguredItbiDocument`, `renderConfiguredItbiDocument`, `registerOnlineItbiDraftUpload`, `registerInternalItbiUpload`, `downloadItbiProcessAttachment`, `requestPortalItbiContestation`, `grantItbiProcessAccess`, `sendInternalItbiMessage`, `sendPortalItbiMessage`, `publishOnlineItbiPolicy`, `configureItbiNotary`, `submitOnlineItbi`, `transferItbiManually`, `rectifyTransferredItbi`, `createItbiPropertyCollection`, `renderItbiProcessPdf`, `renderItbiDamPdf`.

`registerItbiPortalUpload(input)` conserva seu único argumento e utiliza `databaseConnection` da instância; a ingestão e seu `afterCreate` utilizam a mesma transação GED. Não há aquisição de conexão dentro do callback.

### Funções que recebem `DatabaseExecutor`

Passe `context.database ?? db` para leitores, ou o `tx` recebido do chamador:

`readItbiAdditionalForms`, `assertInternalItbiProcessAccess`, `readInternalItbiChannel`, `readPortalItbiChannel`, `assertPortalItbiAccess`, `assertNoPendingItbiAdjustments`, `readOnlineItbiEntitlements`, `assertOnlineItbiDraftAccess`, `previewOnlineItbiProperty`.

### Funções que recebem `DatabaseTransaction`

Devem receber **a transação de origem**; não abrir outra conexão ou transação para adaptá-las:

`attributeItbiHistory`, `linkItbiPropertyAttachments`, `evaluateItbiEntryPolicy`, `applyItbiDataAdjustment`, `requestItbiContestationInTransaction`, `transferItbiProfileInTransaction`, `reverseItbiProfileInTransaction`, `transferPaidItbiInTransaction`, `reversePaidItbiInTransaction`.

### Dependências externas ainda reservadas a outros owners

As chamadas abaixo já passam o `tx` Drizzle original, sem bridge ou segundo ORM. Seus exports precisam ser migrados pelos respectivos owners antes da execução integrada:

| Arquivo externo | Dependência consumida nesta frente |
| --- | --- |
| `src/lib/tributacao/scope.ts` | `resolveTaxAssessmentScope`; `taxAssessmentCompensatedValue` já tinha overload Drizzle |
| `src/lib/tributacao/tax-worker-actor.ts` | `resolveTaxWorkerActor` |
| `src/lib/tributacao/property-history.ts` | `attributePropertyHistory` |
| `src/lib/tributacao/s2-service.ts` | `reviseTaxAssessmentInTransaction`, `registerCreditEventInTransaction` |
| `src/lib/tributacao/s3-service.ts` | `createItbiDeclarationInTransaction`, `analyzeItbiInTransaction`, `issueItbiDamInTransaction`, `generateItbiDocumentInTransaction` |
| `src/lib/tributacao/s3-engine.ts` | `calculateItbi` já recebe/retorna Decimal independente de `@/db/decimal` na última leitura |
| `src/lib/documents/document-flow-service.ts` | `ingestGedDocument` já recebe conexão e fornece `DatabaseTransaction` no `afterCreate` |
| `src/lib/portal-cidadao/external-opening.ts` | `openExternalServiceProcess` já recebe `DatabaseTransaction` |

Consumidores de transação fora da reserva identificados por grep: `src/lib/tributacao/index.ts` (`transferPaidItbiInTransaction`), `payment-reversal.ts` (`reversePaidItbiInTransaction`), `configurable-cadastres.ts` (`linkItbiPropertyAttachments`) e `s3-service.ts` (`attributeItbiHistory`, `evaluateItbiEntryPolicy`, `assertNoPendingItbiAdjustments`).

Consumidores app/API fora da reserva:

- `src/app/app-domain/tributacao/itbi/actions.ts`, `collection-actions.ts`, `processos/actions.ts`, `online/actions.ts`, `modelos/actions.ts`, `comunicacao/actions.ts`, `cancelamento-automatico/actions.ts`, `bloqueios/actions.ts`.
- Leitores: `src/app/app-domain/tributacao/itbi/comunicacao/page.tsx` e `comunicacao/ItbiFieldHistory.tsx`.
- `src/app/portal/tributario/itbi/{page.tsx,actions.ts,novo/page.tsx,novo/actions.ts}`.
- Rotas `src/app/api/tributacao/itbi/{[id]/pdf,[id]/dam,expiracao,documentos/[id],declaracoes/[id],anexos}/route.ts`.
- Rotas `src/app/api/portal/tributario/itbi/{[id]/pdf,[id]/dam,solicitacao-anexos,documentos/[id],anexos,declaracoes/[id]}/route.ts`.
- Páginas/componentes que importam somente os schemas de validação continuam consumindo os mesmos exports.
- Testes externos `tests/tax-property-cadastral-completion.test.ts` e `tests/tax-cadastral-migration-chain.test.ts` também chamam estes auxiliares; sua adaptação pertence ao ownerTax. Os testes `tests/itbi-*.test.ts` desta reserva já passam conexão ou executor conforme acima.

Os wrappers de actions continuam responsáveis por capturar erros e devolver `{ error }` aos clients. Estes auxiliares mantêm o comportamento original de lançar erros; nenhum wrapper/action foi editado nesta frente.

## Mapa por arquivo e invariantes

| Auxiliar `itbi-*.ts` | Preservação principal |
| --- | --- |
| `additional-forms` | Última versão por título antes de filtrar ativo; origem e formulário congelado |
| `attachments` | GED válido, UG, deduplicação ordenada, locks de processo/documento e imóvel/processo/documento |
| `contestation` | Locks crédito → declaração, versão otimista, comprovantes, cancelamento de guia, revisão e revogação documental |
| `correspondence` | Adquirente da própria declaração, perfil imutável por versão, atualização e recomposição da correspondência |
| `dam-pdf` | Snapshot repeatable-read, crédito/guia vigentes, Decimal, origem, código bancário registrado |
| `data-adjustment` | Só antes do crédito, partes ordenadas, snapshot de avaliação e evento before/after |
| `document-models` | Versão/origem imutável, quatro estados de emissão, autorização portal, hash de posição e chave idempotente |
| `draft-storage` | Prefixo e tipo/conteúdo, hash GED, autorização atual e lock da mesma chave do envio on-line |
| `entry-policy` | Condições, ordem de avisos, modalidades vigentes, bloqueios e perfil imobiliário conciliado |
| `expiry` | Corte UTC, política atual, UG/ente, pagamento/compensação, crédito e documento com rollback por declaração |
| `fiscal-treatment` | Pendências, comprovantes do processo, imposto teórico separado do valor devido e documento fiscal |
| `history` | `set_config(..., true)` na mesma transação e autor real |
| `online` | Perfil/conta ativos, tabelionato mais recente antes de filtrar membros, formulários, anexos, protocolo, hash canônico, replay e processamento automático |
| `ownership` | Frações/copropietários, pagamento integral, posição vigente, perfil, autor de histórico e cadeia retificadora no estorno |
| `parameters` | ITBI ativo único, ente/UG, alíquota exata, lock e versão otimista, origem imutável |
| `portal-storage` | Autorização vigente, conteúdo/tamanho, GED atômico, proveniência, versão final/assinada e SHA-256 do download |
| `process-channel` | Acesso explícito vigente, conta/perfil ativos, processo com origem única, última resposta antes do aceite e documentos do próprio processo |
| `process-pdf` | Agregado ordenado, origens coerentes, partes/eventos/pagamentos, compensações, retificações e quitação |
| `property-collection` | 1–100 imóveis distintos, mesmo processo, locks ordenados e criação integralmente atômica |
| `rectification` | Crédito/declaração originais travados, pagamentos preservados, guias abertas, nova sequência/partes/formulários/correspondência/documento e cadeia de origem |

### Escalares e persistência

- `numeric(18,2)` e `numeric(9,6)` usam `exactNumeric` e `Decimal` independente. Valores raw numéricos não são convertidos em `Number`; os floats de compatibilidade do DAM mantêm a conversão original explícita.
- Timestamps persistidos são selecionados/retornados por colunas Drizzle tipadas. Os únicos `execute` de aplicação retornam locks/configurações, sem DTO de Date/numeric. Não há timestamp raw sem decoder nesta frente.
- `itbiJson` omite membros `undefined` como o contrato anterior e preserva null/números/strings/arrays aninhados. `JsonNull` é usado para JSON null, distinto de SQL NULL. Datas dentro de snapshots JSON continuam strings.
- `updateItbiDeclaration` atualiza o registro e insere o evento no `DatabaseTransaction` recebido; auditoria, triggers históricos e documentos compartilham esse mesmo tx.
- `withDatabaseTransaction` preserva o nível de isolamento e os timeouts originais; leituras documentais usam `repeatable read`, decisões/publicações seguem `serializable` onde já previsto.
- Nenhuma alteração de DDL remoto, schema compartilhado, driver, contexto, package/build/CI, action/API ou UI foi realizada por esta frente.

## Validação e comandos centrais

### Executado (leve)

- Parser TypeScript e ESLint no escopo: **31 arquivos, zero erros de parse, zero erros/warnings de lint**, sob heap de 512 MiB. Evidência local: `.agent/tax-itbi-light-validation.json`.
- Comparação AST do mapeamento exclusivo com o catálogo físico fornecido: **5 tabelas / 60 colunas**, nomes, tipos, nulabilidade e completude conferidos; zero divergências. Evidência local: `.agent/tax-itbi-physical-schema-verification.json`.
- `node --max-old-space-size=512 --import tsx --test --test-concurrency=1 tests/itbi-source-contracts.test.ts`: **1/1 aprovado**. Testa inventário 20/20, todos os exports e fingerprints dos erros/validações nomeadas anteriores. Não substitui equivalência funcional de banco.

### Preparado; não executado por esta frente

Fixture `tests/helpers/itbi-drizzle-fixture.ts`: reproduz os SQLs históricos instalados, sem DMMF ou API de ORM emulada, usa o driver real Neon/Drizzle sobre o socket PGlite local e dados municipais explícitos da fixture. O teste de posição legada instala o trigger histórico depois de inserir a posição inicial, sem alterar escala física.

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/itbi-field-history.test.ts tests/itbi-expiry.test.ts tests/itbi-process-completion.test.ts tests/itbi-online-channel.test.ts tests/itbi-drizzle-helpers.test.ts
```

Repetir a suite sequencialmente em `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Pacific/Auckland` quando a integração dos owners estiver disponível. A fixture usa exercício 2026, correspondente ao snapshot de migração atual.

O teste adicional cobre Date exata com milissegundos, Decimal de 18 dígitos, JSON null versus SQL NULL, rollback de sequência/auditoria, avisos/bloqueios, conta/perfil e acesso revogado, aceite de readequação externa, decisão não tributável, transmissão parcial/correspondência, retificação e estorno da cadeia, PDFs.

Smoke físico opt-in (URL fornecida centralmente):

```powershell
$env:ITBI_NEON_URL = '<conexão central>'
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/itbi-neon.test.ts
```

O smoke usa uma única transação **read-only/repeatable-read**, escopo impossível e projeções físicas reais. Não executa DDL/DML/auditoria. Complementa os casos positivos locais; não os substitui.

Registrar aqui os resultados reais da fila central e corrigir eventuais falhas de integração antes da aceitação final. Não houve build/typecheck pesado, testes de banco, Git, commit/push ou deploy por esta frente.
