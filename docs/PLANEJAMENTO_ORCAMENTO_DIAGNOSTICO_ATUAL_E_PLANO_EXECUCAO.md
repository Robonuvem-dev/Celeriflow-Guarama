# Planejamento e Orçamento — diagnóstico atual e plano de execução

Data: **11/10/2026**. Código examinado: **`b965d82` (`plan2`)**, com árvore de trabalho limpa no início da revisão. Escopo: **EXE-01 — Prefeitura, 99 itens; LEG-01 — Câmara, 99 itens**.

## 1. Conclusão

**Continuação após a revisão:** S1 e S2 implementadas e validadas tecnicamente nos cenários registrados: [S1](PLANEJAMENTO_S1_CONTABILIDADE_EVIDENCIAS.md) e [S2](PLANEJAMENTO_S2_EXECUCAO_FINANCEIRO_COMPRAS_EVIDENCIAS.md). A próxima execução é **S3**. O inventário abaixo preserva o recorte inicial `b965d82`; os registros de continuidade atualizam as lacunas sem promover aceites integrais.

**Retomada atual após pedido de execução contínua:** implementações S3–S7 e verificações em [PLANEJAMENTO_S3_S7_EVIDENCIAS.md](PLANEJAMENTO_S3_S7_EVIDENCIAS.md). Próxima frente S8/S9, com materiais oficiais e ensaio ainda necessários. Os estados de diagnóstico abaixo são históricos; esse registro não promove A/H automaticamente.

**Estado mais recente:** S8 técnica implementada; [publicação/diagnóstico e preparação S9](PLANEJAMENTO_S8_S9_PUBLICACAO_E_ENSAIO.md). A implantação operacional e o ensaio autenticado dos 198 IDs continuam pendentes, com bloqueios concretos registrados. Matrizes individuais: [controle de evidências](EVIDENCIAS_PLANEJAMENTO_ORCAMENTO.md).

**Já existe domínio operacional próprio de Planejamento nas duas jornadas. O trabalho restante combina complementação funcional, fechamento das integrações e demonstração integral por ente. Não se resume a testar ou publicar o que já existe.**

Esta revisão atualiza o diagnóstico inicial de 49 bases parciais/50 não evidenciadas. Aqueles números descrevem o inventário anterior a F0–F8 e não devem ser usados como percentual atual de implementação. Nenhum aceite integral novo é registrado por este documento.

Fontes: texto integral dos 99 requisitos preservado na seção 4 de [PLANO_IMPLEMENTACAO_PLANEJAMENTO_ORCAMENTO.md](PLANO_IMPLEMENTACAO_PLANEJAMENTO_ORCAMENTO.md), referenciado ao PDF oficial, páginas 1–13 e 256–267; matrizes [Prefeitura](PLANEJAMENTO_ORCAMENTO_PREFEITURA.md) e [Câmara](PLANEJAMENTO_ORCAMENTO_CAMARA.md); leitura dos serviços, actions, componentes e testes abaixo. Os títulos curtos desta revisão não substituem os subcritérios do texto oficial.

O conteúdo funcional dos dois blocos é comum; acesso, dados, permissões, demonstração e aceite são independentes. Educação aparece nos demonstrativos fiscais exigidos; não se cria um módulo escolar por esse motivo. Custos/Controle Interno mantêm seus próprios planos e denominadores.

### Estado de verificação

- Última rodada registrada em [EXECUCAO_PLANEJAMENTO_ORCAMENTO.md](EXECUCAO_PLANEJAMENTO_ORCAMENTO.md): 43 testes aprovados, lint/Prisma/TypeScript/build aprovados, 57 páginas estáticas. São resultados anteriores a esta revisão documental, não uma nova execução de testes.
- Testes PostgreSQL comprovam partes importantes do domínio. Os novos cenários de execução usam configuração explícita de fixture; não comprovam ativação completa, Compras futura nem toda a concorrência entre módulos.
- Na revisão inicial não foi localizado cenário específico chamando configuração/sincronização da ponte contábil com as seis regras e partidas reais. A continuação S1 acrescentou `tests/planning-accounting.test.ts`, com os resultados registrados no documento de evidências.
- Ensaio autenticado, publicação pública e aceite integral dos 99 itens por ente continuam sem evidência registrada.
- O status operacional das migrations não foi consultado novamente nesta análise. Os registros anteriores indicam pendências `170000`/`180000` e a nova `190000`; conferir o banco de destino antes de implantação.

## 2. Evidências de código reutilizável

Os caminhos dos serviços nesta tabela são relativos a `src/lib/planejamento/`; os componentes a `src/components/app-ui/planejamento/`.

| Ref. | Código conferido | O que já existe | Limite encontrado |
|---|---|---|---|
| C1 | `access.ts`, `policy.ts`, `service.ts`; `PlanningPages.tsx`; actions em `src/app/app-domain/planejamento/actions.ts` | Peças canônicas PPA/LDO/LOA, cadeia por ente/ano, jurisdição/UG, campos de projeto/texto, listas paginadas, programas/objetivos/indicadores/ações e linhas anuais | Criação não equivale a manutenção completa; grau da despesa da LDO e comportamento de orçamento só por fonte exigem complemento; seletores carregam coleções integrais |
| C2 | `catalog.ts`, `reduced-codes.ts` | Fontes com campos TCE/STN/ano; naturezas; percentuais <=100%; código reduzido manual e reordenação sequencial | Sem catálogo oficial versionado/árvore integral; sem geração automática do código PPA pela composição exigida; consignações e vigência precisam cobertura própria |
| C3 | `hearings.ts`, `documents.ts`, `document-response.ts`; `PlanningHearingsPage.tsx`, seção documentos de `PlanningManagementPage.tsx` | Audiências/demandas/contato/bairro/órgão/parecer; vínculo GED à versão preservada, download com hash, solicitação de assinatura | Vincula GED previamente cadastrado; seleção documental limitada a 20 e assinantes a 100; upload e jornada completa não ensaiados |
| C4 | `imports.ts`, `year-rollover.ts`; `PlanningImportsPage.tsx` | Importação STRUCTURE/VALUES, seleção por códigos, cópia/referência de programas/ações, lote/hash/replay/rollback; cópia anual de regras e programação sem realizado | Sem modo de realizado anterior; origem não recebe ano explícito, podendo reunir anos diferentes; prévia é lista da origem, não simulação completa; cópia anual não prova todos os relacionamentos |
| C5 | `revisions.ts`, `operations-core.ts`, `versions.ts`; páginas de histórico/versões/compatibilidade | Movimentos legais, original preservado, cortes, snapshots/hash, consistências, mapeamento/propagação e realizado LDO→PPA | Revisão estrutural de programas fechados, coerência de cortes da programação e consolidações devem ser verificadas; parte da paginação é aplicada após carregamento integral |
| C6 | `amendments.ts`, `credits.ts`, `legacy-reconciliation.ts`, `budget-availability.ts`; gestão de emendas/créditos/workflow | Vereador canônico, bloqueios, decisão integral/rejeição/parcial; prévia e reserva de anulação; implantação única; reconciliação; disponibilidade | Tramitação Câmara/GED e comprovantes finais não encerrados; partidas contábeis e reserva futura ainda precisam ensaio conectado |
| C7 | `scheduling.ts`, `execution-bridge.ts`; chamadas em `src/lib/financeiro/index.ts` | 12 meses, quatro métodos, períodos 2/3/6, cotas, desembolso separado, contingenciamento/liberação/redistribuição; hooks de empenho/pagamento/estorno | Históricos de cálculo vêm de `PlanningQuota.consumed`; falta importar/reconciliar execução legada e alimentar metas de arrecadação automaticamente; precisam testes dos consumidores completos |
| C8 | `accounting-bridge.ts`; entrega em `operations-core.ts` e `versions.ts` | Seis eventos, configuração, comandos pendentes, sincronização, entrega transacional, verificação de abertura legada, locks e escopo | Matriz contábil homologada é configuração externa; sucesso/rollback/replay conectado não comprovados nos cenários específicos atuais |
| C9 | `reports.ts`, `report-catalog.ts`, `report-response.ts`, `report-presentation.ts`; formulários de relatório | 37 entradas, filtros, PDF/CSV, snapshots, composição fiscal configurável, minutas, avaliação financeira por referência implantada | `NOT_STATUTORY`/`INTERNAL_REVIEW`; RCL é projetada; PPA/LDO não têm vínculo direto de dotação suficiente para avaliação executada; publicação indisponível; campos de obras incompletos |
| C10 | `service.ts` (`addPlanningMemory`, `addPlanningWaiver`), modelos canônicos LDO e módulos Financeiro/Tributação/Câmara | Memória base×taxa, previsão de renúncia/compensação, infraestrutura tributária, legislativa e de prioridades/riscos reutilizável | Sem ponte de benefícios→renúncia; memória não prova norma STN; prioridades/riscos não possuem manutenção própria na jornada nova |

Testes examinados: `tests/planning-domain.test.ts`, `tests/planning-operations.test.ts`, `tests/planning-postgres.test.ts`; evidências históricas em [PLANEJAMENTO_F4_F8_EVIDENCIAS.md](PLANEJAMENTO_F4_F8_EVIDENCIAS.md). A existência de serviço compartilhado não comprova os mesmos cenários completos na Câmara.

## 3. Lacunas confirmadas e verificações prioritárias

### Lacunas confirmadas por leitura do código

1. **Itens 3/33:** `instrumentInput` oferece `revenueDegree` e `expenseLevel`, mas não grau independente da despesa da LDO. `lineInput` exige natureza de despesa mesmo no modo só fonte; a configuração precisa refletir entrada, consulta e emissão.
2. **Itens 6/7/37:** os serviços próprios criam programas/ações no PPA; não há manutenção completa correspondente nas actions novas. LDO reutiliza a cadeia, o que não comprova cadastro/importação editável de programas/ações anuais.
3. **Item 8:** `setPlanningReducedCode` recebe código e `reorderPlanningExpenseCodes` gera prefixo+sequência. Nenhum deles representa automaticamente a composição órgão/unidade/função/subfunção/programa/ação exigida no PPA.
4. **Itens 5/9/38/39/60:** importação não define ano da origem; consulta todas as linhas da peça e desloca para `targetYear`. Deve impedir mistura dos quatro anos do PPA e registrar o mapeamento. STRUCTURE/VALUES não importam realizado anterior.
5. **Item 48:** `addPlanningWork` só recebe título/tipo/local/referência/ano/valor. Faltam data de início e os valores individualizados de conservação, novos projetos e ano da LDO. O relatório 49 precisa acompanhar esse complemento.
6. **Itens 13/52/53:** memória existente é projeção simples com texto de metodologia; não reúne automaticamente histórico por ano nem prova todos os campos/cálculos da norma STN aplicável.
7. **Itens 29/31:** avaliação lê a dotação da linha consultada; linhas do PPA/LDO precisam correspondência à execução da LOA anual. RCL atual é soma orçamentária configurada, não composição executada de 12 meses.
8. **Itens 75/81/90:** realizados históricos dependem das cotas preenchidas; não foi localizada alimentação automática de cotas de receita nas rotinas tributárias. Arrecadação e seu estorno precisam origem canônica única, sem somar TaxPayment e Revenue.
9. **Itens 2/55/85:** anexos vinculam GED existente e versão preservada, mas faltam fluxo completo de ingresso do arquivo, pesquisa/paginação e publicação do mesmo documento. Dataset não é hash do arquivo PDF final arquivado.
10. **Transversal:** seletores ora truncam opções, ora carregam tudo; memórias/renúncias retornam somente 20 sem paginação própria. A prévia de compatibilidade carrega todas as linhas e pagina com `slice`.

### Pontos a verificar antes de declarar atendimento

- Abertura tardia deve considerar somente a versão/base da implantação, evitando incluir linhas criadas depois ou duplicar efeitos de comandos de alteração anteriores/posteriores. Exercício e data legal são eixos distintos.
- Sucesso de comando contábil, regras inativas/ambíguas, conta inexistente, competência fechada, falta de servidor e recusa de escopo devem preservar orçamento/auditoria quando a transação falha.
- Reserva, anulação de crédito, contingenciamento, empenho e pagamento devem adotar ordem comum de locks e não consumir a mesma disponibilidade em duas sessões.
- Reserva futura não autoriza empenhamento futuro. Datas/exercício/competência dos consumidores Financeiro/Compras precisam cenários reais.
- Corte anterior à geração da programação não deve mostrar cotas ainda inexistentes; físico/financeiro e datas de registro/vigência precisam regras explícitas.
- Relatórios de confronto/metas devem realmente somar entidades quando solicitado; não basta listar linhas de entes diferentes. Consistência das dimensões entre serviço de compatibilidade e relatório também exige verificação.
- Comparativo legado `generateBudgetChangesComparison` ainda precisa conferir efeito líquido e seleção explícita de ente/peça, antes de redirecionar ou retirar a rota antiga.

## 4. Matriz atual dos 99 requisitos

**B = base interna implementada, com verificações relacionadas; falta cobertura integral/ensaio. P = parcial, com complemento funcional ou de integração identificado.** Ambos são estados de desenvolvimento, não A/H nem aceite. Cada número identifica **EXE-01.n e LEG-01.n**. Os dois controles de aceite permanecem independentes nas matrizes originais; todos passam por **S9**. Referências C apontam para a seção 2; S para o plano da seção 5.

| Item | Exigência resumida | Base | Situação | Trabalho restante além do ensaio S9 | Etapas |
|---|---|---|:---:|---|---|
| 1 | Audiências e demandas | C3 | B | Manutenção, paginação e cenário completo por ente | S4, S6 |
| 2 | Anexos/download de audiência | C3 | P | Ingresso GED, seletores pesquisáveis, storage e acesso autenticado | S6 |
| 3 | Grau receita e nível despesa PPA | C1 | P | Fazer modo só fonte refletir validação, consulta e emissão | S3 |
| 4 | Vínculos PPA conforme TCE | C2 | P | Catálogo oficial vigente e vínculo por peça | S3 |
| 5 | Importar vínculos LOA→PPA | C2, C4 | P | Cópia/mapeamento explícito de vínculos e vigências | S3, S5 |
| 6 | Programas/objetivos/indicadores | C1 | P | Manutenção e múltiplos objetivos/indicadores | S4 |
| 7 | Importar/alterar programas e ações | C1, C4 | P | Assistente independente de linhas e edição no destino | S4, S5 |
| 8 | Código PPA automático composto | C2 | P | Composição exigida e unicidade sem trocar IDs | S3 |
| 9 | Importar receita/despesa PPA/LOA | C4 | P | Ano de origem/destino e prévia de conflitos | S5 |
| 10 | Estrutura/valores/seleção PPA | C4 | B | Seleção pesquisável e prévia completa com totais/erros | S5 |
| 11 | Receita PPA por fonte | C1 | B | Manutenção e rastreabilidade anual | S4 |
| 12 | Rateio PPA | C1, C2 | B | Vigência da configuração e manutenção das parcelas | S3, S4 |
| 13 | Projeção anual PPA | C10 | P | Histórico, premissas e cenários dos quatro anos | S4, S5 |
| 14 | Alterações de receita PPA | C5 | B | Consulta individual pesquisável e regressões de corte | S4 |
| 15 | Consulta PPA por data/entes | C5, C9 | B | Conferir filtros/consolidação/totais em tela e saída | S7 |
| 16 | Metas anuais/destinação PPA | C1, C5 | B | Manutenção e cenários por fonte/ano durante execução | S4 |
| 17 | Transferências PPA por ano/ente | C1, C5 | B | Manutenção e conciliação de contrapartes legadas | S4 |
| 18 | Histórico PPA cronológico/consolidado | C5, C9 | B | Filtros de ente e ordenação consistente na emissão | S7 |
| 19 | Consolidação PPA | C5, C9 | B | Totais e eliminações completos para entes autorizados | S7 |
| 20 | Confronto PPA por fonte/destinação | C9 | P | Validar agrupamento consolidado e destinação | S7 |
| 21 | Emendas PPA | C6 | B | Jornada legislativa/atos e documentação vinculada | S6 |
| 22 | Bloqueio de emendas PPA | C6 | B | Seletores completos e recusa por chamada direta | S4 |
| 23 | Decisão integral/rejeição/parcial PPA | C6 | B | Seleção assistida e tramitação canônica | S4, S6 |
| 24 | Relatórios gerenciais PPA | C9 | B | Conferir todas as variantes e consolidação | S7 |
| 25 | Propagação PPA→LDO/LOA | C5 | B | Mapeamento/concorrência e paginação servidor | S4, S5 |
| 26 | Metas previstas/realizadas por ação/produto | C5, C9 | B | Consolidado e filtros completos no ensaio | S7 |
| 27 | Todas as famílias PPA | C9 | P | Conferir cada saída/subcritério, não só catálogo | S7 |
| 28 | Relatórios compatibilidade valores/metas | C5, C9 | B | Igualar dimensões/corte e verificar ambas as saídas | S7 |
| 29 | Avaliação física/financeira PPA | C7, C9 | P | Mapear execução LOA→programa/ação/ano PPA | S2, S7 |
| 30 | Consultas/relatórios por versão PPA | C5, C9 | B | Cobertura de todas as consultas e anexos históricos | S6, S7 |
| 31 | Saúde/pessoal/MDE/RCL | C9 | P | Bases normativas e RCL executada; regra legislativa | S7 |
| 32 | Receita PPA por grau original/atualizada | C2, C9 | P | Grau pela árvore oficial e variantes por ente | S3, S7 |
| 33 | LDO: graus/projeto/texto | C1 | P | Grau da despesa independente e manutenção legal | S3, S4 |
| 34 | Vínculos LDO TCE | C2 | P | Catálogo oficial vigente e vínculo por peça | S3 |
| 35 | Alterações receita LDO e dados legais | C5 | B | Consulta individual e documentação do ato | S4, S6 |
| 36 | Consulta LDO por data/entes | C5, C9 | B | Conferir consolidação tela/saída | S7 |
| 37 | Programas/ações LDO e importações | C1, C4 | P | Manutenção anual sem editar silenciosamente PPA | S4, S5 |
| 38 | Despesas PPA/LOA/LDO anterior | C4 | P | Ano origem, prévia e modos das três origens | S5 |
| 39 | Receitas PPA/LOA/LDO anterior | C4 | P | Mapeamento anual, vínculos e fontes vigentes | S5 |
| 40 | Realizado LDO reflete PPA | C5 | B | Ensaiar atualização/estorno sem dupla contagem | S4 |
| 41 | Consolidação LDO | C5, C9 | B | Totais/transferências em todos os cenários | S7 |
| 42 | Histórico LDO por ente/data | C5, C9 | B | Consulta e emissão cronológica com filtros | S7 |
| 43 | Emendas LDO | C6 | B | Jornada legislativa/atos e documentação | S6 |
| 44 | Bloqueio emendas LDO | C6 | B | Seletores completos e recusa direta | S4 |
| 45 | Decisão emendas LDO | C6 | B | Seleção assistida e tramitação | S4, S6 |
| 46 | Confronto LDO por fonte/destinação | C9 | P | Consolidado real e destinação | S7 |
| 47 | Receitas/despesas/programas trabalho LDO | C9 | B | Conferir cada variante/filtro/subcritério | S7 |
| 48 | Cadastro obras LDO completo | C9 | P | Data início; conservação; novos projetos; valor anual | S4 |
| 49 | Demonstrativo obras/conservação | C9 | P | Emitir todos os campos completados no item 48 | S4, S7 |
| 50 | Consultas/relatórios por versão LDO | C5, C9 | B | Cobertura de todas as saídas e documentos | S6, S7 |
| 51 | MDE/saúde/pessoal orçados LDO | C9 | P | Composição/leiaute oficial e memória por ente | S7 |
| 52 | Memórias STN | C10 | P | Campos/fórmulas/histórico conforme norma vigente | S4, S7 |
| 53 | Relatórios memórias STN | C9, C10 | P | Leiaute reproduzível e referência normativa | S7 |
| 54 | Programas/ações com filtros completos | C9 | B | Conferir filtros e consolidado de todas as dimensões | S7 |
| 55 | Projeto/lei/anexos LOA | C1, C3 | P | Manutenção, ingresso/vínculo GED e ato versionado | S4, S6 |
| 56 | Fontes TCE/STN LOA | C2 | P | Tabela oficial versionada e vigências | S3 |
| 57 | Plano contas único multiente | C2 | P | Árvore única/versionada e uso nos dois entes | S3 |
| 58 | Natureza/fontes/percentuais <=100% | C2 | B | Vigência/manutenção e seleção completa | S3 |
| 59 | Programação receita/despesa por destinação | C1, C7 | B | Manutenção e realizado vinculado à origem | S2, S4 |
| 60 | Importações e realizado anterior LOA | C4 | P | Modo realizado, estágio, ano origem e memória | S2, S5 |
| 61 | Rateio automático receita LOA | C1, C2 | B | Vigência e rastreabilidade das parcelas | S3, S4 |
| 62 | Histórico atualização receita LOA | C5 | B | Ensaiar contabilidade e ato/documento completos | S1, S6 |
| 63 | Natureza nova na LOA aprovada | C1, C5 | B | Provar efeito contábil transacional/versão | S1 |
| 64 | Partidas automáticas alteração receita | C8 | P | Postagem real, replay, recusa e rollback | S1 |
| 65 | Consulta LOA por data/entes | C5, C9 | B | Consolidado e retirada do comparativo legado ambíguo | S7, S8 |
| 66 | Despesa elemento/destinação/entes | C1, C2 | B | Manutenção, vigência e totais consistentes | S3, S4, S7 |
| 67 | Emendas LOA | C6 | B | Tramitação/atos/GED e ensaio integrado | S1, S6 |
| 68 | Bloqueio emendas LOA | C6 | B | Seletores completos e recusa direta | S4 |
| 69 | Decisão emendas LOA | C6 | B | Seleção assistida, partidas e tramitação | S1, S4, S6 |
| 70 | Alterações multidotações/multifontes | C6, C8 | B | Partidas por item/origem e atomicidade do lote | S1, S2 |
| 71 | Histórico despesa cronológico | C5, C9 | B | Filtros/ordenação e atos finais vinculados | S6, S7 |
| 72 | Consolidação LOA | C5, C9 | B | Conferir totais/eliminações por corte/versão | S7 |
| 73 | Disponibilidade orçamento aprovado | C6, C8 | P | Abertura confirmada e uso no exercício correto | S1, S2 |
| 74 | Desembolso mensal ente/fonte | C7 | B | Pagamento/estorno canônico no fluxo completo | S2 |
| 75 | Arrecadação mensal modalidade/fonte | C7 | P | Alimentação canônica e estornos; modalidade explícita | S2 |
| 76 | Códigos receita/consignação/reordenação | C2 | P | Consignação, gestão assistida e limites de execução | S3, S4 |
| 77 | Prévia/lotes/minutas/efetivação contábil | C6, C8, C9 | P | Partidas, ato final GED e rollback do lote inteiro | S1, S6, S7 |
| 78 | Reserva/liberação anulação da prévia | C6 | B | Concorrência com reserva/empenho/contingenciamento | S2 |
| 79 | Consistências PPA/LDO/LOA | C5 | B | Completar críticas dos novos campos/catálogos | S3, S4 |
| 80 | CMD fonte/mês/entes e relatório | C7, C9 | B | Pago bruto, estornos, cortes e consolidação | S2, S7 |
| 81 | Metas arrecadação e relatório | C7, C9 | P | Realizado automático e consolidado mensal | S2, S7 |
| 82 | Impressão decretos suplementação | C9 | P | Template oficial/ato final, não apenas minuta | S6, S7 |
| 83 | Implantação e consumo futuro Compras | C6, C7 | P | Reserva futura real, bloqueios e escopo/concorrência | S1, S2 |
| 84 | Cópia anual completa | C4 | P | Inventário de relações, vigência e resumo de exceções | S3, S5 |
| 85 | Lei 4.320 e publicação simultânea | C9 | P | Cada anexo oficial + arquivo/portal/estado/recibo | S7, S8 |
| 86 | Cotas por ente | C7 | B | Execução financeira conectada e segregação de UG | S2 |
| 87 | Períodos 2/3/6 meses | C7 | B | Concorrência e reservas por período no consumidor | S2 |
| 88 | Atualização automática cotas | C5, C7 | B | Crédito conectado sem exceder saldo/reservas | S1, S2 |
| 89 | Cotas previsto/realizado | C7, C9 | B | Eventos reais, estornos e reconstrução por corte | S2, S7 |
| 90 | Cálculo ano anterior/três anos/12 | C7 | P | Históricos reais/legados reconciliados e memória | S2, S5 |
| 91 | Percentuais mensais | C7 | B | Editor assistido dos 12 meses e conferência de total | S4 |
| 92 | Contingenciamento global/dotação | C7 | B | Concorrência com consumidores e corte histórico | S2 |
| 93 | Liberação contingenciamento | C7 | B | Vínculo, saldo e concorrência no fluxo conectado | S2 |
| 94 | Redistribuição meses fechados | C7 | B | Cortes antes/depois e invariantes com execução | S2, S7 |
| 95 | Compatibilização LOA↔PPA/LDO | C5 | B | Mapeamento completo e ensaio das três peças | S4, S5 |
| 96 | Confronto LOA por fonte/entes/impressão | C9 | P | Mesmo dataset/totais na consulta e consolidação | S7 |
| 97 | Alterações/filtros MCASP | C2, C9 | P | Classificação oficial e todos os filtros/agrupamentos | S3, S7 |
| 98 | MDE/saúde/pessoal orçados LOA | C9 | P | Composição/leiaute oficial por ente e versão | S7 |
| 99 | Renúncia/compensação/relatório LRF | C9, C10 | P | Benefícios tributários, previsão/realizado e metodologia | S4, S7 |

## 5. Plano de implementação para executar em seguida

S1–S9 são **blocos de retomada**, relacionados às fases F0–F10 existentes, não novos módulos. Ordem: **S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9**. Os materiais externos são registrados desde já; lacunas de código continuam sendo executadas enquanto esses materiais são obtidos. S9 inclui todos os itens, inclusive os marcados B.

### S1 — fechar contabilização transacional (P0; F7/F9)

- Criar cenários PostgreSQL isolados com catálogo/regras/contas e o motor financeiro real; não simular `postAccountingEventInTransaction`.
- Executar implantação com receita/despesa, seis tipos de evento, alterações positivas/negativas, natureza nova e lote de crédito multifonte. Verificar servidor responsável, UG e jurisdição.
- Verificar sincronização de comandos anteriores à conexão, abertura legada reconciliada, original versus posição atual e base preservada da abertura. Ajustar payload/modelo se a entrega tardia depender de dados mutáveis.
- Testar replay e conflito, regra inativa/ambígua, conta ausente, competência fechada e falha após a primeira partida de um lote. Conferir movimentos, saldos, cotas, versões, reservas, comandos e auditoria após rollback.
- Arquivos: `accounting-bridge.ts`, `operations-core.ts`, `versions.ts`, `credits.ts`, `src/lib/financeiro/index.ts`, testes específicos.
- **Aceite:** cada efeito possui partida balanceada exatamente uma vez; falha não deixa orçamento nem lote parcialmente efetivado; sincronização conserva a abertura original. Regras das fixtures não são promovidas como PCASP oficial.

### S2 — Financeiro/Compras e realizados canônicos (P0; F6/F7/F9)

- Ensaiar serviços reais de reserva/solicitação/aprovação em preparação, empenho/reforço/anulação/cancelamento, pagamento/estorno e suas transações.
- Unificar ordem de locks; validar datas/competências, disponibilidade líquida de reserva de crédito e contingenciamento, reservas por período e exclusão da reserva consumida.
- Configurar execução pelo serviço oficial, recusando baseline anterior não reconciliado. Não depender de editar metadata na fixture para demonstrar o fluxo completo.
- Alimentar realizado de receita/estorno a partir do fato financeiro canônico; definir correspondência única natureza/fonte/UG/ano e impedir duplicação de recebimentos tributários.
- Criar contrato de leitura mensal com estágios explícitos e estado de não apuração; mapear linhas PPA/LDO às dotações da LOA anual para avaliação.
- **Aceite:** duas sessões não ultrapassam saldo/cota; reserva futura funciona em Compras sem permitir empenho futuro; reversão devolve apenas seu saldo; previsto/realizado por ente coincide com a origem.

### S3 — catálogos, graus, vínculos e códigos (P1; F1)

- Completar árvore/níveis/vigências, tabela TCE/STN versionada, graus de receita/despesa e comportamento de orçamento por fonte versus elemento/fonte.
- Definir vínculos explícitos por peça ou comprovar compartilhamento canônico equivalente, incluindo importação LOA→PPA/LDO e uso histórico.
- Implementar código automático PPA com composição oficial, códigos de receita/consignação e reordenação assistida antes da execução; preservar IDs de consumidores.
- Conferir TODOS os consumidores antes de modificar funções/modelos; preparar migrações aditivas e reconciliação dos registros antigos.
- **Aceite:** escolha do grau/nível muda entrada/consulta/saída; fonte inválida/vencida é recusada; catálogo é único entre entes; 101% é recusado; códigos não rompem referências.

### S4 — completar elaboração e manutenção ERP (P1; F0/F2/F4/F5/F6)

- Manutenção de peças, programas, múltiplos objetivos/indicadores, ações, previsões, metas, memórias e renúncias; prioridades/riscos e programa/ação anual da LDO.
- Rascunho admite edição controlada; peça fechada exige revisão formal. Revisão estrutural não reescreve snapshots aprovados nem afeta outro exercício inadvertidamente.
- Completar obras com início e valores previstos/conservação/novos projetos/ano da LDO e referências de ente.
- Completar projeção anual com base histórica, parâmetros, memória e ausência de histórico explícita; adequar dados da renúncia/compensação.
- Substituir códigos livres e listas truncadas por seletores/editor pesquisáveis; paginação servidor 20, inclusive programas, memórias/renúncias, compatibilidade e seções secundárias. Formular percentuais em 12 meses e sanção parcial com seleção assistida.
- **Aceite:** usuário realiza manutenção e revisão nas duas jornadas sem SQL/JSON/IDs livres; todos os campos exigidos aparecem; mais de 20 registros permanecem acessíveis; escopo antecede count/totais/export.

### S5 — importações e virada completas (P1; F3/F7)

- Adicionar ano da origem, seleção persistente entre páginas, mapeamento de classificações/fontes/programas/ações e simulação de totais/conflitos.
- Completar importação independente de programas/ações/vínculos e modo de realizado anterior da LOA, com estágio e corte preservados no lote/fingerprint.
- Usar o contrato mensal S2 para ano anterior/três anos; reconciliar históricos legados sem inventar valores.
- Inventariar todos os relacionamentos/configurações da cópia anual; copiar apenas os vigentes e apresentar os não copiados com motivo. Não copiar ato final, consumo ou permissões indevidamente.
- **Aceite:** nenhuma mistura involuntária dos quatro anos PPA; todas as origens/modos exigidos funcionam; replay não duplica; falha reverte lote; origem permanece intacta e resumo explica exceções.

### S6 — GED e tramitação Câmara (P1; F2/F5/F9)

- Ingresso/seleção do arquivo GED, pesquisa/paginação de documentos/audiências/assinantes, proteção por finalidade/ente e download do arquivo preservado com hash.
- Vincular projeto/lei/emenda/lote aos registros canônicos de proposição/ato/tramitação Câmara; preservar o vereador e a decisão legal específicos.
- Assinar versão vinculada pelo serviço GED; mostrar versão/status/finalidade e distinguir assinatura interna de ICP/provedor externo conforme política documental.
- Concluir anexos de audiência e peças, documento final de decreto e vinculação ao ato legal sem substituir a versão sancionada silenciosamente.
- **Aceite:** novo arquivo GED não troca anexo histórico; usuário da outra jurisdição não acessa arquivo; decisão/assinatura/publicação possuem referências reais; erro e replay preservam o fluxo.

### S7 — relatórios oficiais e renúncia (P1; F8/F9)

- Conferir cada saída/subcritério do catálogo contra o texto oficial, com mesma origem de tela/PDF/CSV, classificações históricas e agrupamentos de entidade/consolidado.
- Completar relatório 48/49, avaliação física/financeira anual/quadrienal e reconstrução da programação por data, inclusive corte anterior à geração.
- Implementar RCL executada reproduzível e manter projeção separada; definir inclusões/exclusões/parâmetros e particularidades Câmara para MDE/Saúde/Pessoal.
- Adequar memórias STN, anexos Lei 4.320 e minutas/decretos aos modelos aplicáveis. Não retirar `NOT_STATUTORY` por mudança de rótulo.
- Conectar benefícios tributários à renúncia prevista/realizada e compensação orçamentária, sem confundir compensação de crédito do contribuinte; definir exercício/corte/metodologia.
- **Aceite:** todas as variantes exigidas reconciliam ao centavo; avaliação não apresenta não-apuração como execução zero; leiaute/composição por ente possuem evidência normativa.

### S8 — publicação e transição operacional (P1; F9)

- Arquivar PDF final com hash dos bytes, versão/corte/entes/emissor, autorização e evento de publicação/republicação.
- Implementar publicação simultânea solicitada no item 85: mesmo artefato no portal, link público, estados, falha recuperável e idempotência; emissão interna não equivale a publicação.
- Conferir banco de destino e migrations, perfis, vínculos e legado; aplicar em ambiente isolado primeiro. Preservar migrations RH e sua identidade.
- Corrigir/redirecionar comparativo e formulários antigos somente depois de validar consumidores novos; evitar duplicação de orçamento nos menus Financeiro/Tributação.
- **Aceite:** URL pública entrega exatamente o arquivo preservado; erro não anuncia publicação concluída; rotas antigas encaminham corretamente e execução continua canônica.

### S9 — ensaio e aceite individual (P1; F10)

- Preparar base isolada Vila das Araucárias com dois entes, quatro anos PPA, LDO/LOA, diversas UGs/fontes e volume superior a 20 registros.
- Usar usuários proponente/aprovador/sancionador/consulta/financeiro e perfis com escopo parcial; incluir tentativas diretas de action/export/download.
- Executar cada item e todos os subcritérios em `/planejamento/*` e `/camara/planejamento/*`, incluindo falhas, concorrência, estornos, integração, documento emitido e efeitos persistidos.
- Registrar ID, roteiro, pré-condição/dados/ano/UG/versão/corte, perfil, evidência/artefato/hash quando aplicável, commit, executor/data e resultado. Usar uma linha por ID em cada ente; cada subcritério tem evidência própria.
- **Aceite final:** EXE-01 **99/99** e LEG-01 **99/99**, independentes. Item parcial permanece pendente; build/testes não substituem demonstração.

## 6. Dependências externas identificadas

São pedidos concretos a confirmar com o responsável pelo ente. Não se presume API externa para uma tabela ou documento normativo.

| Dependência | Ente / itens | Material/configuração necessária | Responsável esperado | Prova para encerrar |
|---|---|---|---|---|
| Matriz contábil | Ambos: 64, 73, 77, 83, 88 | Relação dos seis eventos com contas débito/crédito, vigência/exercício, indicação de aprovação; cadastrar no Financeiro | Contabilidade | Partidas conferidas, valores/fontes/atos, rollback e replay |
| Classificações oficiais | Ambos: 4, 5, 8, 32–34, 56–58, 66, 76, 97 | Tabelas TCE-PR/STN/MCASP aplicáveis por exercício, versão e origem documental, formato estruturado quando disponível | Contabilidade/Orçamento | Importação/versionamento, rejeição de vínculo inválido e reprodução histórica |
| Demonstrativos/memórias | Ambos: 27, 31, 47, 51–54, 85, 98 | Modelos oficiais aplicáveis, norma/edição, composições e inclusões/exclusões; catálogo de cada anexo 4.320 | Contabilidade/Orçamento | Comparação linha a linha e conferência normativa por saída |
| Particularidades legislativas | Câmara: 31, 51, 85, 98; atos 21–23, 43–45, 67–69 | Metodologia/recorte/consolidação aplicável e fluxo de tramitação/autoridades/atos reais | Contabilidade Câmara/Secretaria Legislativa | Cenário legislativo completo, sem excluir item por suposição |
| Histórico financeiro | Ambos: 13, 29, 31, 60, 75, 81, 90 | Dados canônicos reconciliados do ano anterior/três anos e período da RCL; mapeamento UG/fonte/natureza/programa/ação e estágio | Financeiro/Orçamento | Soma mensal/anual reconciliada; missing não vira zero |
| Renúncia/compensação | Ambos: 99, conforme benefícios aplicáveis | Atos/modalidades, projeção por ano e medida de compensação; vínculo às origens tributárias | Tributação/Orçamento | Previsto/realizado distinguíveis e relatório LRF conferido |
| Assinatura/ato final | Ambos: 2, 55, 77, 82; emendas | Política documental por classe, usuários/autoridades e provedor/certificado apenas se exigido pelo ato | GED/Jurídico/Legislativo | Assinatura da versão exata e evidência verificável |
| Publicação | Ambos: 85; documentos legais relacionados | Configuração storage/portal e fluxo de publicação; credenciais somente se serviço externo for efetivamente necessário | Administração portal/GED | Arquivo público idêntico, hash, URL e recuperação de falha |

## 7. Controle de execução

- S1 e S2 possuem verificação técnica registrada, incluindo correções descobertas pelos testes e concorrência com conexões PostgreSQL reais. A próxima etapa é **S3**, mantendo os critérios de aceite operacional S8/S9.
- Cada bloco entrega serviço/action/UI quando aplicável, migrations aditivas, regressões relevantes e atualização de evidências. Preservar retorno `{ error?, id? }` das actions cliente e conferir consumidores antes de alterar assinatura.
- Ler guias Next locais quando alterar APIs/rotas/actions. Não usar find-and-replace genérico em massa.
- Verificação de código: testes dirigidos, lint, Prisma quando schema mudar, TypeScript e build seguro com `VERCEL_ENV=development`. Rodar testes somente após geração Prisma; build não implanta automaticamente banco nesta modalidade.
- Para revisão apenas documental: conferir sequência 1–99, referências e `git diff --check`. Esta revisão não altera aplicação nem aplica migrations.
- Atualizar matrizes de aceite somente com evidência individual. Este documento organiza o desenvolvimento; não certifica o módulo como pronto.
