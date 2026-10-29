# Handoff — dependências finais da migração Drizzle

## Resultado em 28/10/2026

Aplicada em `package.json` e `package-lock.json` a remediação comprovada em `docs/drizzle-dependency-audit-gate-progress.md`, usando o candidato `C:\Users\trici\AppData\Local\Temp\opencode\drizzle-audit-candidate` como referência. **O audit de produção do lock integrado passou com exit 0: zero high, zero critical e oito moderate.**

A instalação física permanece a anterior: foi usado exclusivamente `--package-lock-only --ignore-scripts`. O parent fará `npm ci` central após a convergência dos consumidores em migração paralela. Este trabalho não executou build global, testes funcionais, commit ou push.

## Delta aplicado e conferido

- Removidos os quatro diretos Prisma: produção `@prisma/adapter-neon`, `@prisma/client`, `prisma`; desenvolvimento `@prisma/adapter-pg`. Não há nenhum nó `prisma` ou `@prisma/*` no lock final.
- Next e eslint-config-next: **16.2.12 → 16.4.3**, incluindo env/plugin/SWC; `@swc/helpers` resolve **0.5.23**.
- Sharp: **0.35.3 → 0.35.5**, no direto e override; binários alinhados e libvips **1.3.2 → 1.3.4**.
- Zod direto: `^4.4.3` → **4.6.6 exato**; `@vercel/cli-config` usa override `zod: "$zod"`, eliminando a cópia 4.1.11.
- Undici dev: **7.28.0 → 7.30.1**; cópia do Blob **6.27.0 → 6.29.1**, com override restrito ao Blob.
- Shadcn **4.13.0** preservado e fixado em dev, conforme a pesquisa de consumidores já documentada.
- Overrides de folhas: Busboy **3.2.2**; Firestore → gRPC **1.13.6**; google-gax → gRPC **1.14.5**; xmldom **0.8.15**; brace-expansion linha 1 **1.1.21**, linha 2 **2.1.7**; nanoid linha 3 **3.3.18**; source-map-js **1.2.2**; fast-uri **3.1.9**.
- Preservados os overrides preexistentes PostCSS **8.5.25** e jwks-rsa → jose **4.15.9**.

O manifest final é semanticamente e byte a byte igual ao candidato. Asserções read-only compararam scripts, declarações e versões resolvidas de **todos os diretos fora do delta autorizado** contra HEAD: todos preservados. Exemplos: Blob **2.6.1**, Firebase **12.17.0**, Firebase Admin **14.2.0**, ExcelJS **4.4.0**, Mammoth **1.12.0**, React/DOM **19.2.4**, Drizzle ORM **0.45.4**, Drizzle Kit **0.31.11**, PGlite **0.4.3** e socket **0.1.3**.

O resolver retirou **133 caminhos**, sem adicionar caminhos novos. Foram comparados individualmente todos os nós do lock final com o candidato: **mesmas versões, integridades, dependências e conjuntos de caminhos**. As únicas diferenças são `dev: true` no candidato versus `devOptional: true` no lock integrado nos oito nós abaixo:

```text
@electric-sql/pglite-socket
@types/react-dom
fast-uri
iconv-lite
jiti
require-from-string
safer-buffer
typescript
```

Essa classificação veio do resolver ao operar na raiz com a instalação preexistente; foi conservada, sem edição manual. O audit real do lock integrado, inclusive fast-uri corrigido, continua passando.

## Checks executados

Ambiente: **Node 24.21.0 / npm 11.19.0**. O CI usa Node 22.

```powershell
npm install --package-lock-only --ignore-scripts --no-fund --no-audit --cache "C:\Users\trici\AppData\Local\Temp\opencode\drizzle-audit-candidate\.npm-cache"
npm audit --omit=dev --audit-level=high --json --cache "C:\Users\trici\AppData\Local\Temp\opencode\drizzle-audit-candidate\.npm-cache"
git diff --check -- package.json package-lock.json
```

Todos terminaram com **exit 0**. Também passaram as asserções de equivalência do manifest com o candidato, sincronia das dependências de raiz do lock com o manifest, ausência de Prisma e preservação de scripts/diretos alheios ao delta. O diff de `package.json` foi revisado; os deltas de versões/caminhos do lock foram enumerados e confrontados com o candidato.

Os oito moderate mantidos são `baseline-browser-mapping`, `uuid`, ExcelJS, gaxios, teeny-request, retry-request, `@google-cloud/storage` e Firebase Admin (incluindo propagação). O audit completo não foi repetido nesta etapa; o candidato documenta advisories dev remanescentes. Passar no gate de produção não significa audit completo zerado.

SHA-256 dos arquivos entregues:

```text
package.json       b0060f1d41ebbaaa5c0d96da14b979497645f91e139cabafe34171f96b25b565
package-lock.json  3dfbc084378d04337bbdb0b9e36fabfc5f7c8a97d3e3cd320dac44dad29b4e7b
```

## Requisitos funcionais para o parent

### Ensaios centrais adicionais no candidato instalado

O parent executou `npm ci --no-fund --no-audit` no diretório temporário do candidato: exit 0, 981 pacotes instalados. Essa instalação não substitui o `npm ci` final da raiz, que aguarda a remoção dos consumidores legados em edição.

- Sharp 0.35.5: encode/decode PNG, JPEG, WebP e AVIF, dimensões preservadas; AVIF identificado corretamente como contêiner HEIF/compressão AV1.
- DOCX gerado por `docx` e lido por Mammoth: parágrafo, tabela e texto Unicode preservados. XML com namespace lido por xmldom: namespace e acentos preservados.
- ExcelJS: roundtrip XLSX mantendo texto Unicode e valor numérico; Zod 4.6.6: coercion, trim, default e rejeição de quantidade negativa aprovados.
- Firebase Admin: inicialização, construção de Auth e encerramento aprovados, sem chamar APIs remotas.
- As duas cópias gRPC efetivas, resolvidas a partir de Firestore e google-gax (1.13.6/1.14.5), passaram em RPC unary, streaming, metadata e propagação de `PERMISSION_DENIED` contra servidor local, com fechamento dos clientes/servidor.
- Cliente real `@google-cloud/firestore`: leitura `DocumentReference.get()` contra serviço gRPC local com `BatchGetDocuments`, decodificação de documento e inteiro 123456789012345 aprovados. Houve aviso de descoberta de metadata sem credenciais; nenhuma credencial foi fornecida ao ensaio local.

Esses checks não afirmam login HTTP real nem cobertura integral dos SDKs; build, instalação da raiz e homologação autenticada continuam pendentes.

1. **Integração central:** concluir a migração dos consumidores Prisma; instalar com `npm ci` em Node 22; executar filas fiscais/financeiras centrais, typecheck, build e o comando exato de audit do CI no conjunto final. Não usar a instalação física antiga como evidência das novas versões.
2. **Next/Sharp:** App Router, ações e formulários com auth/autorização, cookies, redirects, revalidação, upload/download; SVG interno → JPEG/ZIP preservando texto e acentos, PNG/JPEG/WebP/AVIF e limites/erros. Validar binários Windows e Linux/glibc Node 22. Regressão existente: `tests/transparency-consultations.test.ts`.
3. **Zod e CLI-config:** schemas tributários/financeiros/portal, defaults/coercion/Decimal/UTC, records/unions/refinements, mensagens dos actions e React Hook Form; coleções acima do limite; CLI-config com chaves extras e config/token inválidos. O override do CLI-config excede seu pin exato 4.1.11.
4. **Blob/Undici:** upload privado, token/callback, limites 10/20 MB, streaming, bytes/hashes, download/delete com namespace, token explícito e OIDC; redirects/TLS/cancelamento e interceptação entre MockAgent 7 e fetch 6 do Blob. Rodar `tests/blob-namespace.test.ts` e A1 de `tests/drizzle-tax-economic.test.ts`.
5. **Firebase/gRPC/Busboy:** login/recovery/refresh e sessão Admin com fixture/emulador; transporte Firestore Node com RPC unary/stream, metadata/auth/cancelamento/erro/shutdown e google-gax. **Firestore → gRPC 1.13.6 excede `~1.9.0` e precisa dessa prova funcional.** Busboy: multipart válido, campos/arquivo, boundary, limites e erro. `tests/employee-portal-login.test.ts` cobre somente parte da política de login.
6. **XML e relatórios:** Mammoth/DOCX com namespaces, tabelas e acentos; XML malformado e limites; roundtrip XLSX, ZIP/globs, CSS/PostCSS/source maps. Rodar `tests/administration-bi.test.ts`, `tests/report-engine.test.ts` e a regressão de transparência. Smoke do CLI shadcn se usado operacionalmente.

Detalhes das APIs, advisories e matriz T1–T8 permanecem em `docs/drizzle-dependency-audit-gate-progress.md`. Nenhuma validação funcional acima é declarada concluída por este handoff.

## Adendo — novo advisory re2js em 28/10/2026

A rodada central encontrou o novo **GHSA-gg6h-894w-4m9c / CVE-2026-116795**, publicado em 28/10/2026: high (CVSS 7.5), DoS quadrático com `LOOKBEHINDS` opt-in combinado a matching repetido (`find`, `matchAll`, `split`, `replaceAll`). O intervalo vulnerável é `>=2.2.0 <2.8.7`; a primeira correção é **2.8.7**. Fonte: <https://github.com/advisories/GHSA-gg6h-894w-4m9c>.

Correção transitiva permitida: **Firebase 12.17.0 → @firebase/firestore 4.17.0 → re2js `^2.8.3`**, resolvendo agora **2.9.1**, sem direto ou override novo. O requisito Node de re2js muda de `>=18.0.0` para `>=20.0.0`, já exigido pelo próprio Firestore e atendido pelo CI Node 22. A release 2.9.1 também corrige declarações de tipos do método `re` da 2.9.0.

### Comando e comparação integral

```powershell
npm view re2js@2.9.1 version dist.integrity dist.tarball engines dependencies --json
npm update re2js --package-lock-only --ignore-scripts --no-fund --no-audit
npm audit --omit=dev --audit-level=high --json
```

Todos esses comandos terminaram com exit 0. O resolver também mudou `devOptional: true` para `dev: true` nos oito nós já enumerados neste documento. Cada delta foi inspecionado e essas oito mudanças incidentais foram revertidas por patch explícito, preservando a classificação original. A comparação read-only de **todos os 1.150 registros** e dos metadados de topo do lock confirmou **um único nó diferente**, sem adições, remoções ou outros upgrades/downgrades. Comparação linha a linha: somente estas quatro linhas diferem do snapshot imediatamente anterior ao adendo:

```text
node_modules/re2js.version:   2.8.6 → 2.9.1
node_modules/re2js.resolved:  https://registry.npmjs.org/re2js/-/re2js-2.8.6.tgz
                          → https://registry.npmjs.org/re2js/-/re2js-2.9.1.tgz
node_modules/re2js.integrity: sha512-xLgQil4kIUCrAzVk9fRSkxkFNwmygLFjVxXrLc65aE1F0+Zsb8rxumFBy4XKyvgMCTL6kilDq3EZ0piE2dP/Dg==
                          → sha512-JIT3bEEUZTOR2YS1walNEIfH4cF/cQeZcBUFq7ldqO6lR6g0X5CBq/S8rsa9omzZcsNf8qc36jCkWpKKtncrZg==
node_modules/re2js.engines.node: >=18.0.0 → >=20.0.0
```

`package.json` ficou **byte a byte preservado**, incluindo o novo `typecheck:auxiliary: node scripts/typecheck-auxiliary.mjs` do parent. As comparações com candidato/HEAD e hashes das seções anteriores são evidência histórica da primeira rodada; este adendo registra o estado posterior ao script do parent e à correção re2js.

Audit final read-only: **exit 0; 0 high, 0 critical, 8 moderate** (os mesmos oito listados acima); re2js e sua propagação para Firestore/Firebase não aparecem mais no relatório. Não foi executado `audit fix`.

### Compatibilidade dos consumidores e execução posterior

Validação integrada posterior: `npm ci --no-fund --no-audit` concluiu com 981 pacotes. O smoke abaixo passou contra **re2js 2.9.1 fisicamente instalado**, incluindo full match, substring, Unicode e rejeição de sintaxe inválida. `npm audit --omit=dev --audit-level=high --json` repetido após a instalação: **exit 0, zero high/critical, oito moderate**. Isso valida as APIs de expressão regular consumidas, sem substituir a homologação completa do Firestore.

Inspeção explícita de `node_modules/@firebase/firestore/dist/common-OLC1ri4Q.node.cjs.js:23572–23610`: `CoreLike` usa `RE2JS.compile(regexPattern).matches(value)`; `CoreRegexContains` usa `compile(search).test(value)`; `CoreRegexMatch` usa `compile(search).matches(value)`. São chamadas sem flags, com captura de erro de padrão inválido. As variantes ESM/RN inspecionadas usam as mesmas APIs. Não foram encontrados imports diretos de re2js/RE2JS ou uso de `LOOKBEHINDS` no código do projeto. As declarações publicadas de 2.9.1 preservam `compile(regex: string, flags?: number): RE2JS`, `matches(input): boolean` e `test(input): boolean`, com full match versus substring documentados: <https://unpkg.com/re2js@2.9.1/build/index.d.ts>.

A instalação física continuou em **re2js 2.8.6**; não houve `npm ci`, build, typecheck, testes pesados ou operações git nesta correção. Após o parent instalar o lock final com `npm ci`, executar o smoke abaixo e os checks centrais já previstos; o smoke valida exatamente as APIs consumidas e rejeição de sintaxe inválida, sem rede:

```powershell
node -e "const a=require('node:assert/strict'),fs=require('node:fs'),p=require('node:path'); const {RE2JS:R}=require('re2js'); a.equal(JSON.parse(fs.readFileSync(p.join(p.dirname(require.resolve('re2js')),'../package.json'),'utf8')).version,'2.9.1'); a.equal(R.compile('^Jo.*.$').matches('João'),true); a.equal(R.compile('abc').matches('xabcx'),false); a.equal(R.compile('abc').test('xabcx'),true); a.equal(R.compile('abc').test('xyz'),false); a.throws(()=>R.compile('[')); console.log('re2js Firestore API smoke OK');"
npm audit --omit=dev --audit-level=high --json
```

SHA-256 após o adendo (manifest preservado em relação ao início desta correção):

```text
package.json       ea3f66e1d3fd5427f4695bfc902cc88097874c5ca7840c3163d55f41274ada39
package-lock.json  98d4bb533f22b84c1e036b693502618366ca0e232e6e03d88421fb8ddd2e894e
```
