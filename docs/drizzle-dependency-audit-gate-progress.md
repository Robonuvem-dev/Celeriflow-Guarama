# Gate de dependências — pesquisa e candidato isolado

## Resultado em 28/10/2026

**O candidato isolado passa em `npm audit --omit=dev --audit-level=high`: exit 0, zero high e zero critical, com oito apontamentos moderate.** Isso demonstra a resolução do gate para esse manifest/lock; não demonstra compatibilidade funcional nem significa que as correções foram aplicadas ao projeto.

O audit-base é `.agent/drizzle-current-dependency-audit.json`: **40 pacotes apontados, 26 high, 2 critical, 11 moderate e 1 low**. Esses totais contam pacotes, inclusive propagação de problemas transitivos, e não advisories independentes. O gate obrigatório está em `.github/workflows/ci.yml:39`, após os testes e o build.

Artefatos gerados exclusivamente em:

```text
C:\Users\trici\AppData\Local\Temp\opencode\drizzle-audit-candidate\
  package.json
  package-lock.json
  audit-production.json
  audit-all.json
  .npm-cache\
```

O candidato usa os dois manifests copiados do projeto e alterações explícitas em seu `package.json`. A geração utilizou **Node 24.21.0 / npm 11.19.0**; o CI usa **Node 22**. Não foi criada uma instalação `node_modules` no candidato. As versões nativas foram resolvidas no lock, sem executar scripts ou carregar binários.

| Evidência | Resultado |
| --- | --- |
| `npm install --package-lock-only --ignore-scripts --no-fund --no-audit --cache .npm-cache` | exit 0 |
| `npm audit --omit=dev --audit-level=high --json --cache .npm-cache` | **exit 0**; 0 high, 0 critical, 8 moderate |
| `npm audit --json --cache .npm-cache` | exit 1; 8 high, 1 critical, 15 moderate, 1 low: **25 pacotes no audit completo** |
| Prisma no lock candidato | Nenhum nó `prisma`/`@prisma/*`; 133 caminhos do lock-base removidos no total |
| Diretos preservados no lock | Blob **2.6.1**, Firebase **12.17.0**, Admin **14.2.0**, ExcelJS **4.4.0**, Mammoth **1.12.0**, React/DOM **19.2.4** |

A retirada das quatro dependências Prisma é **uma premissa simulada do candidato**, a ser aplicada pelo parent quando a migração permitir: `@prisma/adapter-neon`, `@prisma/client`, `prisma` e o dev `@prisma/adapter-pg`. A instalação principal continua necessária aos consumidores legados ainda existentes.

## Grafo físico e correções das hipóteses iniciais

Foram confrontados `package-lock.json`, os `package.json` efetivamente instalados, os nós informados pelo audit e `npm explain @grpc/grpc-js @fastify/busboy zod --json`.

- **gRPC persiste sem Prisma/shadcn.** `firebase@12.17.0 → @firebase/firestore@4.17.0 → @grpc/grpc-js@1.9.16`; e `firebase-admin@14.2.0 → @google-cloud/firestore@8.7.0` opcional `→ google-gax@5.0.8 → @grpc/grpc-js@1.14.4`.
- **Busboy também persiste:** `firebase-admin@14.2.0 → @fastify/busboy@3.2.0`, faixa `^3.0.0`.
- **O CLI-config é runtime neste grafo:** `@vercel/blob@2.6.1 → @vercel/oidc@3.8.0 → @vercel/cli-config@0.2.0 → zod@4.1.11` exato. Mover shadcn para dev não elimina esse Zod.
- Há dois Undici: **6.27.0 dentro do Blob**, faixa `^6.23.0`, e **7.28.0 na raiz**, também declarado dev e compartilhado com shadcn/dotenvx. Atualizar apenas o direto não corrige a cópia 6.x do Blob.
- **Shadcn é CLI sem consumidor encontrado:** a busca nos arquivos de aplicação, testes, scripts e configuração encontrou apenas `package.json`, `package-lock.json` e o URL de schema de `components.json`. Não há import, require, import dinâmico ou script npm que consuma `shadcn`. O pacote fornece o binário `shadcn → dist/index.js`; o candidato conserva **4.13.0 em dev**. Os componentes da aplicação usam suas implementações locais e outras bibliotecas, não esse CLI.
- Retirar Prisma elimina `@prisma/config → deepmerge-ts` e `mysql2`. Mover shadcn retira do grafo de produção MCP SDK, Express/body-parser/proxy-addr, ip-address, browserslist e outros utilitários do CLI. Esses nós continuam no lock de desenvolvimento quando alcançáveis por shadcn/ESLint.
- `@xmldom/xmldom@0.8.13` vem de `mammoth@1.12.0`, não de Prisma. Não foi encontrado import de Mammoth nos fontes/scripts pesquisados, mas ele permanece declarado em produção; o candidato corrige a folha e conserva seu contrato declarado.

## Versões exatas e limites de compatibilidade

Os pisos abaixo vêm dos ranges do audit-base e, nos casos indicados nas referências, de `first_patched_version` das advisories do GitHub. As versões candidatas foram confirmadas no registry npm. Para folhas com várias advisories, adotou-se o primeiro patch que cobre também os apontamentos menores já listados, quando isso exige apenas outro patch da mesma linha.

| Pacote / caminho instalado | Pai imediato / faixa pedida | Piso relevante | Versão no candidato |
| --- | --- | --- | --- |
| `next@16.2.12` | direto exato | **16.4.1** cobre os últimos ranges `<=16.4.0` | **16.4.3**, alvo do audit; `eslint-config-next` dev alinhado em **16.4.3** |
| `sharp@0.35.3` | direto + override; Next antigo pedia `^0.34.5` | **0.35.5**, não apenas 0.35.4 | **0.35.5** no direto e no override; Next novo pede `^0.35.5` |
| `zod@4.4.3` raiz | direto `^4.4.3` | **4.6.6** | **4.6.6** exato |
| `@vercel/cli-config/node_modules/zod@4.1.11` | CLI-config 0.2.0 pede **4.1.11 exato** | **4.6.6** | override **apenas nesse pai**, `zod: "$zod"`; resolve 4.6.6 da raiz |
| `undici@7.28.0` raiz | direto dev | **7.30.1** | **7.30.1**; dev no lock final |
| `@vercel/blob/node_modules/undici@6.27.0` | Blob 2.6.1, `^6.23.0` | **6.29.1** | **6.29.1** nesse pai; preserva a linha 6.x |
| `@grpc/grpc-js@1.9.16` | Firestore 4.17.0, **`~1.9.0`** | **1.13.6** | **1.13.6**, override no Firestore; excede o minor pedido pelo pai e requer prova funcional |
| `google-gax/node_modules/@grpc/grpc-js@1.14.4` | google-gax 5.0.8, `^1.12.6` | **1.14.5** nesta linha | **1.14.5**, override nesse pai, dentro da faixa original |
| `@fastify/busboy@3.2.0` | firebase-admin, `^3.0.0` | high em **3.2.1**, CRLF moderate em **3.2.2** | **3.2.2** |
| `@xmldom/xmldom@0.8.13` | Mammoth, `^0.8.6` | **0.8.15** | **0.8.15**, sem atravessar para 0.9.x |
| `brace-expansion@1.1.18` | minimatch 3.1.5, `^1.1.7`, via ExcelJS | high em **1.1.20**, conjunto listado em **1.1.21** | **1.1.21**, seletor `@1` |
| `brace-expansion@2.1.4`, dois caminhos | minimatch 9.0.9 / 5.1.9, `^2.0.2` / `^2.0.1`, via Admin / ExcelJS | high em **2.1.6**, conjunto listado em **2.1.7** | **2.1.7**, seletor `@2` |
| `nanoid@3.3.16` | postcss 8.5.25, `^3.3.16` | **3.3.18** | **3.3.18**, seletor `@3`; mantém CJS desta linha |
| `source-map-js@1.2.1` | postcss e `@tailwindcss/node`, `^1.2.1` | **1.2.2** | **1.2.2** |
| `fast-uri@3.1.4` | cópias de AJV 8.20.0, `^3.0.1`, via MCP/conf | high até **3.1.6**, conjunto listado até **3.1.8** | **3.1.9**; dev no lock final |

O primeiro audit experimental ainda incluiu `fast-uri` com marcação compartilhada `devOptional`, embora seus pais restantes fossem de desenvolvimento. O candidato final fixa o patch 3.1.9 e o lock final o classifica como dev. A conclusão do gate utiliza o resultado real do npm, não apenas uma inferência de alcançabilidade a partir dos pais.

**Next mínimo versus candidato:** a release [16.4.1](https://github.com/vercel/next.js/releases/tag/v16.4.1) é a primeira correção dos três últimos avisos de cache/Server Actions/SVG; **16.4.3 não é o primeiro patch de segurança desses avisos**. O candidato comprova o alvo sugerido pelo audit, [16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3), que inclui correções adicionais de fontes, proxy, bootstrap e tracing. Não foi gerado um segundo candidato 16.4.1.

### Delta exato de overrides comprovado pelo resolver

Este é o objeto completo do **candidato temporário**, preservando os overrides originais de PostCSS e `jwks-rsa/jose`:

```json
{
  "postcss": "8.5.25",
  "sharp": "0.35.5",
  "@fastify/busboy": "3.2.2",
  "@firebase/firestore": {
    "@grpc/grpc-js": "1.13.6"
  },
  "google-gax": {
    "@grpc/grpc-js": "1.14.5"
  },
  "@vercel/blob": {
    "undici": "6.29.1"
  },
  "@vercel/cli-config": {
    "zod": "$zod"
  },
  "@xmldom/xmldom": "0.8.15",
  "brace-expansion@1": "1.1.21",
  "brace-expansion@2": "2.1.7",
  "nanoid@3": "3.3.18",
  "source-map-js": "1.2.2",
  "fast-uri": "3.1.9",
  "jwks-rsa": {
    "jose": "4.15.9"
  }
}
```

Não se propõe um override global de Zod 3→4, Undici 6→7, uuid 8/9→11, brace-expansion 1/2→5 ou `jose` entre famílias. Entre os **novos** overrides, os que excedem a faixa estrita do pai são os dois destacados: **Firestore `~1.9.0` → gRPC 1.13.6** e **CLI-config Zod exato 4.1.11 → 4.6.6**. O segundo continua na mesma major; o primeiro conserva a major 1, mas ultrapassa deliberadamente o limite de minor do pai. Os demais patches transitivos novos satisfazem as faixas instaladas. O override preexistente de PostCSS 8.5.25 também substitui o pin 8.5.23 do Next candidato, conservando a decisão já presente no projeto.

As folhas dentro da faixa também podem ser mantidas por uma atualização direcionada do lock; o artefato comprovado usa os pins acima para tornar o conjunto exato explícito. Uma edição posterior para reduzir overrides exige regerar e auditar seu próprio lock.

## Tabela JSON de remediação e advisories determinantes

Os IDs `T1`–`T8` remetem aos testes necessários na seção seguinte. Os URLs são os avisos determinantes dos pisos; o JSON-base conserva a lista integral de `via`, ranges e nós, inclusive os avisos menos severos e os múltiplos avisos do mesmo pacote. `candidate` descreve somente o artefato isolado.

```json
[
  {
    "package": "next", "severity": "critical", "installed": "16.2.12", "directParents": ["celeriflow: exact 16.2.12"],
    "via": [
      {"url": "https://github.com/advisories/GHSA-p293-qw3h-jr36", "affected": ">=16.0.0 <16.3.3", "patched": "16.3.3"},
      {"url": "https://github.com/advisories/GHSA-2xp9-vwfh-vxw4", "affected": ">=16.0.0 <16.3.3", "patched": "16.3.3"},
      {"url": "https://github.com/advisories/GHSA-vcvr-r3jv-pc5j", "affected": ">=16.2.0 <16.3.6", "patched": "16.3.6"},
      {"url": "https://github.com/advisories/GHSA-cjq9-62q9-8jv4", "affected": ">=16.0.0 <16.3.8", "patched": "16.3.8"},
      {"url": "https://github.com/advisories/GHSA-2464-fhr4-w9xw", "affected": ">=16.0.0 <=16.4.0", "patched": "16.4.1"},
      {"url": "https://github.com/advisories/GHSA-p3m5-59mp-jv5r", "affected": ">=16.0.0 <=16.4.0", "patched": "16.4.1"},
      {"url": "https://github.com/advisories/GHSA-673q-mjm6-r5xr", "affected": ">=16.0.0 <=16.4.0", "patched": "16.4.1"}
    ], "candidate": "16.4.3", "testsNeeded": ["T1", "T2", "T8"]
  },
  {
    "package": "sharp", "severity": "high", "installed": "0.35.3", "directParents": ["celeriflow exact + override", "next optional ^0.34.5"],
    "via": [
      {"url": "https://github.com/advisories/GHSA-rgj7-g3m4-5g8c", "affected": "<0.35.4", "patched": "0.35.4"},
      {"url": "https://github.com/advisories/GHSA-wq5f-xc86-pv6w", "affected": "<0.35.5", "patched": "0.35.5"}
    ], "candidate": "0.35.5 direct + override", "testsNeeded": ["T2", "T8"]
  },
  {
    "package": "zod", "severity": "high", "installed": ["4.4.3", "4.1.11 nested", "3.25.76 CLI"],
    "directParents": ["celeriflow ^4.4.3", "@vercel/cli-config@0.2.0 exact 4.1.11", "shadcn@4.13.0 ^3.24.1"],
    "via": [{"url": "https://github.com/advisories/GHSA-mrhx-c7xc-m3w5", "affected": "<4.6.6", "patched": "4.6.6"}],
    "candidate": "4.6.6 root and scoped CLI-config; retain 3.25.76 only under dev CLI", "testsNeeded": ["T3", "T4", "T8"]
  },
  {
    "package": "undici", "severity": "high", "installed": ["7.28.0 root", "6.27.0 Blob"],
    "directParents": ["celeriflow dev exact 7.28.0", "@vercel/blob@2.6.1 ^6.23.0", "shadcn ^7.27.2", "@dotenvx/dotenvx ^7.11.0"],
    "via": [
      {"url": "https://github.com/advisories/GHSA-xjj6-f33q-929c", "affected": ">=7.18.0 <7.30.1 || >=6.23.0 <6.29.1", "patched": ["7.30.1", "6.29.1"]},
      {"url": "https://github.com/advisories/GHSA-2m5v-pch6-74hx", "affected": ">=7.0.0 <7.30.1 || >=4.0.0 <6.29.1", "patched": ["7.30.1", "6.29.1"]},
      {"url": "https://github.com/advisories/GHSA-qrxm-fqhp-jwvm", "affected": ">=7.0.0 <7.30.1 || >=4.2.1 <6.29.1", "patched": ["7.30.1", "6.29.1"]},
      {"url": "https://github.com/advisories/GHSA-4w7w-5xrc-9h26", "affected": ">=7.0.0 <7.30.1", "patched": "7.30.1"}
    ], "candidate": ["7.30.1 dev", "6.29.1 scoped Blob"], "testsNeeded": ["T4", "T8"]
  },
  {
    "package": "@grpc/grpc-js", "severity": "high", "installed": ["1.9.16", "1.14.4"],
    "directParents": ["@firebase/firestore@4.17.0 ~1.9.0", "google-gax@5.0.8 ^1.12.6"],
    "via": [{"url": "https://github.com/advisories/GHSA-m9gg-hp2v-232j", "affected": "<1.13.6 || >=1.14.0 <1.14.5", "patched": ["1.13.6", "1.14.5"]}],
    "candidate": ["1.13.6 scoped Firestore", "1.14.5 scoped google-gax"], "testsNeeded": ["T5", "T8"]
  },
  {
    "package": "@fastify/busboy", "severity": "high", "installed": "3.2.0", "directParents": ["firebase-admin@14.2.0 ^3.0.0"],
    "via": [
      {"url": "https://github.com/advisories/GHSA-xjh9-v7x6-24jw", "affected": ">=3.1.0 <3.2.1", "patched": "3.2.1"},
      {"url": "https://github.com/advisories/GHSA-x8mw-p69m-v3mx", "affected": ">=1.0.0 <3.2.1", "patched": "3.2.1"},
      {"url": "https://github.com/advisories/GHSA-gxm5-99cw-xjw9", "affected": "<3.2.2", "patched": "3.2.2"}
    ], "candidate": "3.2.2", "testsNeeded": ["T5", "T8"]
  },
  {
    "package": "@xmldom/xmldom", "severity": "high", "installed": "0.8.13", "directParents": ["mammoth@1.12.0 ^0.8.6"],
    "via": [
      {"url": "https://github.com/advisories/GHSA-c7q8-3ch8-vqpv", "affected": ">=0.7.0 <=0.8.14", "patched": "0.8.15"},
      {"url": "https://github.com/advisories/GHSA-27p8-2357-5qqv", "affected": ">=0.7.0 <=0.8.14", "patched": "0.8.15"},
      {"url": "https://github.com/advisories/GHSA-8344-3jmq-59r6", "affected": ">=0.7.0 <=0.8.14", "patched": "0.8.15"},
      {"url": "https://github.com/advisories/GHSA-965w-775f-mr7g", "affected": ">=0.7.0 <=0.8.14", "patched": "0.8.15"}
    ], "candidate": "0.8.15", "testsNeeded": ["T6", "T8"]
  },
  {
    "package": "brace-expansion", "severity": "high", "installed": ["1.1.18", "2.1.4", "5.0.9 dev after CLI move"],
    "directParents": ["minimatch@3.1.5 ^1.1.7", "minimatch@9.0.9 ^2.0.2", "minimatch@5.1.9 ^2.0.1", "minimatch@10.2.5 ^5.0.5 dev"],
    "via": [
      {"url": "https://github.com/advisories/GHSA-qhr7-859c-m2p7", "affected": "<1.1.20 || >=2.0.0 <2.1.6 || >=4.0.0 <5.0.11", "patched": ["1.1.20", "2.1.6", "5.0.11"]},
      {"url": "https://github.com/advisories/GHSA-q2hr-2g5m-vwhr", "affected": "<1.1.21 || >=2.0.0 <2.1.7 || >=4.0.0 <5.0.12", "patched": ["1.1.21", "2.1.7", "5.0.12"]}
    ], "candidate": ["1.1.21", "2.1.7", "5.0.9 retained dev"], "testsNeeded": ["T7", "T8"]
  },
  {
    "package": "nanoid", "severity": "high", "installed": "3.3.16", "directParents": ["postcss@8.5.25 ^3.3.16"],
    "via": [{"url": "https://github.com/advisories/GHSA-2v37-7h3g-55p8", "affected": "<3.3.18", "patched": "3.3.18"}],
    "candidate": "3.3.18", "testsNeeded": ["T7", "T8"]
  },
  {
    "package": "source-map-js", "severity": "high", "installed": "1.2.1", "directParents": ["postcss@8.5.25 ^1.2.1", "@tailwindcss/node@4.3.2 ^1.2.1"],
    "via": [{"url": "https://github.com/advisories/GHSA-68fv-2mgg-jv7q", "affected": ">=1.0.0 <1.2.2", "patched": "1.2.2"}],
    "candidate": "1.2.2", "testsNeeded": ["T7", "T8"]
  },
  {
    "package": "fast-uri", "severity": "high", "installed": "3.1.4", "directParents": ["AJV@8.20.0 ^3.0.1 via MCP SDK / conf"],
    "via": [
      {"url": "https://github.com/advisories/GHSA-qw65-cvwx-89v3", "affected": ">=3.0.0 <3.1.7", "patched": "3.1.7"},
      {"url": "https://github.com/advisories/GHSA-w74x-v6f9-j3xg", "affected": ">=3.0.0 <3.1.9", "patched": "3.1.9"}
    ], "candidate": "3.1.9 dev", "testsNeeded": ["T7", "T8"]
  }
]
```

A propagação em `firebase`, `@firebase/firestore`, `@firebase/firestore-compat` desaparece do audit de produção quando as cópias gRPC são corrigidas. A propagação em `@vercel/blob`, `@vercel/oidc` e `@vercel/cli-config` desaparece quando seu Zod é corrigido. Essas entradas não exigem downgrade dos pacotes diretos.

## Apontamentos que saem do gate com a retirada/reclassificação

| Origem no audit-base | Via / advisory | Destino no candidato |
| --- | --- | --- |
| `prisma`, `@prisma/config`, `deepmerge-ts` high | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), deepmerge-ts `<8.0.0` | removidos com Prisma; não se força deepmerge-ts 8 sobre Prisma 7 |
| `mysql2` high | [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr), `<3.22.0`; [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3), `<=3.23.0` moderate | removido com Prisma |
| `shadcn`, seu Zod 3, `deepmerge` low | Zod `<4.6.6`; [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), deepmerge `>=4.2.0 <=4.3.1` | somente dev, versões conservadas; não forçar Zod 4 no código CLI que usa Zod 3 |
| MCP SDK high | [GHSA-22jm-h49p-29qw](https://github.com/advisories/GHSA-22jm-h49p-29qw), `>=1.24.0 <1.32.0`; [GHSA-46jr-4wx8-v453](https://github.com/advisories/GHSA-46jr-4wx8-v453), `>=1.3.0 <1.32.0` | 1.30.0 apenas dev; **1.32.0** é piso pesquisado para endurecimento separado do CLI |
| `body-parser` high / `proxy-addr` critical | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), `>=2.0.0 <2.4.0`; [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), `>=1.1.0 <2.0.8` | somente dev via Express/MCP; pisos **2.4.0 / 2.0.8** pesquisados, não aplicados |
| `browserslist` high | [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) e [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g), `<=4.28.6` | somente dev; piso **4.28.7** pesquisado |
| `ip-address` high | [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr), `<=10.3.0`; conjunto de avisos alcança `<=10.7.3` | somente dev via express-rate-limit; **10.7.4** cobre o conjunto pesquisado |
| `js-yaml` high | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh), `>=4.0.0 <4.3.2` | somente dev via cosmiconfig/ESLint; piso **4.3.2** pesquisado |
| `hono`, `qs`, `postcss-selector-parser` moderate | ranges e URLs integrais no audit-base | somente dev via CLI/MCP/Express |
| brace-expansion 5 high | avisos da tabela JSON; piso **5.0.12** cobre o conjunto desta linha | somente dev via ts-morph/ESLint; não substitui brace-expansion 1/2 do runtime |

Mover uma ferramenta sem consumidor runtime para dev representa sua classificação real; não corrige seus advisories. O audit completo do candidato continua acusando o CLI e sua árvore. A etapa atual do CI usa explicitamente `--omit=dev`.

## Oito apontamentos moderate mantidos no gate

1. `baseline-browser-mapping@2.10.41`, via Next: [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv), `>=2.0.0 <2.11.0`; piso 2.11.0.
2. `uuid@8.3.2` sob ExcelJS e `uuid@9.0.1` sob gaxios/teeny-request: [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), `<11.1.1`; piso 11.1.1.
3. `exceljs@4.4.0`, propagação por uuid.
4. `gaxios@6.7.1`, propagação por uuid.
5. `teeny-request@9.0.0`, propagação por uuid.
6. `retry-request@7.0.2`, propagação por teeny-request.
7. `@google-cloud/storage@7.21.0`, propagação por retry-request/teeny-request.
8. `firebase-admin@14.2.0`, propagação por Storage.

Moderate continua reportado pelo npm, mas não causa falha com `--audit-level=high`. O candidato conserva ExcelJS 4.4.0 e os formatos/exports atuais, sem adotar o downgrade automático para 3.4.0 nem forçar uuid 11 sobre consumidores que pedem 8/9. Também conserva Blob 2.6.1 e Firebase 12.17.0, rejeitando as sugestões automáticas 2.4.0 e 9.14.0: elas desviam da folha vulnerável e podem remover contratos usados.

## Evidência de API e testes necessários antes da aplicação

Esta pesquisa conferiu chamadas instaladas, exports/tipos das releases candidatas, engines e notas de correção. **Não executou testes funcionais de aplicação, typecheck, build, PGlite ou validação contra serviços remotos.** A tabela explicita a prova de compatibilidade ainda necessária ao parent.

| ID | Conferência estática / documental | Validação necessária |
| --- | --- | --- |
| **T1 — Next** | 16.4.3 mantém major 16, Node `>=20.9.0` e peers que aceitam React/DOM 19.2.4. A release é de backports. `next.config.ts` usa Server Actions 4 MB, Turbopack, tracing e regras de headers. | Node 22: rotas App Router, Server Actions/formulários com auth e autorização, uploads no limite, revalidação, downloads, cookies/sessão e redirects; configuração e bundle após o upgrade. |
| **T2 — imagens** | [Sharp 0.35.5](https://github.com/lovell/sharp/releases/tag/v0.35.5) inclui libvips 1.3.4/librsvg corrigido. Seus [tipos](https://github.com/lovell/sharp/blob/v0.35.5/lib/index.d.ts) mantêm `sharp(Buffer).jpeg({quality}).toBuffer()`, usado em `src/lib/transparencia/export-files.ts:28`. Node `>=20.9.0`. | Em Linux/glibc Node 22 e Windows: SVG válido → JPEG/ZIP com texto/acentos, dimensões e paginação; PNG/JPEG/WebP/AVIF no otimizador Next; limites e erros de imagem inválida. A correção não deve bloquear todo SVG: a exportação interna depende dele. `tests/transparency-consultations.test.ts` é uma regressão existente, além de smoke explícito de JPEG. |
| **T3 — Zod** | [4.6.6](https://github.com/colinhacks/zod/releases/tag/v4.6.6) antecipa os limites de array/set/map e corrige tipos de record. Isso pode mudar quantidade/ordem de issues para coleções acima do limite. O CLI-config instalado usa `.object`, `.enum`, `.optional`, `.omit`, `.extend`, `.passthrough`, `safeParse/parse`, todos da família 4. | Schemas representativos de tributação/financeiro/portal: defaults, coercion, ISO/UTC, Decimal textual, `z.record`, refinements, unions, erro exibido pelos actions e resolvers do React Hook Form; coleções oversized devem falhar pelo limite sem exigir a lista antiga de todos os erros por elemento. CLI-config: preservação de chaves extras e mensagens de `credStorage`/config/token, incluindo entrada inválida. |
| **T4 — Blob/Undici** | Blob fica em 2.6.1. `put/get/del`, `upload/handleUpload` são usados em `platform/blob.ts` e nas rotas de anexos. O Blob importa `fetch` do Undici 6; o [export 6.29.1](https://github.com/nodejs/undici/blob/v6.29.1/types/index.d.ts) o conserva. O [export 7.30.1](https://github.com/nodejs/undici/blob/v7.30.1/types/index.d.ts) conserva `MockAgent/getGlobalDispatcher/setGlobalDispatcher` usados nos testes. Engines: 6.x `>=18.17`, 7.x `>=20.18.1`, compatíveis com Node 22. | Upload privado, geração de token, callback autenticado, limite 10/20 MB, streaming, bytes/hashes, download e deleção com namespace; token explícito e caminho OIDC sem token. Rodar `tests/blob-namespace.test.ts` e o cenário A1 em `tests/drizzle-tax-economic.test.ts`; verificar interceptação entre MockAgent 7 e o fetch da cópia 6 do Blob. Release de segurança também altera tratamento de redirects/TLS/streams; validar rejeição e cancelamento. |
| **T5 — Firebase/gRPC/Busboy** | Nenhum import direto de Firestore foi encontrado na aplicação; ela usa `firebase/app`, `firebase/auth`, `firebase-admin/app` e `firebase-admin/auth`. A árvore continua instalada e auditada. Firestore usa `Metadata`, `credentials.createSsl/createInsecure`, `loadPackageDefinition`; [gRPC 1.13.6](https://github.com/grpc/grpc-node/blob/%40grpc/grpc-js%401.13.6/packages/grpc-js/src/index.ts) mantém esses exports. 1.13.6 usa proto-loader `^0.7.13`, mantendo a família usada pelo Firestore. As releases Firestore 4.17.2 e até 4.19.0 ainda pedem `~1.9.0`, portanto atualizar Firebase sozinho não resolve esse vínculo. | Login/recovery/refresh e sessão Admin (`verifyIdToken`/cookie) com emulador/fixture apropriada; import Node e browser. Para autorizar o override fora de `~1.9.0`: Firestore SDK Node/emulador, RPC unary/stream, metadata, auth/cancelamento/erro e shutdown, além de google-gax com 1.14.5. Multipart Busboy: boundary, arquivo/campos, limites e erro. `tests/employee-portal-login.test.ts` cobre parte da política de login, não todo o transporte Firebase. |
| **T6 — XML** | Mammoth permanece 1.12.0. Seu `lib/xml/xmldom.js`/reader usa `DOMParser.parseFromString`, `childNodes`, attributes e namespaces. O [parser 0.8.15](https://github.com/xmldom/xmldom/blob/0.8.15/lib/dom-parser.js) mantém essa API. O pin respeita `^0.8.6`; não é salto para 0.9.x. | DOCX válido com namespaces, tabelas e acentos; XML malformado/nomes inválidos, entradas grandes dentro do limite do produto e propagação do erro. Como não há consumidor Mammoth encontrado nos fontes, confirmar também eventual uso operacional externo antes de decidir sua remoção em outra tarefa. |
| **T7 — folhas CJS/build/CLI** | brace-expansion 1/2 mantém o `module.exports` consumido pelos respectivos minimatch; nanoid permanece 3.x; source-map-js permanece 1.x; fast-uri permanece 3.x sob AJV. Sem impor pacotes ESM de novas majors. | Roundtrip XLSX, relatórios e ZIP/globs (`tests/administration-bi.test.ts`, `tests/report-engine.test.ts`, `tests/transparency-consultations.test.ts`); CSS/PostCSS e source maps válidos; padrões de brace normais/limites. Smoke `shadcn --help` somente se o parent mantiver o CLI como ferramenta instalada. |
| **T8 — integração do candidato** | O resolver aceitou o manifest e o audit de produção passou no lock isolado; binários e fontes de produção ainda não foram testados nessa combinação. | Em branch/worktree decidida pelo parent: `npm ci` em Node 22, filas fiscais/financeiras centrais, typecheck e build exigidos, depois o comando **exato** do CI. Revalidar o audit quando o lock final incorporar as alterações reais do parent. |

Referências adicionais consultadas:

- [gRPC: advisory de certificados, correções 1.13.6 e 1.14.5](https://github.com/advisories/GHSA-m9gg-hp2v-232j).
- [Undici 6.29.1](https://github.com/nodejs/undici/releases/tag/v6.29.1) e [7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1): backports de segurança nas duas linhas.
- [Sharp/librsvg: patch 0.35.5](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).
- [Next/SVG: first patched 16.4.1, dependência Sharp >=0.35.5](https://github.com/advisories/GHSA-2464-fhr4-w9xw).
- Metadados npm consultados nas URLs `https://registry.npmjs.org/<pacote>/<versão>`; exemplos: [Next 16.4.3](https://registry.npmjs.org/next/16.4.3), [Sharp 0.35.5](https://registry.npmjs.org/sharp/0.35.5), [Zod 4.6.6](https://registry.npmjs.org/zod/4.6.6), [Busboy 3.2.2](https://registry.npmjs.org/@fastify%2fbusboy/3.2.2).

## Reprodução da evidência e identificação dos artefatos

Com o diretório temporário como working directory:

```powershell
npm install --package-lock-only --ignore-scripts --no-fund --no-audit --cache .npm-cache
npm audit --omit=dev --audit-level=high --json --cache .npm-cache
```

O `audit-production.json` é a saída desse último comando. O `audit-all.json` resulta do audit sem `--omit=dev`; sua falha é esperada pelos advisories de desenvolvimento ainda presentes. Os arquivos JSON salvos por PowerShell podem ter BOM UTF-8.

SHA-256 do conjunto pesquisado:

```text
Raiz package.json:
cc3551f74c46a8d26018d6655dfca4c8eaba8e3ae5307ad439b5b085ce73ae28
Raiz package-lock.json:
727d64b5f197ab700f04764065ee8fc0fee7e40fa4352252fca7ce3fb18115c2
Candidato package.json:
b0060f1d41ebbaaa5c0d96da14b979497645f91e139cabafe34171f96b25b565
Candidato package-lock.json:
b737cec4bb200dfa740e5d9c042160261aefec62b67687437f4f3b74e3d3df15
```

**Handoff ao parent:** há uma combinação resolvida e auditada que atende ao limite atual do CI sem downgrades de diretos ou majors globais. A decisão de aplicar depende de concluir a retirada real de Prisma, confirmar a classificação do CLI e validar especialmente os contratos de transporte/schema indicados em T3–T5. O resultado integrado permanece pendente dessa aplicação e de seus testes centrais.
