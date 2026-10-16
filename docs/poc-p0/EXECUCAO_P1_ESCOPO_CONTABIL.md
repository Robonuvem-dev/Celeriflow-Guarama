# P1 — fundação de escopo contábil por entidade e UG

**Executado:** 12/10/2026. **Estado:** P1 iniciada e fundação de escrituração/consultas contábeis aplicada no banco atual. A fase P1 ainda **não está integralmente concluída**.

## Entregue

1. `AccountingTransaction` passa a guardar `governmentEntityId` e `budgetUnitId`, com relações para `GovernmentEntity` e `BudgetUnit`.
2. Migration `20261012100000_accounting_entity_unit_scope`, aditiva, aplicada via `prisma migrate deploy` ao banco atual. Não exclui tabelas nem colunas; as linhas contábeis antigas permanecem sem escopo (`NULL`) e não são atribuídas por inferência.
3. Migration `20261012110000_entity_scoped_financial_years` substitui a unicidade global de ano por chave (entidade, ano), mantém índice parcial para legado sem entidade e cria exercícios escopados para os entes oficiais e de ensaio. Referências das peças LDO/LOA de ensaio são religadas aos exercícios correspondentes.
4. Migration `20261012120000_accounting_year_entity_guard` impede lançamento contábil cuja entidade diverge da entidade do exercício.
5. Migration `20261012130000_scoped_year_requires_accounting_scope` impede partidas sem dimensões em exercícios escopados.
6. Constraint pareia os dois IDs; FK preserva integridade; trigger exige que `PlanningEntityUnit` vincule aquela UG à entidade informada.
7. Serviço de postagem propaga o escopo informado e infere a UG de origens canônicas já cobertas: empenho/anulação/movimento, liquidação, pagamento, retenção, conta bancária, classificação de extrato e movimentação/linha orçamentária do Planejamento. UG ambígua, vínculo ausente, entidade divergente ou autorização de UG inválida são recusados.
8. Estorno copia o escopo da partida original.
9. Postagem manual pela tela exige entidade e UG. As opções vêm das UGs autorizadas pelo contexto; a action envia as permissões do usuário e o serviço valida a relação novamente.
10. Diário, Razão e Balancete aceitam filtro por entidade e/ou UG. O Balancete interno da tela e o diário recente são restringidos às UGs autorizadas. A geração de relatórios financeiros internos recebe as UGs autorizadas pelo contexto autenticado.
11. Fixture de PostgreSQL/PGlite aplica as migrations; testes cobrem postagem escopada, recusa de UG não autorizada, interseção de filtros, leitura segregada das três consultas, pendências bancárias restritas à entidade, fechamento/reabertura mensal e encerramento anual independentes de Prefeitura/Câmara, com segregação de responsáveis.
12. Arrecadação, lançamento prévio, coleta, redistribuição de fonte, estorno e confirmação de pagamento tributário usam a UG da origem/conta para escolher o exercício. A confirmação tributária grava receita, tesouraria e partida no mesmo escopo, preservando replay e rollback transacional.
13. A seleção de exercícios e as actions de fechamento da tela contábil validam acesso à entidade; o administrador técnico conserva o acesso previsto pelo contexto.
14. `Revenue.budgetUnitId` persiste a UG antes da arrecadação. Migration `20261012140000_revenue_budget_unit_scope` vincula a dimensão, infere somente contas de origem conhecidas e valida UG/ente/exercício/conta. Coleta com conta de outra UG, operações fora do perfil e replay com dados divergentes são recusados.
15. `20261012150000_accounting_year_scope_update_guard` estende o guard contábil à alteração do exercício: uma partida da Câmara não pode ser religada ao exercício da Prefeitura.
16. `report-scope.ts` intersecta exercício/entidade/UG solicitada/UGs autorizadas. Tesouraria, conciliações, patrimônio contábil, DVP, RGF e programação de desembolso aplicam o escopo; demonstrativos com totais indivisíveis da entidade exigem acesso ao conjunto completo de UGs. Impressão pede identificação explícita quando o ano é ambíguo. A lista pública e o download de snapshots distinguem a entidade.
17. `sendAccountingReference` referencia a partida já gerada pela baixa canônica do retorno, sem produzir segunda escrituração. Preserva referência anterior na trilha quando presente; retorno sem baixa canônica fica pendente, sem partida presumida. Teste cobre pagamento com excesso e replay.
18. Constituição tributária grava exercício/ente/UG no snapshot; emissão de guia preserva o vínculo e mudança da conta padrão não muda a identidade da arrecadação.
19. Postagem recusa conta com desdobramentos cadastrados e valida conteúdo/escopo da chave idempotente antes de reutilizar uma partida.
20. Carga de proveniência de ensaio: quatro versões DRAFT de 2024–2027, 63 entradas de planejamento por versão (252 no banco), hash/origem/vigência explícitos; 21 contas contábeis por ano documentadas no manifesto. **Nenhuma classificação foi homologada como oficial.** Evidência: `CLASSIFICACOES_ENSAIO_P1.json`.
21. Identidades de ensaio: 21 cadeias PF→contribuinte/fornecedor/credor, sem alterar IDs de contribuinte, imóvel ou inscrição. Dados e documentos são fictícios; replay das cargas mantém as quantidades. Evidência: `IDENTIDADES_ENSAIO_P1.json`.
22. `InternalControlPlan.budgetUnitId` vincula o Controle Interno ao cadastro canônico de UG/ente. A criação, o registro e a resolução de apontamentos validam o escopo. A tela e os contadores de indicadores restringem planos/apontamentos às UGs autorizadas; planos legados ficam sem atribuição presumida. Indicadores financeiros também respeitam módulo e UG.

### Migrations e banco

- Antes da P1: 68 migrations locais, todas aplicadas.
- Estado atual: 75 migrations locais, sete migrations P1 aplicadas.
- A primeira tentativa da migration de exercícios parou ao encontrar o índice único legado `FinancialYear_year_key`; não havia inserido/atualizado linhas. A tentativa foi marcada como rollback, somente os objetos parciais dessa tentativa foram removidos e a migration corrigida foi aplicada. O registro de rollback permanece no histórico de migrations; a execução mais recente está concluída e a base está atualizada.
- As migrations adicionam dimensões/índices/guards e os exercícios por entidade; não removem tabelas. Exercícios legados e chaves de negócio existentes são preservados. Referências P0 LDO/LOA são apontadas ao novo exercício da mesma entidade/ano.
- O inventário prévio da P0 mostrava **zero lançamentos contábeis** na base; portanto não havia partidas existentes a migrar ou classificar. Se surgirem registros históricos legados no futuro, continuam explicitamente sem escopo até reconciliação baseada em evidência.
- Verificação read-only pós-migration: migrations concluídas, duas colunas e triggers presentes, 0 partidas, 0 sem vínculo, 0 mal vinculadas; fixtures P0 confirmadas (2 entidades, 42 UGs, 8 exercícios entidade/ano e 18 instrumentos; quatro exercícios legados permanecem preservados). Também foram criados exercícios em preparação para os entes operacionais atuais. Registro de execução: `AMBIENTE_ATUAL_VERIFICACAO.json`.
- Conferência posterior em leitura: os registros `POC P0` continuam íntegros. A idempotência por entidade/ano está implementada na carga; a verificação de repetição com escrita registrada no fechamento P0 antecede estas migrations.

## Continuação integrada com P2

O motor tributário parametrizado passou a utilizar o mesmo resolvedor de ente/UG das constituições canônicas. As actions do bloco enviam a autorização de UG; consultas de guias e seletores de lançamentos filtram o snapshot persistido. Replays validam acesso e os campos de conteúdo cobertos pelo contrato. Regras fiscais sobrepostas são recusadas quando a versão aplicável não foi explicitamente selecionada.

As correções de arrecadação histórica e atomicidade de retorno foram feitas no mesmo bloco, conforme a otimização solicitada, com testes/validações conjuntos ao final. Evidências e limites: [P2 — cadeia tributária](EXECUCAO_P2_CADEIA_TRIBUTARIA.md).

P1 continua **em andamento**: este bloco fecha parte dos consumidores tributários, mas não homologa a matriz PCASP/MSC nem comprova todos os produtores, cadastros e saídas do critério integral.

## Ainda falta na P1

1. A unicidade do exercício agora é por entidade, mantendo índice parcial separado para os exercícios legados sem entidade. Porém, os consumidores ainda precisam receber/selecionar a entidade em todos os fluxos de Financeiro, Planejamento e Tributação antes de declarar a migração integral concluída.
2. Constituição/guia pelo serviço tributário canônico e confirmação de pagamento já resolvem exercício pela UG; a referência paralela não posta novamente. Outros produtores tributários e patrimoniais, sem origem administrativa canônica, ainda precisam de revisão integral; o caminho patrimonial legado foi restringido explicitamente ao exercício sem entidade, evitando seleção arbitrária entre entes.
3. A geração interna de demonstrativos e a impressão passaram a aplicar escopo, além dos snapshots por entidade. Jobs, publicações e demais consumidores gerais precisam de revisão completa; totais indivisíveis não são apresentados como se fossem totais da UG. O aceite legal dos demonstrativos permanece pendente.
4. Contas/naturezas/fontes do P0 são sintéticas. Homologar e relacionar versões/códigos vigentes do plano de contas e classificações municipais/PCASP/TCE/STN com os documentos da seção 8 do plano consolidado; não publicar nem contabilizar os códigos `POC` como classificados oficialmente.
5. Centros de custo estão vinculados às entidades de ensaio, mas `CostCenter` não é dimensão de contabilização aprovada; o domínio de apropriação por objeto/item vem na F11/P6.
6. O escopo administrativo do Controle Interno foi implementado na tela, comandos e contadores. Relações CNAE/CBO/serviços e dimensões de fonte/MSC ainda exigem a conclusão prevista no plano; documentos GED compartilhados precisam seguir sua política própria de acesso.

## Verificações

- `npx prisma validate`: aprovado.
- `npx prisma generate`: aprovado.
- `npx prisma migrate deploy`: sete migrations P1 aplicadas, com recuperação registrada da tentativa inicial de exercícios.
- ESLint direcionado: aprovado.
- `src/lib/financeiro/__tests__/accounting-scope.test.ts`: 3/3 aprovados em PostgreSQL embarcado com as sete migrations aplicadas.
- `src/lib/c7/__tests__/control-scope.test.ts` e `operations-service.test.ts`: 2/2 aprovados; criação/apontamento/resolução fora da UG recusados, status preservado após recusa.
- `tests/planning-accounting.test.ts`: 5/5 aprovados.
- `tests/planning-completion.test.ts`: 5/5 aprovados.
- `tests/planning-execution.test.ts`: 8 aprovados, 3 de concorrência PostgreSQL real não executados por falta de conexão de teste configurada.
- `tests/planning-postgres.test.ts`: 1/1 aprovado, incluindo as jornadas da Prefeitura, Câmara e fundo com exercícios próprios.
- `tests/public-finance.test.ts`: 19/19 aprovados; preservação dos formatos de exportação e projeções públicas.
- Total das suítes relacionadas: 43 cenários aprovados; 3 de concorrência externa não executados. A rodada conjunta escopo/execução/completion foi interrompida por timeout e teve uma falha do protocolo da fixture após erro SQL esperado; a verificação do guard passou a usar a conexão direta da fixture. Reexecução integral dessas três suítes: 16 aprovados/3 não executados, sem falhas.
- `scripts/verify-poc-p1-scope.ts`: inventário de leitura apenas aprovado no banco atual.
- `npm run build`: aprovado após as alterações de receita, referência tributária, snapshots, validação de conta, seletor orçamentário, autorização do exercício e escopo do Controle Interno/indicadores. O resultado do bloco tributário posterior está registrado separadamente na execução P2.
- Auditoria Decimal/Float: não há registros em AccountingEntry, Revenue, Commitment, Settlement ou Payment na base atual; zero divergências, sem criação de saldos artificiais. Regras com movimentos são exercitadas nas fixtures isoladas.
- Cargas de catálogo/identidade P1: aplicação e reaplicação aprovadas; verificação final registrada em `VERIFICACAO_P1.json`.
- Verificação da matriz P0: aprovada; o hash do schema é conferido contra o commit histórico da baseline para preservar a evidência original após a evolução P1.
- Navegação autenticada pelo navegador não foi executada nesta sessão.

## Próxima continuação da P1

**Continuação de 13/10/2026:** [escopo, identidades e classificações](EXECUCAO_P1_2026_10_13.md). Adoção municipal aditiva, relações de atividades/serviços, reconciliação de identidades e memória classificatória por partida foram implementadas localmente. P1 permanece aberta: integração integral, múltiplas fontes/MSC, decisões municipais e validação agrupada estão pendentes.

**Continuação executada:** [bloco integrado P1–P4](EXECUCAO_P1_P4_BLOCO_INTEGRADO.md), com importação das três versões oficiais TCE-PR de 2026 (14.494 entradas), validação contábil por metadados publicados e revisão adicional de consultas tributárias. De-para/homologação local e as demais pendências estruturais continuam abertos.

- Concluir a propagação de exercício/entidade em todos os consumidores de `FinancialYear` e `MonthlyAccountingClose` (chamadas de Financeiro, Tributação, Planejamento e rotas de impressão); o modelo de dados agora permite fechamento independente por entidade/ano.
- Completar dimensões de UG/ente nos fluxos e relatórios financeiros restantes, sem inferir escopo quando a origem não oferece vínculo.
- Mapear cadastros/classificações oficiais por vigência e validar a matriz de contas.
- Reexecutar typecheck completo, build, testes transacionais/regressão e uma demonstração normal pelo contexto autenticado, antes de dar P1 como concluída.

**P0 concluída:** [controle e fechamento](FECHAMENTO_P0.md). **Aceite da POC:** nenhum item recebe ATENDE nesta execução; o teste técnico da P1 não substitui os roteiros oficiais.
