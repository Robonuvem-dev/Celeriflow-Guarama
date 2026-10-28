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
