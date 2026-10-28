# Integração manual de main — piloto do padrão de tabelas

**Data:** 28/10/2026  
**Estado:** 31/31 destinos integrados na árvore compartilhada; verificações leves aprovadas. Build/typecheck e conclusão do merge são gates centrais do parent.

## 1. Referências e método

Histórico remoto confirmado por `git show --no-patch`:

1. Base já integrada pelo parent: `0831a93a71ee67bf720188c0819a92112fc22205` — `ajuste de links e cards`.
2. Primeiro commit novo: `f0914ad672279f17b7b0ab4391006f6f1c9f9fd0` — `ok, tabela padrão 1`; pai = base acima.
3. Alvo desta integração: `d0c851e0f07ae90f6d49c417d07c339195865d32` — `ajuste no padrão`; pai = primeiro commit novo.

Inventário de `git diff --name-status 0831a93..d0c851e`: **9 renames R100 + 15 adições + 7 modificações = 31 destinos**.

Foi feita integração manual de três versões: base `0831a93`, conteúdo atual da árvore compartilhada e versão final remota `d0c851e`. Cada arquivo novo foi lido individualmente no remoto; cada modificação/rename teve seu diff individual e a preexistência local conferidos. Todas as gravações desta frente foram feitas por `functions.patch`, incluindo os nove `Move to` de documentação.

### Situação local antes dos patches

- Os 15 destinos adicionados pelo remoto estavam ausentes.
- Os seis componentes existentes (`ClientLayout`, `ModuleShell`, `EditUnitSheet`, `NewUnitSheet`, `UnidadesClient` e layout de Saneamento) coincidiam com a base ao desconsiderar CRLF. Seus deltas remotos foram aplicados.
- `unidades/page.tsx` já continha a migração Drizzle: `context.database ?? db`, `listConsumerUnits` e DTO paginado. Essa implementação local foi preservada e recebeu o delta visual e a constante de página do remoto.
- Os nove documentos ainda estavam nos caminhos antigos; os destinos estavam ausentes. Na leitura imediatamente anterior aos movimentos, os nove conteúdos coincidiam com a base/remoto após normalizar CRLF, inclusive `PLANEJAMENTO_MIGRACAO_PRISMA_PARA_DRIZZLE.md`. Foram movidos os arquivos atuais, sem substituir seu corpo por uma cópia histórica.

## 2. Inventário dos 31 destinos e hashes remotos

Os hashes são **Git blob SHA-1 do conteúdo remoto em `d0c851e`**, calculados em memória com o envelope `blob <bytes>\0`. Não são hashes de commits. Resultado `igual` significa comparação integral de texto normalizando somente CRLF → LF; nenhum outro whitespace ou conteúdo foi ignorado.

| # | Operação | Destino | Blob remoto | Resultado |
|---:|---|---|---|---|
| 1 | R100 | `docs/Docs nao precisa subir/ANALISE_FRONTEND_PORTAL_TRANSPARENCIA_PAU_DOS_FERROS (1).md` | `63f361a2464773ac275a238b6ba875447a977af8` | Igual; origem removida |
| 2 | R100 | `docs/Docs nao precisa subir/ANALISE_FRONTEND_PORTAL_TRANSPARENCIA_PAU_DOS_FERROS.md` | `63f361a2464773ac275a238b6ba875447a977af8` | Igual; origem removida |
| 3 | R100 | `docs/Docs nao precisa subir/ANALISE_GERAL_MODULOS_INTEGRACOES_ADERENCIA_POC.md` | `d6c489868f1e42641478fcd885d7493cd5ef1f47` | Igual; origem removida |
| 4 | R100 | `docs/Docs nao precisa subir/CARGA_DEMONSTRACAO_AURORA_MG.md` | `4ba4eef7950758b547a87610d49409a480ae9fae` | Igual; origem removida |
| 5 | R100 | `docs/Docs nao precisa subir/LEG-04_VALIDACAO.md` | `16b95a25f1cf6672f4090880cc582580d4258074` | Igual; origem removida |
| 6 | R100 | `docs/Docs nao precisa subir/PLANEJAMENTO_MIGRACAO_PRISMA_PARA_DRIZZLE.md` | `4529993c4b84f4c7a026fca320e4dec61af1be78` | Igual; origem removida |
| 7 | R100 | `docs/Docs nao precisa subir/PLANO_MELHORIAS_PORTAL_TRANSPARENCIA.md` | `c1f4c0a6ce86dc4214d5ffd1a15a6159bfa1fa65` | Igual; origem removida |
| 8 | R100 | `docs/Docs nao precisa subir/PORTAL_TRANSPARENCIA_OPERACAO.md` | `d5459007ea36502ac18bcda4aa3daaa966f726cd` | Igual; origem removida |
| 9 | R100 | `docs/Docs nao precisa subir/RELATORIO_GERAL_CELERIFLOW_2026-10-16.md` | `cc031af1791d5970d5d99234df4870136e850422` | Igual; origem removida |
| 10 | A | `docs/INVENTARIO_TABELAS_CELERIFLOW.md` | `ee877653d4f458d4d14fdd276483997b0d57c9ea` | Igual |
| 11 | A | `docs/PLANO_ADEQUACAO_PADRAO_TABELAS.md` | `655329a05b5e06c9b499b09f400312ddfb66738b` | Igual |
| 12 | A | `docs/Padrão de Tabelas.md` | `cc8bbcb7806f7fa71f3471619a702162afc87837` | Igual |
| 13 | A | `docs/VALIDACAO_PILOTO_TABELA_UNIDADES_CONSUMIDORAS.md` | `1bed343fa232a972e649a04b3e01dc0159266dd4` | Igual |
| 14 | A | `scripts/audit-table-pattern.mjs` | `4ccc3a0873d00d7515fe1bf6a5df989cda89dc65` | Igual |
| 15 | M | `src/app/app-domain/ClientLayout.tsx` | `920d1d86585ce267c1ae5839776da228e7a8b995` | Igual |
| 16 | M | `src/app/app-domain/saneamento/components/EditUnitSheet.tsx` | `662fbbcf23fb5128ae819037426fcc0955bb6dbd` | Igual |
| 17 | M | `src/app/app-domain/saneamento/components/NewUnitSheet.tsx` | `615ebc1017c73dcae7eed363ab7ea1ee51934cbe` | Igual |
| 18 | M | `src/app/app-domain/saneamento/components/UnidadesClient.tsx` | `19f5cf87ec3f1dfdf1ab3c75e3ad371242faba8d` | Igual |
| 19 | M | `src/app/app-domain/saneamento/layout.tsx` | `c6f277704fc01e73ac01cebed929d0064281848f` | Igual |
| 20 | A | `src/app/app-domain/saneamento/navigation.ts` | `ccf39f47e9ecd8fd02c721c78f4d15679575ab2a` | Igual |
| 21 | A | `src/app/app-domain/saneamento/unidades/UnitsListState.tsx` | `67cc286b9c6a28d5e2605148290ff5a05aae4fe7` | Igual |
| 22 | A | `src/app/app-domain/saneamento/unidades/columns.ts` | `b527ec0fae1e680344cd43dc383559fc91f53b14` | Igual |
| 23 | A | `src/app/app-domain/saneamento/unidades/error.tsx` | `ad3928fd796bde702ede431d5fbea79bf6a899ec` | Igual |
| 24 | A | `src/app/app-domain/saneamento/unidades/loading.tsx` | `cf4d6d158f4b281653bc98308c1d7ba3eccd9dd4` | Igual |
| 25 | M | `src/app/app-domain/saneamento/unidades/page.tsx` | `e98d91e36dc10b54e58fc565439aa3a9e688ec4d` | Three-way Drizzle; JSX igual |
| 26 | M | `src/components/app-ui/erp/ModuleShell.tsx` | `e9efc1b190f06a4e8b494932cc0ed5c0c445e70b` | Igual |
| 27 | A | `src/components/app-ui/operational/OperationalTable.tsx` | `9a11cbc6f9ffb0e4800ca98d4e7e258efe361540` | Igual |
| 28 | A | `src/components/app-ui/operational/OperationalWorkspace.tsx` | `2178e3592a596b79b8a0a0d93eb64ce40c952b6e` | Igual |
| 29 | A | `src/components/app-ui/operational/operational.module.css` | `d8a0d822d31b66a1b106611240201d8467c688eb` | Igual, inclusive bytes |
| 30 | A | `src/lib/operational-tables.ts` | `d56bd1b179ddb86740b64bfe4765b6ad2a05820c` | Igual |
| 31 | A | `tests/operational-table.test.ts` | `c4bc7a32c4fd98eff73f6d9c1d4ac96d637acc74` | Igual |

**Conferência final:** 31 destinos presentes; nove origens antigas ausentes; **30/31 textos iguais** ao alvo, sendo **20/31 idênticos em bytes** e dez com diferença somente de finais de linha. A única divergência funcional de código em relação ao remoto está descrita abaixo. Os quatro documentos novos, o script e todos os novos arquivos TS/TSX/CSS/teste são idênticos em bytes ao remoto.

## 3. Three-way de `unidades/page.tsx`

### Delta visual remoto incorporado

- Retirada de `PageFrame`, `PageHeader`, ícone `Droplets` e wrappers locais da listagem.
- Renderização final exatamente como em `d0c851e`: `<UnidadesClient units={units} pagination={{ query, total }} />`.
- `requested.pageSize = OPERATIONAL_PAGE_SIZE` antes da leitura, com a mesma constante central de 20.

### Implementação Drizzle mantida da árvore atual

```tsx
const context = await getTenantContextForModule("SANEAMENTO");
const requested = parseSanitationQuery(await searchParams);
requested.pageSize = OPERATIONAL_PAGE_SIZE;
const { records: units, total, query } = await listConsumerUnits(context.database ?? db, requested);
```

O único delta restante de `git diff --ignore-space-at-eol d0c851e -- src/app/app-domain/saneamento/unidades/page.tsx` corresponde a imports/contexto/consulta Drizzle: o bloco Prisma de `where`, `count` e `findMany` continua substituído pelo repositório existente.

O leitor foi conferido em `src/db/repositories/sanitation/queries.ts:9–23`: filtros de status/categoria, busca pelos cinco campos, total filtrado, `clampSanitationPage`, ordenação `createdAt desc, id asc`, offset/limit e os mesmos dez campos do DTO (`id`, `code`, `address`, `streetAddress`, `neighborhood`, `postalCode`, `category`, `status`, `ownerName`). A integração não escreveu nesse repositório.

## 4. Comparação JSX/CSS e comportamento remoto

Comparação de todos os nós-raiz JSX por parser/printer TypeScript, normalizando CRLF antes do parsing: **12/12 arquivos TSX, 20/20 raízes JSX idênticas ao remoto**.

| Arquivo TSX | Raízes comparadas | Resultado |
|---|---:|---|
| `src/app/app-domain/ClientLayout.tsx` | 3 | PASS |
| `src/app/app-domain/saneamento/components/EditUnitSheet.tsx` | 1 | PASS |
| `src/app/app-domain/saneamento/components/NewUnitSheet.tsx` | 1 | PASS |
| `src/app/app-domain/saneamento/components/UnidadesClient.tsx` | 2 | PASS |
| `src/app/app-domain/saneamento/layout.tsx` | 2 | PASS |
| `src/app/app-domain/saneamento/unidades/UnitsListState.tsx` | 1 | PASS |
| `src/app/app-domain/saneamento/unidades/error.tsx` | 1 | PASS |
| `src/app/app-domain/saneamento/unidades/loading.tsx` | 1 | PASS |
| `src/app/app-domain/saneamento/unidades/page.tsx` | 1 | PASS |
| `src/components/app-ui/erp/ModuleShell.tsx` | 2 | PASS |
| `src/components/app-ui/operational/OperationalTable.tsx` | 4 | PASS |
| `src/components/app-ui/operational/OperationalWorkspace.tsx` | 1 | PASS |

O comparador inicial reportou apenas CRLF preservado em `JsxText`; ao normalizar finais de linha antes do parsing, todas as comparações passaram, sem alteração adicional de código.

**CSS:** `operational.module.css` é idêntico em bytes ao blob `d8a0d822d31b66a1b106611240201d8467c688eb`.

Além da igualdade JSX, o texto integral dos componentes e helpers coincide com `d0c851e`, garantindo a incorporação da revisão final:

- Workspace ativado exatamente em `/saneamento/unidades`, navegação extraída e passagem direta pelo layout desse módulo.
- Barra lateral inicial de 56 px, expansão para 208 px e overlay abaixo de 960 px, fechamento/navegação/foco e `inert` conforme o remoto.
- Busca e diálogo de filtros com contagem, aplicar/limpar/cancelar e preservação do hook de navegação URL existente.
- Colunas, larguras, ações Editar/Inativar, confirmação e tratamento de erro das actions conforme o remoto.
- Estado/seleção de conteúdo integral da célula, ícones condicionais ao overflow, leitura por trechos, cópia e foco conforme o remoto.
- Preferências por usuário/tabela, arraste/teclado, restauração, política de dispositivos e diagnóstico de conflito de espaço conforme o remoto.
- Paginação, contagens, loading e error/retry conforme o remoto. `unstable_retry` corresponde ao guia da versão instalada do Next.js.

Não foi introduzida uma seleção adicional de linhas; a interação da tabela é exatamente a publicada no alvo remoto.

## 5. Verificações efetivamente executadas nesta integração

| Verificação | Resultado |
|---|---|
| Inventário e hashes por leitura de `git diff`/`git show` + filesystem | 31/31 destinos e nove movimentos conferidos |
| Comparação integral normalizando somente CRLF | 30 iguais + uma adaptação Drizzle esperada |
| Comparação JSX por TypeScript | 12 arquivos / 20 raízes PASS |
| Comparação CSS em bytes | PASS |
| Parsing TypeScript/JavaScript | 17/17 arquivos PASS: 16 TS/TSX + script MJS |
| Gate AST de Prisma ativo | 17/17 PASS; zero imports/reexports Prisma e zero identificadores Prisma/cliente/raw/transaction/GetPayload verificados |
| ESLint, `--max-warnings=0`, 16 TS/TSX + script MJS | Exit 0, sem warnings |
| `tests/operational-table.test.ts` | **3 PASS / 0 FAIL**, 607 ms totais reportados |

Comando do teste puro executado:

```powershell
node --max-old-space-size=256 --import tsx --test tests/operational-table.test.ts
```

A suíte importada é idêntica ao remoto e cobre conservação da largura total/min/max/ações, revalidação de preferências, conflito abaixo de 702 px e preservação integral de grafemas/texto na leitura por trechos.

Guias Next.js lidos antes dos patches: `01-directives/use-client.md`, `03-file-conventions/error.md` e `03-file-conventions/loading.md`, dentro de `node_modules/next/dist/docs/01-app/03-api-reference/`.

## 6. Handoff central

- Esta frente entregou alterações de arquivos somente nos 31 destinos/origens reservados e neste documento próprio.
- Não executou operações Git de escrita, mudança de index/ref/MERGE_HEAD, commit/push/checkout/merge, build, tsc, PGlite, scripts operacionais ou consultas remotas.
- O parent pode reconciliar os links globais dos nove documentos no novo diretório e executar os gates centrais. A atualização de MERGE_HEAD para `d0c851e` e a conclusão do merge pertencem ao parent.
- As alegações de build/testes/navegador nos quatro documentos remotos são evidência histórica do produtor remoto. Não representam execução desses gates na árvore Drizzle por esta frente.
- Esta integração não declara uma nova homologação de navegador nem build/typecheck da árvore compartilhada. Esses resultados devem ser acrescentados pelo executor central após execução real.
- As pendências/retornos centrais dos sete motores PlanningExecution continuam no handoff específico `docs/drizzle-planning-execution-operations-progress.md`.
