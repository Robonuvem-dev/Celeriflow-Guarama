# RH External Operations — handoff Drizzle

## Situação e ownership

As quatro libs atribuídas foram integralmente migradas: `benefit-calculation.ts`, `external-configuration.ts`, `movement-import.ts` e `partner-discounts.ts`. Os cinco testes leves passaram; lint/parse dos doze TS próprios limpos. A suite de persistência tem doze cenários preparados para a fila central, **ainda sem execução nesta frente**.

Baseline readonly: `C:/Users/trici/AppData/Local/Temp/opencode/personnel-external-operations-originals.json`. Foram analisados os quatro módulos e todos os consumidores individualmente antes das assinaturas. Os oito consumidores capturados continuam idênticos à baseline.

| Arquivos próprios | Responsabilidade |
| --- | --- |
| `src/lib/rh/benefit-calculation.ts` | Política/cálculo diário e movimento de benefício |
| `src/lib/rh/external-configuration.ts` | Preparação/readiness eSocial |
| `src/lib/rh/movement-import.ts` | CSV, prévia/aplicação, hash e replay |
| `src/lib/rh/partner-discounts.ts` | Autorizações, reserva, consulta e postagem de convenentes |
| `src/lib/contracts/personnel-external-operations.ts` | Contexto, DTOs, Decimal/JSON próprios |
| `src/db/schema/personnel-external-operations.ts` | Seis projeções físicas exclusivas, 36 colunas |
| `src/db/repositories/personnel-external-operations/benefits.ts` | Direitos, rubrica, férias/licenças |
| `src/db/repositories/personnel-external-operations/configuration.ts` | Upsert transacional e leitura de conexões |
| `src/db/repositories/personnel-external-operations/movements.ts` | Locks, movimento, arquivos/regimes/rubricas da importação |
| `src/db/repositories/personnel-external-operations/partners.ts` | Escopos, contratos/UG, autorizações, parcelas e status do evento |
| `tests/drizzle-personnel-external-operations-ast.test.ts` | Cinco provas leves, incluindo algoritmos/schemas/payloads originais |
| `tests/drizzle-personnel-external-operations.test.ts` | Doze cenários reais Neon/Drizzle, execução central |
| `tests/fixtures/personnel-external-operations.sql` | Fixture SQL independente após as 156 migrações; três injetores locais aditivos |

O owner RH retém `poc-bootstrap`, actions/APIs e testes/helpers HR existentes. Esta entrega também retém correções concretas de Recruitment, RH Pages, FinanceSetup e MunicipalSetup. As oito nulabilidades municipais já foram corrigidas e estão registradas no handoff municipal.

## Contratos públicos

Todos os nomes públicos foram preservados. Os três schemas Zod e os dois algoritmos puros mantêm seu comportamento original, confirmado contra a captura anterior às edições.

| Export | Assinatura/retorno após migração |
| --- | --- |
| `hrBenefitRuleSchema` | Mesmo schema/refinamentos/defaults |
| `calculateDailyBenefit(input)` | Mesmo `{ days, total, employee, entity, postedAmount }`; valores Decimal próprios |
| `generateBenefitMovement(connection, actorId, raw)` | `DatabaseConnection`; `Promise<ExternalPayrollMovement>` |
| `hrExternalConfigurationSchema` | Mesmo schema estrito, CNPJ/HTTPS/reference/hash/layout |
| `saveHrExternalConfiguration(connection, raw)` | `DatabaseConnection`; conexão completa, mesmo ID no update |
| `describeHrExternalReadiness(executor)` | `DatabaseExecutor`; mesmo array de dois ambientes/status/issues |
| `parsePayrollMovementImport(text)` | Mesmo parser/linhas/datas/erros |
| `importPayrollMovements(connection, actorId, raw)` | `DatabaseConnection`; mesmo `{ lines, created, reused, mode, hash }` |
| `partnerDiscountPolicySchema` | Mesma política estrita |
| `listOwnPartnerDiscountGrants(context)` | Mesmo array com `{ id, name, policy, contracts }` |
| `reservePartnerDiscount(context, raw, connection?)` | Mesmo ID; conexão opcional explícita |
| `listOwnPartnerDiscounts(context)` | Mesmo `{ grants, agreements }`, parcelas e entradas aninhadas |
| `postPartnerDiscount(context, raw, connection?)` | Mesmo movimento da parcela; conexão opcional explícita |

O contexto estrutural é `{ user: PermissionUser; database?: Database }`, compatível com `AppContext`. Havendo banco injetado, as escritas de convenente exigem identidade com `connection.db` antes de adquirir o pool. A omissão da conexão mantém o default Drizzle da aplicação.

Erros de validação/negócio continuam sendo lançados pelas libs; as actions retidas pelo owner RH continuam responsáveis por convertê-los em seus ActionResults. Os shapes de sucesso, chaves de origem e textos dos erros de negócio foram preservados.

## Handoff nominal dos consumidores ao owner RH

1. **`src/app/app-domain/rh/operacoes/actions.ts:286`**: comando `beneficio` deve chamar `generateBenefitMovement(databaseConnection, context.user.id, values)`. O mesmo arquivo já importa/usa essa conexão nas demais operações.
2. **`src/app/app-domain/rh/operacoes/actions.ts:335`**: comando `importar` deve chamar `importPayrollMovements(databaseConnection, context.user.id, values)`. Mantidos o hash, contagens e mensagem no ActionResult.
3. **`src/app/app-domain/rh/esocial/actions.ts:8–10`**: `saveHrExternalConfiguration` recebe a conexão Drizzle, em vez do `prisma` desestruturado do contexto. Preservar a obtenção do contexto administrativo e `{ message, id }` / `{ error }` existentes.
4. **`tests/hr-workforce-service.test.ts:290–306`**: os cinco usos de importação e os três de benefício recebem a conexão real Neon/Drizzle da própria fixture; leituras de asserção recebem `connection.db`. A fixture antiga ainda está em Prisma/DMMF e pertence integralmente ao owner RH. Não adicionar cliente Prisma ou adaptar delegates para compatibilizar os novos serviços.
5. **`tests/hr-calculation.test.ts:49–57`**: o cálculo puro conserva os mesmos valores e erros; a migração nominal de `Prisma.Decimal` para `Decimal` próprio pertence ao owner dos testes HR.
6. **`src/app/portal/convenentes/actions.ts` e `page.tsx`**: o contrato de duas entradas/contexto e os retornos permanecem válidos com o default Drizzle. Em testes com contexto injetado, passar a mesma conexão como terceiro argumento das duas escritas.
7. **`src/lib/portal-servidor/management.ts` e `src/db/repositories/personnel-pages/catalog.ts`**: consumidores apenas dos schemas; seus imports/contratos permanecem válidos.

Dependências RH compartilhadas usadas diretamente, sem alteração: `resolveContractRevision`, `payrollPeriod`, `requireEmploymentContract/History/Regime`, `requirePayrollRule`, `enqueueHrIntegration`, `reserveConsignmentAgreementInTransaction` e `postConsignmentInstallment`. As duas últimas já recebem, respectivamente, `DatabaseTransaction` e `DatabaseConnection`. As consultas/escritas compartilhadas usam o mesmo executor fornecido, sem ponte Prisma. O lock compartilhado de `personnel/integration.ts` permanece de ownership RH; os locks próprios retornam `::text` para o transporte.

## Transações, locks e semântica

- **Benefício:** uma transação de conexão; locks `RH:employee:${employeeId}` e depois `RH:contract:${contractId}`. Recarrega histórico após lock e resolve a revisão vigente, inclusive salário/version/metadata legais. Valida contrato/regime/política/plano na competência inteira, direito ativo único e rubrica MANUAL/sentido. Mantém dias UTC, vínculo, exclusões sobrepostas, teto do titular, autorização de valor individual, ordem férias→licenças e payload completo de memória. Evento `CALCULO_BENEFICIO`, replay e movimento estão no mesmo `tx`; evidência precede a mutação como no original.
- **eSocial:** parse antes da transação e upsert SQL atômico por código `ESOCIAL_RH_${environment}`. Credencial fica no campo próprio, fora do JSON. Criação mantém campos de teste nulos; update zera teste anterior e registra a mesma mensagem, preservando ID, criação e mock. Readiness lê o executor recebido e mantém `transmissionAvailable: false`.
- **CSV:** mantém parser semicolon/aspas/escapes/quebras/BOM/CRLF; hash SHA-256 do texto original, não normalizado. Locks de lote `RH:import:${batchKey}`, hash `RH:import-hash:${hash}` e contratos em ordem de ID. Prévia não escreve. Aplicação, linhas, evento e rollback usam o mesmo `tx`; timeout de 60 s. Preservados duplicidade por arquivo, replay por linha, comparação Decimal/datas/referência/notas e erros com número de linha.
- **Convenentes:** mantém ator autorizado, categoria/ativação/vigência, contratos, titular ativo na listagem, secretaria/UG e scope opcional da folha; não acrescenta restrição de status de contrato à listagem. Reserva usa uma transação de 60 s e compõe `reserveConsignmentAgreementInTransaction(tx, ...)`, evento `DESCONTO_CONVENENTE_RESERVADO` e status `PROCESSADO` no mesmo `tx`. Cronograma, margem, política, legalidade, locks, replay e duplicidade são os do motor de consignação existente.
- **Postagem:** consultas prévias usam `connection.db` da origem validada; a única transação pertence a `postConsignmentInstallment(connection, ...)`, como no original. Movimento/dedução e ledger são atômicos nesse motor; nenhum wrapper cria transação externa ou conexão adicional.

## Autoridade física, precisão e transporte

Autoridades: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json` e as 156 migrações históricas de `prisma/migrations-ibema/`. As seis projeções privadas são `BenefitConfig`, `PayrollBenefit`, `Vacation`, `Leave`, `IntegrationConnection` e `SstBenefitPayrollScope`; as 36 colunas conferem em tipo e nulabilidade nos dois sentidos.

Dinheiro NUMERIC usa `Decimal`/mapper exato existente. `PayrollBenefit.customValue` permanece Float físico e passa por `new Decimal(String(value))` antes do cálculo, como no original. Datas de colunas são tipadas e decodificadas em UTC; datas civis do CSV continuam `Date` UTC e datas em JSON permanecem strings. SQL raw próprio retorna apenas locks textuais e compara hash JSON; sem timestamp cru. Listas usam `inArray` tipado, sem interpolar arrays raw. Preservados SQL NULL, JSON literal null e propriedades nulas.

## Evidências leves executadas

- **5 PASS / 0 FAIL / 0 SKIP**, heap 256 MiB.
- Golden AST independente: oito schemas/inputs, quatro funções puras, expressão SHA-256 e os três payloads completos dos eventos; alteração de Decimal normalizada somente no fingerprint.
- **Seis projeções / 36 colunas**, tipo e nulabilidade nos dois sentidos.
- **12 TS**: lint/parse com zero erros/warnings; **87 imports estáticos e seis dinâmicos** resolvidos.
- Check final conjunto com os dois testes Recruitment corrigidos: **14 TS**, zero erros de parse/lint e zero warnings; oito testes leves aprovados no total.
- Fixture offline: **28 INSERTs / 185 campos** conferidos, incluindo todos os obrigatórios sem default.
- Oito consumidores capturados continuam byte a byte iguais; zero imports/tipos/APIs Prisma nas quatro libs, contratos e repositórios próprios; zero Proxy/delegate/compat cast próprio.

Comando leve:

```powershell
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/drizzle-personnel-external-operations-ast.test.ts
```

## Doze cenários reais preparados para o parent

1. Readiness dos dois ambientes e validação CNPJ/HTTPS/credencial/schema sem gravação.
2. Upsert de conexão, preservação de metadata/mock, reset de testes, JSON null e credencial separada.
3. Benefícios com revisão histórica/version, ausência sobreposta, teto de desconto, Float individual e replay.
4. Rejeições de contrato/regime/configuração/vigência/assignment/rubrica/valor individual sem efeito parcial.
5. Falha tardia do movimento desfaz a evidência já enfileirada na mesma transação.
6. Prévia/aplicação de CSV com Decimal grande/negativo, multiline, datas civis, hash original e replay entre atores.
7. Arquivo duplicado, replay divergente, linha tardia inválida, falha tardia de auditoria e guards de imutabilidade ativos.
8. Grants por ator/configuração/titular ativo/UG-secretaria, sem alteração de regra de status de contrato.
9. Reserva por política/margem/UG/referência; falha tardia do evento desfaz acordo, cronograma e ledger; replay e divergência.
10. Shape/ordem/Decimal/datas UTC das listagens aninhadas e isolamento de conta sem grant.
11. Postagem com validação de folha/parcela/UG, rollback tardio do ledger, dedução e replay sem duplicação.
12. Conexão de origem incorreta rejeitada antes do pool; composição real de configuração observa estado não commitado e restaura por rollback.

Fixture independente com SQL explícito depois do histórico completo e transporte real Neon/Drizzle sobre PostgreSQL local PGlite, pool limitado a um cliente. Injetores de falha são locais/aditivos em `HrIntegrationEvent`, `HrMovement` e `HrConsignmentEntry`; nenhum guard/constraint histórico é desativado. Erros SQL esperados usam transações próprias com rollback.

Comando central sequencial:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-personnel-external-operations.test.ts
```

**Pendente:** persistência/integração e typecheck semântico centrais. Nenhum PGlite, tsc/build pesado, apply/seed/DML remoto ou operação Git foi executado nesta frente.
