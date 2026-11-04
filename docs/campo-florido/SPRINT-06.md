# Sprint 06 — CF30 Automação, IA Assistiva, Segurança, Auditoria, Desempenho e Garantia (30.1, 30.2, 30.9, 30.10, 30.11, 30.13, 30.14)

## Escopo concluído
- **30.1 — Segurança da Informação e Controle de Acesso**:
  - Autenticação e autorização por perfil/operação (`COMPRAS: read/create/update`), validação de escopo de unidade/secretaria de origem (`assertPurchaseRequestOrigin`), segregação de funções na revisão/aprovação de `DFD`, `PCA`, `ETP` e `TR` (proibição de autoaprovação) e proteção transacional.
- **30.2 — Automação e Inteligência Artificial Assistiva com Validação Humana**:
  - Geração de sugestões assistivas baseadas em regras parametrizadas da Lei nº 14.133/2021, reaproveitamento automático de dados e verificação de consistência normativa (`generateAssistiveSuggestions` em `src/lib/compras/internal-phase-documents.ts`).
  - Validação humana obrigatória (`ACEITA`, `EDITADA` ou `RECUSADA`) antes da aplicação, persistida na tabela `"PurchasePlanningAiSuggestionLog"` (`recordAiSuggestionDecision`).
- **30.9 — Usabilidade, Acessibilidade e Navegação Guiada**:
  - Trilha guiada passo a passo (`1. DFD -> 2. PCA -> 3. ETP -> 4. TR`) em `/compras/planejamento/[id]`, com preenchimento assistido, alertas claros de coerência e preservações de histórico.
- **30.10 — Relatórios e Acompanhamento Gerencial**:
  - Painel gerencial em `/compras/planejamento/pca` e rota `/api/compras/planejamento/pca/relatorio` consolidando demandas, status de documentos (`DFD`, `PCA`, `ETP`, `TR`), documentos vinculados ao GED e controle de prazos (`No prazo`, `Próximos 30 dias`, `Atrasados`) via `summarizeInternalPhaseMonitoring`.
- **30.11 — Auditoria e Rastreabilidade**:
  - Registro transacional em `"AuditEvent"` (`insertAuditEvent`) em todas as ações de criação/edição de planejamento (`savePurchasePlanning`), formalização e tramitação de DFD (`formalizeDemand`, `routeDemand`), elaboração e tramitação de PCA/ETP/TR (`saveInternalPhaseDocumentAction`, `routeInternalPhaseDocumentAction`), validação humana de sugestões de IA (`decideInternalPhaseAiSuggestionAction`) e emissão de relatórios (`PCA_MANAGERIAL_REPORT`).
- **30.13 — Desempenho e Disponibilidade**:
  - Controle de concorrência otimista por versão/etapa e bloqueio transacional (`FOR UPDATE`), índices dedicados em `"PurchasePlanningDocumentVersion"` e `"PurchasePlanningAiSuggestionLog"`, e testes de carga concorrente aprovados.
- **30.14 — Garantia e Suporte Técnico (12 Meses)**:
  - Termo e metadados formais de governança, SLA de disponibilidade (99,5%) e garantia mínima de 12 (doze) meses a partir do aceite definitivo (manutenção corretiva, atualização normativa da Lei nº 14.133/2021 e suporte técnico contínuo) integrados ao módulo `/compras/planejamento` e ao relatório gerencial.

