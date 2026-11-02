# Checkpoint — Campo Florido

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
- Migração aditiva 20261102120000_cf10_recycling_stock: associação de material a tipo/unidade, saldo por depósito e movimento ambiental; FKs compostas por instância, checks e histórico protegido contra edição/exclusão. Na integração de 02/11, o arquivo ainda não aplicado foi reposicionado após as migrações sociais já registradas, mantendo o SQL original.
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
