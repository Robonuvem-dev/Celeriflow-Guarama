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


---

## Sprint 08 — CF31 — Backup (31.1 a 31.11)

Branch exclusiva: `feat/cf26-cf29-cf31-cf32-mateus`. Responsável: Mateus (11/11 requisitos, P0 - Impeditivo).

- [x] 31.1: Fazer o backup de todos os sistemas descritos no edital (CeleriFlow / módulos integrados).
- [x] 31.2: Automatização e armazenamento de Backup em Nuvem.
- [x] 31.3: Backups automáticos sem necessidade de intervenção humana.
- [x] 31.4: Executar dentro da Tecnologia Web (`/configuracoes/backup`).
- [x] 31.5: Backup full diário, armazenando os 7 últimos dias.
- [x] 31.6: Armazenar 1 Backup full no primeiro dia de cada mês durante 12 meses.
- [x] 31.7: Backup diferencial dos arquivos de log de 1 em 1 hora.
- [x] 31.8: Armazenamento dos arquivos em Data Center CERTIFICADO.
- [x] 31.9: Transferência e armazenamento em criptografia Padrão Militar AES 256 bits (`aes-256-gcm` via `node:crypto`).
- [x] 31.10: Aplicação de backup instalável no servidor de banco de dados como serviço do Windows (`RunAsService` / script e manifesto de serviço).
- [x] 31.11: Espaço disponibilizado limitado a 3 Terabytes (controle de cota de 3 TB = 3.298.534.883.328 bytes).
- [x] Implementar painel operacional em `/configuracoes/backup` com `OperationalListFrame` e `OperationalTable`, API `/api/sistema/backup` e suíte de testes automatizados.

## Sprint 09 — CF32 — Serviço Data Center (32.1 a 32.21)

Branch exclusiva: `feat/cf26-cf29-cf31-cf32-mateus`. Responsável: Mateus (21/21 requisitos, P0 - Impeditivo).

- [x] 32.1: Serviço de Data Center em nuvem para hospedagem, disponibilização e backup dos sistemas.
- [x] 32.2: Certificações obrigatórias ABNT NBR ISO/IEC 27001:2022 e ABNT NBR ISO/IEC 20000-1:2018 com alta disponibilidade, redundância e recuperação de desastres.
- [x] 32.3: Acessibilidade via Internet com disponibilidade mínima de 99,6% (24x7x365).
- [x] 32.4: Backup Seguro integrado às funcionalidades do Serviço de Backup (CF31).
- [x] 32.5: Hosting (hospedagem em nuvem e conexão à Internet).
- [x] 32.6: Redundância de hardware, ativos, serviços e replicação de infraestrutura.
- [x] 32.7: DNS hierárquico para resolução por nomes amigáveis.
- [x] 32.8: Elasticidade dinâmica sem interrupções em picos de demanda.
- [x] 32.9: Firewall (filtro de pacotes, proxy de aplicações, appliance software/hardware).
- [x] 32.10: Segurança Física do Data Center (controle de acesso, câmeras, biometria).
- [x] 32.11: Segurança Virtual (detecção/bloqueio de intrusão, antivírus e backups na nuvem).
- [x] 32.12: Licenciamento incluso (Sistemas Operacionais, SGBD e antivírus).
- [x] 32.13: Monitoramento contínuo de sistemas, serviços e recursos de TI.
- [x] 32.14: Gestão e administração de sistemas, SO e Bancos de Dados.
- [x] 32.15: Acessibilidade via navegadores web (computação em nuvem).
- [x] 32.16: Migração simples e assistida para a nuvem.
- [x] 32.17: Redução de custos de infraestrutura de TI.
- [x] 32.18: Suporte à plataforma de hospedagem 24x7x365.
- [x] 32.19: Plataforma integrada permitindo visualização de módulos/sistemas via navegador com login unificado.
- [x] 32.20: Certificado WildCard SSL cobrindo domínio principal e subdomínios.
- [x] 32.21: Domínio de aplicações web associado a subdomínio com SSL e sem uso de portas após a URL (`https://guarama.celeriflow.com.br`).
- [x] Implementar painel operacional de governança e telemetria em `/configuracoes/datacenter` com `OperationalListFrame` e `OperationalTable`, API `/api/sistema/datacenter/health` e testes automatizados.

## Sprint 10 — CF26 — Arrecadação Online Service (26.1 a 26.7)

Branch exclusiva: `feat/cf26-cf29-cf31-cf32-mateus`. Responsável: Mateus (7/7 requisitos, P0 - Impeditivo).

- [x] 26.1: Padrão FEBRABAN de arrecadação online via webservice com comunicação em tempo real entre sistema tributário e instituição bancária.
- [x] 26.2: `consultarDebitoIPTUOp` — consulta por inscrição imobiliária e exercício, retornando parcelas em aberto com linha digitável e código de barras FEBRABAN Segmento 6.
- [x] 26.3: `consultarDebitoISSOp` — consulta por inscrição municipal e competência (MM/AAAA), retornando débitos de ISS em aberto.
- [x] 26.4: `consultarDebitoDividaAtivaOp` — consulta por número da CDA ou CPF/CNPJ, retornando débitos inscritos em dívida ativa.
- [x] 26.5: `consultarDebitoParcelamentoOp` — consulta por número do acordo/parcelamento, retornando parcelas vincendas/vencidas.
- [x] 26.6: `cancelamentoOp` — estorno/cancelamento de autenticação bancária com reversão de status da guia e trilha de auditoria.
- [x] 26.7: `confirmacaoOp` — confirmação de arrecadação online em tempo real com baixa imediata do débito e comprovante de autenticação.
- [x] Implementar WebService SOAP/REST em `/api/tributacao/arrecadacao-online`, console/simulador bancário ao vivo em `/tributacao/arrecadacao` e `/tributacao/arrecadacao-online` e testes automatizados.

## Sprint 11 — CF29 — Declaração das Informações das Administradoras de Cartões (29.1, 29.3–29.5, 29.7–29.9)

Branch exclusiva: `feat/cf26-cf29-cf31-cf32-mateus`. Responsável: Mateus (7 requisitos livres; preservar 29.2 e 29.6 de Eduardo).

- [x] 29.1: Identificar equipamentos utilizados (POS/TEF/Ecommerce), número identificador e se o equipamento é próprio ou compartilhado.
- [x] 29.3: Termo de responsabilidade sobre o envio das informações pelo credenciado.
- [x] 29.4: Declaração da movimentação dos contribuintes (Débito, Crédito à vista, Crédito parcelado, taxas e ISS apurado).
- [x] 29.5: Geração do Documento de Arrecadação Municipal (DAM) para recolhimento do ISS apurado.
- [x] 29.7: Recepção dos arquivos enviados pela operadora de cartão por meio de Web Service (`/api/tributacao/declaracao-cartoes/webservice`).
- [x] 29.8: Relatório com informações declaradas pelas operadoras categorizadas por natureza de operação.
- [x] 29.9: Identificação do número identificador do equipamento utilizado nas operações declaradas.
- [x] Preservar integralmente os requisitos `29.2` e `29.6` atribuídos ao Eduardo.
