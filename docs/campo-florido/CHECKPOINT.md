# Checkpoint — Campo Florido

## Catálogos padronizados — 02/11/2026

Continuidade no checkout antigo, expressamente autorizada pelo usuário após a tentativa de usar a pasta do GitHub Desktop. Base local/remota conferida: 13269cb96594c455ab3e9b593827c6d9d7fb5236, exclusivamente em feat/cf10-cf30-cf33-mateus. O incremento anterior de estoque/histórico está publicado nesse commit; o pacote ZIP anterior não deve ser reaplicado.

- Reaproveitados os cinco catálogos e a persistência Drizzle existentes. Nenhuma tabela de banco, migração, chave, lock, regra de duplicidade ou auditoria foi alterada.
- Cadastros usam OperationalListFrame, OperationalTable, OperationalLinkPagination, filtros e diálogos compartilhados. A rota foi registrada no workspace ambiental. Busca por código/nome/descrição/endereço e situação antecede a paginação de 20 registros; catálogo e filtros permanecem na URL.
- Formulários preservam código imutável na edição, descrição integral, endereço, situação e rascunho após erro/fechamento. Inclusão bem-sucedida limpa o formulário; edição conserva os valores. Os campos de endereço legados também são preservados quando não são editáveis naquele tipo de catálogo.
- saveRecyclingEntry conserva Promise<void>, autenticação/autorização antes da escrita, validação e transação/auditoria existentes. O novo adapter saveRecyclingEntryForClient retorna sucesso/erro ao formulário client, sem expor mensagens internas do banco. Não concede operações adicionais.
- Validação nova: 10 testes reais de catálogo/persistência/perfis; 13 de seleção/rota/contratos/renderização (incluem 4 cenários existentes de estoque); 4 browser com componentes/CSS reais. Todos passaram, sem skipped. O teste de contrato de action substitui identidade/IO por sentinelas; não é sessão autenticada. A persistência real é verificada separadamente na fixture isolada Neon/Drizzle/PGlite.
- ESLint e git diff --check aprovados. Tipos: partições 11, 13 e 16 aprovadas pelo runner existente, cobrindo todas as fontes alteradas e seus imports; também aprovado tsc específico das fixtures TS/TSX. O plano contém 16 partições (inclui artefatos de tipos deixados pelo diagnóstico Webpack); somente as três citadas foram executadas neste incremento. Não contar isso como novo build integral nem como aprovação das 16 partições.
- Browser: cinco catálogos em 1366×768 com 13px/24px e 20/1 registros; texto longo recuperado integralmente pelo diálogo; filtros/resultado vazio; consulta/criação/edição; erro preservando rascunho e inatividade; formulário móvel em 390×844. Identidade e gravação são simuladas na fixture. O token de fonte usa fallback sans-serif; sem homologação autenticada da aplicação real.

Build integral continua pendente pelo bloqueio Windows descrito abaixo; não houve nova execução completa neste incremento nem alteração de compilador/configuração/permissões para contorná-lo. A continuidade/publicação de desenvolvimento segue a orientação do usuário de trabalhar no checkout antigo e enviar somente para a sua branch, com essa limitação informada. Nenhum resultado pendente é marcado como aprovado; sem PR de conclusão, merge ou deploy manual. Catálogo visual passa a implementado/testado; Sprint 01 segue parcial por homologação/estorno, Sprint 02 ainda não iniciada.

Comandos de validação deste incremento:

```sh
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/recycling-catalog-persistence.test.ts tests/recycling-catalog.test.ts tests/user-additional-profiles.test.ts
node --import tsx --test tests/recycling-catalog-view.test.ts tests/recycling-catalog-actions.test.mjs tests/recycling-stock-ui.test.tsx
node --test tests/recycling-catalog.browser.test.mjs
node scripts/typecheck-build.mjs --partition 11
node scripts/typecheck-build.mjs --partition 13
node scripts/typecheck-build.mjs --partition 16
```

O banco dos testes é isolado, com DATABASE_URL sentinela. A comparação remota e a atualização condicionada da referência devem preceder qualquer publicação; não sobrescrever commits concorrentes. Próximo: avaliar estorno vinculado/autorizações integradas e iniciar somente as lacunas confirmadas da Sprint 02. Antes do PR final, conciliar a migração CF10 renomeada e as evoluções GED já presentes na main, sem duplicação.

## Retomada — 02/11/2026

O usuário autorizou execução local nesta conversa. Checkout novo exclusivamente da branch feat/cf10-cf30-cf33-mateus, base remota c189c720db9d64c5fbd89d4e24e6c67e48ff5820. Nenhum ZIP antigo foi recuperado. O registro em nuvem abaixo descreve a etapa anterior, não o executor desta retomada.

Incremento atual: reutilização dos componentes operacionais existentes na tela de estoque/histórico CF10 e nos diálogos de movimentação, respeitando a orientação de manter o estilo da base. Backend, schema, migrações e contratos das actions preservados. Detalhes em SPRINT-01.md.

Validação atual: npm ci concluído (1005 pacotes); 23/23 testes de persistência/estoque/perfis, 4/4 de rota/renderização e 4/4 no navegador headless aprovados. Os cenários browser verificam geometria padrão 13px/24px, paginação 20/1, troca de visão, consulta, destino ativo, precisão, erro/rascunho/idempotência, detalhes seguros e celular. A fixture usa o fallback sans-serif do token de fonte, não carrega o Inter via Next. A rota também foi registrada no manifesto operacional para receber o workspace ambiental real. Testes usam somente fixture isolada e DATABASE_URL sentinela; nenhum banco real, main, cemitério ou código de terceiros alterado. Catálogo visual, estorno e homologação autenticada continuam pendentes na Sprint 01; Sprint 02 não iniciada.

### Bloqueio do build local — publicação na branch autorizada com ressalva

ESLint dos arquivos alterados e git diff --check aprovados. npm run build: coverage aprovado, verify-files FILES_INTACT_BASELINE_AUTHORIZED, typegen aprovado e as 15 partições completas de tipos aprovadas (3.469 fontes, 1.015 validações de rotas, 1.258 s). A compilação final Turbopack falhou com exit 1 porque o executor Windows negou a criação do junction .next/node_modules/firebase-admin-a14c8a5423a75469 para node_modules/firebase-admin (os error 5, acesso negado). Não houve erro TypeScript nessa execução. Nenhuma permissão do computador foi modificada.

O comando obrigatório npm run build não foi aprovado nesta retomada. A publicação foi inicialmente suspensa pela regra de AGENTS.md. Depois de informado expressamente sobre a falha de permissão e a ausência de commit/push, o usuário instruiu “sobe para a minha branch”. Essa autorização específica permite publicar este incremento em desenvolvimento exclusivamente em feat/cf10-cf30-cf33-mateus, com o build pendente registrado; não altera AGENTS.md, não aprova o build e não autoriza merge ou deploy em produção. Os resultados de build aprovados de 01/11 abaixo pertencem aos incrementos anteriores e não validam estas novas edições. Uma compilação Webpack foi tentada apenas como diagnóstico, após os tipos completos já aprovados, e interrompida sem resultado final; não altera scripts/configuração, não conta como aprovação e não substitui o comando obrigatório. Nenhum teste do build foi desabilitado na configuração do projeto.

Entrega autorizada: publicar os 11 arquivos deste incremento pelo conector GitHub na conta Robonuvem-dev, com pai c189c720 e atualização da referência condicionada ao HEAD esperado, sem force. Conferir presença do commit remoto e igualdade da árvore local antes de considerar publicado. Sem PR de conclusão, merge ou deploy manual. A aprovação integral de build e a homologação continuam pendentes.

Histórico da recuperação: antes dessa autorização foi criado cf10-ui-checkpoint-20261102.zip em outputs/cf10-validation com changes.patch (inclui arquivos novos), manifest.json (base/branch/hashes SHA-256), CHECKPOINT.md e logs de compilação. Seus 11 arquivos tiveram zero divergências e o patch foi conferido contra a base em índice isolado. Esse pacote retrata o checkpoint anterior à publicação e não deve ser reaplicado sobre a branch sem comparação.

### Avanço remoto identificado nesta retomada

Main foi consultada somente para leitura no commit 6495d9a6a01482bd4b67b0565e094f7da3e6c9cd. O documento remoto docs/INTEGRACAO_DEPLOYS_2026-11-02.md registra integração dos incrementos 185fdd74/c189c720 por outro trabalho e renomeação da migração ambiental de 20261101120000 para 20261102120000, com SQL preservado. As telas StockView/MovementForm nessa main ainda têm os mesmos blobs da nossa base. Não foi realizada integração de main nesta branch, migração, merge ou deploy por esta retomada. Não extrapolar o documento de integração para afirmar que o banco/produção atual foi homologado aqui.

Antes do PR da Sprint 07, conciliar a nova base remota, especialmente o nome da migração, referências de schema/teste/docs e as evoluções de GED reutilizáveis em CF33. Não adicionar uma segunda migração criando as mesmas tabelas, sobrescrever alterações de terceiros nem usar testes desta branch como validação da main atual.

Reuso adicional confirmado por inspeção da main 6495d9a6: src/lib/documents/ged-policy.ts (blob ace7fa72e1326cb33f641788668476a20004bc0a) amplia a lista de formatos GED para Word, ODT/ODF, planilhas, apresentações, HTML e imagens adicionais. A restrição de formatos descrita na auditoria original corresponde à base d507684f; não deve motivar nova implementação de suporte antes de reconciliar esta evolução. Aceitação na política não comprova extração/visualização de cada formato nem vínculo às normas. docs/GED_REVISAO_PADRAO_MODULOS.md também inventaria novas estruturas de comentários, metadados, ACL e integrações; revisar seus serviços, contratos e migração como dependências estritas de CF33/CF30 quando essas sprints começarem.

---

Data: 01/11/2026. Repositório exclusivo: Robonuvem-dev/Celeriflow-Guarama.
Branch exclusiva: `feat/cf10-cf30-cf33-mateus`.
Base deste incremento: `185fdd7409f56746af10b401f096e91f51acac67`.
Base da auditoria estática original: `d507684ffe5a39c7b38ed1a4a5bd0d500ae73067`.

## Recuperação e segurança

O ZIP do Work anterior não foi anexado nem recuperado. Esta entrega é uma nova implementação incremental sobre a base remota conferida, baseada na auditoria e no código existente. Não afirmar que as alterações não publicadas antigas foram transferidas.

O executor desta etapa é Linux em nuvem. O checkout foi recriado após reinicialização do ambiente; não existe dependência do computador do usuário. Não confiar na sobrevivência do scratch entre turnos.

Este incremento adiciona uma migração exclusivamente ambiental, executada e revertida apenas na fixture isolada. Nenhum banco produtivo foi consultado ou alterado; sem merge/deploy. O arquivo 33.6 de Eduardo permanece com blob d6634ce21f0f387811f313f8476beb79f0369946.

## Incremento anterior publicado

- Documentação nova: source-requirements.csv, SPRINT-00.md, SPRINTS.md e este checkpoint.
- src/db/repositories/environment/recycling-catalog.ts: persistência extraída da action existente; preserva chave, lock, instância, erros de duplicidade, inclusão/edição e auditoria na mesma transação.
- src/app/app-domain/meio-ambiente/residuos/cadastros/actions.ts: mantém autenticação, autorização, schema, instância, assinatura Promise<void> e revalidação; delega somente a escrita transacional.
- src/app/app-domain/meio-ambiente/residuos/cadastros/page.tsx: mostra formulário de inclusão somente com create e edição somente com update. A proteção server-side continua obrigatória.
- tests/recycling-catalog-persistence.test.ts: cinco casos reais sobre fixture isolada PostgreSQL/PGlite com o driver Neon/Drizzle da aplicação: CRUD dos cinco catálogos, identidade/escopo, duplicidade/edição inexistente, criação concorrente e rollback de inclusão/edição se a auditoria falhar.

Essas alterações foram publicadas em 185fdd7 e permanecem preservadas.

## Alterações deste incremento — movimentos e estoque

- Implementação e decisões detalhadas em SPRINT-01.md; catálogos existentes continuam sendo usados por referência, sem duplicação.
- Migração aditiva 20261101120000_cf10_recycling_stock: associação de material a tipo/unidade, saldo por depósito e movimento ambiental; FKs compostas por instância, checks e histórico protegido contra edição/exclusão.
- Entrada com origem da coleta; saída para centro ativo com quantidade, valor obtido e saldo atualizado. Quantidades/valores exatos, idempotência por requisição/autor, concorrência, sequência e auditoria na mesma transação.
- Página /meio-ambiente/residuos/estoque com saldo por depósito, total do material na instância e histórico paginado. Formulários somente para create; action exige a mesma operação no servidor.
- Tela sem schema informa indisponibilidade em vez de executar DDL. Migração não foi aplicada em produção nem em instância de usuário.
- EnvWaste, MaterialStock, recebimentos aprovados e integração contábil permanecem intactos; nenhum lançamento de caixa/contabilidade é gerado pela receita ambiental registrada.
- Correção por estorno vinculado não implementada; não apagar ou editar histórico para corrigir dados. Avaliar esse fluxo antes do uso definitivo.

## Verificações executadas

- npm ci --ignore-scripts --no-audit --no-fund: concluído, 1008 pacotes.
- Testes direcionados de catálogos: 8/8 aprovados; 0 falhas; 0 skipped. Incluem 5 casos novos de persistência e 3 casos existentes de schema/identidade.
- Regressão ampliada: 50/50 aprovados; 0 falhas; 0 skipped. Inclui os 39 cenários anteriores e 11 casos de estoque ambiental.
- Backend de estoque, execução final após acrescentar FKs/perfis: 13/13 aprovados; 0 skipped. Os dois casos adicionais verificam restrição de criação no perfil/usuário e constraints entre instâncias/unidades. Nenhum código de aplicação mudou entre essas execuções.
- Renderização da interface: 3/3 aprovados; 0 skipped. Visões de consulta/operação, destinos ativos, ausência de saída sem saldo, valores precisos e escape de observações. Não substitui sessão autenticada no navegador.
- Migração: DDL criado e revertido com BEGIN/ROLLBACK e aplicado somente na fixture. MaterialStock e EnvWaste sentinela preservados nos testes.
- npm run build deste incremento: aprovado integralmente, exit 0. Coverage PASS; 28 migrações futuras reconhecidas; verify-files FILES_INTACT_BASELINE_AUTHORIZED; typegen; 3.469 fontes/1.015 validações em 15 partições de tipos; compilação e geração das 104 páginas estáticas concluídas. Tipos: 800 s; Next build: 104 s. A nova rota dinâmica /app-domain/meio-ambiente/residuos/estoque consta no resultado.
- A primeira execução passou todas as 15 partições de tipos, mas falhou ao abrir o cache persistente do Turbopack. Somente .next/cache/turbopack do checkout foi removido após conferir o caminho; a segunda execução integral passou sem alterar código/configuração ou pular verificações.
- git diff --check: passou após as alterações iniciais.
- ESLint direcionado à implementação ambiental e aos testes novos: aprovado, sem avisos; conferir novamente se houver novas edições.
- Verificação de migrações do build: FILES_INTACT_BASELINE_AUTHORIZED; strictAdoption permanece BLOCKED por diferença histórica preexistente em 20261011010000_add_sst_clinical_services. Nenhum arquivo histórico foi alterado e nenhuma adoção/deploy foi executada; databaseAuthority=NOT_CHECKED.
- Assinatura/call sites conferidos: saveRecyclingEntry é usado pelo formulário server-side da página de catálogo. Retorno Promise<void> preservado; nenhum contrato client foi alterado.
- A nova recordRecyclingMovementAction é aguardada pelo componente client MovementForm e mantém retorno estruturado de sucesso/erro. O contrato de saveRecyclingEntry permanece intacto.

Os testes usam fixtures locais ao executor em nuvem e DATABASE_URL sentinela 127.0.0.1:1, sem credenciais reais. O build é executado sem VERCEL_ENV=production e sem variáveis de migração: o script faz verify-files, não deploy. Não há bypass das verificações do projeto.

Comando da regressão (com DATABASE_URL sentinela):

```sh
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=tap \
  tests/recycling-stock.test.ts \
  tests/recycling-catalog-persistence.test.ts tests/recycling-catalog.test.ts \
  tests/purchase-planning.test.ts tests/user-additional-profiles.test.ts \
  tests/c5-procurement-policy.test.ts tests/stock-valuation.test.ts \
  tests/ged-management.test.ts tests/ged-storage.test.ts \
  tests/procurement-auxiliary-catalogs.test.ts tests/procurement-budget-scope.test.ts \
  tests/procurement-authorization-atomicity.test.ts tests/procurement-temporal-readers.test.ts
node --import tsx --test tests/recycling-stock-ui.test.tsx
```

## Estado das sprints

| Sprint | Estado |
|---|---|
| 00 | Inventário estático e matriz 42/42 documentados; homologação funcional dos fluxos integrada às etapas seguintes. |
| 01 | Catálogos publicados em 185fdd7. Movimentos/saldos, UI e migração implementados/testados isoladamente; build integral aprovado. Homologação com sessão autenticada e estorno antes de uso definitivo ainda pendentes. |
| 02 | Não iniciada; a base de movimentos ambientais já existe para implementar filtros, relatórios e gráficos. |
| 03 | Não iniciada; cadastro jurídico/versões e GED já inventariados para reuso. |
| 04 | Não iniciada; preservar 33.6 e reutilizar relações históricas após conferir DDL instalado. |
| 05 | Não iniciada; reusar requisições/planejamento/PCA auxiliar, dotações e GED. |
| 06 | Não iniciada; provedor IA e garantia/suporte contratual permanecem externos. |
| 07 | Não concluída; build do incremento não equivale a validação dos 42 requisitos. |

## Continuação

1. Conferir HEAD remoto, status e documentação; preservar quaisquer mudanças posteriores.
2. Usar o commit que contém este checkpoint como entrega do incremento de movimentos/saldos, com build e testes aprovados. Conferir sua presença na branch remota antes de repetir publicação. Sem PR de conclusão das sprints, merge ou deploy de produção.
3. Completar prova de autorização e UI com perfis representativos em banco isolado de homologação, sem solicitar credenciais em chat nem aplicar migração em produção.
4. Avaliar estorno vinculado antes do uso definitivo e avançar à Sprint 02 com relatórios/filtros/gráficos sobre os movimentos existentes. Não retirar a exigência de recebimento aprovado nem regras contábeis do patrimônio.
5. Avançar conforme SPRINTS.md, mantendo itens externos pendentes: origem dos textos 33.15, provedor IA e garantia/suporte 30.14.
