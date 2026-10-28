# Portabilidade CI dos testes Drizzle

## Resultado — 2026-10-28

Entregues os ajustes exclusivos dos **15 testes** transferidos para esta frente. A seleção leve final aprovou **32 testes / 32 PASS / 0 FAIL / 0 SKIP em 41,10 s**, com heap de 256 MiB e concorrência 1.

A execução final usou um preload temporário, externo ao repositório, que lança erro em leituras/consultas síncronas a `.agent`, `.git`, fontes em `Temp/opencode`, ao worktree visual externo e em comandos Git. Todos os 15 arquivos passaram nessa condição. O preload serve apenas à verificação local; os testes de CI consomem diretamente as fixtures versionadas.

## Catálogo físico público

- Gerador offline: `scripts/export-drizzle-test-catalog.mjs`.
- Artefato gerado: `tests/fixtures/installed-physical-catalog.json`.
- Entrada histórica: `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`.
- O gerador exige o SHA-256 original abaixo **antes de interpretar/exportar** o catálogo. Os testes não executam o gerador nem precisam dessa entrada privada.
- `formatVersion: 1`; `sourceSha256` registra a prova de origem; `catalogSha256` cobre `JSON.stringify(catalog)`.

| Evidência | Valor |
| --- | --- |
| SHA-256 da captura original, conferido após a exportação | `bc2cd102e4627e250d00af1420cef46d95dbd954477202044024fdccceca729d` |
| SHA-256 do arquivo público completo | `f42265defe4adb2d92c9b63e964dcbbda807221fb342aa1191a2182d8a4696b5` |
| SHA-256 do objeto `catalog` | `1b6ca54c94a3aa6638ad61324483b32773ceb45efbd90020a49e6dce9b5497cb` |
| Tamanho UTF-8 | **4.074.174 bytes** |
| Tabelas representadas por colunas públicas | **998** |
| Colunas / constraints / índices / valores de enum | **10.843 / 11.949 / 2.753 / 17** |

A exportação inclui exclusivamente linhas com `schema === "public"` e estes campos:

```text
columns:     schema, table_name, name, type, not_null, default_expression
constraints: schema, table_name, name, type, definition
indexes:     schema, table_name, name, definition
enums:       schema, name, label, position
```

Uma conferência independente comparou exatamente as **25.562 linhas** exportadas com a projeção whitelisted da captura original, incluindo ordem, tipos, nulabilidade, defaults e definições. O artefato contém metadata de schema: não exporta registros das tabelas, funções, triggers, owners, roles/usuários do banco, valores de sequências, credenciais ou URLs de conexão/configuração. A ocorrência textual `https://%` é o padrão SQL original da CHECK `SstEsocialEvidence_endpoint_check`, preservado como definição de constraint; não é um endpoint configurado.

Os 15 consumidores resolvem a fixture por `new URL("./fixtures/installed-physical-catalog.json", import.meta.url)`. Ausência da fixture causa erro de leitura, sem fallback privado ou skip. O owner das novas Health Pages pode consumir essa mesma fixture pública.

## Baselines visuais históricos

- Gerador: `scripts/export-drizzle-visual-baselines.mjs`.
- Artefato: `tests/fixtures/historical-visual-baselines.json`.
- Fonte única e fixa: objetos Git do commit **`5cfa75dfe20a6d3fcc20dce33e818585cb8b9954`**. O gerador usa argumentos diretos para `git ls-tree` / `git show`; não lê a árvore atual para criar conteúdo esperado.
- O histórico Git é necessário somente para regenerar essa fixture. A execução dos testes usa o JSON, inclusive com checkout raso.
- `formatVersion: 1`; TypeScript **5.9.3**; SHA-256 do arquivo **`6e2f385c7262463b04ae7807627b2bc89e18d5fed51c3e46ec627a45a7e71e75`**; tamanho **41.276 bytes**.

| Conjunto | Inventário histórico | Comparação preservada |
| --- | --- | --- |
| Obras | **59 TSX / 80 raízes JSX** | Fingerprint das raízes JSX/CSS ordenadas de cada arquivo, com contagem e inventário exato |
| Planejamento | **15 TSX / 41 raízes JSX** | 14 JSX exatos e uma conversão de construtor Decimal na versão |
| Componentes Planejamento sem persistência | **6 ASTs completas** | `PlanningDocumentUpload`, `PlanningForm`, `PlanningLookupField`, `PlanningRecordEditor`, `PlanningReportSubmission`, `PlanningMovementHistory` |
| Wrappers Financeiro | **2 ASTs completas** | `financeiro/orcamento/planejamento/{page,PlanejamentoClient}.tsx` |
| Cemitérios | **24 TSX / 37 raízes JSX** | 23 arquivos estritos e uma expressão de namespace Decimal, mantendo `getText()` original das raízes |

Os fingerprints JSX são SHA-256 de `JSON.stringify(raízes)`; os fingerprints de AST completa cobrem `printer.printFile(source)`, com comentários removidos como na comparação anterior. O artefato guarda também o hash do conteúdo histórico de cada arquivo. Inventários e chaves de referência usam caminhos relativos ao repositório com `/`.

As únicas exceções de expressão continuam explícitas, com fingerprint original, fingerprint normalizado, namespace e contagem histórica:

1. `src/components/app-ui/planejamento/PlanningVersionPage.tsx`: exatamente **1** ocorrência de `new Prisma.Decimal(` → `new Decimal(`.
2. `src/app/app-domain/cemiterios/taxas/guias/[id]/page.tsx`: exatamente **1** ocorrência de `Prisma.Decimal.max(0, total.minus(paid))` → `Decimal.max(0, total.minus(paid))`.

Para portabilidade entre checkouts Windows/Linux, a leitura visual canoniza somente CRLF → LF; o printer explicita LF. As duas falhas iniciais de Planejamento foram rastreadas aos CRLF preservados pelo TypeScript dentro de texto JSX. Após essa canonização, as comparações contra o commit fixo passaram, sem gerar baseline a partir dos arquivos atuais.

## Escopo e checks

| Arquivo em `tests/` | Checks leves aprovados |
| --- | ---: |
| `cemetery-static-contract.test.ts` | 3 |
| `drizzle-finance-setup-tools-ast.test.ts` | 2 |
| `drizzle-planning-publication-operations.test.ts` | 1 |
| `drizzle-tax-annual.test.ts` | 1 |
| `drizzle-planning-pages-visual.test.ts` | 3 |
| `drizzle-municipal-setup-tools-ast.test.ts` | 3 |
| `drizzle-tax-accounting.test.ts` | 1 |
| `drizzle-personnel-external-operations-ast.test.ts` | 5 |
| `drizzle-tax-final-helpers.test.ts` | 1 |
| `drizzle-tax-collection-operations.test.ts` | 1 |
| `drizzle-tax-catalog-rules.test.ts` | 1 |
| `drizzle-works-pages-visual.test.ts` | 3 |
| `laboratory-mappings.test.ts` | 2 |
| `recruitment-drizzle-ast.test.ts` | 3 |
| `tfd-drizzle.test.ts` | 2 |
| **Total** | **32** |

- Os **12 arquivos sem baseline visual** foram comparados à captura readonly anterior: conteúdo byte a byte igual, exceto a expressão do caminho do catálogo. Isso inclui integralmente os corpos dos cenários SQL dos arquivos mistos.
- Os três testes visuais mantêm suas verificações de sintaxe, ausência do ORM anterior, inventário, JSX/CSS, ASTs completas e mappings. Os skips condicionados à disponibilidade de fontes externas foram removidos.
- ESLint dos **15 testes + 2 geradores**: exit 0, **zero warnings**.
- Busca final em fontes/fixtures de `tests/`: **zero** referências a `.agent/`, `Temp/opencode`, `celeriflow-main-sync` ou caminhos privados `C:/Users/...`.
- Busca de consumidores de histórico em testes AST: nenhum `git show`, `cat-file`, `rev-parse` ou `ls-tree` em runtime. O runner de seleção Group A usa `git ls-files`, que não exige o commit visual histórico.

Comandos leves reproduzíveis a partir da raiz:

```sh
node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-concurrency=1 "tests/cemetery-static-contract.test.ts" "tests/drizzle-finance-setup-tools-ast.test.ts" "tests/drizzle-municipal-setup-tools-ast.test.ts" "tests/drizzle-personnel-external-operations-ast.test.ts" "tests/recruitment-drizzle-ast.test.ts" "tests/drizzle-planning-pages-visual.test.ts" "tests/drizzle-works-pages-visual.test.ts" "tests/laboratory-mappings.test.ts"
node --max-old-space-size=256 --conditions=react-server --import tsx --test --test-concurrency=1 --test-name-pattern="^(pure publication catalog:|pure annual:|Tax accounting: physical columns/|Tax final helpers: installed evaluation mapping,|Collection operations: 57 complete runtime mappings|pure catalog rules:|TFD · mapeamentos completos|TFD · política pura)" "tests/drizzle-planning-publication-operations.test.ts" "tests/drizzle-tax-annual.test.ts" "tests/drizzle-tax-accounting.test.ts" "tests/drizzle-tax-final-helpers.test.ts" "tests/drizzle-tax-collection-operations.test.ts" "tests/drizzle-tax-catalog-rules.test.ts" "tests/tfd-drizzle.test.ts"
```

Regeneração de manutenção, com as fontes históricas disponíveis:

```sh
node --max-old-space-size=256 "scripts/export-drizzle-test-catalog.mjs"
node --max-old-space-size=256 "scripts/export-drizzle-visual-baselines.mjs"
```

A validação desta frente foi exclusivamente leve; cenários SQL/PGlite e typecheck/build permanecem na execução central solicitada pelo parent.

## Handoff nominal fora dos 15 arquivos

**Owner RH / parent:** `tests/drizzle-personnel-pages-ast.test.ts` também possui fingerprint sensível a finais de linha. Inspeção readonly dos 98 TSX mostrou:

- CRLF atual, igual ao assert existente: `8f8a5d76c51cfcb85e6312ff929e9168a454b7cde1b32423781d4a2f99486649`.
- Mesma extração com LF: `19c3e7885201ca55ae4af58d87062b41944cc27557a1f9d6468fde27434ef951`.

Os 98 arquivos contêm CRLF no checkout local. O owner precisa alinhar esse teste ao baseline histórico com LF para checkout Linux; o achado foi comunicado ao parent e o arquivo está fora da transferência exclusiva desta missão.

**Parent / atributos Git:** a entrada LF de `tests/fixtures/installed-physical-catalog.json` já existe em `.gitattributes`. Incluir também `tests/fixtures/historical-visual-baselines.json text eol=lf` estabiliza o SHA-256/tamanho do arquivo visual gerado em checkouts Windows. Os testes leem seu JSON e comparam os fingerprints internos, portanto a representação externa dos finais de linha desse JSON não interfere nos asserts.
