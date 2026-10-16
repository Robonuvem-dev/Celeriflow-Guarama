# Revisão da main, nove migrations e build Vercel

## Resultado

Integração fast-forward de `e513831` até **`a4de0df`**, preservando o pacote local de Frota. Foi utilizado o stash `frota-before-tribut9-review-20261013`, reaplicado sem conflitos e conservado como segurança.

Durante a verificação final, outra execução registrou o commit **`858842b — Frotas`**, já alinhado com `origin/main`, incluindo o pacote de Frota e a correção judicial. Esta revisão não executou commit/push. Ajustes de build, fixtures e o relatório desta auditoria ainda constam como alterações locais posteriores a esse commit.

**As nove migrations têm finalidade e consumidores efetivos no código recebido.** Elas não são pré-requisitos funcionais de todos os fluxos de Frota, mas são necessárias para executar as ampliações da main com suas tabelas, campos e garantias de integridade. Não são apenas seeds ou tabelas sem uso. Não foi identificada justificativa para removê-las nesta revisão.

Isso não equivale a homologar integralmente os módulos envolvidos. Parte das validações permanece na aplicação, e testes isolados não certificam fontes oficiais, atos legais ou operação municipal real.

## Avaliação individual

| Migration | Necessidade e consumidores conferidos | Decisão |
|---|---|---|
| `20261014100000_control_final_reports` | Índices de edição/revisão/finalização/publicação e triggers de imutabilidade em `InternalControlEvent`/anexos. Usados por `c7/circumstantiated-report.ts`, página/actions de relatórios e APIs de download/publicação. | Manter. Testados revisão concorrente, bytes finais, publicação/replay e recusa de anexos de outra entidade/assinatura ausente. |
| `20261014110000_tax_annual_batches` | Simulação/lote/itens e transições, memória fiscal e conciliação com `TaxAssessment`. Usados por `tributacao/annual-batches.ts`, rollover, cron, actions e UI de lotes. Não cria automaticamente lançamentos na instalação. | Manter. Testados Executivo/Câmara, simulação sem efeito, rollback, concorrência, retomada e mudança de base/regra. |
| `20261014120000_hr_role_legal_history` | Histórico legal de cargo por ente, sequência de versões, ato/GED/hash, extinção e retificação aditiva. Usado pelo editor RH e estatísticas de Controle. Não infere extinção a partir de `Role.isActive`. | Manter. Testadas posição temporal, extinção, retificação, versão e imutabilidade. |
| `20261014130000_material_subcategories` | Subclasses e FK composta impedindo vínculo com categoria incompatível. Usadas por cadastro de materiais, seletor de regras de custos e snapshot de consumo. Campo novo é opcional para materiais antigos. | Manter. Testados consumo, seleção de regra, categoria incompatível e preservação do snapshot após mudança de nome. |
| `20261014140000_process_judicial_cases` | Identificação judicial vinculada ao processo nativo, ente/UG e eventos/GED; posição exige evento na mesma transação. Usada por editor do processo e consulta de Controle. | Manter. Testados escopo, versão/replay, encerramento e recusa de alteração sem evento. Corrigido erro de tipagem da consulta. |
| `20261014150000_personnel_fiscal_definitions` | Composição fiscal e limites versionados por exercício, com limites ordenados e revisões imutáveis. Usada por apuração pessoal/RCL de 12 competências e RGF. Não gera percentuais legais fictícios na instalação. | Manter. Testados Executivo/Câmara, escopo integral do ente, cortes incompletos, duplicação de componentes e limite próprio. |
| `20261014160000_stock_valuation` | Valorização opcional após abertura documental; eventos Decimal ligados a movimentos reais, saldos e histórico. Usada por `stock-valuation.ts`, `stock-service.ts`, contabilização de consumo e devoluções. `valuationEnabled` inicia false. | Manter. Testados centavos, média, concorrência, saldo/rollback, devoluções e reconhecimento VPD único. |
| `20261014170000_account_classification_snapshot` | Snapshot JSON opcional das classificações de partidas; preserva classificação já informada, sem backfill inferido em históricos. Usado pela postagem contábil, dimensões de origem, redistribuição e estorno. | Manter. Testados adoção/de-para, vigência, snapshot, fontes distintas por linha e estorno documental. |
| `20261014180000_municipal_activity_relation_integrity` | Trigger preserva relações municipais documentadas armazenadas em `TaxRegistryEntry`. Usada por `planejamento/activity-relations.ts` e leitura fiscal das relações de serviço. Não altera outras categorias fiscais nem atribui alíquota por CNAE/CBO. | Manter. SQL aplicado com histórico completo no teste integrado de Frota; fluxo dedicado de configuração/sucessão não foi homologado nesta revisão. |

As migrations recebidas adicionam estruturas/restrições; não possuem DROP de tabela/coluna, reset, remoção de dados nem backfill de classificação histórica. Triggers sobre tabelas existentes acrescentam bloqueios: os testes conferiram os caminhos revisados, não todos os consumidores possíveis do sistema.

## Problemas comprovados e ajustes

### Consulta judicial / Vercel

Em `src/app/app-domain/controle-interno/consultas/judicial/page.tsx`, o Prisma inferia `_count` como entrada opcional/union ao contextualizar `groupBy` dentro da tupla de `$transaction`. A promessa `statusCounts` agora é criada antes da tupla, mantendo a consulta na transação RepeatableRead e preservando o total real. Sem cast `any` e sem substituir resultado ausente por zero.

### Testes recebidos

A primeira execução apresentou 10 falhas entre 16 testes. A investigação encontrou problemas de cenário/infraestrutura:

- fixture de catálogo de redistribuição omitia `normativeReference`, campo obrigatório;
- histórico legal de cargo e catálogo de item de custos exigiam escopo completo do ente, mas o ator possuía somente uma das duas UGs;
- testes de estoque/subclasse reservavam R$ 20/R$ 30 contra cota bimestral de cerca de R$ 8,33; o cenário de estoque requeria ainda duas reservas de R$ 30 contra dotação anual de R$ 50;
- usuário da fixture estava sem `ativo=true` para movimentações que exigem vínculo financeiro ativo;
- os dois testes iniciais de estoque usavam regras de referência sem habilitar explicitamente o modo POC da fixture;
- índice composto nomeado da posição de estoque não era gerado pelo helper DMMF, causando erro SQL `42P10` no upsert;
- depois de violações esperadas de trigger pelo socket PGlite/Prisma, alguns testes seguintes falhavam com conexão fechada. As asserções de integridade SQL passaram a executar pelo backend isolado direto, conservando os mesmos triggers e verificando o estado subsequente pela aplicação.

Cada arquivo de teste foi revisado e ajustado individualmente. As regras de cota, autorização, usuário ativo e imutabilidade da aplicação não foram afrouxadas. Os helpers receberam apenas opção de valor de dotação, com os valores/defaults anteriores preservados para os demais consumidores.

### Memória do build

A checagem monolítica excedia o heap de 6144 MB. O novo `scripts/typecheck-build.mjs` distribui todas as fontes do projeto entre quatro checagens sequenciais e distribui os blocos de validação de rota gerados por Next via AST. Declarações globais e demais arquivos compartilhados participam de todas as partes; imports são verificados normalmente.

- mantém as opções estritas e a validação de páginas/layouts/API;
- encerra no primeiro erro, antes de executar Next build;
- não edita fontes da aplicação; gera projetos/validadores apenas em `.next`;
- cada processo libera a memória antes do próximo, conservando o heap de 6 GB;
- modo `--cold` verifica sem usar o cache incremental.

Checagem fria aprovada nas quatro partes: memória reportada aproximadamente **5,48 / 5,80 / 5,51 / 5,72 milhões de KB**, dentro do heap configurado. Há custo de tempo por verificar imports compartilhados mais de uma vez. A execução local não garante o tempo/disponibilidade do serviço remoto Vercel.

## Estado do banco compartilhado

Após integração, `prisma migrate status` deixou de apontar as nove migrations ausentes. Em uma consulta posterior, o banco já continha também a migration de Frota, aplicada durante a sessão por execução externa à revisão: **não executei migrate deploy/dev/reset neste trabalho**.

O script novo `scripts/verify-migration-history.ts` consulta somente `_prisma_migrations`, confere arquivos e checksums e considera as terminações LF/CRLF de Windows/Linux, como o Prisma. Resultado observado:

```json
{"local":104,"applied":104,"pending":[],"issues":[]}
```

Checksums coincidentes certificam o histórico de scripts aplicado, não ausência de alterações manuais em todas as tabelas. A validação da cadeia completa em banco isolado foi aprovada pelo teste integrado de Frota.

## Verificação final

- TypeScript monolítico local com heap 8192 MB aprovado, incluindo correção judicial.
- `npm run build` aprovado com checagem particionada e Next build completo.
- Checagem fria de quatro partes com heap 6144 MB aprovada.
- 12 cenários corrigidos dos módulos recebidos aprovados nas reexecuções relevantes: Controle 2, RH 1, judicial 1, pessoal fiscal 2, catálogos 2, subclasse 1, estoque 3.
- Outros 4 cenários já aprovados após integração: lotes anuais Executivo/Câmara 2 e controle de Frota 2.
- `npm run test:frotas`: 18 aprovados após integração.
- Ainda não é resultado oficial da POC de 50 itens de Frota nem confirmação de deployment remoto corrigido.
