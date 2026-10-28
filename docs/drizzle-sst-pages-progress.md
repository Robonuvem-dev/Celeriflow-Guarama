# SST — páginas e componentes: implementação entregue

## Escopo e baseline

- Ownership: todos os 86 arquivos TSX de `src/app/app-domain/sst/**`; repositórios exclusivos em `src/db/repositories/sst-pages/**` e DTOs em `src/lib/contracts/sst-pages.ts`.
- Baseline inicial e hashes das árvores JSX: `.agent/sst-pages-baseline.json`. O worktree histórico contém 51 TSX com referências Prisma; a árvore principal recebida já tinha zero referências Prisma, mas consultas Drizzle/SQL inline. Os números 58 do handoff e 51 do worktree correspondem a snapshots distintos.
- Guias locais Next de páginas/layouts, componentes server/client e fetching consultados antes das edições. Consultas são extraídas individualmente; JSX/CSS preservados.
- Contratos temporais: selects tipados usam o decoder de coluna; SQL bruto decodifica cada Date com `databaseTimestamp`. Numeric exato requer Decimal a partir da string original. JSON null/SQL NULL e relações opcionais conservam o contrato por campo.

## Resultado

- 86/86 TSX inventariados: zero referências Prisma/GetPayload, zero import de schema/Drizzle, zero consulta SQL inline.
- 35 TSX com consultas inline passaram a chamar os novos leitores. `ReasonFields.tsx` passou do tipo inferido de schema para DTO explícito. Total: 36 TSX alterados nesta frente.
- 11 repositórios exclusivos, com 54 funções exportadas, recebem `DatabaseExecutor` do chamador. As páginas continuam resolvendo `sstDatabase(context)` (`context.database ?? db`), e a transação do chamador pode ser usada diretamente pelos leitores.
- `src/lib/contracts/sst-pages.ts` define os contratos explícitos. Nenhum cliente global é importado pelos novos leitores.
- Autorização clínica/UG/atuação permanece nas páginas/serviços antes da leitura detalhada. As consultas auxiliares financeiras continuam sob `canViewModule(..., "RH")`; opções de administração continuam sob o teste de administrador.
- Os demais TSX já delegavam a consulta a repositórios/serviços migrados pelo owner SST ou não possuíam consultas. Suas árvores JSX também integram a verificação completa.

### Mapa dos leitores

| Repositório (`src/db/repositories/sst-pages/`) | Consumidores TSX extraídos |
| --- | --- |
| `administration.ts` | `configuracoes/page`, `configuracoes/[id]/page`, `profissionais/page`, `jornadas/page`, `juntas/page`, `ghe/page` |
| `agenda.ts` | `agenda/page`, `agenda/agendamentos/page`, `agenda/agendamentos/[id]/page` |
| `programs.ts` | `programas/page`, `programas/[id]/page` |
| `clinical-options.ts` | `questionarios/page`, `questionarios/[id]/page`, `prontuarios/page`, `vacinacao/page`, `restricoes/page`, `restricoes/[id]/page` |
| `aso.ts` | `aso/page`, `aso/[id]/page`, `aso/[id]/imprimir/page`, `aso/[id]/anamnese/page`, `anamneses/[id]/page` |
| `certificates.ts` | `atestados/novo/page`, `atestados/[id]/page`, `atestados/[id]/comprovante/page` |
| `equipment.ts` | `equipamentos/page`, `equipamentos/[id]/page`, `equipamentos/entregas/page`, `equipamentos/necessidades/page` |
| `functional-options.ts` | `vinculos/page`, `ordens-servico/page` |
| `benefits.ts` | `planos/cadastro/page` |
| `prevention.ts` | `prevencao/novo/page` |
| `accidents.ts` | `acidentes/page`, `acidentes/[id]/page` |

Todos os caminhos acima são relativos a `src/app/app-domain/sst/`, com extensão `.tsx`.

### Contratos de escalares e relações

- Colunas Drizzle `date(..., { mode: "date" })` e `timestamp` continuam retornando `Date`. Filtros civis do ASO recebem o `Date` UTC já validado por `sstCivilDate`.
- SQL bruto: equipamentos (`caValidUntil`, `createdAt`), períodos funcionais (`startsAt`, `endsAt`), responsabilidades técnicas (`startsAt`, `endsAt`), revisões de atestado (`createdAt`), evidência CAT (`createdAt`) e outbox de restrição (`dueAt`) convertem explicitamente com `databaseTimestamp`.
- O DTO de equipamento inclui todos os campos físicos, além do nome/código de Material. Datas opcionais e relações `Supplier.person`/`Supplier.company` conservam null.
- `restrictedRoleIds`, `departmentIds` e `roleIds` nullable são normalizados para os arrays usados pelas telas, sem regravar os dados físicos.
- JSON de snapshots/perguntas/conteúdo permanece `JsonValue`, incluindo JSON null. Datas dentro de snapshots permanecem strings quando seu contrato é JSON; não são promovidas implicitamente para `Date`.
- O valor financeiro mostrado em atestados é intencionalmente `amount: string`, vindo de `numeric::text`, preservando todos os dígitos para o JSX original. Os contratos Decimal de benefícios/ledgers delegados continuam sendo responsabilidade dos serviços/repositórios SST existentes.
- Todos os limites, paginação de 20 itens, critérios de ordenação e filtros de UG/secretaria/ativo/pessoa/profissional/atuação foram transportados individualmente das consultas recebidas.

## Verificação leve executada

- Parser TypeScript + ESLint: **101 arquivos**, zero erros de parse, zero erros/warnings de lint (86 TSX + 11 leitores + DTO + três testes). Processo limitado a 512 MiB.
- Comparação de JSX por AST: **86/86 idênticos** tanto ao baseline recebido quanto ao worktree histórico; zero diferenças inclusive expressões JSX/classes/estilos. Fingerprint agregado: `b9865c728366e50925ae78b6a47ce52e6c747978374bdcb7ddd0449a476e2305`.
- Evidências locais: `.agent/sst-pages-jsx-verification.json`, `.agent/sst-pages-light-validation.json`, `.agent/sst-pages-final-inventory.json`.
- A conferência AST é reproduzível em `tests/drizzle-sst-pages-ast.test.ts`, sem depender dos arquivos `.agent` ou de Git.

## Validação central e correção da fixture

- Resultado informado pelo central: AST **2/2 PASS**. O strict integrado dos leitores Finance + RH + SST + Procurement + Fleet também aprovou: **1.047 arquivos, 103 s, 2.523.046 KiB, zero erros**; esse resultado não inclui testes/runtime app.
- A primeira integração SST-pages falhou no DDL, antes dos cenários: `relation MaterialMovement does not exist` ao criar a FK `SstEquipmentDeliveryItem.movementId`. A fixture parcial incluía oito migrações SST e omitia dependências físicas do estoque.
- Correção entregue em `tests/helpers/sst-pages-database.ts`: `createSstPagesDatabase()` usa `createLocalDrizzleDatabase()` e aplica integralmente, em ordem lexicográfica, todos os **156** `migration.sql` históricos disponíveis, de `20261009232000_baseline` até `20261027200000_secretariat_employee_manager`. Isso instala `MaterialMovement`, suas dependências/FKs e os guards posteriores do SST.
- `tests/drizzle-sst-pages.test.ts` chama essa fixture exclusiva, sem listas parciais de tabelas/migrações. O seed inclui secretaria, perfil, categoria de material e a cadeia física de ente/instância/regras/regime/local/centro/mapeamento/período funcional. ASO, exame, anamnese e `SstAsoFlowSource` são inseridos na mesma transação para cumprir os dois guards diferidos do ASO.
- Verificação leve desta correção, a 512 MiB: **2 arquivos, zero erros de parse, zero erros/warnings ESLint**. A inspeção estática confirmou as 156 migrações, a criação de `MaterialMovement` antes da FK SST e a inclusão dos guards de ASO/período funcional. O reteste de banco permanece reservado ao central.

### Testes e reteste

- `tests/drizzle-sst-pages.test.ts`: seis subcasos sobre o driver Neon/Drizzle real conectado à fixture PGlite, com replay integral do histórico SQL físico. Cobre UG/secretaria, atuação/usuário/ativo, pesquisa/paginação estável, GHE/complemento sem grupo com campos nullable, relações completas, JSON null, datas UTC/civis e SQL bruto, certificado/dependente e sigilo por escopo fornecido ao leitor. Runtime aguarda reteste central após a correção acima.
- `tests/drizzle-sst-pages-neon.test.ts`: smoke físico dos 54 leitores, opt-in por `SST_PAGES_NEON_URL`, na mesma transação `repeatable read` **somente leitura**, sem DDL/DML/auditoria. Valida resolução das tabelas/colunas e SQL real com escopo impossível; não substitui os cenários positivos da fixture local nem os testes de autorização dos serviços do owner SST.
- `tests/drizzle-sst-pages-ast.test.ts`: baseline visual completo e ausência de legado/SQL inline; **2/2 PASS** informado pelo central.

Comandos para o slot central (sequenciais):

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-sst-pages.test.ts
# Repetir o teste de banco sob TZ=UTC, America/Sao_Paulo e Pacific/Auckland.
# SST_PAGES_NEON_URL deve ser fornecida pelo owner central; o teste é skip sem ela.
node --max-old-space-size=512 --conditions=react-server --import tsx --test tests/drizzle-sst-pages-neon.test.ts
```

### Handoff ao parent/owner SST

- Implementação TSX disponível na árvore principal; não há edição em actions `.ts`, APIs, `src/lib/sst/**`, schemas ou repositórios SST de ownership anterior.
- As chamadas a serviços SST conservam as assinaturas recebidas; mutações continuam nos actions/serviços do owner, com a conexão/transação Drizzle proprietária. Esta frente adiciona somente leitores, sem abrir outra transação dentro deles.
- O parent deve incluir os três testes acima e o build estrito integrado na aceitação final. A aprovação de parse/lint/JSX não é aprovação de tipos, integração de banco ou deploy.
