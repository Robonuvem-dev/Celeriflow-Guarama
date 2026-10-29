# Páginas públicas reais — evidência após o build de 29/10/2026

## Resultado final — revalidação das duas correções

**9/9 cenários com HTTP 200 e sem falha geométrica detectada; 12/12 painéis com `data-fit="ready"`. Código de saída do runner: 0.**

Execução em Chromium **156.0.8078.73**, sem sessão, de **2026-10-29T16:59:59.015Z** a **2026-10-29T17:00:41.621Z**. Foram repetidas exatamente as três páginas públicas nos viewports desktop **1280×720, 1366×768 e 800×600**, com Licitações/Contratos nas duas abas reais: **9 páginas, 12 aberturas de painéis e 42 screenshots** (viewport + documento completo).

| Página | 1280×720 | 1366×768 | 800×600 | Painéis executados |
| --- | --- | --- | --- | --- |
| `/portal/licitacoes-e-contratos` | HTTP 200; geometria sem falha | HTTP 200; geometria sem falha | HTTP 200; geometria sem falha | Licitações e Contratos em cada tamanho |
| `/portal/planejamento` | HTTP 200; geometria sem falha | HTTP 200; geometria sem falha | HTTP 200; geometria sem falha | Planejamento em cada tamanho |
| `/portal/portaldatransparencia/estatisticas` | HTTP 200; geometria sem falha | HTTP 200; geometria sem falha | **HTTP 200; tabela renderizada; `fit=ready`** | Estatísticas em cada tamanho |

### Regressões anteriores resolvidas no build final

1. **Menu institucional em 1280 px:** overflow horizontal do documento passou de **6 para 0 px**, nas três páginas. Nos outros tamanhos também foi **0 px**. Screenshot real de confirmação: `operational-route-2026-10-29T16-59-59-014Z-1-1.png`.
2. **Estatísticas em 800×600:** mínimo horizontal passou de **880 para 760 px**. O corpo disponível continua **800×504 px**, com **40 px de margem horizontal**, sem redução da fonte ou ocultação de colunas. Renderiza **4 linhas, 9 colunas**, fonte **13 px**, linhas **24 px**; última linha em `bottom=188`, antes do limite do corpo em `572` e do rodapé em `600`. Screenshot real: `operational-route-2026-10-29T16-59-59-014Z-9-2.png`.

Mínimos horizontais observados no build final: Licitações **600**, Contratos **710**, Planejamento **690**, Estatísticas **760 px**.

### Contagens e geometria finais

- **HTTP:** 9 respostas 200; zero respostas HTTP ≥400 registradas.
- **Runtime:** zero erros JavaScript; stderr do servidor vazio; zero falhas/bloqueios de execução no relatório.
- **Painéis:** 12 com `fit=ready`; zero overflow horizontal/vertical do corpo; zero colunas ocultas; zero cabeçalhos truncados sem acionador de acesso integral.
- **Interação:** 12/12 retornos de foco ao acionador; 12/12 probes de roda sem movimentar o documento de fundo. O `body` do portal fica bloqueado por `overflow:hidden` enquanto o modal está aberto.
- **Rodapé:** termina exatamente em `720`, `768` e `600`, respectivamente; altura **28 px**. Corpo da tabela começa em `y=68`, com alturas **624**, **672** e **504 px**.
- **Recursos necessários:** zero requisições não-prefetch bloqueadas. Foram bloqueados **159 GETs de prefetch para páginas fora do recorte revisado**, sem carregar essas páginas.
- **Dados existentes:** Licitações, Contratos e Planejamento vazios; Estatísticas com quatro linhas agregadas e contagens zeradas. Não havia 20+1 registros naturais nem outra página de dados para exercitar. Nenhum dado foi criado.
- **Escopo:** modo `--public-only`; inventário de somente três rotas. Não foi repetido o inventário administrativo nem produzida uma lista de 393 bloqueios. Autenticação administrativa/CDP não foi tentada.

### Servidor final e cleanup

Antes de parar o preview anterior, confirmou-se por CIM que **PID 11528**, informado como iniciado pelo principal, executava exatamente:

`node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100`

Somente esse PID anterior foi encerrado, conforme autorização, para eliminar o processo com build antigo em memória. Iniciou-se um único `next start` temporário sobre o build final, **PID 22104**, escutando em `127.0.0.1:3100`. O listener desse PID foi confirmado **antes e depois** dos nove cenários. A navegação manteve a origem normal **`http://app.localhost:3100`**.

O PID próprio 22104 foi encerrado no `finally`. A verificação posterior retornou **`PreviewStopped: True`**, sem listener na porta 3100. **Preview parado.** Nenhum build/dev foi executado nesta revalidação, e nenhum outro processo foi encerrado.

### Artefato e hashes SHA-256 da execução final

Build principal informado como totalmente aprovado: 14 partições, 3245 fontes, 938 validações de rotas e 95 páginas estáticas. O ensaio executou esse artefato existente, sem recompilá-lo.

| Artefato/arquivo | SHA-256 |
| --- | --- |
| `.next/BUILD_ID` — modificado em `2026-10-29T16:57:11.063Z` | `2487db8873110d0c1281cb5e28e1e1a3a2bc78f442106393c8e6427d59dab426` |
| `src/app/portal/portaldatransparencia/estatisticas/page.tsx` | `9e570822ac8fa74219aa934704b8263ec15133542d0b5182b62920f64d48f2ae` |
| `src/components/portal-institucional/PortalShell.tsx` | `a41e894ce86f1849358e8af6f52a930482cc2ced9c995eb9fb437f78c6e9994c` |
| `scripts/verify-operational-routes.mjs` | `1685b70b1437c8feb1e2597ade9fc770e3126cd4edc05aa1a91cdad31228f2c6` |
| Relatório JSON final | `63612b4f4048b1622118ce1b1b017f824c39fcb743d288625db8cd00e45a2a81` |
| Digest geométrico final | `320fc1fb64d4cfe4d07d1449ec18ee8097408a0e804037685edbbe2d3fdb96df` |

Os dois arquivos de aplicação corrigidos foram apenas lidos nesta frente para renovar os hashes da revisão do runner. No runner, acrescentou-se o recorte `--public-only` para não reconstruir o inventário administrativo. Sintaxe e ESLint direcionado passaram; a execução real retornou **0**. Não houve alteração funcional de produção, domínio, base compartilhada, autenticação ou configuração.

### Evidências finais e reprodução

Diretório: `C:\Users\thiag\AppData\Local\Temp\opencode\`

- **Relatório final:** `operational-routes-2026-10-29T16-59-59-014Z.json`.
- **Digest:** `operational-routes-2026-10-29T16-59-59-014Z-digest.json`.
- **42 screenshots:** `operational-route-2026-10-29T16-59-59-014Z-*.png`.
- **Logs deste preview:** `operational-final-next.stdout.log` e `operational-final-next.stderr.log`.

Para execução contra um preview já iniciado do build confirmado:

```powershell
$env:OPERATIONAL_ROUTES_SIZES = '1280x720,1366x768,800x600'
node scripts/verify-operational-routes.mjs --public-only --run
```

Para ler a evidência sem servidor/navegador:

```powershell
node scripts/verify-operational-routes.mjs --summary 'C:\Users\thiag\AppData\Local\Temp\opencode\operational-routes-2026-10-29T16-59-59-014Z.json'
```

O resultado final confirma as duas correções nos estados e tamanhos observados. Não certifica rotas administrativas, zoom/dispositivos móveis ou paginação de 20+1 sem dados disponíveis. Nenhuma credencial foi solicitada/exibida, e não houve login, seed ou mutação intencional.

---

## Histórico anterior às correções — execução de 15:10 UTC

**Os resultados abaixo foram superados pela revalidação final acima e permanecem como proveniência das falhas corrigidas.**

### Resultado anterior

**Executadas três páginas completas reais em Chromium 156.0.8078.73, com seus painéis de consulta, nos viewports desktop 1280×720, 1366×768 e 800×600.**

- 9 cenários com resposta **HTTP 200**.
- 12 aberturas de painéis: Licitações, Contratos, Planejamento e Estatísticas, nos três tamanhos.
- **42 screenshots**: 9 páginas + 12 painéis, cada composição em viewport e documento completo.
- **5 cenários `OBSERVED_GEOMETRY_ONLY`; 4 `OBSERVED_FAILURE`.** São observações dos dados/estados efetivamente disponíveis, não homologação global das tabelas.
- Zero erros JavaScript registrados; zero respostas HTTP ≥400 registradas; logs de erro do servidor vazios.
- 159 requisições GET de **prefetch de navegação para páginas não revisadas** foram bloqueadas; zero requisições não-prefetch bloqueadas na versão final do runner. Nenhuma dessas páginas foi carregada pelo prefetch.
- Autenticação administrativa não executada; nenhuma sessão existente foi fornecida. Nenhum login/reset, seed, mutação intencional ou alteração de configuração/autenticação foi realizado.

## Servidor e artefato

O PID 23644 informado pelo principal já não existia no início da execução, e a porta 3100 não tinha listener. O log original mostrava `Ready`, sem erro, mas não comprovava persistência do processo.

Como o build havia sido confirmado pelo principal, iniciou-se somente `next start --hostname 127.0.0.1 --port 3100`, com a porta previamente livre. A navegação utilizou o hostname normal **`http://app.localhost:3100`**. Nenhum build/dev foi executado.

Na execução final, o processo próprio **PID 11180** estava escutando em `127.0.0.1:3100` **antes e depois dos nove cenários**. Depois, apenas esse processo próprio foi encerrado no `finally` do ensaio. Nenhum processo/servidor do proprietário foi encerrado. O ensaio não deixa servidor persistente para a próxima etapa de autenticação.

Artefato utilizado:

- `.next/BUILD_ID` modificado em **2026-10-29T14:35:12.515Z**.
- SHA-256 do BUILD_ID: `70da95b749303cea06ec89c006b3f925a94d53689b0f659fde964bf5c603e3bf`.
- O runner registra hashes dos arquivos de consulta revisados; não declara, por isso apenas, equivalência de todo o servidor com toda a árvore de fontes.

## Matriz observada

| Página | 1280×720 | 1366×768 | 800×600 | Dados/painéis efetivamente vistos |
| --- | --- | --- | --- | --- |
| `/portal/licitacoes-e-contratos` | Falha: menu do portal +6 px horizontal | Sem falha geométrica detectada | Sem falha geométrica detectada | Licitações: 0 registros, 6 colunas. Contratos: 0 registros, 7 colunas. As duas abas reais foram abertas. |
| `/portal/planejamento` | Falha: menu do portal +6 px horizontal | Sem falha geométrica detectada | Sem falha geométrica detectada | 0 publicações, 7 colunas. Estado vazio real. |
| `/portal/portaldatransparencia/estatisticas` | Falha: menu do portal +6 px horizontal; painel cabe | Sem falha geométrica detectada | **Falha: `data-fit="conflict"`, tabela indisponível** | 4 linhas agregadas e 9 colunas nos dois tamanhos maiores; contagens de pedidos zeradas. Em 800 px o conflito impede renderização da tabela. |

Não havia 20+1 registros naturais nessas consultas. Não se criaram dados para simular a linha 20 ou uma segunda página. Os controles de última página estavam desabilitados no conjunto disponível; a mudança de página com registros reais permanece sem evidência neste ensaio.

## Problema 1 — Estatísticas não cabe em desktop 800×600

**Reproduzido na página real, com screenshot de viewport.**

- Página: `/portal/portaldatransparencia/estatisticas`.
- Acionador normal: `Abrir tabela — Pedidos recebidos no exercício 2026`.
- Dispositivo classificado pelo próprio componente: **desktop**, não tablet por largura.
- Surface: `(0, 0, 800, 600)`; padding da surface e do `main` operacional: **0 em todos os lados**.
- Header: 36 px; faixas acima da tabela totalizam 68 px; rodapé de 28 px.
- Corpo disponível: **800×504 px**, em `x=0, y=68`, até `bottom=572`.
- Mínimo requerido: **880×504 px**.
- Resultado: **faltam 80 px na horizontal; altura é suficiente**.
- `data-fit="conflict"`; `table=null`; nenhuma linha/coluna é renderizada. A tela exibe a mensagem de área insuficiente.
- O rodapé continua em `y=572`, `height=28`, `bottom=600`, e anuncia quatro registros, embora a tabela esteja bloqueada pelo conflito.

Origem a revisar pelo principal: configuração das nove colunas em `src/app/portal/portaldatransparencia/estatisticas/page.tsx:24`, somando **880 px de mínimos**. Não é perda de altura por padding do PortalShell: o painel realmente ocupa toda a largura e dispõe dos 504 px verticais exigidos. A adaptação de domínio não foi modificada nesta frente.

Screenshot do viewport:

`operational-route-2026-10-29T15-10-54-784Z-9-2.png`

## Problema 2 — menu institucional extrapola 6 px em 1280×720

**Reproduzido nas três páginas antes de abrir os painéis.**

- `document.documentElement.scrollWidth - innerWidth = 6`.
- Em 1366×768 e 800×600, o overflow horizontal observado foi **0**.
- Witness do DOM: último `LI` da navegação institucional, classes `ml-auto flex shrink-0 items-stretch border-l border-white/20`.
- `LI`: `x=1232.578125`, `width=53`, `right=1285.578125` para viewport de 1280 px.
- Link filho: `x=1233.578125`, `width=52`, mesmo `right=1285.578125`.
- `UL` pai: `hidden flex-nowrap items-stretch xl:flex`, `x=16`, `width=1248`, `right=1264`.
- O último item ultrapassa a caixa do `UL` em cerca de 21.58 px e o viewport em cerca de 5.58 px, arredondados para **6 px** no scrollWidth.

Origem a revisar pelo principal: `src/components/portal-institucional/PortalShell.tsx:500` e `:560–561`, navegação `xl:flex` sem quebra e último item de mapa do site sem shrink. O runner somente mediu os elementos; não alterou esse componente compartilhado.

Screenshot de página em 1280×720:

`operational-route-2026-10-29T15-10-54-784Z-1-1.png`

## Geometria dos painéis

Todos os painéis ocupam `(0,0,width,height)`, sem padding adicional no workspace/main operacional.

| Viewport | Corpo real da tabela | Rodapé real |
| --- | --- | --- |
| 1280×720 | `x=0, y=68, width=1280, height=624` | `y=692, height=28, bottom=720` |
| 1366×768 | `x=0, y=68, width=1366, height=672` | `y=740, height=28, bottom=768` |
| 800×600 | `x=0, y=68, width=800, height=504` | `y=572, height=28, bottom=600` |

Mínimos horizontais observados: **Licitações 600, Contratos 710, Planejamento 690, Estatísticas 880 px**. Há `fit=ready` em **11 das 12 aberturas**; a exceção é Estatísticas em 800 px.

Nas tabelas renderizadas: zero colunas ocultas, zero cabeçalhos truncados sem acesso integral e zero overflow horizontal/vertical do corpo. Estatísticas, nos dois tamanhos maiores: **4 linhas de 24 px**, fonte de célula **13 px**, última linha em `bottom=188`, acima dos limites do corpo e do rodapé. Nos estados vazios não se inferiu fonte/altura de linhas inexistentes.

### Documento de fundo e correção do runner

Os documentos institucionais têm altura maior que o viewport. O runner inicial interpretava isso incorretamente como overflow de uma tabela desktop dentro do modal.

Na versão final, os fatos são registrados separadamente:

- Ao abrir o painel, o `body` fica com **`overflow-x:hidden; overflow-y:hidden`**.
- Nos **12 probes de roda**, `scrollX/scrollY` do documento permaneceram inalterados durante o painel aberto.
- Nos **12 fechamentos**, o foco voltou ao acionador real.
- Surface, tabela e rodapé ativos foram medidos dentro do viewport. A rolagem do documento de fundo não é usada para tornar acessível a tabela.
- A extrapolação horizontal do menu na página sem modal continua sendo uma falha independente, devidamente reportada.

Capturas `*-full-document.png` incluem o documento institucional atrás do modal e **não representam só o viewport**. Para avaliar o encaixe do painel, usar a captura sem esse sufixo e as coordenadas JSON. O runner agora guarda ambos os tipos explicitamente.

## Evidências

Diretório: `C:\Users\thiag\AppData\Local\Temp\opencode\`

- **Relatório final:** `operational-routes-2026-10-29T15-10-54-784Z.json`.
- **Digest geométrico:** `operational-routes-2026-10-29T15-10-54-784Z-digest.json`.
- **Screenshots finais:** `operational-route-2026-10-29T15-10-54-784Z-*.png` — 42 arquivos.
- **Self-test final:** `operational-routes-2026-10-29T15-10-49-309Z.json`.
- Logs próprios do `next start`: `operational-routes-owned-next.stdout.log` / `.stderr.log`.

Os ensaios intermediários `15-05-09` e `15-08-00` foram preservados. O primeiro contém falsos positivos de documento de fundo; o segundo também bloqueava os metadados estáticos `src/app/icon.png` e `src/app/favicon.ico`. O runner passou a permitir somente esses arquivos estáticos existentes; o ensaio final não tem bloqueios de recursos necessários, apenas prefetch de outras páginas mantido proibido.

Para imprimir o resumo sem abrir navegador/servidor:

```powershell
node scripts/verify-operational-routes.mjs --summary 'C:\Users\thiag\AppData\Local\Temp\opencode\operational-routes-2026-10-29T15-10-54-784Z.json'
```

## Próxima execução e limites

O principal pode manter um `next start` em terminal persistente e, depois, expor o Chrome local em CDP 9225 para uma sessão já autenticada da origem exata. O runner não cria sessão/credencial e não elimina os bloqueios de GETs com gravação. Não há evidência de autenticação administrativa nesta execução.

Depois de corrigidos os dois problemas de aplicação, repetir somente os cenários afetados no novo build confirmado. Caso se alterem arquivos da cadeia pública com hash fixado no runner, a revisão deve ser atualizada após inspeção individual; não se desabilita a proteção em massa.

Somente `scripts/verify-operational-routes.mjs` e documentação própria foram modificados nesta execução. Sintaxe, ESLint e self-test do runner passaram. A execução real terminou com código 2 devido às falhas registradas, como esperado. Nenhuma alteração de shared/domain, banco, host/env/configuração, autenticação, build ou dev foi feita por esta frente.
