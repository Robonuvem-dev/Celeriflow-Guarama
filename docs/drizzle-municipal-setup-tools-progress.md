# Ferramentas municipais — Planejamento e sete scripts RH

## Ownership e entrega

Transferência recebida: primeiro os dois programas de Planejamento, depois confirmação expressa dos sete programas RH. Todos foram analisados individualmente; buscas de consumidores anteriores localizaram apenas referências documentais e a mensagem de pré-requisito entre os dois CLIs POC. As novas funções exportadas são consumidas pela suíte desta frente.

| Programa exclusivo em `scripts/` | Entrada testável | Comportamento CLI preservado |
|---|---|---|
| `seed-municipal-planning.ts` | `seedMunicipalPlanning(connection, actorId)` | exige exclusivamente `--apply`, URL isolada e administrador técnico ativo; recusa produção/URL operacional |
| `verify-planning-readiness.ts` | `verifyPlanningReadiness(executor, storageConfigured?)` | diagnóstico read-only; saída e erro resumidos originais |
| `adopt-aurora-advance-accounting.ts` | `adoptAdvanceAccounting(connection, apply = false)` | preview padrão; adoção aditiva idempotente |
| `adopt-aurora-payroll-accounts.ts` | `adoptPayrollAccounts(connection, apply = false)` | preview padrão; adoção aditiva e validação da classificação publicada |
| `adopt-aurora-travel-policy.ts` | `adoptTravelPolicy(connection, apply = false)` | preview padrão; preserva conjuntos/regimes de produção e recusa política divergente |
| `adopt-aurora-travel-workflows.ts` | `adoptTravelWorkflows(connection, apply = false)` | preview padrão; roteiro por ente, UGs ordenadas e publicação legal |
| `seed-hr-documentary-poc.ts` | `seedHrDocumentaryPoc(connection, competence?, args?)`; `documentaryPocPreview` | preview sem abrir conexão; `--competence`, `--calculate`, `--close`, `--publish` originais |
| `seed-hr-poc-linked-workflows.ts` | `seedHrPocLinkedWorkflows(connection, publish = false)`; `linkedPocPreview` | preview sem conexão; cálculos vinculados e publicação opcional |
| `seed-rh.ts` | `seedRh(connection, log?)` | carga direta original; mesmos logs, CPFs, estados, valores e datas |

Todos os CLIs usam conexão própria `DatabaseConnection`, fecham o pool em `finally` e têm guard `require.main === module`. **Zero imports/clientes/APIs Prisma e zero Proxy** nos nove programas e helpers. O nome físico `_prisma_migrations` permanece no diagnóstico para consultar a evidência histórica existente; não há uso de ORM nessa consulta.

### Arquivos novos próprios

- `scripts/lib/municipal-setup-tools.ts`: conexão, atores, locks, catálogo e eventos contábeis.
- `scripts/lib/municipal-setup-poc.ts`: adoção independente do bootstrap documental, com dados copiados da origem e prova AST golden.
- `src/db/schema/municipal-setup-tools.ts` e `src/db/schema/municipal-setup-personnel.ts`: projeções físicas exclusivas, **63 tabelas / 448 colunas**, sem migrações/DDL produtivo.
- `tests/drizzle-municipal-setup-tools-ast.test.ts`.
- `tests/drizzle-municipal-setup-tools.test.ts` e `tests/fixtures/municipal-setup-tools.sql`.

Não foram editados motores, actions, contexto, repositórios ou schemas existentes de Planejamento/RH, infraestrutura compartilhada, package/lock/build/CI/config ou documentação global. RH Pages e os 12 FinanceSetup continuam sob ownership desta frente para falhas centrais.

## Transações e composição

- A carga municipal preserva a transação única de 120 s e o lock `municipal-planning-reference`. Ator técnico é validado antes dela, como na origem. Marcador, colisões, pessoas, Câmara, peças, linhas, totais e auditoria compartilham a transação real.
- As quatro adoções preservam uma transação única de 60 s, advisory locks originais, critérios de replay/divergência e evidências. Publicação de catálogo ocorre depois das entradas em `DRAFT`; publicação workflow ocorre depois das etapas em `DRAFT`, com autoria/data pelo serviço Drizzle existente.
- `createMunicipalEdition` exige `DatabaseTransaction`. Chamadas do verificador contábil e publicador de workflow recebem a própria transação; não há cast de conexão, delegate, API emulada ou transação paralela.
- O bootstrap documental original abria **três transações separadas**, preservadas no helper exclusivo: parâmetros (`RH:POC:BOOTSTRAP:V1`), pessoas/cargos/folhas (`RH:POC:DATASET:V1`) e contratos (`RH:POC:CONTRACTS:V1`), cada uma de 60 s. O comportamento de instalação parcial entre essas fases continua o mesmo; cada fase tem rollback integral.
- Contratos novos chamam `saveEmploymentContractInTransaction` com a transação Drizzle real e input validado pelo schema RH. Cálculo/fechamento/publicação, revisão contratual, pensões e direitos de férias recebem **DatabaseConnection**, pois os serviços abrem suas próprias transações. Mantidas as fronteiras originais dos programas POC, sem adaptar um `tx` para parecer conexão.
- O pequeno `seed-rh.ts`, que antes gravava item a item, agora agrupa seus 17 payloads numa transação real para rollback técnico. Mantém a semântica original: reusa funcionários/cargo/setor/benefício existentes, mas **acrescenta** folhas, férias, ponto, licença, dependente, benefícios e atos a cada execução. Não foi inventado marcador de replay para essa carga legada.

## Preservação de dados e escalares

- Hashes e constantes das quatro adoções, ordem dos códigos/eventos, aliases `aurora-account:*`, mensagens, tipos/estados e payloads JSON preservados.
- Valores monetários e metas NUMERIC em Planejamento e parâmetros RH são `Decimal` desde a string até o binding tipado. Não há conversão de NUMERIC por `Number`.
- `IndicatorPPA.baselineValue/targetValue` e os campos monetários legados do pequeno seed RH são fisicamente `double precision`. Suas expressões originais foram mantidas, incluindo `Number(program.target) * 0.8`; isso não converte colunas NUMERIC.
- Datas tipadas usam os encoders/decoders centrais. `CamAdvisor.startsAt` é `date`, com modo Date; timestamps preservam milissegundos e UTC. O seed RH conserva inclusive a ordem original da mutação local `today.setHours(8...)` / `today.setHours(17...)`.
- SQL bruto próprio retorna boolean, texto ou contagens; estas últimas continuam JSON number no diagnóstico, como na origem. Não há raw timestamp ou numeric monetário sem decoder.
- Limite previdenciário aberto permanece SQL NULL; `endsAt` de contrato mantém NULL; strings/objetos/arrays e null JSON continuam distintos. Nenhuma consulta interpreta JSONB como Decimal ou Data.
- Upserts vazios viraram `ON CONFLICT DO NOTHING` seguidos da leitura correspondente quando necessária, preservando alterações do operador e timestamps. Inserções em lote vazias são omitidas; conflitos seguem os alvos físicos originais.

## Evidência e validação leve

Baseline readonly antes das alterações: `C:/Users/trici/AppData/Local/Temp/opencode/municipal-setup-tools-originals.json`, incluindo os nove scripts e a origem `src/lib/rh/poc-bootstrap.ts`.

Provas AST independentes desse arquivo temporário, fixadas no teste:

1. Definições originais de todas as constantes/hashes e os payloads `payload`, `details`, `specialParameters` dos nove programas.
2. Arrays completos de definições de rubricas/regras POC e referência documental, com mesma ordem, strings, números e nulls.
3. Os **17 payloads originais de escrita de `seed-rh.ts`**, comparados por tokens após normalizar somente delimitadores de string/trivia; expressões de datas, enums e chaves mantidos.
4. Existência/tipo/nulabilidade das 448 colunas contra o catálogo físico fornecido; nenhum schema existente foi alterado para acomodar o código.

Hashes funcionais fixados na integração:

| Adoção | SHA-256 original |
|---|---|
| Adiantamentos | `3780b2dd74644743490f499c78dbbb0d557c348e8dfa1d9c9706c73cbb00c377` |
| Contas de pessoal | `e934a1a19fd50d898a41f3aeeee784143d2d514b4c3c57c57acdb5c4c9521f32` |
| Política de viagens | `94043dba0c3ff941ed664fca482c2b39374965e26f03d4f046bba7da1e60909d` |
| Roteiros de viagens | `dc631c31ea498eef61a8a3aa90b576a7d56a103ccd653ba1a2ad665c4686591d` |

Validação final executada com heap de **256 MiB**:

- AST: **3 PASS, 0 FAIL, 0 SKIP**, incluindo a prova dos 17 payloads legados.
- ESLint/parse/imports de 15 arquivos: **zero erros/warnings e zero problemas sintáticos/imports**, 109 imports estáticos e 13 dinâmicos resolvidos.
- Nove subcenários de integração conferidos por AST; 63 tabelas/448 colunas validadas contra o catálogo, inclusive nulabilidade dos campos obrigatórios declarados.

## Suíte real preparada para o parent

`tests/drizzle-municipal-setup-tools.test.ts` usa `createSpecializedDrizzleFixture`, replay integral dos 156 SQL históricos e o transporte real Neon/Drizzle. Pré-condições são SQL explícito próprio; banco/tributos históricos não são reinseridos, rebatizados ou apagados.

Nove subcenários preparados:

1. Carga municipal: autorização, colisão tardia depois dos cadastros Câmara e rollback total; seis instrumentos, 60 linhas, Câmara, datas, totais Decimal, auditoria e replay.
2. Diagnóstico: presença das sete tabelas, contagens, módulos ordenados, storage, evidência de migração não concluída e read-only. O executor histórico não cria seu próprio registro de migrações; o teste usa uma relação **TEMP local/transacional** com o layout capturado de `_prisma_migrations`, descartada com rollback. Nenhuma relação produtiva/guard é substituída.
3. Adoções de adiantamentos e pessoal: preview sem DML, hashes, aliases/pares, publicação, replay e proteção de cadastro alterado pelo operador.
4. Política de viagens: ausência/presença de conjunto, escopo produção, datas, JSON exato, replay e divergência preservada.
5. Workflows: agrupamento de UGs por ente, ordenação, colisão no segundo ente revertendo o primeiro, publicação após etapas e guard imutável real.
6. Seed RH: identidades, estados/valores/datas/nulls e semântica aditiva original.
7. Previews documentais sem conexão, validação do ano, três contratos/nove tipos, limites NUMERIC e null, replay preservando ajuste de parâmetro do operador.
8. Nove cálculos oficiais demonstrativos de outubro, fechamento, igualdade Decimal bruto–descontos=líquido, 27 demonstrativos e replay sem duplicação.
9. Fluxos vinculados: revisão intramês, pensão, primeira parcela vinculada, diferença de 13º e férias com direitos; publicação, replay e isolamento do conjunto produtivo.

Os preparadores abrem/commitam suas transações **somente na conexão local efêmera** para testar as mesmas fronteiras produtivas; cada falha transacional reverte antes do `node:test`. Não há outer transaction que absorva erro PostgreSQL e contamine os próximos subtestes. A fixture fecha em `finally`.

Comandos da fila central sequencial:

```powershell
node --max-old-space-size=256 --import tsx --test --test-concurrency=1 tests/drizzle-municipal-setup-tools-ast.test.ts
node --max-old-space-size=512 --import tsx --test --test-concurrency=1 tests/drizzle-municipal-setup-tools.test.ts
```

**Integração ainda não executada nesta frente.** Nenhuma execução CLI/apply/seed em Neon, PGlite paralelo, tsc/build ou operação Git foi feita. Typecheck/build semânticos e persistência estão reservados ao parent.

## Interrupção FinanceSetup durante a missão

Correção prioritária concluída da fixture dos 12 FinanceSetup: referência `Bank` COMPE `001` e `tax_iptu/tax_itbi/tax_issqn` passaram a ser reutilizadas de `20261010130000_add_master_data_foundation`; lint/parse limpo e novo reteste solicitado ao parent. Handoff específico em `docs/drizzle-finance-setup-tools-progress.md`. Não foi declarado PASS PostgreSQL pós-correção nesta frente.

## Correção da conferência física ampliada central

Corrigidas as oito nulabilidades reportadas pelo parent em `.agent/drizzle-current-schema-check.json`: `ConfiguracaoInstancia.municipio/uf`, `AttendanceRecord.hoursWorked`, `BenefitConfig.baseValue`, `Department.secretariatId`, `Leave.endDate`, `PlanningBudgetLine.physicalTarget` e `Payroll.totalValue` agora declaram `notNull()`.

Conferidos individualmente os dois schemas e todos os consumidores/imports. Os quatro campos com default físico zero preservam esse default no mapping (`Decimal` no NUMERIC da meta física, number nos doubles legados). As escritas produtivas já informam os campos obrigatórios sem default. A pré-condição da colisão de workflow passou a informar a secretaria real, evitando NULL indevido antes de testar a unicidade. O teste físico agora exige igualdade de nulabilidade **nos dois sentidos**, para todas as 448 colunas.

Constraints físicas e scripts/payloads produtivos preservados. Validação limitada a lint/parse/AST e comparação offline, heap 256 MiB; execução PostgreSQL segue com o parent.
