# Sprint 05 — CF30 Fase Interna da Contratação (30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.12)

## Escopo concluído
- **30.3 — Conformidade com a Lei Federal nº 14.133/2021**:
  - Estruturação dos documentos da fase preparatória (`DFD`, `PCA`, `ETP` e `TR`) aderente aos arts. 6º, XXIII, 12, VII, 18, caput e § 1º (incisos I a XIII), 40, § 1º e 117 da Lei nº 14.133/2021.
  - Descritor normativo e de governança em `src/lib/compras/internal-phase-documents.ts` (`getCf30GovernanceAndWarrantyDescriptor`).
- **30.4 — Plano de Contratações Anual (PCA)**:
  - Consolidação por exercício, unidade administrativa e objetivo institucional do PPA (`ObjectivePPA`), com conciliação das dotações orçamentárias da solicitação de origem (`consolidatePca`, `summarizePcaBudget`).
  - Identificação automática de **oportunidades de compras coletivas e padronização** entre unidades administrativas (`identifyCollectivePurchaseOpportunities` em `src/lib/compras/pca-consolidation.ts`), com exibição em `/compras/planejamento/pca`.
  - Emissão e exportação de **Relatórios Gerenciais do PCA e Fase Interna** em HTML/impressão e CSV (`/api/compras/planejamento/pca/relatorio`).
- **30.5 — Estudo Técnico Preliminar (ETP)**:
  - Elaboração estruturada com os 13 elementos do art. 18, § 1º da Lei nº 14.133/2021 (`normalizeEtpPayload`, `buildInheritedEtpPayload`), versionamento imutável em `"PurchasePlanningDocumentVersion"` (`documentType = 'ETP'`), vínculo ao GED e fluxo de aprovação com segregação de funções (`RASCUNHO -> EM_ANALISE -> APROVADO | DEVOLVIDO`).
- **30.6 — Termo de Referência (TR)**:
  - Elaboração estruturada com os elementos do art. 6º, XXIII e art. 40, § 1º da Lei nº 14.133/2021 (`normalizeTrPayload`, `buildInheritedTrPayload`), herdando dados de DFD e ETP, versionamento imutável (`documentType = 'TR'`), vínculo ao GED, bloqueio de aprovação quando o ETP concluir pela inviabilidade e fluxo de aprovação com segregação de funções.
- **30.7 — Documento de Formalização de Demanda (DFD)**:
  - Formalização versionada a partir da solicitação aprovada (`PurchaseDemandVersion`), unidade requisitante, justificativa, itens, planejamentos vinculados e tramitação (`PurchaseDemandEvent`) em `/compras/solicitacoes/[id]/dfd`.
- **30.8 — Gestão Integrada de Documentos (GED)**:
  - Vínculo e recuperação de versões finais/assinadas do GED (`DocumentVersion`) em todos os documentos da fase interna (`DFD`, `PCA`, `ETP` e `TR`) com download seguro via `/api/assinatura-digital/ged/download`.
- **30.12 — Integração entre Documentos da Fase Interna**:
  - Reaproveitamento automático de informações em cadeia (`Solicitação -> DFD -> PCA -> ETP -> TR`) sem redigitação manual e verificação automática de coerência (`verifyInternalPhaseCoherence`) detectando divergências de valor, vigência ou versão anterior de DFD/ETP.

