# Revisão independente de integridade funcional

Data: **29/10/2026**. Resultado: **duas regressões funcionais reproduzidas; descoberta dos testes novos corrigida no âmbito de testes; gates históricos ainda incompatíveis com a alteração autorizada da UI**.

## Base, método e alcance

- `AGENTS.md` lido. Guia instalado de Server/Client Components do Next 16.4 consultado. Relatórios dos lotes, cobertura e integração consultados antes de classificar achados.
- Referência local: **`b199957ce1712fdf1613b4d6909643c3cca4c2c1`**, a mesma registrada no relatório de integração como pull local/remoto. Esta auditoria não consultou novamente o remoto nem realizou pull.
- Comparação de conteúdo contra HEAD por decodificação **somente leitura** dos objetos locais, inclusive packs/deltas, sem invocar Git. CRLF normalizado apenas para comparação. Última contagem: **461 fontes versionadas modificadas + 128 fontes novas** em `src/tests/scripts`, incluindo os dois testes desta revisão. São contagens do snapshot concorrente, não um inventário definitivo do merge.
- Comparação AST dos argumentos de `where/orderBy/limit/offset` nas fontes modificadas, leitura dos consumidores e inspeção de construção de linhas, seleção, formulários, callbacks e exportações. Leitura adicional dos adapters e do caminho de provider em `ClientLayout`/manifestos/painéis.
- **Zero fontes modificadas em `src/db`** contra HEAD. Varredura AST de **3.244 fontes de produção** em `src`: zero imports/reexports runtime ou `require/import()` literais de `@prisma/client`/`generated/prisma`. Nomes históricos de diretórios SQL não foram tratados como ORM ativo.
- Não houve build, instalação, execução de Git, banco local/remoto, seed ou chamada de action real. Os probes transpilaram os componentes em memória com hooks/controladores isolados e spies de actions; não são homologação DOM/navegador.
- No workspace foram acrescentados somente dois testes e este relatório. Domínio e base compartilhada permanecem sob responsabilidade dos executores dos lotes.

## Achados reproduzidos / encaminhamento ao principal

### F01 — P2: validação do editor não impede o `onSubmit` manual do perfil imobiliário

**Locais:**

- `src/app/app-domain/tributacao/TaxFormRowsEditor.tsx:23–39`: listener nativo de `submit`; ao detectar campo inválido chama `event.preventDefault()`.
- `src/app/app-domain/tributacao/imoveis/[id]/perfil/PropertyProfileClient.tsx:33–36`: o formulário tem `onSubmit` manual, que sempre constrói o `FormData`, inicia a transition e chama `submit`; não verifica `event.defaultPrevented` antes disso.
- `src/app/app-domain/tributacao/imoveis/[id]/perfil/actions.ts:8–14`: a action continua sendo a autoridade de validação/permissão; não foi modificada.

**Reprodução:** renderizar o editor com 21 componentes de inscrição, deixando o último obrigatório vazio. Executar seu listener nativo e em seguida o handler real do formulário pai, como ocorre na propagação do evento para o handler delegado React. Resultado do probe: **`defaultPrevented=true`, `actionCalls=1`**. A mensagem local não bloqueia a chamada manual. Antes da conversão, os inputs obrigatórios pertenciam ao formulário e a validação HTML impedia esse submit.

**Efeito:** tentativa inválida de salvar, inclusive com campo fora da página, é encaminhada ao servidor apesar do bloqueio local. Não foi demonstrada gravação inválida nem bypass de autorização: o spy substitui a action, e o domínio mantém suas validações.

**Correção solicitada ao principal:** integrar o validador ao submit do pai, ou fazer o handler manual respeitar o cancelamento já realizado antes de chamar `preventDefault()`/construir o payload. Preservar `{ error }` da action. Acrescentar teste que passe pelo editor **e pelo handler pai**, exigindo zero chamadas para campo inválido na linha 21 e uma chamada com payload integral após correção. Testar somente o helper ou o listener não cobre o defeito.

### F02 — P2: busca inclui valores editáveis e remove a linha durante a digitação em Compras

**Locais:**

- `src/app/app-domain/compras/_components/ComprasPanelTable.tsx:20–21`: monta `search` com todos os `row.values`, também nas grades de edição.
- `src/app/app-domain/compras/_components/ComprasOperationalList.tsx:26–28,33`: filtra imediatamente o conjunto pesquisável antes de paginar.
- `src/app/app-domain/compras/licitacoes/BiddingDraftTables.tsx:20–22`: a função do membro é simultaneamente texto pesquisável e input controlado.
- O mesmo adapter atende `src/app/app-domain/compras/solicitacoes/AllocationDraftTable.tsx:19–24`.

**Reprodução:** na edição dos membros, pesquisar `Membro`; editar a função encontrada para `Presidente`. Ao primeiro caractere `P`, o pai atualiza `row.values.role`, o adapter recompõe `search`, a linha deixa de corresponder e seu input desmonta. Probe com o adapter real: **uma linha visível antes, zero depois**.

**Efeito:** perda de foco e interrupção da edição. O rascunho permanece no pai; não foi constatada perda do array/payload. A operação passa a exigir limpar a busca para continuar digitando. É comportamento novo da consulta adicionada à grade editável, não filtro aplicado depois da paginação.

**Correção solicitada ao principal:** nas grades editáveis, desativar busca sobre campos mutáveis ou manter resultados estáveis durante a edição. As consultas somente leitura podem continuar com busca. Financeiro já explicita `searchable={false}` nas grades de edição. Teste de aceitação: editar registro encontrado na página 2, continuar digitando e fechar/reabrir sem perder valor/seleção/payload completo.

### F03 — P2 de cobertura: oito suítes novas não eram descobertas pelo runner padrão — corrigido em testes

**Local:** `scripts/group-a-tests.mjs:4–16`. As raízes de descoberta são `tests`, `src/lib` e `scripts`. Os oito arquivos persistidos em `src/app` e `src/components` não entram na seleção, mesmo após serem versionados.

**Efeito:** executar os arquivos manualmente dava verde, mas o CI normal não protegia os **34 testes** de rascunhos/payloads/colunas desses oito arquivos.

**Correção desta auditoria:** `tests/table-migration-offline-domain.test.ts` é descoberto pelo padrão existente e executa explicitamente as oito suítes. O subprocesso usa React normal porque o teste tributário depende de `react-dom/server`; o runner pai usa `--conditions=react-server`. Remove somente `NODE_TEST_CONTEXT` herdado, que de outro modo suprime o runner filho, e exige uma contagem TAP positiva para impedir sucesso sem execução. A chamada sob a condição real do pai executou **34/34**, zero skips. Nenhum script de produção/runner foi alterado.

### F04 — P2 preexistente: ações de Parlamentares continuam sem implementação

**Local atual:** `src/app/app-domain/camara/vereadores/VereadoresClient.tsx:30,35,38`. Alterar cargo, editar/alocar gabinete, editar vereador e Novo Vereador são botões sem `onClick`, link ou action.

**Comportamento:** clicar não abre editor nem executa operação. **Já ocorria no HEAD**, nas linhas históricas 47, 142, 186 e 233; não é regressão causada pela conversão nem callback removido na migração. Não usar a existência desses botões como evidência de preservação funcional de CRUD implementado. A entrega deve registrar a dívida ou o principal deve implementar os fluxos com as permissões correspondentes.

O noop de `saneamento/unidades/UnitsListState.tsx:11` pertence ao loading/error com paginação `pending`, total zero; não foi classificado como ação de negócio quebrada. O `onClose={() => undefined}` do estado inicial de parametrizações de RH também não foi confundido automaticamente com callback de uma mutação perdida.

## Pontos verificados sem regressão confirmada

- **Predicados antes da paginação:** na comparação AST, as mudanças de consulta direta se concentram em Auditoria, Judicial/Ouvidoria, manutenção de bens, eventos de valorização, solicitações de serviços, AIH/APAC, TFD, acessos/publicações e referências normativas. Os ajustes comuns trocam limites anteriores pela constante 20. As condições de escopo continuam presentes; relações normativas acrescentam count/página com o `planningEntityScope`. Não foi encontrada troca geral de filtro autorizado por filtro client sobre página parcial nessa leitura.
- **Campos antes empilhados:** inspeção das construções de linhas e sondagem das propriedades lidas nas células antigas não confirmou descarte de campos nos exemplos revistos. Exemplos: recebimento continua separado em Liquidações/Pagamentos, gabinete mantém sala/andar/telefone/ramal e Saúde/Portal conservam seus atributos desmembrados. Isso não certifica visualmente cada célula dos aproximadamente 500 arquivos.
- **Off-page:** as oito suítes persistidas cobrem estado integral, edição e remoção por índice/ID, alinhamento de arrays paralelos, obrigatórios fora da página, `false`, zero, nulo, strings decimais e preservação de resposta de erro. Os testes tributários existentes substituem painel/tabela e não cobrem a propagação de submit real de F01.
- **Exportações >20:** downloads de Compras continuam identificados por `runId`; a migração não mudou seus writers/repositórios. No portal, tela usa `result.records`, enquanto os renderizadores de exportação usam `result.rows` integral. O novo teste executa CSV/TXT reais com 41 registros e confirma arquivos iguais nas páginas 2/3. Não houve teste de download HTTP autenticado.
- **Sort parcial:** `OperationalTable` não introduz ordenação local dos 20 registros. Licitações ordena o conjunto mesclado antes do recorte; acolhimento ordena fila antes da página; transparência ordena `rows` antes de produzir `records`. Novo teste adversarial cobre ordenação monetária global em 20/20/1. Ordenações SQL antigas sem desempate por ID em AIH/APAC/TFD permanecem risco preexistente sob empates, não alteração introduzida por este diff.
- **Workspace:** hooks obrigatório/opcional estão exportados no código atual. Foram conferidos o caminho do workspace de rota, providers locais dos painéis, wrapper público e uso de `excludeQuery`. Não foi reproduzida rota sem provider nesta amostra. O resultado global zero do relatório de cobertura é evidência do auditor de cobertura, não nova execução independente daquele script nesta revisão.

## Testes históricos: falhas reproduzidas e substituição proposta

Não regenerar hashes da UI atual nem remover/desativar as asserções para obter verde. A baseline histórica continua com `sourceCommit=5cfa75dfe20a6d3fcc20dce33e818585cb8b9954`. Nenhuma fixture/hash histórico foi alterado nesta revisão.

| Arquivo | Falha observada | Local relevante |
|---|---|---|
| `tests/drizzle-planning-pages-visual.test.ts` | Inventário 20 versus 15 TSX; AST integral de `PlanningForm` diferente | 40–66 |
| `tests/drizzle-works-pages-visual.test.ts` | Inventário 60 versus 59 bloqueia até a verificação sem Prisma/sintaxe; inventário/JSX histórico divergente | 29–49 |
| `tests/cemetery-static-contract.test.ts` | Novo `ProcessRowMenu.tsx` invalida o inventário exato antes do hash JSX | 49–64 |
| `tests/drizzle-health-pages-ast.test.ts` | Novos `HealthPageTools`, `HealthReadTable` e `TreatmentReportsTable` fora do inventário congelado | 17–22 |
| `tests/drizzle-health-pharmacy-pages-ast.test.ts` | Hash do JSX de `farmacia/page.tsx`, cuja composição mudou legitimamente | 45–62 |
| `tests/drizzle-personnel-pages-ast.test.ts` | 104 versus 98 TSX | 15–32 |
| `tests/drizzle-sst-pages-ast.test.ts` | 99 versus 86 TSX | 13–30 |
| `tests/finance-pages-static.test.ts` | 71 versus 64 TSX bloqueia a varredura sem ORM antigo; teste visual tem skip condicional já existente | 34–55 |

São **10 falhas de teste**, não dez bugs de negócio demonstrados. Inventários novos e composição tabular autorizada explicam a incompatibilidade dessas exigências históricas; isso não prova sozinho que todos os demais contratos foram preservados.

### Substituição para implementação pelo principal

1. **Manter a prova histórica executável:** preservar os JSON/hashes e seus commits de origem. Arquivar artefatos-fonte imutáveis da versão histórica, com manifest de commit/caminho/SHA, e executar as antigas verificações contra esses artefatos. O histórico deixa de ser uma exigência de congelar a UI atual, sem virar skip nem hash recalculado do worktree. A obtenção dos artefatos deve ser feita pelo principal no fluxo permitido, não fabricada a partir da UI nova.
2. **Inventário atual separado e obrigatório:** descobrir todos os arquivos atuais, incluindo novos adapters/painéis, e reconciliar destinos do inventário de tabelas. Não exigir que a quantidade atual de TSX seja igual à antiga. Ausência de arquivo antigo ou destino não reconciliado deve falhar com diagnóstico próprio.
3. **Gate Drizzle separado de identidade visual:** aplicar a todos os arquivos atuais checks AST de imports runtime legados, fronteiras client/server e sintaxe, sem colocá-los depois de uma asserção de quantidade fixa. Manter os testes existentes de mappings/catálogo físico; eles passaram nesta execução. RH/SST continuam passando seus testes separados de ausência de ORM/SQL inline.
4. **Acesso e actions como contratos comportamentais:** conferir módulo, ente/UG/unidade/setor, permissão de operação, uso do executor autorizado e tratamento de `{ error }` por consumidores `await`. Exercitar callbacks reais com spies e casos negados, sem transformar botões sem handler em cobertura de action. Para SQL, compilar predicados Drizzle com dialect/mock offline; fixtures de banco ficam para a etapa autorizada do principal.
5. **Contrato tabular atual:** fixtures com 0/1/20/21/41 registros, filtros e sort antes do recorte, totais do conjunto, clamp de página, seleção e validação off-page, fechar/reabrir, payload completo e exportação integral. Asserções sobre IDs/campos/valores/ações, não hash de JSX. Incluir F01 e F02 antes de considerá-los corrigidos.
6. **Geometria e visual da UI nova:** manter a proveniência visual antiga, mas homologar a composição nova por invariantes de acesso aos campos, fonte/linha, linha 20, foco, resize e política de dispositivos autorizada. Hash de JSX não demonstra essas propriedades.

Não há aprovação do gate global neste relatório. Os testes históricos continuam falhando e precisam dessa adaptação explícita.

## Execuções e resultados

### A. Todas as novas suítes persistidas identificadas na migração

```powershell
node --import tsx --test --test-concurrency=1 tests/operational-table.test.ts tests/discovery-link-drafts.test.ts tests/especializados-table-widths.test.ts src/components/app-ui/planejamento/planning-drafts.test.ts src/components/app-ui/planejamento/operational-columns.test.ts src/app/app-domain/tributacao/tax-draft-state.test.ts src/app/portal/public-columns.test.ts src/app/app-domain/sst/_components/draft-payload.test.ts src/app/app-domain/financeiro/draft-rows.test.ts src/app/app-domain/educacao/professor/entry-drafts.test.ts src/app/app-domain/patrimonio/_components/operational-workflows.test.mjs
```

**40/40 passaram**, zero skips, sem banco.

### B. Proteções acrescentadas nesta auditoria

```powershell
node --conditions=react-server --import tsx --test tests/table-migration-offline-domain.test.ts
node --conditions=react-server --import tsx --test tests/table-migration-query-export.test.ts
node node_modules/eslint/bin/eslint.js tests/table-migration-offline-domain.test.ts --max-warnings 0
node node_modules/eslint/bin/eslint.js tests/table-migration-query-export.test.ts --max-warnings 0
```

- Agregador aprovado: **34 testes reais no subprocesso**, sem skips, sob runner pai `react-server`; não somar esses 34 novamente aos 40 de A.
- Novo contrato query/export: **3/3 passaram**, cobrindo registro 41 + escopo, ordenação global e CSV/TXT integrais.
- ESLint: ambos aprovados, zero avisos.

### C. Testes offline existentes relevantes

```powershell
node --import tsx --test tests/purchase-item-input.test.ts tests/purchase-request-origin-policy.test.ts tests/bidding-workflow.test.ts tests/health-registration-policy.test.ts
```

**12/12 passaram**, incluindo regras de origem/permissão, transições, prazo, itens e política de cadastro.

```powershell
node --import tsx --test --test-concurrency=1 tests/drizzle-planning-pages-visual.test.ts tests/drizzle-works-pages-visual.test.ts tests/cemetery-static-contract.test.ts tests/drizzle-health-pages-ast.test.ts tests/drizzle-health-pharmacy-pages-ast.test.ts tests/drizzle-personnel-pages-ast.test.ts tests/drizzle-sst-pages-ast.test.ts tests/finance-pages-static.test.ts tests/tabular-renderers.test.ts tests/procurement-export-contract.test.ts
```

**24 testes: 13 passaram, 10 falharam, 1 skip preexistente.** Mappings/catálogo, ausência de ORM em verificações separadas, renderizadores tabulares e contratos de pacotes passaram; falhas discriminadas acima. As suítes históricas de páginas que criam PGlite/Neon/fixtures não foram executadas por exigirem banco.

### D. Probes de F01/F02

Instrumentação temporária reproduzível, fora do workspace, em `C:\Users\thiag\AppData\Local\Temp\opencode\integridade-functional-probes.cjs`. Leitor de referência local em `integridade-readonly-baseline.cjs`, no mesmo diretório. Não fazem conexão de banco, spawn de Git nem mutação de arquivos do projeto.

```text
invalid-row-21-native-validator-followed-by-real-parent-submit: defaultPrevented=true, actionCalls=1
editing-search-matching-role-Membro-to-P: visibleBefore=1, visibleAfter=0
```

## Encerramento

Solicita-se ao principal corrigir F01/F02 nos respectivos domínios e adaptar os gates históricos com a proveniência preservada. F03 recebeu correção somente em testes. F04 deve permanecer explicitamente identificado como dívida anterior. Os resultados são do snapshot auditado; alterações concorrentes posteriores precisam de revalidação direcionada. Nenhuma aprovação de deploy/build/banco é inferida destes checks offline.
