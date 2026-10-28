# Tributação e Cemitérios — migração Drizzle

## Estado e escopo

**Em andamento; migração integral ainda não concluída.** Escopo reservado: `src/lib/{tributacao,cemeteries}`, `src/app/app-domain/{tributacao,cemiterios}`, `src/app/api/{tributacao,cemiterios}`, validação pública de alvará, portais tributário/NFS-e, novos schemas/repositórios/contratos e testes específicos.

Árvore compartilhada com trabalho paralelo. Não foram executados instalação, build, tsc global, DDL/carga em banco remoto, commit ou push. Verificações pesadas ficam para execução sequencial pelo responsável pela integração.

## Entregas implementadas

- Decimal independente (`@/db/decimal`) nos motores fiscais S2–S10, opções de pagamento, cadastro imobiliário, taxas cemiteriais e DANFSe.
- Cálculo puro `calculateTaxAssessment`/`TaxError` extraído para `assessment-engine.ts`; exports anteriores preservados em `index.ts`.
- Schema `cemeteries.ts` com as 19 tabelas do domínio e contratos completos de consulta, relatório, lookup e anexos.
- Consultas cemiteriais com filtros SQL, joins e DTOs explícitos; páginas de consulta e relatório adaptadas.
- Anexos cemiteriais: documento, versão, vínculo e auditoria escritos na mesma transação Drizzle. Referências GED verificadas por SQL explícito.
- Quatro endpoints de Cemitérios adaptados; emissão de relatório registra histórico e auditoria atomicamente.
- Schemas cadastral e NFS-e; leitura de nota, dados fiscais, partes/endereços, histórico e validação de alvará em repositórios dedicados.
- Portal NFS-e: autorização TITULAR/NFSE, vigência e situação canônica ativa aplicadas antes da contagem/paginação em SQL.
- Páginas públicas de NFS-e/alvará e endpoints internos XML/documento/PDF adaptados, preservando apresentação e geração documental.
- `tests/cemetery-query-attachments.test.ts`: consultas/anexos Drizzle e catálogo de colunas Drizzle substituindo DMMF; cadeia financeira legada preservada enquanto seus writers não forem migrados.
- Cruzamento de inteligência tributária e emissão de auto em `inteligencia-tributaria-engine.ts`, com schema `TaxAuditCrossCheck`, Decimal independente e DTO explícito. As três actions em `fiscalizacao-actions.ts` mantêm os envelopes `{ data?, error? }` e os gates de acesso/operação.
- Contadores: publicação versionada com advisory lock, controle otimista, histórico `TaxAuditLog` e `AuditEvent` na mesma transação; listagem e action/página adaptadas. O teste econômico existente passa a conexão Drizzle à publicação do contador e preserva os demais writers legados.
- Bloqueio/liberação imobiliária: escopo ente/UG, lock `FOR UPDATE`, versões, conferência de posição e operador/perfil ativo preservados; gravação e auditorias atômicas. Actions mantêm autorização exclusiva de supervisor e retorno `{ error? }`. Página mantém a consulta da função nativa `property_effective_edit_restriction`; triggers continuam controlando o consumo da autorização.
- `readNfseDocumentHistory` passa a retornar `NfseDocumentHistory`, com eventos/cartas explicitamente tipados fora do ORM.
- Integração C7: `taxAssessmentCompensatedValue(tx: DatabaseExecutor, assessmentId): Promise<Decimal>` usa o executor recebido, com consulta dedicada de movimentos efetivados e soma Decimal independente; não abre conexão/transação. `taxScopeSnapshot` é puro e usa JSON estrutural independente, preservando membros opcionais e o DTO anterior. `scope.ts` não importa mais Prisma em runtime. Um overload legado específico preserva os chamadores Prisma já localizados, usando exclusivamente o cliente/transação que receberam, até a migração inteira dessas unidades; não há conversão entre ORMs.

### Contratos e consumidores alterados

| API | Conexão nova | Consumidores adaptados |
|---|---|---|
| `listCemeteryProcesses`, `cemeteryBurialReport`, `cemeteryLookup`, `assertCemeteryAttachmentTarget`, `listCemeteryAttachments` | `DatabaseExecutor` | Páginas de consulta/relatório, quatro endpoints cemiteriais e teste de consultas/anexos |
| `ingestCemeteryAttachment` | `DatabaseConnection` | Endpoint de anexos e teste de consultas/anexos |
| `runTaxAuditCrossCheck`, `issueTaxInfractionNotice` | `DatabaseExecutor` | Actions de inteligência tributária |
| `publishAccountant` | `DatabaseConnection` | Action de contadores e `tests/economic-profile.test.ts` |
| `publishPropertyEditRestriction`, `approvePropertyEdit` | `DatabaseConnection` | Actions de bloqueio, `tests/property-edit-restrictions.test.ts` e `tests/property-profile.test.ts` |

Todos os consumidores foram localizados antes da alteração. Testes legados usam transporte Neon/Drizzle ligado ao mesmo PGlite **entre** operações completas, sem misturar conexões/ORMs dentro de uma transação.

## Fronteiras transacionais pendentes

- `tributacao/index.ts`, `accrual-accounting.ts`, `s9-service.ts` e `cemeteries/{fees-service,structure-service,workflow}.ts` continuam com Prisma. Integram arrecadação, dívida ativa, contabilização e Planejamento/Financeiro; devem migrar como unidades transacionais completas com a mesma `DatabaseTransaction`.
- Serviços tributários restantes, actions/páginas internas e portal tributário ainda contêm consultas e writers Prisma. A existência dos novos schemas não significa migração desses consumidores.
- Não converter helpers transacionais isoladamente enquanto os chamadores ainda entregarem `Prisma.TransactionClient`; não abrir Drizzle em conexão separada dentro dessas transações.
- `tests/cemetery-fees-service.test.ts` e `tests/cemetery-workflow-service.test.ts` ainda usam DMMF e fixtures Prisma. Exigem migração real dos writers/fixtures, preservando as asserções.
- A compatibilidade de tipos Decimal com os consumidores legados precisa ser verificada no TypeScript da integração; não foram introduzidos casts para mascarar incompatibilidades.
- `src/lib/fiscalizacao/**`, `src/lib/portal-cidadao/**`, helpers de assinatura/GED e fixtures compartilhadas estão fora desta reserva; consumidores internos ainda os importam. Em particular, migrar as actions de inteligência não migra `fiscalizacao/actions.ts`, `s7-actions.ts` nem a página operacional de Fiscalização.

## Inventário residual reproduzível

`node scripts/drizzle-inventory-taxation.mjs` é somente leitura. `--details` inclui linha/sinal/imports; `--check` falha enquanto houver dependências diretas. Snapshot desta entrega: **459 arquivos examinados, 284 com evidência sintática direta Prisma/tipos/chamadas legadas**, incluindo testes/scripts específicos. Não é percentual de funcionalidades migradas nem certificação de ausência de dependência transitiva.

| Diretório | Examinados | Com evidência direta residual |
|---|---:|---:|
| `src/lib/tributacao` (inclui testes internos) | 106 | 75 |
| `src/lib/cemeteries` | 11 | 3 |
| `src/app/app-domain/tributacao` | 219 | 133 |
| `src/app/app-domain/cemiterios` | 20 | 10 |
| `src/app/api/tributacao` | 14 | 14 |
| `src/app/api/cemiterios` | 4 | 0 |
| `src/app/validar-alvara` | 2 | 0 |
| `src/app/portal/tributario` | 16 | 10 |
| `src/app/portal/nfse` | 2 | 0 |
| Novos repositórios Tributação/Cemitérios | 11 | 0 |

O comando lista todos os caminhos residuais. Os dois usos diretos de DMMF no recorte são `tests/cemetery-fees-service.test.ts` e `tests/cemetery-workflow-service.test.ts`; as fixtures compartilhadas importadas por outros testes também permanecem legadas e não são certificadas por esse inventário nominal.

## Validação realizada

49 testes puros aprovados (~4,38 s): motores fiscais S2–S10, C8, cadastro imobiliário e cálculo de taxas cemiteriais.

```powershell
node --import tsx --test src/lib/tributacao/__tests__/fiscal-engine-s2.test.ts src/lib/tributacao/__tests__/s3-engine.test.ts src/lib/tributacao/__tests__/s4-engine.test.ts src/lib/tributacao/__tests__/s5-engine.test.ts src/lib/tributacao/__tests__/s6-engine.test.ts src/lib/tributacao/__tests__/s7-engine.test.ts src/lib/tributacao/__tests__/s8-engine.test.ts src/lib/tributacao/__tests__/s9-engine.test.ts src/lib/tributacao/__tests__/s10-engine.test.ts src/lib/tributacao/__tests__/c8-tax-assessment.test.ts src/lib/tributacao/__tests__/property-cadastral-engine.test.ts tests/cemetery-fees-engine.test.ts
```

Ainda pendentes: testes de integração dos novos leitores/writers, verificação TypeScript e build pelo integrador. Fixtures Neon/PGlite que alteram `neonConfig` devem ser executadas sequencialmente.

- ESLint do código novo/migrado, motores, páginas, endpoints, testes e scripts específicos: **PASS**, zero erros e zero avisos. `git diff --check` do recorte alterado: **PASS**.
- Smoke local da integração C7: **PASS**, `taxScopeSnapshot` conserva objeto/nulos/arrays e importar `scope.ts` não carrega nenhum runtime `@prisma`/`.prisma` no cache de módulos. ESLint dos helpers/repositório e teste atualizado também aprovado; nenhum teste pesado ou tsc foi executado durante o build central.
- `node scripts/drizzle-verify-taxation-handoffs.mjs`: **PASS**, sete páginas alteradas com raízes JSX textualmente idênticas a `3f05dcd` (somente CRLF/LF normalizados).
- Nova suíte `tests/drizzle-taxation-cemeteries.test.ts` preparada, **não executada neste agente**: replay local do histórico SQL sem DMMF, catálogo/numerics/nulabilidade, partes/endereços/histórico NFS-e, filtros de autorização antes de paginação, alvará, versões/rollback de contador, compensação exata na transação repeatable read recebida e seu rollback, controle/consumo de autorização imobiliária, anexos GED e auditoria de relatório. Usa driver Neon real contra PGlite isolado; não acessa `DATABASE_URL` remoto.

### Execução sequencial para integração

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-taxation-cemeteries.test.ts tests/cemetery-query-attachments.test.ts tests/economic-profile.test.ts tests/property-edit-restrictions.test.ts tests/property-profile.test.ts
```

Depois de migrar os writers financeiros/cemiteriais, incluir novamente os testes de taxas, estrutura, workflow e cadeias financeiras completas. Os testes já existentes não foram removidos nem tiveram suas asserções financeiras reduzidas.
