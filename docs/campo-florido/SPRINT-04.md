# Sprint 04 — consulta de textos jurídicos

## Incremento 01 — impressão, requisito 33.7

O cadastro jurídico oferece **Imprimir texto jurídico** também para perfis de consulta. O link fixa a versão exibida na tabela. A página de impressão permite imprimir ou salvar em PDF pelo navegador, com texto integral, parágrafos, ementa e data de publicação da versão. Tipo, número, esfera e órgão continuam vindos da identificação atual do ato, pois esses campos não têm snapshot na versão legada.

A rota exige acesso ao módulo CADASTROS antes de consultar. A versão pedida é filtrada no banco; versão inexistente retorna 404, sem substituição silenciosa. O HTML escapa dados, preserva quebras de linha e bloqueia scripts/conexões externas por CSP. Resposta privada sem cache. Não depende de GED, novo schema, migração ou alteração do portal 33.6.

**Validação:** 2 testes de renderização, 3 testes da rota com dependências de identidade e banco simuladas e 4 testes de navegador do cadastro com fixture, incluindo o link para a versão exibida e a geometria padrão. Tipos dos arquivos alterados, dependências e teste TypeScript aprovados. Sem homologação autenticada ou build integral; este permanece pendente pelo bloqueio Windows/Turbopack registrado.

Próximos itens: consulta e filtros jurídicos (33.1/33.3/33.5), vínculos entre atos (33.10) e comentários (33.13). 33.6 continua sob responsabilidade do Eduardo. Pendências da Sprint 03: armazenamento binário direto e desempenho (33.11), e origem da integração (33.15).

## Incremento 02 - filtros da consulta (33.5)

A consulta combina tipo, assunto pela ementa, numero, data de publicacao e situacao. A busca livre considera o numero, a ementa e o conteudo da versao mais recente. Os criterios persistem ao paginar e a listagem e a contagem usam a mesma consulta filtrada.

Validacao local: 9 testes de persistencia passaram em banco isolado e a checagem de tipos direcionada passou. Build integral e teste de navegador tiveram a verificacao bloqueada pela revisao automatica por trafego de telemetria. Validacao integral encaminhada para a CI do GitHub via PR em rascunho, com autorizacao de publicacao antecipada na branch de trabalho. Homologacao pendente.

## Auditoria de continuidade - 33.1 e 33.10

O snapshot versionado em tests/fixtures/installed-physical-catalog.json confirma LegalTextRelation com origem, destino, tipo, vigencia e notas. O proximo incremento deve mapear essa estrutura no Drizzle e consultar os vinculos nos dois sentidos, com a identificacao dos atos relacionados. A evidencia vem do snapshot do repositorio. A presenca no banco de homologacao ainda precisa ser confirmada.

## Incremento 03 - base dos vinculos (33.1 e 33.10)

Mapeamento Drizzle de LegalTextRelation conforme o catalogo versionado e o SQL historico. O repositorio lista os dois sentidos e inclui tipo, numero e ementa do ato relacionado. A consulta ainda precisa ser ligada ao detalhe protegido e testada em banco isolado. Cadastro de vinculos, revogacoes e homologacao seguem pendentes. Nenhuma migracao foi criada.

A acao Consultar ato agora mostra a versao mais recente, a ementa e os vinculos nos dois sentidos em uma unica visualizacao protegida. A impressao continua independente dos vinculos. Validacao local: 10 testes de persistencia em banco isolado, 2 testes de renderizacao e 4 testes de rota passaram. Cadastro de vinculos e revogacoes (33.10), build integral e homologacao seguem pendentes.

## Incremento 04 - registro de vinculos (33.10)

O formulario Vincular ato registra referencias, regulamentacoes, alteracoes e revogacoes com data de efeito e notas. Numero, tipo, esfera e orgao identificam o destino. A operacao exige permissao de edicao, rejeita autovinculos e duplicidades e grava a auditoria na mesma transacao. A consulta mostra os dados nos dois sentidos. Revogacao fica no historico do vinculo e nao altera automaticamente a situacao da norma.

Validacao local: 10 testes de persistencia, 6 de rota/renderizacao e 5 testes existentes das acoes passaram. O formulario ainda precisa de teste de navegador. Build completo, publicacao e homologacao pendentes.

## Incremento 05 - palavras ignoradas na busca (33.3)

O painel de filtros aceita uma lista por consulta, separada por espacos, virgulas ou ponto e virgula. A lista acompanha a paginacao. Os termos ignorados deixam de restringir a busca livre, inclusive no corpo da versao atual. Os filtros estruturados continuam ativos. A lista fica na URL da consulta; nao ha preferencia global persistida.

Dez testes de persistencia passaram, incluindo o caso em que uma palavra ignorada deixaria a consulta sem resultados. Teste de navegador, build completo e homologacao pendentes.

O 33.13 continua aberto. A revisao nao encontrou uma entidade de comentarios de textos legais no schema atual. A implementacao precisa de armazenamento proprio com autoria e acesso, sem usar notas de relacionamento ou comentarios de revisao do GED para outra finalidade.

## Incremento 06 - comentarios internos (33.13)

O cadastro juridico permite adicionar comentarios ao ato com permissao de edicao. A autoria vem da sessao e a gravacao da auditoria ocorre na mesma transacao. A consulta protegida exibe ate os 100 comentarios mais recentes com autor e data. A impressao e o portal publico ficam fora do fluxo.

A migracao aditiva cria LegalTextComment e foi exercitada apenas em PGlite. Testes direcionados de persistencia, rota, renderizacao e acoes passaram (23 casos). Publicacao, build completo, teste de navegador e homologacao pendentes.
