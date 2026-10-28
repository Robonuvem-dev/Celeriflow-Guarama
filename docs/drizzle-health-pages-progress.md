# Saúde — páginas e componentes Drizzle

## Reserva exclusiva e estado

- Transferência de 28/10: **100 `.tsx`** em `src/app/app-domain/saude/**`, excluindo `farmacia/**`; repositories exclusivos `health-pages/**`, contratos `src/lib/contracts/health-pages.ts` e mappings mínimos `src/db/schema/health-pages.ts`.
- Os **17 `.tsx` de Farmácia** e a infraestrutura `health-pharmacy-pages` pertencem a TFD/TaxFinalHelpers. As páginas retidas que já consumiam `pharmacyPatients` continuam usando esse reader existente, sem duplicá-lo.
- Actions/APIs `.ts`, serviços e repositories/schemas Saúde compartilhados seguem com os respectivos owners. Contratos de retorno de actions e handlers foram preservados.
- O inventário de entrada tinha 33 `.tsx` com referências diretas ao ORM anterior. O inventário atual dos 100 arquivos retidos tem **zero marcadores Prisma**, inclusive acessos raw/transacionais legados.
- Guia Next instalado de fetching consultado. Readers recebem `DatabaseExecutor`; páginas resolvem `context.database ?? db`. Os dois fluxos de leitura TFD que já abriam transação usam `DatabaseConnection`/`withDatabaseTransaction`, mantendo o isolamento padrão original.

## Implementação e revisão

- `health-pages/catalogs.ts`: opções de relatórios, unidades, histórico de cargas SUS, configuração laboratorial e integrações. Preserva escopo global versus vazio, vínculos profissionais alternativos ativos, catálogos globais, `distinct`, joins, ordenação, limites por pai e paginação original.
- `health-pages/administration.ts`: referências e as 11 abas administrativas. Projeções seguem os DTOs de `AdministracaoClient`; históricos aninhados, feriados e nascimento são decodificados explicitamente por `databaseTimestamp`. Campos de vigência dos escopos administrativos permanecem texto conforme o catálogo físico.
- `schema/health-pages.ts`: apenas projeções read-only de `HealthLaboratoryConfiguration` e `HealthEsusBatch`, sem DDL. A configuração laboratorial seleciona os campos originais e o nome do autor, sem acrescentar o identificador do autor às props do client.
- As páginas de administração, importações, configuração laboratorial, relatórios e integrações usam os readers exclusivos. As demais implementações Drizzle recebidas foram revisadas estaticamente em conjunto com os contratos atuais de TFD, acompanhamento, vacinação e leitores clínicos.
- Ajustes da revisão: fallback do executor nas 18 páginas que acessavam o campo opcional diretamente; padrões `LIKE`/`ILIKE` originais nas buscas; auditoria `LIKE 'HEALTH_%'` case-sensitive, conservando o significado de `_` no PostgreSQL e os limites inclusivos de data; vínculo obrigatório profissional/servidor nas condutas ESAVI; ausência de pedido laboratorial como `null`, distinta de pedido sem laudos; nome vazio do responsável familiar distinto de ausência de pessoa; retirada de ordenação adicional na lista limitada de profissionais SISAB.
- Listas e detalhes continuam com os guardas de módulo/unidade e titularidade originais. A aba de acessos só consulta dados após `isSystemAdministrator`; cargas SUS globais rejeitam usuários com escopo por unidade; prontuários, carteira vacinal, acompanhamento e solicitações TFD conservam os checks anteriores à apresentação dos dados.
- Seleções tipadas usam os decoders dos mappings existentes. As consultas raw remanescentes em páginas projetam IDs/textos/counts; os timestamps raw do reader administrativo são convertidos campo a campo. Nenhuma conversão por nome de propriedade ou API ORM simulada foi introduzida.

## Regressão JSX portátil

- `tests/fixtures/health-pages-original-jsx.json`: 100 fingerprints congelados do JSX **original**, capturados da referência designada antes da migração, nunca das páginas migradas.
- `tests/helpers/health-pages-jsx-fingerprint.ts`: printer AST TypeScript; normaliza CRLF e remove somente assertions de tipo. Mantém elementos, atributos, classes, textos, callbacks, handlers e expressões de action dos nós JSX.
- `tests/drizzle-health-pages-ast.test.ts`: exige o conjunto completo de arquivos retidos, fingerprints originais e ausência de marcadores legados.
- A referência externa `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync` foi usada **somente para conferir a origem**. A suíte versionada lê apenas o checkout e a fixture pública local; não depende de `.agent`, worktree externo, snapshots privados ou fallback com skip.

## Fixture independente de readers para o gate central

- `tests/helpers/health-pages-database.ts`: replay dos **156 SQL históricos** pelo runner público, dataset fictício nominal escrito em SQL independente dos mappings e transporte Neon → socket PostgreSQL → PGlite. Reutiliza apenas o transporte genérico `local-drizzle-database`, com pool de produção **5** e servidor **maxConnections 10**; DDL, seeds e readers atravessam o driver real.
- A fixture respeita os dados de referência históricos: reutiliza o módulo SAUDE já instalado e preserva os perfis iniciais. Colunas obrigatórias/defaults e FKs do seed foram consultadas no catálogo público; `weeklyHours` permanece inteiro.
- `tests/drizzle-health-pages.test.ts`: confere tipos/nullabilidade das duas projeções contra `tests/fixtures/installed-physical-catalog.json`, com digests públicos fixados. A suíte de banco cobre os sete readers exportados: relações e nulls, filhos inativos, histórico UTC com milissegundos, filtros case-sensitive/insensitive e curingas, identidade administrativa, escopos, joins, counts, paginação real acima de 20 registros, limites de execução por conexão e transação repeatable-read com rollback.
- Há oráculos SQL independentes para listas, perfis, auditoria e segunda página. A fixture não usa DMMF, esquema gerado dos mappings de runtime ou fixture de outro domínio.
- Arquivos para execução central:
  - `node --import tsx --test tests/drizzle-health-pages-ast.test.ts`
  - `node --import tsx --test --test-concurrency=1 tests/drizzle-health-pages.test.ts`
  - Executar também o reader gate em timezone não UTC (por exemplo `TZ=America/Sao_Paulo`) para validar timestamps raw/JSON sem deslocamento de horário local.

## Validação realizada nesta frente

- Parsing TypeScript dos 100 `.tsx` e dos oito arquivos exclusivos de suporte: **zero erros sintáticos**.
- Comparação estática da fixture com a origem e dos 100 `.tsx` atuais com essa origem: **zero diferenças de JSX**. Após os ajustes finais de DTO, os seis arquivos afetados foram novamente comparados: zero diferenças.
- ESLint nos 108 arquivos: **zero erros**; os avisos de bindings/import sem uso da migração foram corrigidos. Permanecem dois avisos de navegação já existentes em `PacientesClient.tsx` e `ClinicalAccessSwitch.tsx`, cujo JSX é o original. Rechecagem dos nove arquivos alterados ao final: zero erros e zero avisos.
- Inspeção estática do seed: 37 INSERTs, sem coluna desconhecida ou coluna obrigatória sem valor/default; digests da fixture pública conferem. Nenhuma referência desprotegida a `context.database` resta nos `.tsx` retidos.
- **Aceite de runtime/compilação permanece no gate centralizado.** As suítes de banco acima foram preparadas, sem execução PGlite nesta frente. Não foram executados build, tsc, instalações, Git, DDL ou carga no Neon.

## Handoffs

- Consumidos os contratos atuais de `tfdRequestForActor`, `tfdTripAccessWhere`, `activeTfdPassengerWhere`, `followupBatchForActor` e `vaccinationFormOptions`; eventuais novos diagnósticos em serviços/actions compartilhados devem retornar aos respectivos owners.
- As pendências de fixtures Compras em `price-research.test.ts`, `shared-procurement-catalog.test.ts` e `helpers/procurement-database.ts` continuam transferidas a PharmacyVaccination/Followup e não foram alteradas nesta reserva.
- Pronto para o gate central incluir os dois testes de Saúde e registrar os resultados de transporte, compilação e runtime; zero Prisma e equivalência JSX não substituem esse aceite.
