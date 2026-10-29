# Navegador — base operacional

## Resultado executado

**318 casos aprovados, 0 falhas na execução final**, em Chrome real headless, com React interativo, CSS atual da aplicação e dados controlados.

- Início: `2026-10-29T12:18:01.211Z`; término: `2026-10-29T12:20:31.051Z`.
- Chrome: `156.0.8078.73`, executável `C:/Program Files/Google/Chrome/Application/chrome.exe`.
- Dependências locais: Next `16.4.3`, React `19.2.4`, Tailwind `4.3.2`; esbuild e Playwright Core já disponíveis.
- Verificação estática dos dois arquivos de teste: ESLint, exit **0**.

```text
Browser 156.0.8078.73; 30 module configurations; actual Tailwind + CSS Module + cached Inter.
...
{"total":318,"passed":318,"failed":0,"report":"C:\\Users\\thiag\\AppData\\Local\\Temp\\opencode\\operational-browser-results.json"}
```

Esta evidência homologa **o comportamento da base comum na composição isolada descrita abaixo**. Não homologa as páginas completas dos módulos, seus DTOs, consultas, permissões, filtros de domínio ou mutações.

## Implementação e reprodução

Arquivos persistentes:

- `scripts/verify-operational-browser.mjs`: compila a fixture, inicia servidor HTTP em `127.0.0.1` com porta efêmera, abre navegador real, aplica assertions e retém JSON/screenshots. Retorna exit 1 quando uma assertion falha.
- `tests/operational-browser-fixture.tsx`: monta **OperationalWorkspace → OperationalListFrame → OperationalTable + OperationalPagination**, com **OperationalTablePanel / OperationalSurface** e diálogos reais da Base UI. A massa contém 21 registros: página 1 com 20 e página 2 com 1.

Comandos:

```powershell
node scripts/verify-operational-browser.mjs
node scripts/verify-operational-browser.mjs --summary
npm exec --no -- eslint scripts/verify-operational-browser.mjs tests/operational-browser-fixture.tsx
```

Opções por ambiente:

| Variável | Uso |
|---|---|
| `PLAYWRIGHT_MODULE_PATH` | Caminho para instalação existente de Playwright/Playwright Core. Padrão deste ambiente: `%LOCALAPPDATA%/Temp/opencode/node_modules/playwright-core` |
| `CHROMIUM_PATH` | Executável existente; também há descoberta de Chrome e dos Chromium locais conhecidos |
| `OPERATIONAL_CDP_URL` | Conexão opcional a CDP existente |
| `OPERATIONAL_BROWSER_OUTPUT` | Diretório **existente** para JSON/screenshots; padrão `%LOCALAPPDATA%/Temp/opencode` |
| `OPERATIONAL_BROWSER_FILTER` | Regex para executar um subconjunto. O relatório reflete apenas os casos efetivamente executados |

Exemplo de rechecagem de interação:

```powershell
$env:OPERATIONAL_BROWSER_FILTER = 'full-Unicode|panel-nested|phone/[0-9]'
node scripts/verify-operational-browser.mjs
$env:OPERATIONAL_BROWSER_FILTER = ''
```

### Isolamento e CSS

- `AGENTS.md` e os guias locais Next `01-app/03-api-reference/01-directives/use-client.md` e `01-app/01-getting-started/11-css.md` foram consultados.
- Portas CDP usuais `9222`, `9223` e `9224` não responderam; os listeners locais verificados não expuseram Chrome CDP. A execução final abriu sua própria instância isolada.
- O servidor entrega somente fixture, JS/CSS, favicon e fontes locais. Requisições externas são bloqueadas e reportadas. Resultado final: **0 erros de página, 0 respostas HTTP ≥400, 0 tentativas externas**.
- `src/app/globals.css` foi compilado do código atual com `@tailwindcss/postcss`. `operational.module.css` foi compilado como CSS Module por esbuild. Isso inclui as utilities importantes `h-dvh!`, `w-dvw!`, `p-0!` e os estilos reais de diálogo/painel.
- As faces Inter de `next/font` foram reutilizadas do cache `.next/static`; ao menos a face latina foi confirmada como **loaded** pelo navegador. O runner exige esse cache para evitar declarar geometria representativa com fonte substituta. O CSS operacional não é extraído de um build antigo.
- Adaptações exclusivas da fixture: `next/link` vira âncora com navegação suprimida, `next/image` vira `img` local e `next/navigation` fornece caminho controlado. Componentes operacionais, ícones, hooks de dispositivo, algoritmos de largura e primitives de diálogo permanecem reais.
- Os manifestos de todos os módulos são importados. Esses manifestos também alcançam helpers puros de navegação/política/decimal, sem abrir conexão de banco.
- Material: declarações `fields` e `columns` extraídas por AST de `MaterialCatalogTable.tsx`. Resumo: labels extraídos de `AnnualSummaryClient.tsx`, com a conversão `configuration` extraída por AST de `TaxOperationalTable.tsx`. Nenhum componente de domínio com Server Actions é carregado.
- Ações de linha e de cabeçalho alteram contadores locais. O catálogo Material exercita três ícones na coluna de 92 px; unidades exercita dois na coluna fixa de 64 px.

## Cobertura dos módulos

Todos os **30 registros** de `src/components/app-ui/operational/modules/index.ts` foram montados com sua navegação e identidade reais, usando o schema comum de unidades. Em cada registro foram verificadas quantidade de links, classificação do dispositivo, 20/1 linhas, colunas, fonte, geometria, rodapé e acesso integral aos cabeçalhos recortados.

| Grupo de casos | Quantidade |
|---|---:|
| 30 registros × 6 tamanhos desktop × páginas 20/1 no mesmo caso | 180 |
| 30 registros × 2 tamanhos tablet × páginas 20/1 | 60 |
| 30 registros × 2 tamanhos celular × páginas 20/1 | 60 |
| Schemas largos Material/Resumo em desktop | 2 |
| Desktop estreito e fronteira de 702 px | 1 |
| Variantes adicionais de UA/toque | 4 |
| Resize, persistência, reset e ações | 1 |
| Unicode, cópia e foco do popup | 1 |
| Acesso aos cabeçalhos recortados | 1 |
| Painel e popup aninhado | 1 |
| Carregamento, erro/retry e vazio | 1 |
| Interações completas em tablet/celular, quatro tamanhos | 4 |
| Tablet com rolagem horizontal e vertical efetivas | 1 |
| Erros de runtime/rede e carregamento de fonte | 1 |
| **Total** | **318** |

Registros efetivamente percorridos:

```text
administracao, cadastros,
compartilhados-planejamento, compartilhados-planejamento-camara,
compartilhados-cemiterios-estrutura, compras, documentos, configuracoes,
atendimento, auditoria, camara, cemiterios, cultura, seguranca,
protocolos, transparencia, financeiro, controle-interno, patrimonio,
obras, frotas, rh, sst, saneamento, meio-ambiente, saude,
portal-servidor, social, educacao, tributacao
```

“Todos os módulos” nesta matriz significa todos esses registros montados na **base controlada**. Não significa que todos os schemas ou todas as rotas desses módulos foram abertos.

## Medidas desktop

Unidades: 8 colunas, mínimo **702 px**, cabeçalho de tabela + 20 linhas = **504 px**. Workspace com menu recolhido de **56 px**, header de 36 px e toolbar de 32 px. Coordenadas em pixels CSS, origem no viewport.

Seletores medidos:

- Corpo disponível: `[data-operational-table]`.
- Linha final: `[data-operational-row]:last-child`.
- Rodapé: `[data-operational-pagination]`.
- Classificação: `[data-operational-workspace][data-device]`.

| Viewport desktop | Corpo disponível W×H | Tabela W×H | Bottom linha 20 | Rodapé top–bottom | Overflow documento X/Y | Overflow tabela X/Y |
|---|---:|---:|---:|---:|---:|---:|
| 1920×1080 | 1864×984 | 1864×504 | 572 | 1052–1080 | 0/0 | 0/0 |
| 1440×900 | 1384×804 | 1384×504 | 572 | 872–900 | 0/0 | 0/0 |
| 1366×768 | 1310×672 | 1310×504 | 572 | 740–768 | 0/0 | 0/0 |
| 1280×720 | 1224×624 | 1224×504 | 572 | 692–720 | 0/0 | 0/0 |
| 1366×650 | 1310×554 | 1310×504 | 572 | 622–650 | 0/0 | 0/0 |
| 800×600 | 744×504 | 744×504 | 572 | 572–600 | 0/0 | 0/0 |

Nos seis tamanhos, `data-fit="ready"`, **13 px de fonte, 24 px por linha**, oito colunas visíveis. Na página 2, linha única em `y=92`, bottom **116**, e o retângulo do rodapé fica idêntico ao da página 1. Essa mesma matriz foi aprovada para cada um dos 30 registros.

### Desktop estreito não se torna celular

Com UA Windows, `data-device="desktop"` foi preservado em 390×844, 683×384, 758×600 e 757×600.

- **758×600**: área útil de largura 702 px → tabela pronta.
- **757×600**: área útil de largura 701 px → conflito explícito.
- **390×844** e **683×384**: conflito explícito, sem inferir celular pela largura.

Variantes adicionais: Windows com cinco pontos de toque continuou desktop; Macintosh com cinco pontos de toque foi tablet; Android sem `Mobile` foi tablet; Android com `Mobile` foi phone. Os contextos iPad/iPhone também mantiveram a classe nas duas orientações.

## Schemas largos em 1280×720

| Configuração real extraída | Colunas | Mínimo | Tabela | Linha 20 bottom | Rodapé top–bottom | Overflow documento/tabela |
|---|---:|---:|---:|---:|---:|---|
| Material | 13 | 890 px | 1224×504 | 572 | 692–720 | 0 em ambos os eixos |
| Resumo anual | 23 | 960 px | 1224×504 | 572 | 692–720 | 0 em ambos os eixos |

Fonte de 13 px e linhas de 24 px mantidas; nenhuma coluna removida. Página 2 com uma linha e rodapé na mesma posição.

No resumo, **22 dos 23 cabeçalhos ficaram visualmente recortados**. Cada um preservou `th[aria-label]` e o botão de detalhes; os 22 botões foram abertos e o conteúdo integral do diálogo foi comparado ao label original, com retorno de foco. Portanto, o resultado comprova **acesso integral**, não exibição simultânea de todos os labels completos. Em particular, a prévia de `Lançado R$` teve apenas 7 px disponíveis.

### Último redimensionador: correção confirmada

Arquivo: `src/components/app-ui/operational/operational.module.css`, regra `.table th:last-child .resize`.

Seletor medido em Resumo:

```css
th:last-child button[aria-label="Ajustar largura de Lançamentos inadimplentes"]
```

- Último `th`: `x=1229`, `y=68`, `width=51`, `right=1280`.
- Botão: `x=1268`, `y=68`, `width=12`, `height=24`, `right=1280`.
- CSS calculado: **`right: 0px`**.
- `elementFromPoint` no centro encontrou o próprio botão.
- Resize por seta e por arraste real do mouse alterou a última coluna, com restauração por Home.

**O avanço de 12 px para fora da tabela não foi reproduzido na base observada.** A correção já existente foi apenas verificada.

## Tablet e celular

Geometria antes de rolar, página com 20 registros:

| Dispositivo / viewport | Largura útil / tabela | Bottom linha 20 | Rodapé no documento | Overflow X documento / tabela | Overflow Y documento / tabela | Linha / fonte |
|---|---:|---:|---:|---:|---:|---:|
| Tablet 768×1024 | 712 / 712 | 572 | 996–1024 | 0 / 0 | 0 / 0 | 24 / 13 |
| Tablet 1024×768 | 968 / 968 | 572 | 740–768 | 0 / 0 | 0 / 0 | 24 / 13 |
| Phone 390×844 | 334 / 702 | 744 | 788–844 | 0 / **368** | 0 / 0 | 32 / 13 |
| Phone 844×390 | 788 / 788 | 744 | 744–800 | 0 / 0 | **410** / 0 | 32 / 13 |

- Phone retrato: `scrollLeft` real chegou a **368**, expondo a última coluna; documento sem overflow horizontal.
- Phone paisagem: rolagem vertical alcançou o rodapé; a tabela não foi cortada para caber nos 390 px de altura.
- A página 2 mantém a posição do rodapé **no documento**. Em paisagem, a rolagem de 410 px é preservada após paginar: a linha 21 fica em `y=-306`, bottom `-274` no viewport, equivalente a `y=104`, bottom `136` no documento. É necessário rolar para cima para ler essa linha; esta suíte não exige autoscroll ao paginar.
- Tablet com unidades não precisou rolar nos dois tamanhos pedidos. Para comprovar os dois eixos permitidos, o resumo de 23 colunas foi exercitado em **768×500**: tabela de 960 px em área de 712 px, `scrollLeft=248`; documento com 100 px excedentes e `scrollY=100`, rodapé alcançável. `data-fit="ready"`, sem overflow horizontal do documento nem clipping vertical interno.
- Painéis reais foram abertos nos quatro tamanhos mobile e seus rodapés alcançados por rolagem. Expansão de menu abaixo de 960 px usou overlay com main `inert`; Escape recolheu e devolveu foco ao botão.

## Interações verificadas

### Larguras, ícone condicional e utilitários

Em 1366×768, colunas iniciais:

```text
[161, 297, 174, 119, 250, 135, 110, 64]
```

- Rua passou de **297 → 112 px** por teclado e seu botão de texto integral apareceu.
- Recarregar o navegador preservou as larguras salvas.
- Reset do header restaurou as larguras originais e removeu o ícone quando o texto voltou a caber.
- Arraste real levou Rua a **367 px**, mantendo total **1310 px**, e Home restaurou a grade.
- A coluna utilitária permaneceu em **64 px**. Seus botões de 24×24 ficaram em `x=1308…1332` e `x=1336…1360`, dentro da célula `x=1302…1366`.
- Editar, Histórico e a ação geral do header incrementaram os contadores controlados. Nenhuma mutação de domínio foi executada.

### Texto completo Unicode, popup e painel

Valor controlado: **6630 unidades UTF-16**, contendo acentos, quebras de linha, espaços finais, caracteres combinantes, família com ZWJ, bandeira, CJK e árabe.

SHA-256 do texto integral:

```text
ea243f7658de97891cbe147d9ec5efa41d9bc00585ae8b743bfedd8c7cf25ac7
```

| Contexto | Trechos percorridos | Popup W×H | Overflow interno X/Y |
|---|---:|---:|---:|
| Desktop 1366×768 | 16 | 672×420 | 0/0 |
| Painel desktop 1280×720, popup aninhado | 16 | 672×420 | 0/0 |
| Tablet 768×1024 | 16 | 672×420 | 0/0 |
| Tablet 1024×768 | 16 | 672×420 | 0/0 |
| Phone 390×844 | 17 | 374×420 | 0/0 |
| Phone 844×390 | 19 | 672×374 | 0/0 |

Em todos: concatenação dos trechos igual ao valor original, limites de grafemas preservados, clipboard real contendo o valor inteiro, foco inicial em Fechar, tabulação contida no popup e foco final no acionador. No painel desktop também foram exercitadas 20 tabulações, popup aninhado e paginação 20/1. Sua surface mediu **1280×720**, tabela **1280×504**, rodapé **692–720**.

Carregamento, erro, retry e estado vazio também preservaram o retângulo do rodapé. O retry voltou a 20 linhas e o vazio mostrou `0–0 de 0`.

## Falhas e interpretação da execução

**Nenhuma falha da base foi reproduzida pelas assertions da execução final.**

A primeira passagem do harness teve três reprovações de teste, investigadas antes da execução final:

1. Tabulação consultada antes do redirecionamento assíncrono do focus guard da Base UI. A checagem passou a aguardar o foco estabilizado, com timeout de 1,5 s e falha se permanecesse fora do popup.
2. Foco após fechar painel mobile consultado antes do fim da animação/unmount. A checagem passou a aguardar o desaparecimento da surface e então confirmar o retorno ao acionador.
3. Rodapé comparado em coordenadas de viewport antes/depois de um scroll de 410 px. A comparação mobile passou a usar coordenadas do documento; desktop continua exigindo rodapé na borda inferior do viewport e overflow zero.

Esses ajustes foram feitos somente no harness. Não representam correções de produto. O recorte de labels do resumo e a preservação do scroll em phone paisagem estão registrados nas seções anteriores, sem convertê-los em afirmação de legibilidade simultânea ou de navegação automática.

## Artefatos e identificação do código exercitado

Diretório local da evidência: `C:\Users\thiag\AppData\Local\Temp\opencode`.

- `operational-browser-results.json`: 318 casos, retângulos de linhas/tabelas/rodapés, resizers, ações, UAs, erros e hashes das fontes.
- `operational-browser-evidence.json`: digest gerado por `--summary`, com medidas selecionadas e interações.
- `operational-browser-material-1280.png` e `operational-browser-summary-1280.png`: capturas da página 2 com um registro.
- `operational-browser-tablet-768x1024.png`, `operational-browser-tablet-1024x768.png`.
- `operational-browser-phone-390x844.png`, `operational-browser-phone-844x390.png`.

Os PNGs `operational-browser-failure-*` eventualmente presentes no diretório temporário são da primeira passagem do harness; **não** são falhas da execução final.

Hashes SHA-256 relevantes da execução final:

| Fonte | SHA-256 |
|---|---|
| `src/components/app-ui/operational/operational.module.css` | `dc701db8ea1a9ab19468aa62028f5aef429cfcbd13d7c3b118eb334b2be75eb4` |
| `src/components/app-ui/operational/OperationalTable.tsx` | `7510362217efddeeb90be1e2f92d99696722cf805f4c626d04d0541afbbf7197` |
| `src/components/app-ui/operational/OperationalWorkspace.tsx` | `16414052b9798adb2da588159bb0f16b74d4ef2e823422b4c3d1fa51a266d231` |
| `src/components/app-ui/operational/OperationalTablePanel.tsx` | `f7c416e7490d2f212cb0094affeebbb99261398028f00d83fcf59f336dbdbac1` |
| `src/app/globals.css` | `35f57242e6f739a14734fdfdba367fa150682dcb4772fcef968e03cc42e64198` |

Nenhum build, npm ci, acesso DB/auth, commit ou edição da base compartilhada/domínio foi realizado nesta tarefa. A conclusão é restrita a navegador Chromium, escala CSS padrão e composição isolada; o ensaio não é prova de zoom nativo, WebKit/Firefox, hidratação SSR ou funcionamento das rotas autenticadas.
