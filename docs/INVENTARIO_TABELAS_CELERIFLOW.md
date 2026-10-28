# CeleriFlow — índice das estruturas tabulares

**Snapshot:** `0831a93`, auditado em 28/10/2026.  
**Quantidade:** 343 estruturas lógicas em 298 arquivos: 330 operacionais com rota, seis legadas sem rota consumidora identificada e sete formatos especiais.  
**Diagnóstico e plano:** [PLANO_ADEQUACAO_PADRAO_TABELAS.md](PLANO_ADEQUACAO_PADRAO_TABELAS.md).

## Como ler

- Cada seção de módulo usa a pasta-base indicada; os caminhos das linhas são relativos a ela.
- `L95:C7` identifica linha 95, coluna 7 do snapshot. Um arquivo pode ter vários pontos.
- Famílias: **H** HTML; **E** `ErpTableContainer`; **U** `Table` da UI; **S** `SanitationTable`; **R** `ResizableTable`; **G** grade CSS de dados.
- **LEGADO**: sem rota consumidora identificada; não excluir automaticamente.
- **ESPECIAL**: documento/relatório/formato informativo com requisitos próprios.
- Situação de todos os pontos operacionais: **pendente de adequação e validação pelo novo padrão**. Este índice não declara migração realizada.
- Campos reconhecidos, sinais de código e rotas candidatas de cada ponto estão na saída `node scripts/audit-table-pattern.mjs --inventory` ou `--csv`.
- Reutilização por várias páginas e variações de abas/parâmetros não multiplica a definição de código neste índice.

## Administração — 8 pontos

Base: `src/app/app-domain/administracao/`.

- `calendario/CalendarioClient.tsx` — L95:C7 H.
- `cargos/CargosClient.tsx` — L104:C7 H.
- `demandas/DemandasClient.tsx` — L143:C7 H **LEGADO**.
- `departamentos/DepartamentosClient.tsx` — L93:C7 H.
- `indicadores/AdministrationDashboard.tsx` — L104:C57 H.
- `secretarias/SecretariasClient.tsx` — L102:C7 H.
- `servidores/ServidoresClient.tsx` — L132:C7 H.
- `unidades/UnidadesClient.tsx` — L92:C7 H.

## Atendimento — 3 pontos

Base: `src/app/app-domain/atendimento/`.

- `AtendimentoClient.tsx` — L72:C9 H **LEGADO**.
- `central/page.tsx` — L58:C7 E.
- `ouvidoria/OuvidoriaClient.tsx` — L35:C5 E.

## Auditoria — 1 ponto

Base: `src/app/app-domain/auditoria/`.

- `page.tsx` — L223:C9 E.

## Cadastros — 8 pontos

Base: `src/app/app-domain/cadastros/`.

- `documentos/DocumentosClient.tsx` — L75:C7 H.
- `fornecedores/FornecedoresClient.tsx` — L143:C7 H.
- `imoveis/ImoveisClient.tsx` — L84:C7 H.
- `MasterDataCatalogClient.tsx` — L81:C9 H; usado pelo helper de páginas de catálogo.
- `organograma/page.tsx` — L16:C676 H.
- `pessoas-fisicas/PessoasFisicasClient.tsx` — L94:C7 H.
- `pessoas-juridicas/PessoasJuridicasClient.tsx` — L93:C7 H.
- `qualidade/page.tsx` — L65:C9 H.

## Câmara — 8 pontos

Base: `src/app/app-domain/camara/`.

- `legislaturas/LegislaturasClient.tsx` — L65:C13 H.
- `leis/LeisClient.tsx` — L28:C7 H.
- `proposicoes/ProposicoesClient.tsx` — L28:C7 H.
- `sessoes/SessoesClient.tsx` — L116:C15 H; L183:C58 H.
- `vereadores/VereadoresClient.tsx` — L110:C15 H; L162:C15 H; L200:C13 H.

## Cemitérios — 7 pontos

Base: `src/app/app-domain/cemiterios/`.

- `CemiteriosClient.tsx` — L110:C1914 H **LEGADO**.
- `consulta/page.tsx` — L16:C53 H.
- `processos/page.tsx` — L33:C53 H.
- `relatorio/page.tsx` — L22:C5 H **ESPECIAL**.
- `taxas/guias/[id]/page.tsx` — L18:C8 H **ESPECIAL**.
- `taxas/page.tsx` — L36:C138 H; L38:C257 H.

## Componentes compartilhados — 20 pontos

Base: `src/components/`.

- `app-ui/planejamento/PlanningCatalogPage.tsx` — L38:C41 U.
- `app-ui/planejamento/PlanningHearingsPage.tsx` — L34:C41 U.
- `app-ui/planejamento/PlanningImportsPage.tsx` — L24:C103 U.
- `app-ui/planejamento/PlanningManagementPage.tsx` — L60:C69 U; L70:C68 U; L74:C184 U; L82:C73 U; L95:C70 U; L110:C115 U; L122:C67 U; L159:C831 U.
- `app-ui/planejamento/PlanningMovementHistory.tsx` — L14:C5 U.
- `app-ui/planejamento/PlanningPages.tsx` — L70:C41 U; L100:C103 U.
- `app-ui/planejamento/PlanningReferencePage.tsx` — L27:C41 U; L28:C111 U; L34:C126 U.
- `app-ui/planejamento/PlanningVersionPage.tsx` — L21:C634 U.
- `cemeteries/StructurePages.tsx` — L34:C7 H; L66:C148 H.

Os 18 pontos de Planejamento também têm consumidores da Câmara; não contá-los novamente por módulo. Os dois pontos de estrutura de Cemitérios também possuem mais de uma rota consumidora.

## Compras e Contratos — 18 pontos

Base: `src/app/app-domain/compras/`.

- `catalogo/CatalogoClient.tsx` — L149:C13 E.
- `contratos/[id]/page.tsx` — L280:C20 G.
- `contratos/ContratosListClient.tsx` — L73:C528 H.
- `contratos/InstrumentLifecycleReport.tsx` — L54:C751 H **ESPECIAL**; L58:C317 H **ESPECIAL**; L60:C553 H **ESPECIAL**.
- `convenios/ConveniosListClient.tsx` — L63:C528 H.
- `exportacoes/ProcurementExportsClient.tsx` — L187:C11 H.
- `licitacoes/page.tsx` — L109:C47 H.
- `licitacoes/portal/page.tsx` — L107:C47 H.
- `pesquisas-precos/[id]/PriceResearchDetailClient.tsx` — L198:C1724 H.
- `pesquisas-precos/CompactItemsTable.tsx` — L76:C13 H.
- `pesquisas-precos/PriceResearchListClient.tsx` — L95:C15 H.
- `planejamento/PlanningListClient.tsx` — L87:C11 H.
- `processos/[id]/page.tsx` — L118:C13 H.
- `processos/ProcessosListClient.tsx` — L104:C15 H.
- `solicitacoes/[id]/page.tsx` — L111:C13 H.
- `solicitacoes/SolicitacoesListClient.tsx` — L110:C15 H.

## Configurações — 4 pontos

Base: `src/app/app-domain/configuracoes/`.

- `auditoria/page.tsx` — L61:C7 E.
- `perfis/PerfisClient.tsx` — L312:C11 H.
- `processos/page.tsx` — L66:C2147 H.
- `usuarios/components/UsuariosClient.tsx` — L146:C11 H.

## Controle Interno — 5 pontos

Base: `src/app/app-domain/controle-interno/`.

- `consultas/judicial/page.tsx` — L29:C1542 H.
- `consultas/ouvidoria/page.tsx` — L38:C1620 H.
- `consultas/rh/page.tsx` — L37:C36 H; L38:C106 H.
- `ControlDiagnosticsClient.tsx` — L11:C2350 H.

## Esportes e Cultura — 3 pontos

Base: `src/app/app-domain/cultura/`.

- `components/AtividadesEsporteLazerClient.tsx` — L29:C7 H.
- `components/CulturaProjetosClient.tsx` — L37:C7 H.
- `components/GestaoCulturalClient.tsx` — L35:C7 H.

## Documentos/GED — 3 pontos

Base: `src/app/app-domain/documentos/`.

- `assinaturas/AssinaturasClient.tsx` — L65:C7 H.
- `ged/GEDClient.tsx` — L230:C13 H.
- `modelos/ModelosClient.tsx` — L110:C13 H.

## Educação — 3 pontos

Base: `src/app/app-domain/educacao/`.

- `EducationListClient.tsx` — L47:C7 H; componente usado por várias listagens.
- `professor/ProfessorEntryGrids.tsx` — L20:C1431 H; L21:C1218 H. Grades de chamada e notas, com edição e conflito estrutural a tratar.

## Financeiro e Contábil — 28 pontos

Base: `src/app/app-domain/financeiro/`.

- `automacoes/page.tsx` — L71:C57 H.
- `conciliacao-bancaria/ConciliacaoBancariaClient.tsx` — L351:C13 H.
- `contabilidade/ContabilidadeClient.tsx` — L82:C197 H.
- `contabilidade/disponibilidade/page.tsx` — L27:C446 H.
- `contabilidade/etapas-anuais/AnnualStagesClient.tsx` — L30:C519 H; L84:C815 H.
- `contabilidade/etapas-anuais/ExtraNoteTransportClient.tsx` — L27:C253 H.
- `contabilidade/saldos-fontes/page.tsx` — L50:C38 H.
- `contas-bancarias/BankResourceSourcesClient.tsx` — L28:C32 H.
- `contas-bancarias/ContasBancariasClient.tsx` — L181:C11 U.
- `contas-bancarias/TreasuryTransferSection.tsx` — L114:C11 U.
- `custos/CostsClient.tsx` — L60:C960 H.
- `download-extratos/DownloadExtratosClient.tsx` — L293:C13 H.
- `empenhos/EmpenhosClient.tsx` — L222:C11 U.
- `liquidacoes/LiquidacoesClient.tsx` — L231:C11 U.
- `orcamento/cadastros/CadastrosClient.tsx` — L46:C490 U **LEGADO**.
- `orcamento/OrcamentoClient.tsx` — L187:C98 U; L194:C11 U; L251:C11 U; L326:C92 U.
- `orcamento/planejamento/PlanejamentoClient.tsx` — L330:C157 U **LEGADO**; L339:C158 U **LEGADO**.
- `pagamentos/PagamentosClient.tsx` — L299:C11 U; L501:C13 U.
- `receitas-constitucionais/ReceitasConstitucionaisClient.tsx` — L199:C13 H.
- `receitas/ReceitasClient.tsx` — L95:C522 H.
- `relatorios/indices-constitucionais/FiscalIndicesClient.tsx` — L19:C1196 H.
- `rendimentos/RendimentosClient.tsx` — L430:C13 H.

## Frotas — 1 ponto

Base: `src/app/app-domain/frotas/`.

- `FrotasClient.tsx` — L168:C11 H.

`gestao/page.tsx` tem uma listagem em cartões expansíveis com múltiplas áreas, não uma definição de tabela. Está na frente de análise de visualizações alternativas, sem multiplicar artificialmente a quantidade de tabelas HTML.

## Indicadores — 1 ponto

Base: `src/app/app-domain/indicadores/`.

- `MunicipalCostIndicators.tsx` — L19:C1040 H.

## Meio Ambiente — 9 pontos

Base: `src/app/app-domain/meio-ambiente/`.

- `areas-verdes/page.tsx` — L45:C13 H.
- `denuncias/page.tsx` — L46:C13 H.
- `documentos/page.tsx` — L46:C13 H.
- `educacao/page.tsx` — L45:C13 H.
- `empreendimentos/page.tsx` — L48:C13 H.
- `fiscalizacao/page.tsx` — L46:C13 H.
- `licenciamento/page.tsx` — L53:C13 H.
- `residuos/page.tsx` — L46:C13 H.
- `solicitacoes/page.tsx` — L54:C13 H.

## Obras e Construção Civil — 14 pontos

Base: `src/app/app-domain/obras/`.

- `components/MedicoesClient.tsx` — L241:C11 H.
- `components/ObrasProjetosClient.tsx` — L148:C9 H.
- `components/ServicosUrbanosClient.tsx` — L172:C11 H.
- `construcao-civil/[id]/page.tsx` — L55:C745 H.
- `construcao-civil/configuracoes/ConstructionSettingsClient.tsx` — L50:C7 H.
- `construcao-civil/construtoras/page.tsx` — L18:C1089 H.
- `construcao-civil/equipe/ConstructionStaffClient.tsx` — L39:C7 H.
- `construcao-civil/fiscalizacao/page.tsx` — L44:C7 H.
- `construcao-civil/page.tsx` — L24:C7 H.
- `construcao-civil/participacao/page.tsx` — L25:C870 H.
- `construcao-civil/profissionais/ConstructionProfessionalsClient.tsx` — L41:C7 H.
- `construcao-civil/regras/ConstructionRulesClient.tsx` — L50:C119 H.
- `relatorios/page.tsx` — L130:C13 H; L187:C11 H.

## Almoxarifado e Patrimônio — 14 pontos

Base: `src/app/app-domain/patrimonio/`.

- `almoxarifados/WarehouseTable.tsx` — L31:C7 H.
- `bens/[id]/page.tsx` — L30:C189 H.
- `bens/page.tsx` — L63:C6 R.
- `centros-custo/CostCenterTable.tsx` — L11:C10 H.
- `ciclo-vida/page.tsx` — L227:C11 H; L276:C11 H; L321:C11 H.
- `inventarios/InventoryCountClient.tsx` — L57:C9 H.
- `inventarios/page.tsx` — L80:C9 H.
- `materiais/MaterialCatalogTable.tsx` — L110:C7 H.
- `requisicoes/[id]/MaterialRequestWorkflowClient.tsx` — L48:C7 H.
- `requisicoes/[id]/page.tsx` — L76:C230 H.
- `requisicoes/page.tsx` — L104:C9 H.
- `valorizacao/page.tsx` — L34:C9 H.

## Portal do Servidor — 15 pontos

Base: `src/app/app-domain/portal-servidor/`.

- `aniversariantes/page.tsx` — L21:C9 H.
- `banco-horas/page.tsx` — L26:C5 H.
- `beneficios/page.tsx` — L165:C15 H.
- `capacitacao/page.tsx` — L24:C7 H.
- `consignacoes/page.tsx` — L24:C301 H.
- `demonstrativos/page.tsx` — L29:C7 H.
- `documentos/page.tsx` — L142:C15 H.
- `emissoes/page.tsx` — L16:C766 H.
- `ferias/page.tsx` — L149:C9 H; L171:C9 H.
- `ficha-funcional/page.tsx` — L147:C15 H.
- `folha/page.tsx` — L203:C15 H.
- `licenca-premio/page.tsx` — L19:C5 H.
- `ponto/page.tsx` — L135:C15 H.
- `protocolos/page.tsx` — L23:C7 H.

## Processos/Protocolo — 8 pontos

Base: `src/app/app-domain/protocolos/`.

- `acompanhamento/page.tsx` — L206:C15 H.
- `arquivados/ArquivadosClient.tsx` — L107:C15 E.
- `assinaturas/AssinaturasClient.tsx` — L112:C15 H.
- `busca/BuscaClient.tsx` — L116:C15 E.
- `ouvidoria/page.tsx` — L153:C15 H.
- `processos/ProcessosClient.tsx` — L218:C15 E.
- `servicos/ServiceCatalogEditor.tsx` — L17:C62 H.
- `servicos/solicitacoes/page.tsx` — L15:C898 H.

## Portal público — 11 pontos

Base: `src/app/portal/`.

- `construcao-civil/page.tsx` — L18:C489 H.
- `convenentes/page.tsx` — L10:C1093 H.
- `licitacoes-e-contratos/page.tsx` — L40:C11 H; L62:C11 H.
- `minha-area/processos/page.tsx` — L23:C98 H.
- `planejamento/page.tsx` — L9:C769 H.
- `portaldatransparencia/estatisticas/page.tsx` — L9:C646 H.
- `portaldatransparencia/page.tsx` — L73:C13 H.
- `portaldatransparencia/painel/page.tsx` — L26:C977 H.
- `privacidade/page.tsx` — L57:C13 H **ESPECIAL**.
- `tributario/page.tsx` — L17:C1547 H.

## RH e Folha — 24 pontos

Base: `src/app/app-domain/rh/`.

- `atividades-funcionais/page.tsx` — L28:C409 H; L31:C7 H.
- `atos/page.tsx` — L102:C9 E.
- `beneficios/page.tsx` — L80:C9 E.
- `consignacoes/page.tsx` — L37:C354 H.
- `dependentes/page.tsx` — L75:C9 E.
- `esocial/page.tsx` — L39:C5 H.
- `ferias/page.tsx` — L99:C9 E.
- `folha/eventos/page.tsx` — L72:C9 E.
- `folha/page.tsx` — L72:C9 E.
- `licencas/page.tsx` — L99:C9 E.
- `operacoes/calculos/[id]/page.tsx` — L33:C5 H.
- `operacoes/demonstrativos/[id]/page.tsx` — L19:C5 H **ESPECIAL**.
- `operacoes/medias/page.tsx` — L20:C370 H.
- `operacoes/page.tsx` — L126:C7 H.
- `parametrizacoes/HrPayrollSettingsClient.tsx` — L2408:C5 H.
- `ponto/page.tsx` — L104:C9 E.
- `publicacao-funcional/page.tsx` — L28:C264 H.
- `quadro-cargos/page.tsx` — L27:C638 H.
- `recadastramento/page.tsx` — L20:C5 H.
- `servicos-funcionais/page.tsx` — L18:C537 H.
- `servidores/EmployeeBenefitsCard.tsx` — L84:C13 H.
- `servidores/page.tsx` — L135:C9 E.
- `servidores/ServidorForm.tsx` — L249:C19 H.

## Água e Saneamento — 7 pontos

Base: `src/app/app-domain/saneamento/`.

- `components/FaturasClient.tsx` — L43:C9 S.
- `components/LeiturasClient.tsx` — L51:C9 S.
- `components/PortalClient.tsx` — L135:C9 S.
- `components/QualityClient.tsx` — L149:C9 S.
- `components/ReportsClient.tsx` — L128:C9 S.
- `components/ServicosClient.tsx` — L55:C9 S.
- `components/UnidadesClient.tsx` — L59:C9 S.

## Saúde — 27 pontos

Base: `src/app/app-domain/saude/`.

- `acolhimento/AcolhimentoClient.tsx` — L44:C19 H.
- `administracao/AccessTab.tsx` — L69:C5 H.
- `administracao/CatalogTab.tsx` — L49:C5 H.
- `administracao/documentos/DocumentsClient.tsx` — L107:C7 E.
- `administracao/GroupsTab.tsx` — L43:C5 H.
- `administracao/HolidaysTab.tsx` — L21:C5 H.
- `administracao/importacoes/ImportHistory.tsx` — L44:C9 E; L69:C44 G.
- `administracao/laboratorio/LaboratoryClient.tsx` — L133:C9 E.
- `administracao/PeopleTab.tsx` — L17:C5 H.
- `administracao/procedimentos/ProcedureCatalog.tsx` — L40:C7 E; L66:C231 G.
- `administracao/ProfessionalsTab.tsx` — L82:C5 H.
- `administracao/SchedulingGroupsTab.tsx` — L29:C5 H.
- `administracao/unificacoes/UnificationsClient.tsx` — L47:C268 E.
- `administracao/UnitsTab.tsx` — L92:C7 H.
- `agenda/AgendaClient.tsx` — L175:C11 H.
- `atendimentos/AtendimentosClient.tsx` — L104:C9 H.
- `equipes/EquipesClient.tsx` — L131:C9 H.
- `HealthSimpleListClient.tsx` — L43:C7 H.
- `pacientes/PacientesClient.tsx` — L212:C9 H.
- `producao/laudos/page.tsx` — L25:C53 H.
- `producao/previas/page.tsx` — L28:C184 H.
- `profissionais/ProfissionaisClient.tsx` — L149:C9 H.
- `relatorios/HealthReportsClient.tsx` — L89:C123 E; contém a tabela HTML aninhada indevidamente, registrada separadamente como defeito, sem duplicar a listagem lógica.
- `tfd/laudos/page.tsx` — L26:C53 H.
- `unidades/UnidadesClient.tsx` — L136:C9 H.

## Segurança e Mobilidade — 1 ponto

Base: `src/app/app-domain/seguranca/`.

- `components/SegMobCrudClient.tsx` — L212:C11 U; usado por múltiplas rotas configuradas.

## Assistência Social — 12 pontos

Base: `src/app/app-domain/social/`.

- `atendimentos/AtendimentosClient.tsx` — L47:C7 H.
- `configuracoes/SocialCatalogsClient.tsx` — L77:C9 H; L100:C59 H.
- `encaminhamentos/ReferralClient.tsx` — L60:C7 H.
- `familias/FamiliasClient.tsx` — L127:C9 H.
- `pessoas/[id]/SocialPersonClient.tsx` — L72:C7 H.
- `pessoas/page.tsx` — L23:C7 H.
- `profissionais/SocialProfessionalsClient.tsx` — L41:C7 H.
- `prontuario/ProntuarioClient.tsx` — L265:C11 H.
- `requisicoes/BenefitWorkflowClient.tsx` — L84:C7 H.
- `unidades/UnidadesClient.tsx` — L136:C11 H.
- `visitas/VisitasClient.tsx` — L30:C7 H.

## SST — 23 pontos

Base: `src/app/app-domain/sst/`.

- `acidentes/page.tsx` — L18:C5 H.
- `agenda/agendamentos/page.tsx` — L15:C330 H.
- `aso/[id]/anamnese/page.tsx` — L29:C83 H.
- `aso/page.tsx` — L71:C5 H.
- `atestados/page.tsx` — L16:C67 H.
- `consolidado/ReportView.tsx` — L14:C64 H.
- `equipamentos/entregas/page.tsx` — L26:C5 H.
- `equipamentos/necessidades/page.tsx` — L24:C5 H.
- `equipamentos/page.tsx` — L22:C91 H.
- `equipamentos/relatorios/page.tsx` — L15:C14 H; L15:C714 H.
- `ghe/page.tsx` — L29:C2607 H.
- `integracoes/page.tsx` — L23:C51 H.
- `ordens-servico/page.tsx` — L31:C5 H.
- `prevencao/page.tsx` — L16:C5 H.
- `profissionais/page.tsx` — L25:C5 H.
- `programas/page.tsx` — L22:C791 H.
- `prontuarios/page.tsx` — L28:C5 H.
- `questionarios/page.tsx` — L23:C5 H.
- `relatorios/page.tsx` — L73:C7 H.
- `restricoes/page.tsx` — L21:C108 H.
- `vacinacao/page.tsx` — L25:C5 H.
- `vinculos/page.tsx` — L36:C5 H.

## Transparência — administração — 8 pontos

Base: `src/app/app-domain/transparencia/`.

- `acessos/page.tsx` — L4:C878 H.
- `banners/BannersClient.tsx` — L49:C7 H.
- `contratos/ContratosClient.tsx` — L29:C7 H.
- `diario-oficial/DiarioTable.tsx` — L32:C7 H.
- `licitacoes/LicitacoesClient.tsx` — L29:C7 H.
- `noticias/NoticiasTable.tsx` — L37:C7 H.
- `paginas/PaginasTable.tsx` — L36:C7 H.
- `publicacoes/page.tsx` — L45:C40 H.

## Tributação — 49 pontos

Base: `src/app/app-domain/tributacao/`.

- `alvaras/AlvarasClient.tsx` — L150:C9 E.
- `avaliacoes/ValuationClient.tsx` — L47:C101 H.
- `base-territorial/TerritorialBaseClient.tsx` — L19:C1996 E.
- `bi-tributario/BiTributarioClient.tsx` — L55:C555 G.
- `cadastros-fiscais/FiscalRecordWorkspace.tsx` — L129:C7 H.
- `calendarios/ScheduledGuidesClient.tsx` — L24:C7 H.
- `certidoes/CertidoesClient.tsx` — L137:C9 E.
- `cobranca/CobrancaClient.tsx` — L300:C19 G; L501:C17 G.
- `comparativo-anual/page.tsx` — L36:C5 H; L37:C5 H.
- `divida-ativa/DividaAtivaClient.tsx` — L75:C350 G.
- `divida/DividaClient.tsx` — L171:C9 E.
- `domicilio-tributario/DteClient.tsx` — L30:C562 E.
- `economico/[id]/EconomicHistory.tsx` — L21:C50 H.
- `economico/[id]/EconomicProfilePosition.tsx` — L22:C129 H.
- `economico/consulta/page.tsx` — L24:C1705 H.
- `economico/contadores/AccountantsClient.tsx` — L11:C1484 H.
- `economico/EconomicoClient.tsx` — L175:C9 E.
- `fiscalizacao/FiscalizacaoClient.tsx` — L435:C15 H; L749:C15 H; L856:C15 H.
- `fontes-cadastrais/RegistrySourcesClient.tsx` — L24:C99 E.
- `guias/GuiasClient.tsx` — L107:C9 E.
- `imoveis/[id]/PropertyHistory.tsx` — L20:C50 H.
- `imoveis/[id]/PropertyProfilePosition.tsx` — L21:C139 H.
- `imoveis/alteracao-geral/PropertyBulkClient.tsx` — L31:C29 H.
- `imoveis/ImoveisClient.tsx` — L173:C9 E.
- `imoveis/operacoes/PropertyOperationsClient.tsx` — L27:C69 H.
- `iss-bancario/IssBancarioClient.tsx` — L232:C15 H; L456:C17 H; L735:C17 G; L765:C17 G; L798:C15 H.
- `itbi/cancelamento-automatico/ItbiExpiryClient.tsx` — L13:C2618 H.
- `itbi/comunicacao/ItbiFieldHistory.tsx` — L16:C224 H.
- `itbi/ItbiClient.tsx` — L57:C7 E.
- `motor-fiscal/[id]/page.tsx` — L25:C1285 E.
- `motor-fiscal/MotorFiscalClient.tsx` — L87:C1962 G; L92:C7 E.
- `movimentacoes-contabeis/page.tsx` — L54:C7 H.
- `nfse/NfseClient.tsx` — L387:C17 H.
- `notificacoes/DebtNoticesClient.tsx` — L27:C86 H.
- `pessoas/page.tsx` — L35:C7 E.
- `redesim/RedesimClient.tsx` — L41:C7 E.
- `resumo-anual/AnnualSummaryClient.tsx` — L13:C543 H.
- `simples-nacional/SimplesNacionalClient.tsx` — L189:C15 H; L390:C15 H.
- `vaf/VafClient.tsx` — L235:C17 G.

## Sem definição tabular própria

Planejamento, Processos (entrada alternativa), Iluminação Pública, Portal do Cidadão, Portal do Paciente, Dashboard geral, Notificações e Suporte Técnico não acrescentam definições tabulares próprias ao índice. Isso não significa inexistência de telas, consultas ou registros: há reuso, redirecionamentos, cartões e outras visualizações, descritos no plano.

## Exclusões estruturais registradas

- Primitives: um `<table>` em cada arquivo `src/components/ui/table.tsx`, `src/components/app-ui/erp/ErpTable.tsx`, `saneamento/components/SanitationTable.tsx` e `patrimonio/_components/ResizableTable.tsx`.
- Cópia somente de impressão: segundo `<table>` de `compras/pesquisas-precos/CompactItemsTable.tsx`, L110.
- Aninhamento indevido: `<table>` em `saude/relatorios/HealthReportsClient.tsx`, L89:C188, dentro de `ErpTableContainer`; um problema estrutural, não segunda listagem lógica.
- Fragmentos de saída HTML em strings: consultar a propriedade `stringTables` de `--inventory`; não confundidos com pontos de tela.

## Grades de edição/seleção — frente adicional de 32 pontos

As localizações completas e expressões constam em `node scripts/audit-table-pattern.mjs --grids`, com `classification: "editing-grid"`. Agrupamento por arquivo:

- `compras/licitacoes/BiddingWorkflowPanel.tsx` — duas grades: membros e itens do lote.
- `compras/recebimentos/ReceiptForm.tsx` — itens de recebimento.
- `compras/solicitacoes/SolicitacaoForm.tsx` — rateios/dotações.
- `controle-interno/ChecklistGroupsEditor.tsx` — itens de checklist.
- `financeiro/conciliacao-bancaria/ReconciliationAllocationForm.tsx` — alocações.
- `financeiro/custos/CostsClient.tsx` — objetos/itens.
- `financeiro/custos/PayrollCostRulesClient.tsx` — rateios de folha.
- `financeiro/custos/SettlementCostsPanel.tsx` — custos de liquidação.
- `financeiro/custos/StockCostRulesClient.tsx` — rateios de consumo.
- `financeiro/orcamento/CreditRequestDialog.tsx` — itens de crédito, em diálogo.
- `financeiro/orcamento/planejamento/PlanejamentoClient.tsx` — duas grades: previsões e fixações; componente legado, confirmar uso.
- `financeiro/relatorios/indices-constitucionais/FiscalIndicesClient.tsx` — componentes de índice.
- `financeiro/relatorios/pessoal-fiscal/PersonnelFiscalClient.tsx` — componentes fiscais.
- `obras/construcao-civil/regras/ConstructionRulesClient.tsx` — duas grades: campos e critérios.
- `patrimonio/requisicoes/nova/MaterialRequestForm.tsx` — itens requisitados.
- `saude/atendimentos/[id]/complementos/AdministrationForm.tsx` — insumos administrados.
- `social/requisicoes/BenefitWorkflowClient.tsx` — itens de benefício, em diálogo.
- `tributacao/avaliacoes/simulacao/page.tsx` — seleção de unidades simuladas.
- `tributacao/configuracoes-cadastrais/ConfigurableCadastresClient.tsx` — campos configuráveis.
- `tributacao/configuracoes-cadastrais/ZoningActivitiesInput.tsx` — atividades/regras.
- `tributacao/configuracoes-cadastrais/pgv-lote/PgvBulkClient.tsx` — campos PGV.
- `tributacao/economico/eventos-veiculos/EconomicEventsVehiclesClient.tsx` — campos de veículos/eventos.
- `tributacao/imoveis/[id]/perfil/PropertyProfileClient.tsx` — proprietários/participações.
- `tributacao/lotes-anuais/AnnualBatchesClient.tsx` — alvos de lote anual.
- `tributacao/motor-fiscal/PaymentOptionsEditor.tsx` — opções de pagamento.
- `src/app/portal/tributario/itbi/novo/OnlineItbiClient.tsx` — participantes/frações.
- `src/components/app-ui/planejamento/PlanningForm.tsx` — duas grades: itens orçamentários e mapeamento.
- `src/components/transparencia/DiscoveryPresentationEditor.tsx` — links editoriais.

Nos caminhos abreviados desta última seção, a base é `src/app/app-domain/`, exceto quando o caminho já começa com `src/`. A classificação adicional não autoriza aplicar paginação a itens de formulário sem preservar os valores não salvos e resolver o orçamento da tela.
