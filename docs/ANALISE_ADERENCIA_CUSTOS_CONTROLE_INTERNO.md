# Custos e Controle Interno — aderência ao Planejamento e Orçamento

Data: **11/10/2026**. Decisão de domínio tomada antes de iniciar F9/F10 de Planejamento, atendendo ao pedido de avaliar a inclusão condicional de F11/F12.

**Atualização após as novas orientações:** o usuário confirmou Controle Interno em **Auditoria** e pediu um checkup da localização de Custos entre os 28 módulos. A recomendação resultante é **Custos em Financeiro e Contábil, com indicadores em Administração/BI**. Não se propõe um novo módulo denominado Controladoria. Plano vigente: [PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md](PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md); comparação dos módulos: [CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md](CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md). F11/F12 estão planejadas nas áreas próprias antes de F9/F10, sem implantação realizada por esta análise.

## 1. Conclusão

**Os dois módulos se integram ao Planejamento, mas seus checklists completos não devem ser implantados como domínio de Planejamento e Orçamento.** A aderência é parcial: compartilhar classificação, dotações, programas, metas e demonstrativos não transfere a responsabilidade pela apropriação de custos ou pela auditoria dos demais módulos.

| Checklist | Itens | Responsabilidade recomendada | Relação com Planejamento | Decisão nesta execução |
|---|---:|---|---|---|
| EXE-04 — Gestão e Controle de Custos | 31 | Área funcional de Custos no Financeiro e Contábil, com indicadores em Administração/BI | Consome estrutura/classificação da LOA e dotações; fornece custos realizados para avaliação de programas | F11 planejada na frente financeira antes de F9/F10 |
| EXE-03 — Gestão de Controle Interno | 36 | Área funcional em Auditoria, exercendo controle transversal com autorização própria | Audita planejamento/execução e consulta metas e demonstrativos; integra também Compras, RH, Tributação, Ouvidoria e processos | F12 planejada em Auditoria antes de F9/F10; localização confirmada pelo usuário |

A condição inicial era implantar F11/F12 em Planejamento **se aderentes** e deixar a implantação para outra frente caso contrário. Depois o usuário solicitou o plano de adaptação dos módulos existentes e a revisão da sede de Custos. A análise e o plano estão registrados; não há entrega funcional de F11/F12 nem aceite dos 67 itens neste registro. F9/F10 de Planejamento continuam pendentes, sem início neste bloco.

Tributação participa como fonte dos débitos/receitas e de evidências para auditoria; não é responsável pela apropriação das despesas nem pela gestão de todas as auditorias municipais.

## 2. Fonte oficial e escopo

Fonte: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, seção **10.37**:

- Controle Interno: páginas do arquivo **35–40**, numeração local **1–36**.
- Custos: páginas do arquivo **40–44**, numeração local **1–31**.

Os índices abaixo sintetizam cada requisito para a decisão de domínio. **O texto integral do PDF, incluindo todos os subcritérios, é a referência de implementação e aceite.** Não confundir a numeração local com a numeração contínua das especificações complementares.

Na seção **10.38**, páginas **256–344**, estes dois módulos não possuem bloco próprio de checklist legislativo. A extensão funcional à Câmara pode ser planejada com escopo por entidade, mas não se presume um novo denominador contratual de 31/36 itens para o Legislativo. EXE-01 e LEG-01 permanecem com **99 itens cada**.

## 3. Fundamentos e base existente

### 3.1 Custos

- Os itens **3, 13 e 14** ligam os objetos/relacionamentos à LOA e às dotações. Isso justifica integração direta à classificação canônica de Planejamento.
- Os itens **16–27** exigem apropriação vinculada a liquidação, verificação de materiais, reconhecimento de VPD, prestação de contas, folha, depreciação e almoxarifado. O fato gerador é consumo/reconhecimento da despesa, não a fixação do orçamento.
- Custo, despesa fixada, empenhada, liquidada e paga precisam ser distinguídos. Gerar objetos pela LOA não significa reconhecer custo pelo valor orçado.
- `docs/CHECKLIST_POC_IBEMA_CODEX.md`, seção 7.1, já posiciona EXE-04 no **Financeiro e Contábil**, com checklist e percentual próprios.
- `prisma/schema.prisma`: `CostCenter` já é canônico e possui entidade e hierarquia organizacional. Centro de custo organizacional não substitui objetos, itens, agregadores, apropriações e estornos exigidos no checklist. A busca pelos modelos `CostObject`, `CostItem`, `CostAppropriation`, `CostAggregator` e `CostAllocation` não localizou essas entidades com esses nomes; isso não é prova de ausência de toda funcionalidade relacionada.

### 3.2 Controle Interno

- O item **1** exige integração com os demais módulos por entidade, sem importação/exportação operacional. É um domínio de supervisão transversal.
- O item **23** exige auditoria automática de débitos de fornecedores, contratos, saldos por fonte e índices de saúde/educação; **30, 31 e 35** acrescentam Ouvidoria, processos contra o Município e estatísticas de cargos.
- Checklists, auditorias, pareceres, providências, notificações/respostas e agenda possuem ciclo e responsáveis próprios. Permissão de elaboração orçamentária não concede poderes de auditoria ou encerramento de apontamentos.
- Base atual: `src/app/app-domain/controle-interno/{page.tsx,actions.ts,ControlClient.tsx}`, serviços em `src/lib/c7/operations-service.ts`, modelos `InternalControlPlan` e `InternalControlFinding`.
- Página/actions usam `ADMINISTRACAO`. Os dois modelos examinados são uma base de planos/apontamentos e não possuem vínculo explícito de entidade nem a estrutura completa do checklist. A página lê até 50 planos e inclui apontamentos, sem paginação servidor de 20. A evolução precisa de escopo, autorização própria e jornada ERP completa; a existência da tela não comprova 36/36.

## 4. Mapa de responsabilidade — Custos, 31 itens

Todas as linhas pertencem ao domínio de **Custos/Financeiro**. A coluna de relação identifica fornecedores/consumidores de dados, sem criar segunda implementação nos módulos relacionados.

| Item EXE-04 | Índice do requisito analisado | Relação e fronteira de responsabilidade |
|---|---|---|
| 1 | Objeto com descrição, detalhamento e hierarquia | Custos mantém árvore própria, vinculável à classificação orçamentária |
| 2 | Inclusão de filho com superior/classificação automáticos | Regra da árvore de objetos de Custos |
| 3 | Geração pela LOA até órgão/unidade/função/subfunção/programa/ação, por ente/consolidado | Planejamento fornece LOA/classificações autorizadas; Custos gera objetos idempotentes |
| 4 | Filhos manuais de objetos gerados pela LOA | Custos preserva referência orçamentária e permite detalhamento gerencial |
| 5 | Exclusão dos descendentes junto ao objeto | Exclusão transacional da árvore em Custos |
| 6 | Impedir exclusão quando houver itens/movimentos/custos vinculados | Integridade de histórico de Custos; verificar também descendentes |
| 7 | Identificadores telefone, placa, texto e novas classificações | Classificações configuráveis de itens em Custos |
| 8 | Identificador, descrição/detalhamento e fixo/variável | Cadastro próprio de item de custo |
| 9 | Agregadores com objetos e percentuais cuja soma não ultrapasse 100% | Rateio gerencial de Custos com Decimal e parcela não distribuída explícita |
| 10 | Itens padrão disponíveis | Catálogo inicial de Custos, sem movimentação fictícia |
| 11 | Alterar, ativar/inativar e impedir novo uso de inativos | Política de uso de item, preservando histórico |
| 12 | Objetos relacionados a múltiplos itens | Relacionamento próprio de Custos |
| 13 | Copiar relações objeto/item de LOA anterior | Planejamento fornece peças/anos; Custos mapeia/copía relacionamentos sem copiar consumo |
| 14 | Vários objetos/itens vinculados a várias dotações | Referenciar dotações canônicas de Planejamento, sem duplicar orçamento |
| 15 | Entidades habilitadas à apropriação | Configuração explícita de Custos por entidade |
| 16 | Apropriação em liquidação, folha, almoxarifado e patrimônio | Configuração de gatilhos de execução, não de elaboração orçamentária |
| 17 | Apropriar na liquidação e impedir distribuição acima do liquidado | Financeiro/Custos na mesma transação; saldo reconhecido como limite |
| 18 | Bloquear estorno de liquidação com custo e estornar apropriação na mesma tela | Comando integrado de execução financeira e Custos |
| 19 | Apropriar manualmente pendentes, estornar e excluir estorno | Ledger/saldos de Custos; desfazer estorno de forma rastreável e consistente |
| 20 | Nota de apropriação/estorno | Documento de movimento real de Custos |
| 21 | Apropriar material não destinado ao estoque em verificação/em liquidação | Financeiro verifica destinação e evita dupla apropriação na liquidação seguinte |
| 22 | Apropriar prestação de contas de adiantamentos/transferências no reconhecimento de VPD | Contabilidade fornece evento de reconhecimento, não pagamento do adiantamento |
| 23 | Apropriar lançamento manual de VPD | Integração com escrituração contábil, preservando origem |
| 24 | Configuração folha por funcionário/verba/local/centro/contrato | RH fornece contratos/rubricas canônicos; Custos mantém critérios temporais |
| 25 | Apropriação automática da folha inclusive liquidação simultânea | Financeiro/RH/Custos com lote, idempotência e conservação dos totais |
| 26 | Apropriação automática de depreciação por bem/objeto | Patrimônio fornece movimentos reais; Custos aplica mapeamento vigente |
| 27 | Apropriação automática do almoxarifado por produto/classe/subclasse/centro/local | Almoxarifado fornece consumo valorizado; Custos resolve critérios sem duplicação |
| 28 | Relatório por ente/consolidado, períodos da despesa/apropriação, tipo e pendências | Custos usa reconhecimento e apropriação; filtros de datas independentes |
| 29 | Despesa apropriada/saldo e total por tipo | Relatório reconciliado ao ledger de Custos |
| 30 | Gráfico do valor apropriado por objeto/período | Indicador de Custos; Planejamento pode consumir para avaliar programas |
| 31 | Gráfico por item com filtros entidade/item | Indicador de Custos, com escopo antes de agregação |

## 5. Mapa de responsabilidade — Controle Interno, 36 itens

Todas as linhas pertencem ao domínio de **Controladoria**. O executor financeiro, tributário ou de RH permanece responsável pelo registro fiscalizado.

| Item EXE-03 | Índice do requisito analisado | Relação e fronteira de responsabilidade |
|---|---|---|
| 1 | Integração por entidade sem importação/exportação | Consultas/contratos internos canônicos de todos os módulos |
| 2 | Privilégios por perfil e usuário | Policy de Controladoria por operação/ente, distinta de elaboração |
| 3 | Documentos, notificar usuários, respostas imprimíveis | Ciclo documental e comunicação de Controle Interno com GED |
| 4 | Consulta por categoria/tipo/data/situação/publicação | Consulta própria de Controladoria, com publicação confirmada |
| 5 | Visualizar/alterar/observar/enviar/respostas/anexos | Operações do documento com histórico e autorização |
| 6 | Publicar automaticamente documentos e auditorias | Controladoria integra GED/storage/Transparência |
| 7 | Checklist por grupos/itens numerados | Catálogo próprio e versionado de auditoria |
| 8 | Resposta configurada para irregularidade diagnosticada | Motor de regras de auditoria, com origem verificável |
| 9 | Irregularidade manual | Apontamento próprio, separado do fato fiscalizado |
| 10 | Parecer e providência por irregularidade | Tratamento/acompanhar correção em Controladoria |
| 11 | Parecer relativo a contratação com funcionário identificado | Vincular registro canônico de RH/contratação, sem duplicar pessoa |
| 12 | Respostas possíveis por grupo e automáticas | Configuração própria dos questionários |
| 13 | Categorias de checklist | Classificação do catálogo de auditoria |
| 14 | Checklists padrão das áreas municipais | Catálogo inicial de várias áreas, não só orçamento |
| 15 | Escolher itens da checklist para auditoria | Auditoria preserva cópia dos itens selecionados |
| 16 | Incluir/inativar itens após uso | Evoluir catálogo sem reescrever auditorias passadas |
| 17 | Duplicar checklist editável preservando origem | Cópia de catálogo em Controladoria |
| 18 | Órgão/unidade por centro de custo na auditoria | Reutilizar `CostCenter` organizacional; não confundir com objeto de custo |
| 19 | Agendar auditoria | Programação da equipe de Controle Interno |
| 20 | Encaminhar auditoria ao responsável para respostas | Workflow auditor/auditado com segregação |
| 21 | Auditoria com datas, descrição, centro, responsável e itens da checklist | Modelo próprio de auditoria vinculado à entidade |
| 22 | Gerenciar/duplicar/enviar/analisar/visualizar/encerrar/cancelar | Ciclo auditável e consulta paginada de Controladoria |
| 23 | Auditar fornecedor devedor, empenho acima do contrato, fonte negativa e índices saúde/educação | Financeiro/Compras/Tributação fornecem execução; Planejamento fornece projeções separadas; índices constitucionais exigem bases executadas aplicáveis |
| 24 | Notificações pessoais pendentes, visualizar/responder | Caixa por destinatário; permissão orçamentária não amplia destinatários |
| 25 | Obrigações com criticidade, pessoas/centros visíveis e autorizados à baixa | Agenda transversal de Controladoria |
| 26 | Alertas a vencer/vencidos e justificativa por criticidade | Automação da agenda com deduplicação e justificativa registrada |
| 27 | Antecedência dos alertas/prazo de expiração | Configuração da agenda, não cronograma de desembolso |
| 28 | Pendentes e períodos diário/semanal/mensal/anual | Consultas temporais da agenda |
| 29 | E-mails com título/controlador/destinatário/data/retorno | Comunicação central com status de envio/retorno reais |
| 30 | Consultar reclamações/sugestões da Ouvidoria | Consulta autorizada no domínio de Ouvidoria, respeitando restrições dos processos |
| 31 | Consultar processos contra o Município | Consulta de processos jurídicos/canônicos, não cadastro paralelo em Planejamento |
| 32 | Relatório circunstanciado e publicação automática | Documento próprio de Controladoria com evidências transversais |
| 33 | Quadros/anexos do relatório e publicação dos anexos | Composição do relatório, GED e publicação rastreáveis |
| 34 | Relatórios LRF/anuais para acompanhar índices constitucionais | Reutilizar motor fiscal e dados de Contabilidade; projeção orçamentária não prova índice executado |
| 35 | Estatísticas de cargos por data/cargo/servidor/enquadramento, inclusive extintos | RH fornece histórico/cargos; Controladoria consulta com autorização explícita |
| 36 | Calendário de obrigações por todos/alguns meses | Emissão da agenda de Controladoria |

## 6. Integrações a prever no plano de Planejamento

### 6.1 Custos ↔ Planejamento

- Leitura autorizada de LOA/versão/exercício, hierarquia completa, entidade/UG, programas/ações, classificações e dotações implantadas.
- IDs estáveis e mapeamento explícito entre exercícios; copiar relacionamento não replica apropriações, estornos ou saldos executados.
- Futuro consumo de custos realizados por programa/ação com competência, origem e reversões para avaliação de resultados. Não somar custo e despesa como se fossem parcelas independentes do mesmo total.
- Apropriação/estorno acontece no domínio de Custos junto ao evento de execução e sua transação. A geração de objeto pela LOA não altera saldo orçamentário.

### 6.2 Controle Interno ↔ Planejamento

- Consultar peças, versões, movimentos, compatibilizações, emendas, cotas, reservas de créditos e demonstrativos por entidade/UG autorizados.
- Manter achados, pareceres, responsáveis e providências em Controladoria, referenciando evidências da versão fiscalizada; corrigir orçamento pelo workflow legal de Planejamento.
- Distinguir críticas de elaboração de F4 de auditoria transversal do item EXE-03.23. Usar a projeção fiscal de F8 apenas como projeção; diagnóstico de índice constitucional precisa composição executada homologada.
- F9 pode conectar consumidores existentes/prontos e preparar contratos para a evolução futura. O plano de EXE-01/LEG-01 não incorpora silenciosamente os outros 67 aceites nem depende de declarar EXE-03/EXE-04 homologados.

## 7. Encaminhamento para implantação futura

**F11 — Custos, na frente financeira:** detalhar 31 aceites, completar objetos/itens/agregadores/relações/configurações, apropriação/estornos transacionais e automações de liquidação/VPD/RH/Patrimônio/Almoxarifado, notas, relatórios e gráficos. Reutilizar centro organizacional e orçamento canônicos. Validar concorrência, teto apropriável, estornos, cópia anual, entidade/UG e todos os produtores reais.

**F12 — Controle Interno, no módulo Auditoria:** detalhar 36 aceites, completar escopo/perfis, documentos/GED, checklists versionadas, auditorias e achados, pareceres/providências, encaminhamento/respostas, agenda/alertas, comunicação, consultas transversais e relatórios/publicação. Preservar histórico de auditorias, distinção auditor/auditado e autorização dos dados consultados.

Estas identificações são **fases planejadas nas áreas próprias, não fases executadas de Planejamento**. A sequência vigente é F11 → F12 → F9 → F10; integrações obrigatórias dos 31/36 itens precisam ser concluídas nas próprias F11/F12. Não atribuir percentual de atendimento por cadastro/modelo/entrada de menu nem aceitar integração simulada como implantação completa.
