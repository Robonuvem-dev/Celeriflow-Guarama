# Sprint 01 — movimentos e saldos de recicláveis

Continuação do incremento 185fdd7409f56746af10b401f096e91f51acac67, exclusivamente em `feat/cf10-cf30-cf33-mateus`.

## Decisão de integração

Os cinco catálogos ambientais continuam em ConfiguracaoParametroInstancia com as mesmas chaves RECYCLING_CATALOG. Não foram recriados materiais, tipos, unidades, depósitos, centros ou usuários.

MaterialStock/stock-service só aceitam entradas de origens aprovadas e integram valoração e contabilidade. Uma coleta ambiental não é recebimento de compra. O novo controle ambiental registra esse ciclo sem modificar o serviço patrimonial nem gerar lançamentos financeiros/contábeis. EnvWaste continua sendo seu registro informativo de resíduos; nenhum dado legado é convertido ou migrado automaticamente.

Na conferência do catálogo físico versionado tests/fixtures/installed-physical-catalog.json, a única tabela relacionada a reciclagem/resíduos por nome é EnvWaste; não há as três novas tabelas do controle ambiental. Essa é uma evidência do catálogo versionado, não uma consulta ao banco produtivo atual.

## Implementação por requisito

| Requisito | Entrega | Limite de validação |
|---|---|---|
| 10.4 | A nova página exige acesso MEIO_AMBIENTE; a action exige create no servidor e devolve erro estruturado ao componente client. A visão de consulta não contém formulários. | Renderização dos componentes testada; falta sessão autenticada em ambiente de homologação. |
| 10.5–10.9 | Materiais, tipos, unidades, depósitos e centros existentes são usados por referência. Tipo/unidade do material são definidos na primeira entrada e mantidos em todos os depósitos. | Persistência dos catálogos coberta no incremento anterior; nenhum catálogo duplicado. |
| 10.10 | Entrada com origem da coleta, quantidade decimal, data, depósito e observação. Saldo por material/depósito e total do mesmo material nos depósitos da instância. Paginação no servidor. | Fluxos executados na fixture isolada; migração não aplicada em produção. |
| 10.11 | Saída para centro ativo com quantidade, valor total obtido e saldo atualizado; histórico de coletas e destinações, snapshots de nomes/endereço, sequência e valores exatos. | Sem homologação oficial. A receita ambiental registrada não equivale a lançamento de caixa/contabilidade. |

## Arquivos

- db/migrations/20261101120000_cf10_recycling_stock/migration.sql: três tabelas aditivas, FKs compostas por instância, checks de saldo/quantidade/aritmética e trigger de histórico imutável.
- src/db/schema/environment-recycling.ts: mapeamentos das tabelas; SQL é autoridade das constraints e trigger.
- src/lib/environment/recycling-stock.ts: validação, valores decimais e data municipal America/Sao_Paulo; DTOs sem Decimal na fronteira client.
- src/db/repositories/environment/recycling-stock.ts: disponibilidade do schema, movimento atômico/auditado, idempotência, bloqueios e leitura paginada.
- src/app/app-domain/meio-ambiente/residuos/estoque/: página, action, visualização e formulário client.
- src/app/app-domain/meio-ambiente/residuos/page.tsx: acesso ao estoque na lista existente; contratos e operações legadas preservados.
- tests/recycling-stock.test.ts: migração, ciclo, regras, concorrência, isolamento, constraints, precisão, histórico, paginação e rollback.
- tests/recycling-stock-ui.test.tsx: renderização para consulta/operação, disponibilidade de saída, destinos ativos, precisão e escape de texto.

## Garantias do ciclo

- FKs compostas impedem referenciar cadastros de outra instância. Os prefixos de catálogo são verificados no SQL e os dados são validados novamente antes da gravação.
- A chave da requisição é única por instância. Repetição idêntica pelo mesmo autor retorna o movimento sem alterar saldo ou gerar outra auditoria. Mesma chave com dados ou autor diferentes é recusada.
- O material é bloqueado entre depósitos antes da primeira associação a tipo/unidade. Movimentos também compartilham os locks já usados pelos catálogos.
- Saldo, associação inicial, movimento e auditoria são gravados na mesma transação. Falha de auditoria reverte inclusive o primeiro saldo e a primeira associação.
- Quantidade usa NUMERIC(18,3), valor total NUMERIC(18,2), com Decimal; não há conversão para Number para persistir ou exibir valores.
- Saldo negativo, quantidade inválida, excesso numérico, destino inativo e data anterior à última movimentação do material/depósito são recusados.
- A sequência por material/depósito é única. Histórico é protegido contra UPDATE/DELETE no banco. Correção não é feita apagando movimento; um fluxo de estorno vinculado ainda não foi implementado e deve ser avaliado antes da operação definitiva.
- Cadastros inativos não recebem novas entradas. Saldo já existente pode ser destinado a um centro ativo, mantendo seu histórico e unidade.
- Nomes e endereço do destino são preservados no histórico, mesmo se o cadastro mudar depois.
- A tela verifica se as tabelas existem. Antes da migração, informa a indisponibilidade e mantém os cadastros/resíduos acessíveis; não executa DDL nem provisiona banco automaticamente.

## Testes e estado

- Testes específicos: 13/13 backend e 3/3 renderização, sem skipped. Incluem operação por perfil e FKs de instância/unidade.
- A migração foi executada dentro de BEGIN/ROLLBACK e depois aplicada somente na fixture PostgreSQL/PGlite isolada, usando o driver Neon/Drizzle da aplicação.
- Registros sentinela MaterialStock e EnvWaste permaneceram inalterados durante o ciclo completo.
- Regressão ampliada: 50/50 cenários aprovados (11 casos de estoque + 39 anteriores), seguida da execução final dos 13 casos de estoque após adicionar dois cenários de FKs/perfis. Build integral aprovado após limpeza apenas do cache gerado: coverage, migrações, typegen, 15 partições de tipos, compilação Next e páginas. Detalhes em CHECKPOINT.md.

Comandos específicos:

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:1/cf_unconfigured \
  node --conditions=react-server --import tsx --test tests/recycling-stock.test.ts
node --import tsx --test tests/recycling-stock-ui.test.tsx
```

## Próximos passos

### Incremento de interface — 02/11/2026

Base: c189c720db9d64c5fbd89d4e24e6c67e48ff5820. Execução local expressamente autorizada pelo usuário nesta conversa.

- Estoque e histórico passam a usar OperationalListFrame, OperationalTable e OperationalLinkPagination existentes. Uma visão por vez ocupa a área útil da tabela; a URL mantém a visão e as páginas independentes de saldos/histórico.
- A rota de estoque foi registrada no manifesto operacional saneamento-ambiente.ts e no menu ambiental. A correspondência exata de Controle de Resíduos evita dois itens ativos na mesma subpágina; saneamento e demais módulos não foram alterados.
- Entradas, saídas e detalhes usam Dialog e OperationalPagedContent existentes, incluindo leitura paginada no desktop e rolagem em dispositivos móveis. Sem alteração do CSS compartilhado.
- Os formulários preservam rascunho e chave de requisição ao fechar/reabrir ou receber erro; sucesso limpa o rascunho e gera nova chave. A action continua aguardada com retorno estruturado; autorização e persistência Drizzle não foram alteradas.
- Registros somente para consulta continuam sem ações de movimentação; posição sem saldo não oferece saída. Quantidades/receitas continuam strings decimais exatas, sem Number na apresentação.
- A fixture browser usa componentes/CSS reais e dados sintéticos, com navegação e gravação simuladas. Não é sessão autenticada, homologação funcional do sistema completo ou prova de aplicação de migração.
- Validação desta etapa: 23/23 testes de catálogos, estoque e perfis; 4/4 de rota/renderização; 4/4 no navegador headless com CSS real, desktop e celular; ESLint aprovado. npm run build passou coverage, verify-files, typegen e as 15 partições de tipos, mas falhou na compilação Turbopack porque o Windows negou o junction interno de firebase-admin (os error 5). Após ser informado desse bloqueio, o usuário autorizou publicar somente na sua branch; ver CHECKPOINT.md. Publicação não equivale a build aprovado ou homologação. Os builds aprovados anteriormente não validam esta revisão.

```sh
node --test tests/recycling-stock.browser.test.mjs
```

O catálogo legado ainda requer a mesma revisão visual; esse ajuste não conclui a Sprint 01, não implementa estorno e não inicia a Sprint 02.

Roteiro de verificação funcional: [ROTEIRO_POC_CF10.md](ROTEIRO_POC_CF10.md). É preparação de evidências, sem aprovação de requisitos.

1. Concluir regressão/build e publicar apenas na branch de Mateus.
2. Validar a página com perfis reais de homologação em banco isolado, com a migração aprovada para esse ambiente; não aplicar em produção nesta tarefa.
3. Avaliar estorno vinculado antes do uso definitivo. Não remover a proteção do histórico para corrigir registros.
4. Sprint 02: filtros, relatórios analíticos e gráficos de vendas sobre este movimento, sem recriar a persistência.
