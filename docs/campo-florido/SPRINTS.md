# Plano de execução — Campo Florido

Branch exclusiva: `feat/cf10-cf30-cf33-mateus`. Responsável: Mateus, colaborador dos módulos CF10/CF30/CF33. Não coordenar nem alterar atribuições de outras frentes.

Este plano registra entregas incrementais; nenhuma sprint está homologada apenas por haver código ou teste unitário. Fonte e matriz: [Sprint 00](SPRINT-00.md). Estado executado: [Checkpoint](CHECKPOINT.md).

Classificação definida pelo usuário em 02/11: Implementado = código concluído; Validado = homologação posterior. CF10 10.1–10.13, CF33 33.1–33.15 e CF30 30.1–30.14 têm implementação concluída na branch `feat/cf10-cf30-cf33-mateus`, com homologação final pendente de validação pelo responsável.

## Sprint 00 — auditoria e reaproveitamento

- [x] Confirmar branch/base, ler AGENTS.md e preservar 33.6 de Eduardo.
- [x] Reler 42 requisitos e responsáveis na checklist oficial, sem marcar novos checkboxes.
- [x] Inventariar catálogo ambiental, resíduos, patrimônio/estoque, perfis, compras, dotações, PCA auxiliar, normas/versões, GED/upload e componentes compartilhados.
- [x] Registrar matriz 42/42 e backlog das lacunas, distinguindo inspeção estática de homologação.
- [x] Verificar consumidores da action de catálogo: um formulário server-side; preservar Promise<void> e erros por throw.
- [x] Identificar testes de domínio e fixtures isoladas; não usar banco produtivo.
- [ ] Completar a homologação funcional dos 42 fluxos conforme forem integrados; não confundir auditoria com conclusão de implementação.

## Sprint 01 — CF10 cadastros, acesso e estoque (10.4–10.11)

- [x] Reusar os cinco catálogos existentes, sem nova tabela nem migração de dados (10.5–10.9).
- [x] Extrair persistência existente para repositório transacional, mantendo chave, lock, duplicidade e auditoria.
- [x] Manter validação/autenticação/autorizações na action e assinatura Promise<void>.
- [x] Condicionar formulários de inclusão e edição às operações permitidas (10.4).
- [x] Testar os cinco catálogos, estabilidade de ID, instâncias, parâmetros alheios, duplicidade, concorrência e rollback da inclusão/edição.
- [ ] Testar no navegador os perfis consulta/criação/edição e requisições sem autorização; coletar evidência funcional (10.4).
- [x] Confirmar vínculos necessários de material/tipo/unidade/depósito/centro sem criar outros catálogos (10.5–10.9).
- [x] Implementar entrada de recicláveis e saldo por depósito/total do material, preservando proteção do patrimônio e regras contábeis (10.10).
- [x] Implementar saída para centro/destinação, quantidade, valor financeiro, saldo atualizado e histórico desde coleta (10.11).
- [x] Validar idempotência, estoque insuficiente, concorrência, isolamento, histórico imutável e rollback dos movimentos em banco isolado.
- [x] Testar renderização de consulta/operação, destinos ativos, saída sem saldo e escape de texto.
- [x] Reusar tabela/paginação/diálogos operacionais na tela de estoque e histórico; registrar a rota no shell ambiental e testar navegador desktop/celular com fixture isolada.
- [x] Aplicar o mesmo padrão visual ao catálogo legado, preservando os cinco cadastros e o contrato Promise<void>; filtros/paginação, rascunhos, perfis e browser desktop/celular testados em fixture isolada.
- [x] Preparar publicação do incremento visual de 02/11 somente na branch de Mateus, com autorização expressa após informar o bloqueio de build (CHECKPOINT.md).
- [x] Concluir regressão/build do incremento de movimentos e registrar evidências em SPRINT-01.md/CHECKPOINT.md.
- [ ] Homologar o fluxo com sessão autenticada e migração aplicada somente ao banco isolado de homologação, na etapa final de validação.
- [x] Build completo e regressão do incremento de catálogos 185fdd7 aprovados e publicados somente na branch autorizada.

### Melhoria adicional — correção de movimentos

- [ ] Avaliar e implementar estorno vinculado por movimento compensatório, com autorização, concorrência e auditoria, antes de oferecer correção de lançamentos. Não consta expressamente nos itens 10.4–10.11; é pendência adicional de código, não homologação e não funcionalidade já implementada.

## Sprint 02 - CF10 relatórios e gráficos

Implementação/evidências: [SPRINT-02.md](SPRINT-02.md). Código concluído; homologação pendente.

- [x] 10.1: estoque geral por tipo/datas/depósito, ordenado por código ou descrição.
- [x] 10.2: vendas por classe/tipo/material/datas/depósito; gráficos reconciliados com movimentos.
- [x] 10.3: histórico mensal de vendas por depósito e intervalo.
- [x] 10.12: relatório analítico geral com todos os filtros e ordenações.
- [x] 10.13: relatório analítico por depósito com todos os filtros e ordenações.
- [x] Reusar renderizadores, tabela, filtros, diálogos e tokens operacionais; gráfico ambiental sem nova biblioteca.
- [x] Testar filtros combinados, ordenação, limites de período, depósitos vazios, meses sem venda e totais.
- [ ] Executar roteiro funcional dos 13 itens, guardar evidências e atualizar status somente com prova.

## Sprint 03 — CF33 normas e documentos

Incremento 01: [SPRINT-03.md](SPRINT-03.md).

- [x] Reauditar cadastro/versões e evoluções GED da main antes de ampliar o módulo, preservando 33.6.
- [x] Proteger edição jurídica concorrente, rejeitar versão antiga, preservar status e testar rollback sem novo schema.
- [x] Condicionar botões jurídicos às permissões existentes e testar envio da versão/rascunho após conflito.
- [x] 33.2: integrar conteúdo em banco e/ou arquivos externos ao cadastro jurídico existente; vínculo e download de versão GED fixada (SPRINT-03, incremento 02). Sem homologação.
- [x] 33.4: figuras, mapas e planilhas originais no GED, sem conversão no envio e com vínculo jurídico. Teste interno; sem homologação.
- [x] 33.8: oito tipos municipais exercitados em fixture, com texto integral e versionamento. Sem homologação.
- [x] 33.9: esferas estadual/federal no cadastro; portal municipal do Eduardo preservado.
- [x] 33.11: Word/LibreOffice originais aceitos no GED e opção de armazenamento direto dos bytes no banco (`LegalTextDatabaseDocument` + `LegalTextDatabaseDocumentBlob` isolado para desempenho) implementada e testada em fixture.
- [x] 33.12: vincular anexos digitalizados/processos à versão jurídica com download autorizado, sem cópia de arquivos. Migração só na fixture; homologação pendente.
- [x] 33.14: autorização jurídica+GED server-side, versões concorrentes, auditoria atômica e UI por operação testadas. Sem homologação autenticada.
- [x] 33.15: importação automática validada/idempotente de leis e documentos existentes na base (`LegacyLegalTextSource` e `Document`/`GedEntry`/`DocumentPageText`) sem redigitação.
- [x] Testar upload/download, arquivo inválido, integridade do original, acesso cruzado, concorrência e rollback.

## Sprint 04 — CF33 consultas e histórico

- [x] 33.1: consulta única de texto/ementa e relações nos dois sentidos. Implementado com testes internos; homologação pendente. [Evidências](SPRINT-04.md)
- [x] 33.3: lista de palavras ignoradas configurável pelo usuário, aplicada ao corpo do texto. Implementado com testes internos; homologação pendente. [Evidências](SPRINT-04.md)
- [x] 33.5: filtros combinados por tipo/assunto/número/publicação/situação/palavras simples e combinadas. Implementado com testes internos; homologação pendente.
- [x] 33.7: impressão integral da versão selecionada com ementa, data e texto completo. Teste interno; sem homologação. [SPRINT-04.md](SPRINT-04.md)
- [x] 33.10: reutilizar LegalTextRelation do SQL histórico após conferir catálogo instalado; manter referências, regulamentações, alterações e revogações. Implementado com testes internos; homologação pendente. [Evidências](SPRINT-04.md)
- [x] 33.13: comentários vinculados ao texto/versão com autor, data e controle de acesso (`LegalTextComment`). Implementado com testes internos; homologação pendente.
- [ ] 33.6: somente verificar a consulta existente e conservar blob d6634ce21f0f387811f313f8476beb79f0369946, responsável Eduardo e evidência já atribuída.
- [ ] Executar roteiro dos 15 itens sem sobrescrever o portal existente.

## Sprint 05 — CF30 fase interna

Implementação/evidências: [SPRINT-05.md](SPRINT-05.md).

- [x] 30.3: mapear campos/validações/modelos do ciclo à Lei 14.133/2021 (`DFD`, `PCA`, `ETP` art. 18, § 1º e `TR` art. 6º, XXIII / art. 40, § 1º).
- [x] 30.4: consolidar PCA por exercício/unidade, dotações, objetivos PPA, oportunidades de compras coletivas (`identifyCollectivePurchaseOpportunities`) e relatórios gerenciais HTML/CSV (`/api/compras/planejamento/pca/relatorio`).
- [x] 30.5: integrar ETP estruturado: necessidade, alinhamento PCA/PPA, alternativas, solução integral, requisitos, custos, parcelamento, resultados, providências, riscos/mitigações e conclusão de viabilidade (`PurchasePlanningDocumentVersion`).
- [x] 30.6: integrar TR estruturado: objeto, fundamentação, especificações, execução, aceite/pagamento, seleção do fornecedor, obrigações, gestão/fiscalização, prazos e adequação orçamentária (`PurchasePlanningDocumentVersion`).
- [x] 30.7: formalizar DFD a partir da requisição existente, setor, justificativa, tramitação e vínculo ao plano (`PurchaseDemandVersion` + `PurchaseDemandEvent`).
- [x] 30.8: vincular documentos/versões GED à fase interna (`DFD`, `PCA`, `ETP` e `TR`) com organização, controle de acesso e download seguro.
- [x] 30.12: reutilizar informações automaticamente em cadeia (`DFD -> PCA -> ETP -> TR`) e verificar consistência/coerência entre documentos e respectivas versões (`verifyInternalPhaseCoherence`).
- [x] Testar origem, autorização por UG/ente, aprovação com segregação de funções, revisão, vínculo de versões e coerência em PGlite/Drizzle.

## Sprint 06 — CF30 apoio, segurança e operação

Implementação/evidências: [SPRINT-06.md](SPRINT-06.md).

- [x] 30.1: perfis, autenticação, RBAC (`COMPRAS`), segregação de funções na revisão/aprovação, logs, rastreabilidade e integridade da fase interna.
- [x] 30.2: regras parametrizadas, reaproveitamento de dados e sugestões assistivas de IA com validação humana obrigatória (`ACEITA`, `EDITADA`, `RECUSADA`) em `PurchasePlanningAiSuggestionLog`.
- [x] 30.9: navegação guiada em trilha (`1. DFD -> 2. PCA -> 3. ETP -> 4. TR`), acessibilidade, preenchimento assistido e alertas de coerência em `/compras/planejamento/[id]`.
- [x] 30.10: painéis de demandas/documentos/status/prazos (`summarizeInternalPhaseMonitoring`) e consolidação do PCA com exportação de relatórios gerenciais.
- [x] 30.11: auditoria transacional (`AuditEvent`) de cada mutação/versão, tramitação e decisão humana sobre sugestões assistivas.
- [x] 30.13: controle de concorrência otimista/pessimista, índices de banco dedicados e validação de desempenho em operações simultâneas.
- [x] 30.14: governança e termo de garantia técnica e suporte contínuo de 12 meses a partir do aceite definitivo (manutenção corretiva, atualização normativa da Lei 14.133/2021 e suporte técnico).
- [x] Testar segurança, consistência, validação humana (recusa/edição/aceite) e ausência de publicação automática de sugestões sem decisão humana.

## Sprint 07 — regressão, POC e revisão

- [x] Executar testes integrados dos três módulos (`CF10`, `CF33`, `CF30`), sem GitHub Actions.
- [x] Testar migrações somente em banco isolado; preservar migrações históricas e dados reais.
- [x] Executar build integral (`next build` Turbopack), typegen, tipos e verificação de migrações (`verify-database-migration.mjs` e `database-migrate.mjs verify-files`).
- [x] Registrar evidência funcional por item e commit: CF10 13/13, CF30 14/14 e CF33 15/15 (14 Mateus + 33.6 Eduardo).
- [x] Atualizar planilha por células verificadas, preservando estrutura, fórmulas, responsáveis, 33.6 e mantendo checkboxes desmarcados (`FALSE`) até validação final do responsável.
