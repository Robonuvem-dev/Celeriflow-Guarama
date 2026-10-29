# Homologação de páginas reais — execução somente leitura

## Atualização — páginas públicas executadas após o build

O principal confirmou o build e o novo artefato foi executado em `next start`, sem novo build/dev. As três páginas públicas revisadas foram navegadas nos três tamanhos solicitados: **9 cenários HTTP 200, 12 aberturas de painéis e 42 screenshots reais**. Resultado: **5 observações geométricas sem falha detectada, 4 cenários com falha**, correspondentes a dois problemas distintos. Relatório completo e medidas em [rotas-publicas-execucao.md](rotas-publicas-execucao.md).

Os bloqueios de servidor abaixo são o histórico da primeira tentativa, não a situação da execução pública posterior. A homologação administrativa continua pendente de sessão existente e revisão dos GETs com efeitos colaterais.

## Resultado da primeira execução — 29/10/2026

**Homologação das páginas completas: bloqueada, sem aprovação visual.**

Foi entregue `scripts/verify-operational-routes.mjs`. O runner lê os manifestos atuais, mantém uma linha por rota e pode abrir páginas reais de um servidor já iniciado, usando Chromium, screenshots e medidas de DOM. Não usa a fixture da base como substituto das páginas.

### Evidências efetivamente obtidas

- Inventário offline: **321 registros de workspace, 78 registros de painéis, 393 rotas únicas**. Há sobreposição entre registros; esses números não são contagem de tabelas homologadas.
- As cinco declarações `operationalPanelRoutes` foram incluídas, além dos 12 manifestos de módulos.
- O inventário registra arquivo da página, SHA-256, parâmetros dinâmicos, metadados dos manifestos e indícios conservadores de efeitos colaterais.
- Três cadeias públicas foram revisadas para leitura: Planejamento, Licitações/Contratos e Estatísticas de pedidos. Os arquivos revisados têm hashes fixados no runner. Se mudarem, sua elegibilidade é suspensa.
- `Get-NetTCPConnection -State Listen`: nenhum listener de servidor Next; os listeners locais inspecionados pertenciam a outros aplicativos/serviços. Nenhum processo existente foi encerrado.
- O Chrome normal em execução não tinha `--remote-debugging-port`; os listeners verificados não pertenciam a Chrome. Não havia sessão acessível via CDP. Nenhum perfil de navegador foi copiado, desbloqueado ou encerrado.
- Tentativa real do runner contra `http://app.localhost:3100`: **`APP_NOT_REACHABLE_AT_CONFIGURED_ORIGIN`, `ECONNREFUSED`**. Nenhuma resposta de página/consulta de negócio foi recebida.
- O artefato `.next/BUILD_ID` inspecionado tem modificação em **2026-10-28T18:09:50.687Z**. Isso não comprova conclusão do build novo. O runner não inicia build/dev/start e não modifica `.next`.
- **Páginas reais visitadas: 0. Screenshots reais: 0. Tabelas homologadas: 0.** Também não foi possível executar as páginas públicas, pois não havia servidor disponível.

Relatório da última tentativa com diagnóstico de rede:

`C:\Users\thiag\AppData\Local\Temp\opencode\operational-routes-2026-10-29T13-30-51-589Z.json`

O runner sempre informa no terminal o caminho do JSON correspondente à nova execução. Relatórios e screenshots ficam fora do repositório no diretório temporário aprovado, salvo escolha explícita de outro diretório já existente.

## Por que GET-only não garante banco read-only

A inspeção encontrou gravações no próprio caminho de renderização. Exemplos concretos:

| Página | Operação encontrada |
| --- | --- |
| `src/app/app-domain/tributacao/domicilio-tributario/page.tsx` | `ensureTributarioS3Defaults(databaseConnection)` |
| `src/app/app-domain/tributacao/divida-ativa/page.tsx` | `ensureS9Defaults(...)` |
| `src/app/app-domain/saude/pronto-atendimento/page.tsx` | `ensureRiskProtocols(context)` |
| `src/app/app-domain/atendimento/chamados/[id]/page.tsx` | `db.insert(ticketAuditLogs)` ao visualizar |
| `src/app/app-domain/atendimento/ouvidoria/[id]/page.tsx` | inserção de auditoria de visualização/identidade |
| `src/app/app-domain/sst/aso/page.tsx` | `writeAuditEvent(...)` na listagem |
| `src/app/app-domain/sst/questionarios/[id]/page.tsx` | auditoria de visualização/impressão |
| `src/app/app-domain/cemiterios/relatorio/page.tsx` | `recordCemeteryReport(...)` |

O detector do plano é conservador e também encontra ações aninhadas que só rodariam por submit; **não é prova de que todo indício seja uma escrita ao abrir**. Tampouco a ausência de indício prova que a cadeia transitiva é somente leitura. Por isso, páginas administrativas não revisadas ficam bloqueadas, mesmo com uma sessão válida.

Nenhum SQL foi executado diretamente por este trabalho. O runner não importa clientes ORM nem usa credencial de serviço para descobrir IDs. Para as três páginas públicas elegíveis, foram inspecionadas as funções de leitura chamadas e os respectivos repositórios:

- `listPlanningPublications` → `listPublishedPlanningReports`: `SELECT to_regclass`, contagem e seleção paginada de publicações.
- `getPublicBiddings` / `getPublicContracts`: seleções de registros publicados, joins e projeções com documento mascarado. A função de publicação presente no mesmo módulo não é chamada por essas páginas.
- Estatísticas: agregações por `db.select`; `PageFeedbackSummary` → `readPageFeedbackRatings`, também por seleção.
- Layout público: `getInstitutionalContact` → `readInstitutionalContact`, seleção de contato institucional.
- `pageFeedbackRetentionDays` é somente uma constante importada pela estatística. `recordPageFeedback`, que grava e aplica retenção, não é chamado nesse caminho.

**Não foi estabelecido um papel SQL read-only para o servidor existente.** Não foi alterado usuário, papel, conexão, configuração ou ambiente. A garantia desta execução é ausência de consultas/mutações de negócio realizadas; uma execução futura fica limitada às cadeias de consulta explicitamente revisadas. Rotas que escrevem no GET não são exercitadas sob esta restrição.

## Bloqueio exato de autenticação

O login administrativo normal usa Firebase `signInWithEmailAndPassword`, seguido de `POST /api/auth/session`. Esse endpoint autoriza a identidade municipal e executa `insertAuditEvent(... SESSION_LOGIN ...)` antes de gravar o cookie. O login de servidor também grava auditoria.

Não foi usado login, cadastro, reset, criação manual de cookie, Firebase Admin para fabricar sessão, troca de identidade ou bypass de tenant. Nenhuma credencial/token foi exibida. Não foi fornecido um usuário autorizado com sessão local reutilizável pelo runner.

Para execução autenticada, o proprietário pode fornecer **uma sessão local já existente**, por um contexto CDP da origem exata ou um arquivo de `storageState` já existente. O runner copia o estado somente em memória para seu próprio contexto; não navega, intercepta nem fecha as abas/contextos originais. Cookies não são transplantados de outro hostname. A autorização continua sendo a normal da aplicação.

## Execução pelo principal após o build

Primeiro, confirmar que o build principal terminou com sucesso. Não executar outro build/dev usando a mesma `.next`.

Em um terminal dedicado, depois de confirmar que a porta escolhida está livre:

```powershell
npm run start -- --hostname 127.0.0.1 --port 3100
```

O endereço de navegação deve ser **`http://app.localhost:3100`**. Esse hostname é aceito pelo proxy atual e mantém as verificações normais. O preflight do runner resolve apenas sua própria conexão para loopback, conservando `Host: app.localhost`; não edita hosts/DNS nem configuração do app.

Em outro terminal:

```powershell
node scripts/verify-operational-routes.mjs --plan
node scripts/verify-operational-routes.mjs --self-test
$env:OPERATIONAL_ROUTES_BASE_URL = 'http://app.localhost:3100'
node scripts/verify-operational-routes.mjs --run
```

Sem sessão, o runner ainda pode percorrer as três páginas públicas revisadas. A execução integral termina incompleta, pois as demais rotas continuam listadas como bloqueadas. Não há autenticação automática.

Para consumir o JSON completo de reconciliação já produzido pelo principal:

```powershell
$env:OPERATIONAL_COVERAGE_JSON = 'C:\caminho\existente\coverage.json'
node scripts/verify-operational-routes.mjs --plan
```

Esse JSON deve ser a saída integral de `scripts/verify-operational-coverage.mjs --json`. O runner acrescenta os consumidores AST de tabelas que não aparecem nos manifestos de workspace/painel, mantendo `targets` e a proveniência do relatório. Sem esse arquivo, **393 é o inventário dos manifestos, não uma alegação de cobertura de todos os consumidores de tabelas do projeto**.

### Entradas opcionais

| Variável do processo do runner | Uso |
| --- | --- |
| `OPERATIONAL_ROUTES_BASE_URL` | Origem local; hostname obrigatório `app.localhost`, padrão porta 3100 |
| `OPERATIONAL_CDP_URL` | CDP local já exposto pelo proprietário; precisa existir uma aba da origem exata |
| `OPERATIONAL_STORAGE_STATE` | Arquivo de sessão já existente; não registrar seu conteúdo em logs/git |
| `OPERATIONAL_ROUTES_OUTPUT` | Diretório de evidências já existente |
| `PLAYWRIGHT_MODULE_PATH` | Instalação existente; padrão no temporário aprovado, `node_modules/playwright-core` |
| `CHROMIUM_PATH` | Executável existente; padrão Chrome instalado |
| `OPERATIONAL_ROUTES_SIZES` | Padrão `1280x720,1366x768,800x600`; são viewports desktop, não emulação móvel |
| `OPERATIONAL_ROUTES_FILTER` | Regex para recorte explícito; não significa aprovação das rotas excluídas |
| `OPERATIONAL_COVERAGE_JSON` | JSON integral de reconciliação de consumidores AST |
| `OPERATIONAL_ROUTE_REVIEWS` | Arquivo externo de revisão de cadeias GET, descrito abaixo |

Essas variáveis são entradas do script de verificação; não são alterações de autenticação, env/configuração do app ou banco.

### Expandir a revisão somente leitura

Uma sessão não torna seguros os GETs que gravam. Para adicionar uma rota sem efeito colateral, revisar individualmente a página, layouts, loaders, caminhos de leitura e efeitos automáticos dos clientes. Guardar no arquivo externo de revisão uma entrada com caminho da rota, justificativa e hashes de todos os arquivos da cadeia revisada, incluindo a página. Exemplo de **formato**, sem autorizar uma rota fictícia:

```json
[
  {
    "pathname": "/rota-real-revisada",
    "note": "Funções chamadas e layouts inspecionados; somente SELECT, sem defaults/auditoria/efeitos de escrita.",
    "files": {
      "src/app/app-domain/rota-real-revisada/page.tsx": "SHA256_REAL",
      "src/db/repositories/caminho-real.ts": "SHA256_REAL"
    },
    "panelLabels": ["Abrir título exato do painel de consulta"]
  }
]
```

O runner verifica os hashes e rejeita páginas com indícios de escrita. `panelLabels` só aceita um acionador existente e não ambíguo, com `data-slot="dialog-trigger"` e `type="button"`. Revisões/hashes não são prova obtida por SQL nem devem ser preenchidos em massa. Rotas com efeitos colaterais continuam bloqueadas; não se altera o aplicativo para contornar a restrição.

IDs dinâmicos são descobertos apenas por links da mesma origem, em páginas de leitura elegíveis, sem tentativa de IDs inventados. Falta de link autorizado gera `BLOCKED_NO_AUTHORIZED_SAME_APP_LINK_ID`. Não se fazem SELECTs privilegiados para contornar sessão/RBAC. O inventário e a revisão devem incluir a rota ancestral onde o link existe.

## O que será medido nas páginas reais

- Screenshot da composição inteira e de cada painel público aberto; abas hash de Licitações/Contratos são percorridas pelos links reais.
- Geometria do `body`, `main`, workspace/surface, paddings, viewport da tabela, tabela, linha 20/última linha, rodapé e overflow real.
- Colunas presentes/ocultas, cabeçalhos truncados sem acesso integral, fonte e altura das linhas.
- Última página de dados existentes por botão/link real, quando disponível; comparação da posição do rodapé antes/depois.
- Retorno do foco após fechar o painel.
- Estado vazio e linha 20 apenas quando realmente presentes; não são criados registros para produzir 20+1.

O tráfego do contexto de teste permite somente GET/HEAD da origem local, páginas elegíveis e arquivos estáticos locais existentes; Server Actions, POST/PUT/PATCH/DELETE, APIs não revisadas, WebSockets e tráfego externo são bloqueados. O script não clica salvar, emitir, excluir, exportar, assinar ou qualquer ação de negócio. Respostas de APIs e corpos HTML não são gravados em logs. URLs dinâmicas e erros arbitrários são armazenados como hashes; cookies, cabeçalhos e tokens não são serializados no relatório.

`OBSERVED_GEOMETRY_ONLY` significa somente que a geometria observada não violou os checks executados. **Não significa homologação da rota inteira**. `INCOMPLETE_BLOCKED_REQUESTS`, falta de tabela, auth redirect, revisão ausente, parâmetros ausentes, erro HTTP e falhas geométricas mantêm a execução incompleta. A ausência de screenshot nunca é convertida em aprovação.

Permanecem pendentes, conforme dados/perfil disponíveis: todos os consumidores AST, variantes de query/abas além das explicitamente exercitadas, painéis administrativos com acionadores particulares, 21 registros naturais, erros reais, estados de carregamento, todas as permissões, tablets/celulares e zoom real do navegador. Alterar só viewport não comprova zoom ou classificação móvel.

### Códigos de saída

- `0`: plano/self-test concluído; ou observações solicitadas sem bloqueios detectados. Não é certificado global.
- `1`: falha interna de inventário/runner.
- `2`: execução de páginas incompleta ou com falha/bloqueio. Com as restrições atuais e inventário completo, este é o resultado esperado até resolver os bloqueios.

## Verificações do novo runner

`node --check`, ESLint direcionado e `--self-test` executados e aprovados na versão final. O self-test verifica negação de origem externa/query secreta, bloqueio dos GETs com gravações conhecidas, elegibilidade da paginação pública revisada, correspondência de parâmetros dinâmicos, métodos de escrita/Server Actions e tentativa de API se passar por imagem estática. Não inicia servidor nem acessa banco. Não houve build adicional, seed, migração, mutação, commit ou push nesta frente.

Relatório do self-test final: `C:\Users\thiag\AppData\Local\Temp\opencode\operational-routes-2026-10-29T13-29-50-745Z.json`. Houve tentativas intermediárias interrompidas por timeout durante concorrência com o auditor principal; a carga inicial de Zod foi retirada do prazo da VM, e a reexecução final passou. `git diff --no-index --check` dos dois arquivos novos também não encontrou erros de whitespace.
