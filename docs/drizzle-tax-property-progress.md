# Migração Drizzle — motores imobiliários e PGV

## Reserva e estado

Reserva exclusiva: 13 `src/lib/tributacao/property-*.ts`, `src/lib/tributacao/pgv-bulk.ts`, `tests/property-*.test.ts` (seis existentes + um novo) e `src/db/repositories/tax-property/**`. A reserva anterior de páginas também recebeu a adaptação dos três TSX consumidores próprios descrita abaixo. Sem mudanças em actions/APIs, núcleo Tax, serviços S2–S10 ou schemas compartilhados nesta entrega.

| Motor | Estado da implementação |
| --- | --- |
| `property-access.ts` | Executor Drizzle; imóvel, perfil vigente e origem conciliada |
| `property-history.ts` | Connection nos serviços; transaction nos helpers; atribuição local de ator/processo |
| `property-assessment-coverage.ts` | Transaction Drizzle; lock de imóvel e cobertura de simulações |
| `property-profile.ts` | Connection/transaction; perfis, copropriedade, política, auditoria e gatilhos na mesma transação |
| `property-structure.ts` | Snapshot repeatable-read; helper transacional explícito |
| `property-valuation.ts` | Decimal independente, PGV por testadas, memória/versionamento e upsert anual |
| `property-group-simulation.ts` | Repeatable-read/60s; hash e cálculos preservados |
| `property-simulation-assessment.ts` | Serializable/60s; locks, cobertura e writer externo na mesma transação |
| `property-operations.ts` | Cópia/desmembramento/remembramento e alteração simples em Drizzle |
| `property-bulk-change.ts` | Serializable/120s; seleção, versões, perfil e formulário revalidados |
| `pgv-bulk.ts` | Serializable/60s; locks determinísticos de catálogo e auditoria atômica |
| `property-cadastral-engine.ts` | Já puro; preservado |
| `property-profile-schema.ts` | Já puro; preservado |
| `property-edit-restrictions.ts` | Já Drizzle; delegação existente preservada |

**Implementação e fixtures concluídas na reserva; zero referências diretas Prisma nos 14 motores.** Revisão individual, lint, parse e confronto com catálogo concluídos. Testes reais, typecheck e build pertencem à fila central e ainda não foram executados por esta frente. A integração depende dos cinco helpers externos abaixo.

## Contratos para o owner Tax / integrador

Contratos independentes em `src/db/repositories/tax-property/contracts.ts`; registros são `RealEstateRecord` / `TaxRegistryEntryRecord`, sem tipos de payload ORM. Argumentos de negócio e semântica de erros permanecem os existentes.

### Consumidores externos que precisam adaptar o primeiro argumento

| Exportação | Primeiro argumento / retorno | Consumidores externos identificados |
| --- | --- | --- |
| `assertPropertyCadastralAccess` | `DatabaseExecutor`; `{ property, profile, scope }` | `economic-profile.ts`, `imoveis/[id]/page.tsx`, `imoveis/property-actions.ts` |
| `attributePropertyHistory`, `touchPropertyMetadata` | `DatabaseTransaction`; `Promise<void>` | `itbi-ownership.ts`, `configurable-cadastres.ts`, actions imobiliárias e de cadastros fiscais |
| `assertPropertyOutsideAssessedSimulation` | `DatabaseTransaction`; `Promise<void>` | `index.ts`, `s2-service.ts` |
| `createPropertyWithHistory`, `updatePropertyWithHistory` | `DatabaseConnection`; `Promise<PropertyRecord>` | actions imobiliárias; testes externos de integração |
| `publishPropertyRegistrationPolicy`, `savePropertyProfile`, `createPropertyWithProfile` | `DatabaseConnection`; registro fiscal / imóvel | actions de configuração/perfil; `tax-cadastral-migration-chain.test.ts` |
| `savePropertyProfileInTransaction` | `DatabaseTransaction`; registro fiscal | uso interno da reserva |
| `readPropertyStructure` | `DatabaseConnection`; `Promise<PropertyStructure \| null>` | `imoveis/[id]/PropertyStructure.tsx` |
| `readPropertyStructureInTransaction` | `DatabaseTransaction`; mesmo DTO | helper explícito para quem já tem snapshot |
| `evaluateConfiguredPropertyValuation` | `DatabaseTransaction`; `{ value: Decimal, memory }` | `s3-service.ts` |
| `publishPropertyValuationRule`, `saveConfiguredPropertyValuation` | `DatabaseConnection`; registro fiscal | actions de avaliações; `tax-property-cadastral-completion.test.ts`, `itbi-online-channel.test.ts` |
| `simulateGroupedPropertyValuation` | `DatabaseConnection`; `{ venalValue, estimatedTax, memory, previewHash }` | `avaliacoes/simulacao/page.tsx` |
| `simulatePropertyInTransaction` | `DatabaseTransaction`; mesmo DTO | uso interno da reserva |
| `assessPropertySimulation` | `DatabaseConnection`; `Promise<PropertyAssessmentRecord>` independente | actions de simulação |
| `copyProperties`, `reorganizeProperties`, `property-operations.bulkChangeProperties` | `DatabaseConnection`; retornos de negócio existentes | actions de operações |
| `propertyFilterWhere` | retorna `SQL \| undefined` (predicado Drizzle) | nenhum consumidor externo encontrado |
| `readPropertyBulkSelection`, `readPgvBulkSelection` | `DatabaseExecutor`; seleções existentes | actions de alteração geral, `pgv-lote/page.tsx` |
| `property-bulk-change.bulkChangeProperties`, `bulkChangePgvCatalogs` | `DatabaseConnection`; retornos existentes | actions de alteração geral / PGV |

As duas funções `bulkChangeProperties` são exportações distintas e mantêm entradas/retornos distintos. O caller deve passar `connection` aos serviços que abrem transação, `connection.db` aos leitores e **o próprio `tx` recebido** aos helpers transacionais.

### Dependências externas ainda legadas na versão lida

| Helper do owner Tax | Contrato necessário nesta reserva |
| --- | --- |
| `resolveTaxAssessmentScope` (`scope.ts`) | `(executor: DatabaseExecutor, actor: TaxActor, taxId: string, snapshot?: JsonValue \| null) => Promise<{ budgetUnitId: string \| null; governmentEntityId: string \| null }>` |
| `resolveTaxFinancialYear` (`scope.ts`) | `(executor: DatabaseExecutor, year: number, scope: { governmentEntityId: string \| null }, requireOpen?: boolean) => Promise<FinancialYearRecord>`; campos usados: `id`, `status`, `year` |
| `createTaxAssessmentInTransaction` (`index.ts`) | `(tx: DatabaseTransaction, actor: TaxActor, input de lançamento existente) => Promise<PropertyAssessmentRecord>`; chamada desta reserva envia `{ year: number, taxId: string, taxpayerId: string, realEstateId: string, taxableBase: string, rate: string }`; retorno é o DTO integral `AssessmentRow` independente, com `id`, `calculationSnapshot`, Date e Decimal |
| `publishFiscalCatalogInTransaction` (`configurable-cadastres.ts`) | `(tx: DatabaseTransaction, actor, raw: z.input<typeof fiscalCatalogSchema>) => Promise<TaxRegistryEntryRecord>` |
| `saveConfiguredFiscalRecordInTransaction` (`configurable-cadastres.ts`) | `(tx: DatabaseTransaction, actor, raw: z.input<typeof fiscalRecordSchema>) => Promise<TaxRegistryEntryRecord>` |

Esses helpers não devem abrir outra conexão/transação: a reserva exige atomicidade conjunta de auditoria, catálogo, perfil, histórico e lançamento. Seus wrappers públicos usados nos testes de integração (`configureTaxFinancialMapping`, `createTaxAssessment`, `publishFiscalCatalog`, `saveConfiguredFiscalRecord`) devem receber `DatabaseConnection` conforme a migração do owner.

### Consumidores TSX próprios já adaptados

- `avaliacoes/simulacao/page.tsx` passa `databaseConnection` ao serviço repeatable-read/60s; seletores continuam usando seu executor de leitura.
- `imoveis/[id]/PropertyStructure.tsx` recebe `DatabaseConnection` na prop server-only existente; `imoveis/[id]/page.tsx` passa `databaseConnection`, mantendo a leitura da estrutura numa transação repeatable-read própria, como antes.
- Comparação AST somente leitura dos **146 TSX** contra a referência visual: **única diferença de JSX** é a expressão de infraestrutura `PropertyStructure prisma={prisma}` → `prisma={databaseConnection}`. Nenhuma diferença nas demais raízes, marcação HTML, classes, texto ou conteúdo renderizado.

## Persistência e invariantes

- Reutilização das tabelas tipadas existentes, sem DDL nem registro global de relações. Novo repositório faz selects explícitos e binds parametrizados por campo.
- `propertySnapshot`: Date → ISO, Decimal → texto, undefined em objeto omitido / em array null, JSON null preservado; sem cast de payload.
- Readers usam colunas Drizzle tipadas (incluindo timestamps); SQL raw de gatilhos/locks não projeta DTO temporal. Decimal numérico textual é construído diretamente com `new Decimal(string)`.
- Preservadas transações originais: perfil/criação, efetivação de simulação, alteração simples e PGV serializable/60s; alteração avançada serializable/120s; estrutura repeatable-read; simulação repeatable-read/60s; cópia/reorganização 60s com isolamento padrão.
- Preservados locks de imóvel/advisory, ordenação, origem ente/UG, copropriedade 100%, obsolescência de versões, imutabilidade, conservação de áreas, ausência de cópia de débitos/documentos e cobertura de simulações vigentes.

## Testes e validação central

Os seis testes existentes foram convertidos individualmente para fixture autônoma Neon/Drizzle/PGlite, DDL exclusivamente do SQL histórico. Não usam DMMF, fixture de planejamento nem adaptador Prisma. Fixture própria em `src/db/repositories/tax-property/test-fixture.ts` reutiliza o transporte compartilhado real, com pool cinco/dez sockets, e fechamento sequencial.

- Histórico: imóvel legado é inserido **antes** da instalação dos gatilhos; `migrate()` então completa todo o histórico SQL. Conservadas concorrência, baseline com zero, cadeia de snapshots, rollback, atribuição local e imutabilidade.
- Estrutura: fixture deliberadamente para antes de `20261015140000_property_edit_restrictions`, pois seus perfis mínimos testam vínculos, não o formulário completo. Sem desativar gatilhos ou fabricar tabelas.
- Operações, perfil, bloqueio e PGV: replay integral do histórico; assertions de erros PostgreSQL percorrem `Error.cause` do driver Drizzle. Conservadas assertions de autorização, documentos/débitos de origem, áreas, versões, vínculo de unidade, cópia de coproprietários, simulação sem efeitos, hash, cobertura e rollback PGV. Acrescentada imutabilidade da memória de simulação efetivada.
- Novo `tests/property-bulk-change.test.ts`: seleção/fingerprint, catálogo obsoleto, filtro por campo configurado e falha injetada **na auditoria final**. Verifica rollback conjunto de imóveis, perfis, formulários, históricos e auditorias, depois a efetivação e rejeição da prévia antiga/situação inválida.
- Nova suíte autônoma `src/db/repositories/tax-property/records.integration.test.ts`: catálogo físico a partir do SQL histórico, execução dos leitores vazios, locks, JSON null versus SQL NULL, snapshot Date/Decimal/undefined, precisão de numeric(18,6)/(18,2), identidade/createdAt no upsert anual, relações nullable PF/PJ, proprietários ativos, encerramento de titularidade e escopos JSON número versus texto. Independente dos cinco helpers externos.

### Verificações leves executadas

- ESLint dos motores alterados, repositório/fixtures/testes próprios e três TSX consumidores: **exit 0, zero erros/avisos**.
- Parse AST TypeScript/TSX: **29 arquivos (14 motores, cinco arquivos do repositório, sete testes, três TSX), zero diagnósticos sintáticos**.
- Confronto independente com `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: **14 tabelas / 208 colunas / zero divergências** de nomes, tipo físico/precisão/escala e nulabilidade. Sem gerar oráculo do schema TypeScript.
- Corpo de cálculo `evaluatePropertyValuation` idêntico à referência após normalização apenas de `Prisma.Decimal` → `Decimal`; `property-profile-schema.ts` idêntico. Os dois motores puros e a fachada de bloqueios já migrada não receberam alterações desta frente.
- Diagnóstico central lido: `.agent/drizzle-monolithic-typecheck-errors.json`, `checkedAt=2026-10-28T17:20:35.541Z`. Seus erros de consumidores ainda refletem assinaturas anteriores; esse relatório **precede** esta implementação e não comprova typecheck atual. Nenhum typecheck paralelo executado.

### Fila central — comandos sequenciais

Pode executar já, sem aguardar migração dos helpers de catálogo/lançamento/escopo:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 src/db/repositories/tax-property/records.integration.test.ts tests/property-history.test.ts tests/property-operations.test.ts tests/property-edit-restrictions.test.ts tests/property-structure.test.ts
```

Após integração dos cinco helpers e quatro wrappers públicos acima:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/property-profile.test.ts tests/property-pgv-integration.test.ts tests/property-bulk-change.test.ts
```

Não inferir aprovação global de grep/lint/parse. Nenhuma suíte real, build ou typecheck executados por esta frente; aguardando resultado central e adaptação dos consumidores externos conforme a matriz. Nenhuma operação Git ou alteração de DDL/dados remotos.
