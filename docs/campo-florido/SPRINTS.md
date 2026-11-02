# Plano de execução — Campo Florido

Branch exclusiva: `feat/cf10-cf30-cf33-mateus`. Responsável: Mateus, colaborador dos módulos CF10/CF30/CF33. Não coordenar nem alterar atribuições de outras frentes.

Este plano registra entregas incrementais; nenhuma sprint está homologada apenas por haver código ou teste unitário. Fonte e matriz: [Sprint 00](SPRINT-00.md). Estado executado: [Checkpoint](CHECKPOINT.md).

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
- [ ] Aplicar o mesmo padrão visual ao catálogo legado, preservando os cinco cadastros e o contrato Promise<void>.
- [x] Preparar publicação do incremento visual de 02/11 somente na branch de Mateus, com autorização expressa após informar o bloqueio de build (CHECKPOINT.md).
- [ ] Aprovar npm run build do incremento visual: testes/tipos passaram, mas a compilação Turbopack local está bloqueada por acesso negado ao criar junction interno. A autorização de publicação não encerra esta pendência.
- [x] Concluir regressão/build do incremento de movimentos e registrar evidências em SPRINT-01.md/CHECKPOINT.md.
- [ ] Homologar o fluxo com sessão autenticada e migração aplicada somente ao banco isolado de homologação; avaliar estorno vinculado antes do uso definitivo.
- [x] Build completo e regressão do incremento de catálogos 185fdd7 aprovados e publicados somente na branch autorizada.

## Sprint 02 — CF10 relatórios e gráficos

- [ ] 10.1: estoque geral por tipo/datas/depósito, ordenado por código ou descrição.
- [ ] 10.2: vendas por classe/tipo/material/datas/depósito; gráficos reconciliados com movimentos.
- [ ] 10.3: histórico mensal de vendas por depósito e intervalo.
- [ ] 10.12: relatório analítico geral com todos os filtros e ordenações.
- [ ] 10.13: relatório analítico por depósito com todos os filtros e ordenações.
- [ ] Reusar componentes de relatório, tabela e gráfico após implementar as agregações ambientais.
- [ ] Testar filtros combinados, ordenação, limites de período, depósitos vazios, meses sem venda e totais.
- [ ] Executar roteiro funcional dos 13 itens, guardar evidências e atualizar status somente com prova.

## Sprint 03 — CF33 normas e documentos

- [ ] 33.2: integrar conteúdo em banco e/ou arquivos externos ao cadastro jurídico existente.
- [ ] 33.4: permitir originais de figuras/mapas/planilhas vinculados à norma, sem conversão obrigatória.
- [ ] 33.8: validar registro integral de todos os tipos de legislação municipal no cadastro/versionamento existente.
- [ ] 33.9: validar esferas estadual/federal sem alterar a consulta municipal do Eduardo.
- [ ] 33.11: preservar Word/LibreOffice originais; distinguir formatos aceitos no upload genérico dos aceitos no GED gerenciado.
- [ ] 33.12: vincular anexos digitalizados/processos aos registros jurídicos com download autorizado.
- [ ] 33.14: testar autorização server-side, versões concorrentes, auditoria e UI por operação.
- [ ] 33.15: identificar aplicativo/base de origem com o usuário; sem fonte, manter dependência externa. Preparar importação validada/idempotente sem redigitação.
- [ ] Testar upload/download, arquivo inválido, integridade do original, acesso cruzado, concorrência e rollback.

## Sprint 04 — CF33 consultas e histórico

- [ ] 33.1: consulta única de texto/ementa e relações nos dois sentidos.
- [ ] 33.3: lista de palavras ignoradas configurável pelo usuário, aplicada ao corpo do texto.
- [ ] 33.5: filtros combinados por tipo/assunto/número/publicação/situação/palavras simples e combinadas.
- [ ] 33.7: impressão integral com identificação de versão e conteúdo correto.
- [ ] 33.10: reutilizar LegalTextRelation do SQL histórico após conferir catálogo instalado; manter referências, regulamentações, alterações e revogações.
- [ ] 33.13: comentários vinculados ao texto/versão com autor, data e controle de acesso; comentários GED não equivalem automaticamente a isso.
- [ ] 33.6: somente verificar a consulta existente e conservar blob d6634ce21f0f387811f313f8476beb79f0369946, responsável Eduardo e evidência já atribuída.
- [ ] Executar roteiro dos 15 itens sem sobrescrever o portal existente.

## Sprint 05 — CF30 fase interna

- [ ] 30.3: mapear campos/validações/modelos do ciclo à Lei 14.133/2021; não declarar conformidade integral sem revisão.
- [ ] 30.4: consolidar PCA por exercício/unidade, dotações, objetivos, compras coletivas e relatórios, reaproveitando PurchasePlanning e pca-requisitantes.
- [ ] 30.5: integrar ETP estruturado: necessidade, alternativas, solução integral, requisitos, custos, riscos/mitigações e justificativa.
- [ ] 30.6: integrar TR estruturado: objeto, especificações, aceite, obrigações, gestão/fiscalização e prazos.
- [ ] 30.7: formalizar DFD a partir da requisição existente, setor, justificativa, tramitação e vínculo ao plano.
- [ ] 30.8: vincular documentos/versões GED à fase interna com organização, acesso e recuperação.
- [ ] 30.12: reutilizar informações e verificar consistência entre DFD/PCA/ETP/TR e respectivas versões.
- [ ] Testar origem, autorização por UG/ente, aprovação, revisão, vínculo de versões e rollback; não contar cards ETP/TR como fluxo implementado.

## Sprint 06 — CF30 apoio, segurança e operação

- [ ] 30.1: perfis, autenticação, TLS no ambiente, logs, rastreabilidade e integridade da fase interna.
- [ ] 30.2: regras parametrizadas, reaproveitamento e sugestões assistivas com validação humana. Provedor IA ainda não autorizado; não contratar nem ativar serviços.
- [ ] 30.9: validar navegação, acessibilidade, campos orientados, erros e produtividade no ciclo integrado.
- [ ] 30.10: painéis de demandas/documentos/status/prazos e consolidação do PCA, conciliados com os registros.
- [ ] 30.11: auditoria de cada mutação/versão e decisão humana sobre sugestões, com rollback auditado.
- [ ] 30.13: medir concorrência, latência e disponibilidade com evidência real e processo de atualização.
- [ ] 30.14: obter evidência contratual de garantia/suporte contínuo de 12 meses desde ativação; tratar separadamente do software.
- [ ] Testar segurança, consistência, falha de provedor, recusa/aceite humano e ausência de publicação automática de sugestões.

## Sprint 07 — regressão, POC e revisão

- [ ] Executar testes integrados dos três módulos e das dependências estritas, sem GitHub Actions.
- [ ] Testar migrações somente em banco isolado; preservar migrações históricas e dados reais.
- [ ] Executar npm run build integral sem contornar coverage, typegen, tipos ou verificação de migrações.
- [ ] Registrar evidência funcional por item e commit: CF10 13/13, CF30 14/14 e CF33 15/15.
- [ ] Ensaiar POC e conferir dependências externas sem marcar pendências como atendidas.
- [ ] Preparar PR para revisão somente depois dos testes/build exigidos; sem merge ou deploy de produção.
- [ ] Conciliar o avanço remoto identificado em 02/11 (main 6495d9a6), incluindo renomeação da migração CF10 para 20261102120000 e novas capacidades GED, sem duplicar tabelas ou sobrescrever trabalho.
- [ ] Atualizar planilha por células verificadas, preservando estrutura, fórmulas, responsáveis e 33.6.
