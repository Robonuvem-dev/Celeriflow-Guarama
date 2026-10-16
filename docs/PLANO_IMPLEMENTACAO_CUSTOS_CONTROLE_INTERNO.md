# Financeiro, Administração/BI e Auditoria — implantação de Custos e Controle Interno

Data: **11/10/2026**. Escopo: **EXE-04 — Gestão e Controle de Custos, 31 itens**, e **EXE-03 — Gestão de Controle Interno, 36 itens**.

## 1. Decisão de produto e meta

Diretriz atual do usuário: adaptar os módulos existentes, conferir a aderência de Custos aos 28 módulos e confirmar ou revisar a hipótese Administração/indicadores. **Controle Interno em Auditoria foi confirmado.** Não é necessário criar um novo módulo denominado Administração e Controladoria.

**Decisão recomendada após leitura do código e dos checklists:**

1. **F11 — Gestão e Controle de Custos dentro de Financeiro e Contábil**, com jornada `/financeiro/custos/*` e domínio próprio de Custos. **Administração/BI consome os indicadores** do mesmo serviço, sem outro ledger ou CRUD.
2. **F12 — Gestão de Controle Interno dentro de Auditoria**, com jornada `/auditoria/controle-interno/*`. Administração oferece acesso à mesma área, condicionado à permissão do usuário. A área de evidências técnicas permanece em `/auditoria`.
3. Os cadastros centrais de Administração, o orçamento de Planejamento e os registros financeiros, tributários, de RH, estoque e patrimônio permanecem as fontes canônicas dos fatos. As novas áreas mantêm critérios de custo e registros de controle, não cópias dos fatos fiscalizados.
4. A sequência de trabalho solicitada passa a ser **F4–F8 de Planejamento → F11 → F12 → F9 → F10**. A conexão dos produtores necessária a Custos/Controle Interno pertence a F11/F12; não adiar os itens automáticos desses checklists para declarar essas fases completas. F9 posterior encerra as conexões próprias do checklist de Planejamento.

**Meta: 31/31 Custos e 36/36 Controle Interno integralmente funcionais.** Não usar o mínimo contratual para reduzir a entrega. Item com integração, relatório, permissão ou subcritério pendente continua aberto. Os 67 aceites são independentes dos **99/99 EXE-01 e 99/99 LEG-01** de Planejamento.

**Estado deste documento: plano de implantação.** F11/F12 estão planejadas, não implementadas ou homologadas por este registro. O [checkup dos 28 módulos](CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md) revisou a hipótese intermediária Administração e recomenda Financeiro como sede operacional, mantendo indicadores em Administração. A avaliação de aderência ao Planejamento continua parcial por integração.

## 2. Fontes e análise de aderência

- Fonte oficial: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, seção **10.37**, páginas **35–40** para Controle Interno e **40–44** para Custos. IDs usados aqui são a numeração local de cada módulo.
- [Análise de aderência](ANALISE_ADERENCIA_CUSTOS_CONTROLE_INTERNO.md): mapa individual dos 67 requisitos e fronteiras com Planejamento.
- [Plano de Planejamento](PLANO_IMPLEMENTACAO_PLANEJAMENTO_ORCAMENTO.md): peças, classificações, versões, movimentos, emendas, cotas e implantação.
- `docs/CHECKLIST_POC_IBEMA_CODEX.md`: organização funcional e avaliação independente, atualizadas para a diretriz deste plano.

### Por que estas localizações?

**Custos em Financeiro, indicadores em Administração:** liquidação/VPD e respectivos estornos são os momentos operacionais exigidos pelo checklist, e os serviços financeiros já concentram as transações correspondentes. Administração organiza a leitura gerencial municipal, com indicadores por objeto/item/órgão/programa e acesso ao serviço canônico. A proximidade do BI não transforma o painel no executor de apropriações financeiras nem converte orçamento previsto/pagamento em custo.

**Controle Interno em Auditoria:** o checklist exige programação e realização de auditorias, questionários, apontamentos, pareceres, providências e evidências. Auditoria já dispõe de consulta de eventos imutáveis. A aderência é maior para abrigar o trabalho do controlador, porém a consulta atual de logs não substitui os 36 requisitos funcionais. Documentos, obrigações, comunicações e relatório circunstanciado precisam ser construídos como área própria.

Na seção legislativa **10.38**, páginas 256–344, não há checklist próprio destes dois módulos. A arquitetura precisa aceitar Prefeitura/Câmara por entidade, quando habilitado; extensão funcional à Câmara não cria automaticamente um denominador contratual legislativo de 31/36. Não presumir direito de acesso cruzado entre entes.

## 3. Inventário inicial verificado

| Base | Arquivos/modelos verificados | Reaproveitamento e lacuna |
|---|---|---|
| Administração/BI | `src/app/app-domain/administracao/{page.tsx,layout.tsx,indicadores/page.tsx}` e `src/app/app-domain/indicadores/page.tsx` | Acrescentar indicadores de Custos e atalhos autorizados às áreas canônicas. BI reexporta a página comum de indicadores, que lê o cadastro legado `FleetOperation`; reconciliar as origens atuais antes de mostrar custo municipal. Indicadores novos exigem escopo antes de contagem. |
| Financeiro | `src/app/app-domain/financeiro/layout.tsx`, `src/lib/financeiro/index.ts` | Sede proposta de Custos; `createSettlement` e `cancelSettlement` oferecem a fronteira de transação a conectar. Acrescentar submenu, services/actions e fluxos de apropriação/estorno na própria liquidação. |
| Centro organizacional | `CostCenter`, `GovernmentEntity`, `Secretariat`, `Department`, `AdministrativeUnit` no schema | Reutilizar entidade/hierarquia organizacional. Objeto de custo é outra dimensão; não substituir centro organizacional por objeto de custo. |
| Controle inicial | `src/app/app-domain/controle-interno/{page.tsx,actions.ts,ControlClient.tsx}`; `src/lib/c7/operations-service.ts`; `InternalControlPlan`/`InternalControlFinding` | Base de planos/apontamentos com permissão ADMINISTRACAO. Modelos examinados sem entidade explícita, checklist, respostas e agenda completos. Lista limitada a 50 planos e filhos incluídos não é paginação ERP de 20. Migrar/adotar registros, preservando IDs/histórico e conferindo consumidores. |
| Auditoria técnica | `src/app/app-domain/auditoria/page.tsx`; `src/lib/platform/{audit-query,audit-query-service,audit-evidence}.ts` | Permissão AUDITORIA, filtros, cursor estável e 20 eventos. Acrescentar navegação funcional e vínculos de evidência. Os filtros examinados não incluem entidade/UG; evolução precisa de escopo explícito, sem inferir o ente pelo ator/nome. |
| Planejamento | `src/lib/planejamento/*`; `PlanningInstrument`, `PlanningBudgetLine`, `BudgetAppropriation`, peças canônicas | Fornece LOA/classificação/versão/dotação/programas/metas. Realizado/custo não pode ser fabricado com a previsão. Conexões F9 de Planejamento ainda pendentes. |
| Execução | `Settlement`, `MaterialMovement`, `AssetValueHistory` e contratos financeiros/RH existentes | Reconhecimento/consumo são candidatos a produtores de custo. Auditar cada serviço e seus consumidores na implementação; valores legados Float precisam conversão/regra de arredondamento documentada antes do ledger Decimal. |

Este inventário não promove itens a atendidos. Não houve ensaio funcional dos 67 requisitos. Todos os aceites das matrizes abaixo começam pendentes.

## 4. Navegação e experiência ERP propostas

Rotas são **propostas**, não páginas entregues neste bloco.

| Módulo | Área | Rota proposta |
|---|---|---|
| Financeiro | Painel de custos/configuração por entidade | `/financeiro/custos` |
| Financeiro | Objetos e árvore | `/financeiro/custos/objetos` e `/[id]` |
| Financeiro | Classificações/itens | `/financeiro/custos/itens` e `/classificacoes` |
| Financeiro | Agregadores e rateio | `/financeiro/custos/agregadores` |
| Financeiro | Relações com dotações/folha/bens/estoque | `/financeiro/custos/relacionamentos` |
| Financeiro | Geração LOA/cópia anual | `/financeiro/custos/geracao` e `/copia-anual` |
| Financeiro | Apropriar pendentes, consultar movimentos/estornos | `/financeiro/custos/apropriacoes` e `/[id]` |
| Financeiro | Notas, relatórios e gráficos | `/financeiro/custos/relatorios` |
| Administração | Indicadores de Custos e atalho à operação autorizada | `/administracao/indicadores` → `/financeiro/custos` |
| Auditoria | Evidências técnicas | `/auditoria` |
| Auditoria | Painel de Controle Interno | `/auditoria/controle-interno` |
| Auditoria | Documentos/observações/anexos/notificações | `/auditoria/controle-interno/documentos` e `/[id]` |
| Auditoria | Checklists/grupos/itens/respostas/versões | `/auditoria/controle-interno/checklists` e `/[id]` |
| Auditoria | Auditorias/questionários/análise/achados/providências | `/auditoria/controle-interno/auditorias` e `/[id]` |
| Auditoria | Execuções e diagnósticos automáticos | `/auditoria/controle-interno/diagnosticos` |
| Auditoria | Agenda/alertas/calendário | `/auditoria/controle-interno/obrigacoes` |
| Auditoria | Caixa do notificado e respostas | `/auditoria/controle-interno/notificacoes` |
| Auditoria | Consulta de envio/retorno de comunicações | `/auditoria/controle-interno/comunicacoes` |
| Auditoria | Consultas de Ouvidoria/processos/cargos | `/auditoria/controle-interno/consultas` |
| Auditoria | Quadros, relatório circunstanciado e relatórios legais | `/auditoria/controle-interno/relatorios` |

Administração terá indicadores de Custos e atalho à operação financeira autorizado, além de item **Controle Interno** apontando para a jornada canônica em Auditoria, sem outro CRUD. A rota atual `/controle-interno` será adaptada para acesso compatível após migração/perfis validados. Não fazer redirecionamento cego que impeça os atuais responsáveis de consultar/responder. A sede operacional de Custos é uma recomendação fundamentada no checkup; a localização de Controle Interno foi confirmada pelo usuário.

**Padrões obrigatórios:** `ModuleShell`, `PageHeader`, componentes ERP/formulários do projeto, filtros recolhíveis, tabela de altura natural e 20 registros por página no servidor. Ordenação estável com ID, totais sob o mesmo filtro, preservação do filtro no retorno, campos obrigatórios explícitos, seleção canônica pesquisável e tratamento de erros/salvamento. Sem campos de JSON/IDs livres para substituir os seletores e os editores de relações exigidos.

## 5. Arquitetura, acesso e integridade

### 5.1 Serviços e autorização

- Domínios propostos: `src/lib/custos/*` e `src/lib/controle-interno/*`; páginas/actions finas sobre serviços canônicos. AUDITORIA técnica permanece em `src/lib/platform/audit-*`.
- Custos operacional: ativação/permissão `FINANCEIRO` **mais privilégio da rotina**, por exemplo `custos.manageCatalog`, `custos.configure`, `custos.appropriate`, `custos.reverse`, `custos.issueReports`. BI exige `ADMINISTRACAO` e autorização explícita de leitura agregada de Custos/entes, sem conceder edição financeira.
- Controle Interno: ativação/permissão `AUDITORIA` **mais privilégio da rotina**, por exemplo `controleInterno.manageChecklists`, `schedule`, `diagnose`, `analyze`, `close`, `publish`, `issueReports`. Conferir contrato real de permissões antes de escolher nomes definitivos.
- Consultar logs não concede conduzir auditorias. Ser auditor não concede editar orçamento, liquidar/empenhar ou alterar débitos. Privilégios individuais complementam perfis, com trilha de alteração/delegação.
- Notificados/auditados terão canal restrito para os próprios documentos/questionários/respostas, acessível por Administração ou pela caixa transversal existente, sem lhes conceder a consulta geral de logs ou de auditorias. A autorização exige destinatário/atribuição + ente + recurso; não exigir perfil de auditor apenas para responder.
- Escopo de entidade/UG/centro aplicado **antes** de `findMany`, `count`, agregações, opções, exportação, arquivos e jobs. Consolidado exige autorização em cada entidade selecionada. O recorte de origem e o de destino são verificados nos comandos integrados.

### 5.2 Modelo de Custos proposto

| Entidade lógica | Dados/integridade necessários |
|---|---|
| Configuração por ente | Habilitação, gatilhos/competência, política de rateio e vigência; alteração auditada |
| Objeto de custo | Código/classificação hierárquica, descrição/detalhamento, pai, ente/ano/UG quando aplicável, ativo, referências de geração LOA; filhos sem ciclos e sem troca de ente |
| Classificação e item | Tipo de identificador telefone/placa/texto/customizado, regras, identificador, descrição/detalhamento, fixo/variável, ativo e catálogo padrão |
| Agregador/parcelas | Descrição, objetos e percentuais Decimal ≤100%; resíduo não alocado mostrado, sem normalizar 80% para 100% silenciosamente |
| Relações vigentes | Objeto↔item↔dotação; folha por contrato/pessoa/rubrica/local/centro; bem; produto/classe/subclasse/local/centro; critérios explícitos de precedência/ambiguidade |
| Origem apropriável | Referência canônica ao reconhecimento/consumo, tipo, ente/UG, competência/data despesa, valor original/estornado/apropriável, disponibilidade e hash/revisão quando exigidos |
| Apropriação/parcelas | Origem, objeto/item, data da apropriação, valor Decimal, autor, documento/nota, chave idempotente; total líquido ≤saldo reconhecido |
| Estorno e desfazimento | Movimento compensatório vinculado, motivo/autor/data, teto reversível e evidência; desfazer estorno restaura saldo sem apagar a trilha |
| Geração/cópia | Lote, peça/versão/ano/nível/entes, mapeamento origem/destino, resultado/fingerprint e replay; copiar relações não copia movimentos |

Não criar uma origem manual avulsa apenas com valor livre para substituir liquidação/VPD/folha/depreciação/consumo reais. Apropriação manual distribui saldo de uma origem reconhecida. Material destinado ao estoque é custo no consumo aplicável; consumo imediato em verificação não pode ser apropriado novamente na liquidação/saída. Diferenciar folha liquidada, líquido pago ao servidor, encargos e descontos para não duplicar custo.

### 5.3 Modelo de Controle Interno proposto

| Entidade lógica | Dados/integridade necessários |
|---|---|
| Documento/versão/observação | Categoria/tipo/número/data/situação, conteúdo, contratação e funcionário quando aplicável, GED/hash/ente, versões e destinatários |
| Checklist/versão/grupo/item/resposta | Categoria, numeração estável, texto, ativo, respostas possíveis, regra automática/evidência; modelos padrão municipais |
| Auditoria/itens selecionados | Datas inicial/final/resposta, descrição, centro/ente, auditor/responsável, situação, cópia da checklist/itens na emissão; encaminhamento e histórico |
| Resposta/achado/parecer/providência | Autor/data, irregularidade manual/automática, fonte/revisão/período, análise, ação corretiva, responsável/prazo/evidência e conclusão |
| Execução de diagnóstico | Regra/versão/parâmetros, ente/período, fontes cobertas, resultados IRREGULAR/REGULAR/NÃO AVALIADO, deduplicação e trilha |
| Notificação/resposta/comunicação | Documento/auditoria, destinatário autenticado, envio/leitura/resposta, conteúdo imprimível, e-mail/provedor/tentativa/retorno |
| Obrigação/visibilidade/alerta | Criticidade, vencimento, antecedência/expiração, pessoas/centros com acesso e pessoas autorizadas à baixa, justificativa e eventos |
| Relatório/quadros/snapshot/publicação | Período/ente, quadros editáveis, evidências/anexos, assinatura quando aplicável, versão/hash/layout, estado e comprovante público |

Enviada a auditoria, alterações do catálogo não reescrevem seu questionário. Duplicar auditoria gera novo ciclo, datas/responsáveis conferidos e itens copiados, sem replicar respostas/pareceres/conclusão/publicação. Encerrar exige respostas/análises obrigatórias e tratamento dos achados conforme política explícita; auditor não deve validar a própria resposta como auditado. Cancelamento preserva motivo e histórico.

### 5.4 Banco e execução

- Migrations aditivas no diretório configurado `prisma/migrations-ibema`, com FKs, índices e constraints de ente/referência/valores; preservar migrations aplicadas e trabalho paralelo de RH.
- Apropriar/estornar/desfazer estorno com locks de origem e objetos em ordem estável; reenvio não duplica. Gatilhos de origem usam a **mesma transação** de liquidação/VPD/consumo: falha obrigatória de apropriação reverte a operação, conforme configuração vigente. Proteger também comandos de estorno da origem.
- Para notas/publicações/e-mails externos usar outbox/retry e estados reais. Job não anuncia publicação ou entrega apenas porque foi enfileirado. Um outbox não substitui a atomicidade dos valores de custo.
- Migrar planos/apontamentos antigos somente com mapeamento de entidade comprovado; registros sem ente ficam em reconciliação restrita, não são atribuídos a um ente pelo nome do usuário. Preservar evidência mesmo quando objeto/item for inativado.
- Exclusão de objeto remove descendentes em transação apenas se nenhum nó tiver item/custo/movimentação impeditivos; FKs e locks impedem inclusão concorrente durante exclusão. Não usar cascade que apague apropriações ou auditorias históricas.

## 6. F11 — implantação integral de Gestão e Controle de Custos

| Etapa | Entrega | Critério de saída |
|---|---|---|
| F11.0 | Inventário dos produtores, consumidores, origem contábil e contratos; escopo/policy/perfis, migrations e entrada em Financeiro | Entidade/UG/centro validados em consulta/comando/exportação; mudanças de assinaturas precedidas de busca de todos os consumidores |
| F11.1 | Árvore de objetos, filhos automáticos, exclusão íntegra, geração LOA por nível/entes | Gerar/repetir não duplica; descendentes corretos, sem ciclos; referência orçamentária canônica |
| F11.2 | Itens/classificações/padrões, fixo/variável, ativação e agregadores | Novas classificações operacionais; inativo indisponível; 101% recusado, centavos conservados |
| F11.3 | Relações múltiplas, critérios de folha/bens/estoque e cópia anual | Critérios vigentes/precedência verificáveis, seleção múltipla real e cópia mapeada sem consumo |
| F11.4 | Origem apropriável, distribuição manual/na liquidação, estornos/desfazimento, notas | Duas sessões não ultrapassam teto; consulta manual só pendentes; estorno da origem protegido; documento reconciliável |
| F11.5 | Gatilhos reais liquidação/verificação/VPD/prestação de contas | Falha reverte transação; estoque versus consumo imediato distinguidos; nenhuma dupla apropriação |
| F11.6 | Folha inclusive lote, depreciação e almoxarifado automáticos | Eventos reais rastreáveis, todos os critérios do checklist, replay/estorno e reconciliação comprovados |
| F11.7 | Relatórios, notas e gráficos completos, PDF/CSV/filtros e vínculo ao BI de Administração | Totais iguais ao ledger, período despesa distinto de apropriação, consolidação autorizada, fontes de Frotas/estoque/manutenção reconciliadas sem dupla contagem |
| F11.8 | Ensaio autenticado, regressão e 31 evidências individuais | **31/31** subcritérios demonstrados; build/testes não substituem homologação |

### 6.1 Matriz operacional e aceites — 31 itens

Descrições abaixo preservam os subcritérios operacionais para implementação. A redação oficial integral do PDF prevalece, inclusive quando atravessa páginas. A coluna de aceite inicia **pendente** para todas as linhas.

| ID | Requisito e subcritérios a entregar | Etapa | Prova necessária | Aceite |
|---|---|---|---|---|
| EXE-04.01 | Objeto com descrição, descrição detalhada e classificação hierárquica | F11.1 | Cadastrar raiz/filhos e consultar hierarquia | [ ] |
| EXE-04.02 | Incluir objeto inferior mostrando superior e classificação correta automaticamente, sem digitação manual da classificação | F11.1 | Criar filho de objeto selecionado e conferir código/pai | [ ] |
| EXE-04.03 | Gerar objetos pela hierarquia da LOA até órgão, unidade, função, subfunção, programa ou ação, por entidade e consolidado | F11.1 | Executar todos os seis níveis e recortes; repetir lote sem duplicar | [ ] |
| EXE-04.04 | Incluir níveis inferiores em objetos gerados automaticamente pela LOA | F11.1 | Detalhar objeto gerado preservando origem | [ ] |
| EXE-04.05 | Excluir também todos os descendentes mantendo integridade | F11.1 | Excluir subárvore elegível sem órfãos | [ ] |
| EXE-04.06 | Permitir exclusão só sem item de custo em movimentos/custos alocados/itens vinculados; alertar usuário | F11.1/F11.4 | Recusar nó/subárvore usados, inclusive em concorrência | [ ] |
| EXE-04.07 | Itens com configuração de telefone, placa de veículo e texto; cadastrar novas classificações de identificação | F11.2 | Usar três padrões e classificação criada pelo usuário | [ ] |
| EXE-04.08 | Item com identificador, descrição, descrição detalhada e fixo ou variável | F11.2 | Cadastro/alteração com todos os campos | [ ] |
| EXE-04.09 | Agregador com descrição, um ou mais objetos e percentual; soma de múltiplos objetos ≤100% | F11.2 | Validar 100%, recusar 101% e explicitar resíduo | [ ] |
| EXE-04.10 | Disponibilizar itens padrão sem digitação manual | F11.2 | Selecionar catálogo inicial disponível | [ ] |
| EXE-04.11 | Alterar/ativar/desativar item; inativo indisponível para novo uso | F11.2 | Inativar e tentar usar por tela/action; histórico preservado | [ ] |
| EXE-04.12 | Relacionar objetos aos itens, com múltiplos itens por objeto | F11.3 | Relações e consultas múltiplas persistidas | [ ] |
| EXE-04.13 | Importar automaticamente relações objeto/item de LOA anterior | F11.3 | Copiar exercício anterior, conferir mapeamento e replay | [ ] |
| EXE-04.14 | Relacionar vários objetos e itens a várias dotações do orçamento | F11.3 | Seleção múltipla e recusa de dotação de outro escopo | [ ] |
| EXE-04.15 | Configurar quais entidades usam apropriação | F11.0/F11.5 | Habilitar uma entidade e recusar operação na desabilitada | [ ] |
| EXE-04.16 | Configurar apropriação na liquidação, folha, almoxarifado e patrimônio | F11.3/F11.5/F11.6 | Conferir gatilhos por entidade, vigência e origem | [ ] |
| EXE-04.17 | Apropriar na liquidação conforme item/dotação; distribuir entre vários itens até o valor liquidado e impedir excesso | F11.4/F11.5 | Liquidação real com distribuição, excesso/concorrência/rollback | [ ] |
| EXE-04.18 | Impedir estorno de liquidação com custo apropriado; estornar apropriação dentro da mesma tela de liquidação | F11.4/F11.5 | Fluxo integrado na tela financeira sem sair dela e rollback | [ ] |
| EXE-04.19 | Apropriação manual dos não apropriados; listar só valores pendentes; estornar e excluir/desfazer estorno na mesma rotina | F11.4 | Pendentes corretos; apropriar/estornar/desfazer com conservação e trilha | [ ] |
| EXE-04.20 | Emitir nota de apropriação e de estorno | F11.4/F11.7 | PDFs reais dos dois movimentos com origem e valores | [ ] |
| EXE-04.21 | Apropriar em verificação de materiais/em liquidação quando material não vai ao estoque | F11.5 | Comparar material estocável e consumo imediato; não duplicar na liquidação | [ ] |
| EXE-04.22 | Apropriar prestação de contas de suprimento de fundos/transferências voluntárias no reconhecimento como despesa em VPD | F11.5 | Evento contábil VPD real, distinto do adiantamento/pagamento | [ ] |
| EXE-04.23 | Apropriar lançamentos contábeis manuais envolvendo VPD | F11.5 | Escrituração real vinculada e estorno consistente | [ ] |
| EXE-04.24 | Configurar folha por funcionário, funcionário+verba, verba, localização/centro, e contrato quando multivínculo | F11.3/F11.6 | Exercitar cada critério e dois contratos da mesma pessoa | [ ] |
| EXE-04.25 | Apropriar automaticamente folha na liquidação, inclusive múltiplos empenhos simultâneos, sem abrir rotina manual | F11.6 | Lote real, seleção automática, replay e rollback | [ ] |
| EXE-04.26 | Apropriar automaticamente depreciação conforme relação objeto/bem patrimonial | F11.6 | Movimento patrimonial real, competência/mapeamento e reversão | [ ] |
| EXE-04.27 | Apropriar automaticamente almoxarifado por objetos, itens, produto, classe, subclasse, centros e localização | F11.6 | Todos os critérios, consumo valorizado real e estorno | [ ] |
| EXE-04.28 | Relatório por entidade/consolidado, período despesa, período apropriação e tipo, com apropriados e pendentes | F11.7 | Filtros independentes, acesso e valores reconciliados | [ ] |
| EXE-04.29 | Relatório das despesas apropriadas e saldo a apropriar, totalizador por tipo de despesa ao final | F11.7 | Conferir detalhes/saldos e totalizador no PDF | [ ] |
| EXE-04.30 | Gráfico por objeto do valor apropriado no período informado | F11.7 | Gráfico e detalhamento com mesmos filtros/valores | [ ] |
| EXE-04.31 | Gráfico das apropriações por item com filtros entidade/item | F11.7 | Filtrar item/ente e reconciliar ao ledger | [ ] |

## 7. F12 — implantação integral de Gestão de Controle Interno

| Etapa | Entrega | Critério de saída |
|---|---|---|
| F12.0 | Escopo, perfis individuais, migração/adopção dos planos/achados e shell Auditoria | Dados preservados; acesso de auditor/notificado distinto; compatibilidade da rota antiga validada |
| F12.1 | Documentos/categorias/versões/observações/GED/notificar/responder | Consulta integrada e respostas imprimíveis; campos de contratação/funcionário quando aplicáveis |
| F12.2 | Checklists padrão, grupos, itens numerados, categorias/respostas/regras, cópia/inativação/versões | Itens usados podem evoluir no catálogo sem mudar auditoria emitida |
| F12.3 | Agendar/duplicar/enviar/responder/analisar/encerrar/cancelar auditoria; achados e providências | Ciclo completo, itens escolhidos, datas/responsáveis/centros, segregação e trilha |
| F12.4 | Diagnóstico automático mínimo e configuração de respostas | Quatro famílias reais: débitos, limite contratual, fonte negativa, índices saúde/educação; dados ausentes geram NÃO AVALIADO |
| F12.5 | Caixa pessoal, agenda, visibilidade/baixa, criticidade, alertas, justificativas, calendário | Alertas a vencer/vencidos reais, deduplicados, filtros diário/semanal/mensal/anual |
| F12.6 | Comunicações/retornos, Ouvidoria, processos contra Município e estatísticas RH | Dados canônicos autorizados, histórico temporal e retorno real do provedor |
| F12.7 | Relatório circunstanciado/quadros/anexos, LRF/anuais e publicação automática | Layout/dados conferidos, documento final e anexos disponíveis publicamente quando publicáveis |
| F12.8 | Ensaio autenticado, regressão e 36 evidências individuais | **36/36** subcritérios demonstrados; nenhuma crítica não avaliada confundida com regularidade |

### 7.1 Matriz operacional e aceites — 36 itens

| ID | Requisito e subcritérios a entregar | Etapa | Prova necessária | Aceite |
|---|---|---|---|---|
| EXE-03.01 | Integração total aos demais módulos por entidade sem importação/exportação de dados operacionais | F12.0/F12.4/F12.6 | Consultas/diagnósticos com os mesmos registros canônicos | [ ] |
| EXE-03.02 | Acesso por privilégios de perfil e usuário específico, caracterizando quem acessa | F12.0 | Perfil/override individuais, operações e entidade por servidor | [ ] |
| EXE-03.03 | Documentos IN/pareceres/notificações/diversos; notificar determinados usuários pela consulta, receber respostas e imprimir | F12.1/F12.5 | Emitir/notificar/responder/imprimir no ciclo real | [ ] |
| EXE-03.04 | Consulta integrada de todos os documentos com categoria, tipo, data, situação e filtro publicado no portal | F12.1/F12.7 | Filtrar publicação confirmada e demais campos | [ ] |
| EXE-03.05 | Visualizar/alterar, observar, enviar a notificados, consultar respostas e incluir anexos em cada documento | F12.1 | Executar todas as ações, com histórico e GED | [ ] |
| EXE-03.06 | Publicação automática dos documentos e auditorias no Portal da Transparência | F12.7 | Link público confirmado do mesmo documento/versão | [ ] |
| EXE-03.07 | Cadastrar checklist baseada em grupos/itens numerados | F12.2 | Catálogo com numeração estável e editor operacional | [ ] |
| EXE-03.08 | Configurar resposta relacionada a irregularidade diagnosticada automaticamente | F12.2/F12.4 | Regra → evidência → resposta configurada | [ ] |
| EXE-03.09 | Registrar irregularidades manuais não detectáveis pelo sistema | F12.3 | Achado manual com evidência/origem e responsável | [ ] |
| EXE-03.10 | Parecer por irregularidade e providência para saná-la | F12.3 | Parecer, ação corretiva e acompanhamento verificáveis | [ ] |
| EXE-03.11 | Identificar parecer relativo a contratação e funcionário quando aplicável | F12.1/F12.3 | Vínculo canônico do funcionário/contratação correto | [ ] |
| EXE-03.12 | Cadastrar respostas possíveis por grupo para respostas automáticas | F12.2/F12.4 | Configuração de grupo usada em diagnóstico real | [ ] |
| EXE-03.13 | Enquadrar checklist em categorias para localização | F12.2 | Cadastro e pesquisa por categoria | [ ] |
| EXE-03.14 | Checklists padrão previamente cadastradas para diversas áreas municipais | F12.2 | Catálogo inicial das áreas e uso sem redigitação | [ ] |
| EXE-03.15 | Escolher só os itens desejados para nova auditoria | F12.2/F12.3 | Seleção parcial preservada no questionário emitido | [ ] |
| EXE-03.16 | Incluir/inativar itens de checklist já usada | F12.2 | Evoluir catálogo sem reescrever auditoria anterior | [ ] |
| EXE-03.17 | Duplicar checklist preservando original, copiando itens editáveis | F12.2 | Copiar/editar com origem intacta | [ ] |
| EXE-03.18 | Vincular órgão/unidade por centro de custo à auditoria | F12.0/F12.3 | Centro canônico e escopo da auditoria coerentes | [ ] |
| EXE-03.19 | Agendamento de auditoria para programação da equipe | F12.3 | Auditoria aparece na programação nas datas informadas | [ ] |
| EXE-03.20 | Encaminhar auditoria ao responsável para respostas da checklist | F12.3/F12.5 | Destinatário correto responde com acesso restrito | [ ] |
| EXE-03.21 | Auditoria com data inicial/final, descrição, centro/responsável e checklist carregando itens automaticamente | F12.3 | Cadastro completo e cópia dos itens no ciclo | [ ] |
| EXE-03.22 | Consulta de auditorias: duplicar, enviar questionário, analisar, visualizar análise, encerrar/cancelar; descrição, inclusão, prazo, auditor e situação | F12.3 | Todas as ações/colunas com transições válidas e histórico | [ ] |
| EXE-03.23 | Auditoria automática de empenho com fornecedor devedor, empenhado maior que contrato, fonte negativa e índices constitucionais não atingidos em saúde/educação | F12.4 | Casos positivos/negativos nas quatro famílias, fontes reais e período correto | [ ] |
| EXE-03.24 | Caixa por usuário com pendentes, visualizar/responder notificações dirigidas a ele | F12.5 | Dois destinatários isolados; resposta auditada | [ ] |
| EXE-03.25 | Agenda de obrigações com criticidade, pessoas/centros que podem visualizar e pessoas autorizadas a baixar | F12.5 | Visualização e baixa verificadas separadamente | [ ] |
| EXE-03.26 | Alertas a vencer/vencidos e justificativa obrigatória conforme criticidade | F12.5 | Job real, alertas e tentativa de baixa sem justificativa | [ ] |
| EXE-03.27 | Configurar antecedência dos alertas e prazo de expiração do evento | F12.5 | Parâmetros aplicados nas datas/alertas efetivos | [ ] |
| EXE-03.28 | Agenda só pendentes ou por dia/semana/mês/ano | F12.5 | Todos os recortes, incluindo limites de período | [ ] |
| EXE-03.29 | Consulta central de e-mails com título, controlador, destinatário, envio e situação/retorno | F12.6 | Envio/tentativas/retorno reais; resposta não inferida de envio | [ ] |
| EXE-03.30 | Consultar processos de Ouvidoria e reclamações/sugestões da sociedade | F12.6 | Consulta canônica autorizada, preservando restrições de identificação | [ ] |
| EXE-03.31 | Consultar processos abertos contra o Município | F12.6 | Registros jurídicos reais, situação e origem identificados | [ ] |
| EXE-03.32 | Relatório circunstanciado com publicação automática | F12.7 | Emitir documento completo e confirmar publicação | [ ] |
| EXE-03.33 | Gerenciar quadros do relatório, incluir anexos e publicá-los automaticamente | F12.7 | Quadros editáveis e anexos corretos com acesso público confirmado | [ ] |
| EXE-03.34 | Emitir relatórios legais LRF e anuais obrigatórios para acompanhar índices constitucionais | F12.7 | Leiautes aplicáveis e cálculo executado conferidos | [ ] |
| EXE-03.35 | Estatísticas de cargos por data, cargo, servidor, enquadramento, todos os cargos e extintos | F12.6/F12.7 | Histórico RH real e todos os filtros, inclusive extintos | [ ] |
| EXE-03.36 | Calendário de obrigações por todos os meses ou meses selecionados | F12.5/F12.7 | Seleção múltipla de meses e emissão reconciliada à agenda | [ ] |

## 8. Contratos e conexões obrigatórias

| Produtor/serviço | Uso em Custos/Controle Interno | Evidência da conexão |
|---|---|---|
| Planejamento | LOA/classificações/objetos, dotações/cópia, metas/versões/movimentos | Mesmos IDs e versão; gerar objetos não muda dotação; críticas de elaboração distinguidas dos índices executados |
| Financeiro/Contabilidade | Liquidação, em liquidação/VPD, suprimentos/transferências, empenhos, fontes e demonstrativos | Apropriação atômica; estornos protegidos; ledger financeiro não é duplicado |
| Compras/Contratos | Limite contratual e vínculos de empenhos/fornecedor | Comparar total líquido dos empenhos vinculados ao contrato/aditivos vigentes e período aplicável |
| Tributação | Débitos do fornecedor por identidade canônica | Valor/situação na data fiscalizada; dívida suspensa/cancelada/paga tratada conforme regra aprovada |
| RH/Folha | Pessoa/contratos/rubricas, folha e cargos/enquadramento histórico | Multivínculo sem duplicar pessoa, lote de folha apropriado automaticamente, histórico temporal nas estatísticas |
| Patrimônio | Bens e depreciação/reversões | Mapeamento temporal bem/objeto, movimento único e valor reconciliado |
| Almoxarifado | Produto/classe/subclasse/local/centro e consumo/reversões | Consumo valorizado canônico; entrada em estoque não apropriada duas vezes |
| GED/assinaturas/relatórios | Documentos/anexos/notas/respostas/relatório final | Upload/download autorizado, hash final, versão, documento e anexos reemitíveis |
| Agenda/notificações/e-mail | Encaminhamento, alertas, respostas e consulta de retornos | Jobs com autorização técnica/ente, retry/deduplicação e estados reais |
| Ouvidoria/processos jurídicos | Reclamações/sugestões e processos contra Município | Reusar consulta/ACL de origem; não confundir execução fiscal contra contribuinte com processo contra Município |
| Transparência | Documentos/auditorias/relatório circunstanciado/anexos | Publicação automática configurada e disponibilidade pública do mesmo conteúdo, respeitando classificação publicável |

**Motor automático EXE-03.23:** versionar regra, período, competência, parâmetros e bases. Fornecedor devedor é avaliado na emissão fiscalizada; saldo por fonte usa disponibilidade financeira/contábil aplicável, não apenas dotação orçamentária; saúde/educação usam execução e composição normativa, sem aplicar percentuais projetados como prova de cumprimento constitucional. Origem ausente/incompleta deve produzir **NÃO AVALIADO** com motivo, nunca REGULAR por retornar zero registros. Deduplicar achado por regra/ente/origem/período e preservar sua evolução.

## 9. Dependências e ordem de execução

### Vínculo obrigatório de F11.7 com Administração/indicadores

Usar uma consulta autorizada de Custos para apropriado/pendente por tipo, valor por objeto e apropriações por item, com o mesmo recorte dos relatórios EXE-04.28–31. Expor competência/data despesa e data da apropriação distintamente, filtros de entidade/UG/centro/período e cobertura de valoração/integração. Gráficos permitem abrir detalhamento autorizado no Financeiro mantendo os filtros.

Reconciliar BI legado: `FleetOperation` não é a fonte completa atual de Frotas. `FleetConsumption`/`FleetExpense`/`MaterialMovement` podem referenciar o mesmo consumo e `FleetExpense`/`AssetMaintenance` a mesma manutenção. Não somar essas representações; mapear origem/chave e preservar valores não apurados como pendência, não zero. Pagamentos e estimativas setoriais continuam métricas próprias. Custo por unidade de produto/serviço exige produção física real, compatível no mesmo período/objeto. Detalhamento: [CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md](CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md).

### Sequência

1. Executar F11.0 e F12.0 de análise técnica/escopo antes de abrir os demais comandos. Documentar consumidores e compatibilidade de permissões.
2. Implementar F11.1–F11.4 e preparar contratos/criterios dos produtores reais; continuar F11.5–F11.7 e ensaiar F11.8.
3. Implementar F12.1–F12.3 e F12.5; conectar F12.4/F12.6/F12.7 e ensaiar F12.8. Infraestruturas/documentos compartilhados podem ser preparados durante F11, sem renumerar as fases.
4. **Só declarar F11/F12 concluídas após 31/31 e 36/36 integrais.** Registrar bloqueadores de produtores incompletos na própria fase, não diluir em F9 para anunciar implementação final.
5. Retomar F9 de Planejamento para conexões do orçamento/contabilidade/Compras/Tributação/GED/publicação, incluindo os consumidores de Custos/Controle Interno que dependem desses contratos.
6. Retomar F10 de Planejamento: homologação independente de 99 requisitos por ente e regressão com estas novas áreas.

Dependências a resolver na etapa afetada: política de reconhecimento/competência dos custos e critérios de rateio; configurações aprovadas para índices/PCASP/STN/TCE; contratos completos e histórico de débitos; acesso temporal de RH; fonte canônica de processos jurídicos contra o Município; serviço de e-mail/retornos e agendador; storage/GED/assinatura/publicação. Aproveitar infraestrutura real disponível antes de solicitar credenciais/documentos externos. Não inventar API oficial, percentual legal ou dados de execução.

## 10. Verificação e registro de evidências

- Testes PostgreSQL transacionais: limite apropriável concorrente, exclusão de árvore concorrente, replay/conflito, conservação de centavos, estornos/desfazimento, rollback conjunto com origem e geração/cópia anual.
- Testes de domínio de controle: snapshot do questionário, inativação após uso, duplicação sem respostas antigas, auditor/auditado, transições e fechamento, cálculo dos prazos/alertas e deduplicação de achados.
- Testes de acesso: entidade/UG/centro, perfil e usuário específicos, notificado isolado, exportações/anexos/URLs diretas, consolidação e jobs. Permissão de logs não libera alterações de controle e permissão de Administração não concede escrituração.
- Ensaios autenticados: todos os editores, filtros/paginação, seis níveis de geração LOA, cinco critérios de folha incluindo contrato, todas as automações, quatro famílias de diagnóstico e documentos/publicações/retornos reais.
- Rodar Prisma validate/generate, lint direcionado, TypeScript e build seguro após alterações de código. `npm run build` com `VERCEL_ENV=development` para verificação sem deploy automático; não aplicar migrations implicitamente.
- Base de ensaio isolada com **Vila das Araucárias/PR** e nomes/descrições plausíveis; não inserir dados fictícios em banco operacional nem usar rótulos “demo”, “POC” ou “teste” na interface/documentos apresentados ao cliente.
- Criar `docs/EVIDENCIAS_CUSTOS_CONTROLE_INTERNO.md` durante implementação: ID, texto/subcritérios oficiais, pré-condições, roteiro, resultado, artefatos/hash/link, data, executor, commit e ente. Inicialmente 31 + 36 pendentes; percentual só de linhas integralmente comprovadas.

**Encerramento:** Custos 31/31 e Controle Interno 36/36, com regras, persistência, interfaces, escopo/perfis, relatórios e integrações demonstrados de ponta a ponta. A publicação deste plano não marca nenhuma caixa como concluída.
