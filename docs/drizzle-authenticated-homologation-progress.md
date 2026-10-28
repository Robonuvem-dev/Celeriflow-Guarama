# Homologação HTTP autenticada — preparo entregue ao parent

## Estado em 2026-10-28

**Script preparado; homologação autenticada ainda NÃO executada.** Arquivo: `.agent/drizzle-final-homologation.mjs`.

O parent informou preflight read-only PASS: conta Firebase existente, ativa e com e-mail verificado; um Usuário Neon ativo, perfil ativo `SYSTEM_ADMINISTRATOR`, UID coincidente. Essa evidência é do parent; esta frente não repetiu consultas de identidade, autenticação, HTTP, CRUD, acesso remoto ou abertura de browser/servidor.

Escopo desta entrega: pesquisa local e edição somente deste documento e do script. Verificações locais de sintaxe/lint estão abaixo. Build final, servidor e execução HTTP ficam com o parent.

## Execução posterior ao build final

Com o build final aprovado, o parent inicia seu servidor de produção. Para o alvo local, o processo do **servidor** precisa de `CELERIFLOW_PUBLIC_BASE_URL=http://localhost:3309`: o proxy só ativa o rewrite interno nos hosts de sistema reconhecidos ou nesse hostname configurado. A variável colocada apenas no processo do script não modifica um servidor já iniciado.

```powershell
# Somente depois do build final — executar pelo parent, em outro processo
$env:CELERIFLOW_PUBLIC_BASE_URL = "http://localhost:3309"
npm run start -- --hostname localhost --port 3309

# Homologação completa solicitada: sessão, 20 domínios e um CRUD reversível
node .agent/drizzle-final-homologation.mjs --origin=http://localhost:3309 --crud
```

`--origin` é obrigatório. Allowlist exata:

- `http://localhost:3309`;
- `https://guarama.celeriflow.com.br`.

Outros hosts, portas, esquemas, userinfo, paths, query strings e fragments são recusados **antes** de autenticar. Todos os fetches usam `redirect: "manual"`. Cookies nunca seguem redirecionamento nem são encaminhados ao Google. O script não inicia servidor e não usa browser.

O alvo HTTPS também pode ser escolhido pelo parent com `--origin=https://guarama.celeriflow.com.br`. Para CRUD, o `.next/server/server-reference-manifest.json` local deve ser do build efetivamente servido; o formulário recebido é conferido contra esse manifesto antes da primeira criação. Nenhum ID de action foi fixado no código.

Sem `--crud`, o comando executa a sessão e as leituras e identifica explicitamente seu escopo como `AUTHENTICATED_READS`, com CRUD `NOT_REQUESTED`. `--crud` seleciona a parte mutante já autorizada da homologação; não há confirmação adicional ou aprovação interativa.

Pré-requisitos locais: Node com `fetch`, `FormData`, `Headers.getSetCookie()` e `AbortSignal.timeout()` (ambiente atual: Node 24), dependências instaladas e `.next/BUILD_ID` presente. O script não executa build, não altera pacotes e não conecta diretamente ao banco.

## Autenticação real e sessão

Variáveis necessárias, nunca impressas:

- `SYSTEM_ADMIN_EMAIL`;
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`;
- `NEXT_PUBLIC_FIREBASE_API_KEY`.

O script carrega valores ausentes do ambiente com a precedência de produção: `.env.production.local`, `.env.local`, `.env.production`, `.env`. Variáveis já presentes no processo têm precedência. A leitura usa `dotenv.parse`, sem dump/config logging. Firebase Auth Emulator é recusado.

Fluxo implementado:

1. Exigir que `GET /dashboard` **sem cookie** devolva 307 para `/login?returnTo=/dashboard` no mesmo origin. Isso confirma a fronteira privada e detecta rewrite local incorreto antes de emitir tokens.
2. Firebase Admin `getUserByEmail(SYSTEM_ADMIN_EMAIL)`; conferir conta existente, ativa, e-mail coincidente/verificado.
3. `createCustomToken(existingUser.uid)`, sem claims adicionais.
4. REST `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=...`, JSON `{ token, returnSecureToken: true }`.
5. Exigir HTTP 200 JSON e ausência de criação de usuário; se a resposta incluir `localId`, exigir coincidência. O UID autoritativo vem do ID token conferido com `verifyIdToken`, junto com e-mail/verificação e autenticação recente. Descartar custom/refresh tokens das variáveis de trabalho.
6. `POST /api/auth/session`, JSON `{ idToken }`, com Origin/Referer do alvo. Exigir HTTP 200 e `{ ok: true }`.
7. Conferir **um** cookie `celeriflow_session`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem Domain e `Max-Age=432000` (cinco dias). Conferir sua assinatura/principal com `verifySessionCookie(cookie, true)` e o mesmo UID/e-mail verificado.
8. Reutilizar o cookie **somente em memória** para HTTP privado no origin allowlisted. Em localhost HTTP o script transporta explicitamente o cookie `Secure` emitido pelo servidor de produção; não modifica o contrato de cookie da aplicação.
9. Em `finally`, `POST /api/auth/session/logout`, validar HTTP 200 e cookie vazio com `Max-Age=0`, limpar a referência em memória e confirmar novamente a fronteira anônima de `/dashboard`. Encerrar a instância local do SDK com `deleteApp` — isso não exclui conta Firebase nem revoga sessões de outros usuários.

Fontes conferidas: `src/lib/firebase/server.ts`, `src/lib/platform/session.ts`, `src/app/api/auth/session/route.ts`, `src/app/api/auth/session/logout/route.ts`, `src/proxy.ts`.

## Leituras HTTP protegidas: 20 domínios

Os paths abaixo são URLs públicas do sistema, reescritas para `/app-domain/...` por `src/proxy.ts`. Na árvore atual não há símbolo chamado `appRewriteMappings`; o mapeamento real está nesse proxy. Foram confrontados `ClientLayout.tsx`, a navegação do dashboard, layouts de módulo e as páginas de destino.

| Domínio | GET protegido |
| --- | --- |
| Administração | `/administracao` |
| Cadastros | `/cadastros` |
| Processos | `/protocolos` |
| Atendimento | `/atendimento` |
| Transparência | `/transparencia` |
| Tributação | `/tributacao` |
| Financeiro | `/financeiro` |
| Planejamento | `/planejamento` |
| SST | `/sst` |
| Compras | `/compras/catalogo` |
| RH | `/rh` |
| Patrimônio | `/patrimonio/centros-custo` |
| Educação | `/educacao` |
| Saúde | `/saude` |
| Assistência Social | `/social` |
| Meio Ambiente | `/meio-ambiente` |
| Saneamento | `/saneamento/unidades` |
| Obras | `/obras` |
| Frotas | `/frotas` |
| Cemitérios | `/cemiterios/estrutura` |

Todas exigem **200 sem Location**, `text/html`, documento completo e shell privado com `<main>` e link para `/dashboard`. Nos 19 domínios com card de dashboard, o link de entrada também deve estar presente no HTML autenticado — card oculto por módulo inativo não vira PASS silencioso. Cadastros é verificado diretamente pela página e seu guard, pois não possui card nessa lista do dashboard.

As folhas de Saneamento/Cemitérios evitam os redirects conhecidos de entrada; Compras/Patrimônio usam catálogos de navegação reais. Qualquer redirect inesperado é falha, inclusive para login. As 20 páginas são verificadas sequencialmente; falhas por domínio são agregadas, e o CRUD só começa após todas as leituras e a leitura de auditoria passarem.

O detector inspeciona DOM e Flight em memória: `NEXT_HTTP_ERROR_FALLBACK` (401/403/404/500), `NEXT_REDIRECT`, chunks `:E{...}`, `__next_error__`, `NextError500`, formulário de senha e títulos/headings/alerts dos fallbacks reais da aplicação (`Erro Interno do Servidor`, sessão expirada, banco aguardando atualização, falha técnica/acesso indisponível). Flight usa o conteúdo raw-text do `<script>`, sem decodificar entidades HTML e sem `eval`. O parser compilado do Next não oferece `HTMLElement.clone()`; a inspeção usa seus seletores disponíveis. Assim um soft-500 com HTTP 200 não passa. O script não executa hydration/UsageAuditTracker.

## Auditoria de sessão

`POST /api/auth/session` só retorna sucesso depois do `insertAuditEvent(SESSION_LOGIN)` aguardado no servidor. O script também lê `/configuracoes/auditoria?eventType=SESSION_LOGIN&targetType=SESSION&from=...` e verifica, **em memória**, uma linha do ator esperado pelo e-mail e tipo de evento. O relatório só registra `session_login_audit_visible: PASS`, sem ator, UID, nome, claims ou conteúdo da linha.

O logout autenticado aguarda `SESSION_LOGOUT` pelo mesmo contrato da rota. O script não chama endpoints artificiais de interação, não modifica nem remove `AuditEvent` e não tenta apagar evidências append-only no cleanup. Essa checagem não é uma contagem independente de auditoria por SQL; depende da rota autenticada e da semântica aguardada do endpoint.

## CRUD real escolhido: um Centro de custo de Patrimônio

Pesquisa encontrou um contrato HTTP dedutível e limitado, portanto o CRUD foi implementado:

- `src/app/app-domain/patrimonio/centros-custo/CostCenterForm.tsx`;
- `.../novo/page.tsx`: `createCostCenterAction(formData)`;
- `.../[id]/editar/page.tsx`: `updateCostCenterAction.bind(null, costCenter.id)`;
- `.../actions.ts`: validação Zod, autorização `PATRIMONIO` por operação, checagem de identidade, exclusão de um ID com guard de vínculos a almoxarifados;
- `.../CostCenterTable.tsx`: link de edição por ID e chamada client à `deleteCostCenterAction(id)`.

Essas actions alteram apenas o cadastro e revalidam páginas; não executam pagamentos, envio de e-mail, notificações, movimentos de estoque ou vinculação de outros registros. O script usa exatamente os guards existentes. As actions desse catálogo não inserem auditoria administrativa própria; a entrega não inventa essa garantia.

Contrato Next **16.2.12 instalado**, conferido antes da implementação:

- guias `node_modules/next/dist/docs/01-app/02-guides/forms.md` e `server-actions.md`;
- `next/dist/server/lib/server-action-request-meta.js`: native actions **multipart**, não URL-encoded;
- `next/dist/server/app-render/action-handler.js`: `decodeAction(formData, serverModuleMap)`, bind preservado e redirect nativo 303;
- `next/dist/compiled/react-server-dom-webpack/...client.node.production.js`: `defaultEncodeFormAction`, `$ACTION_ID_`, `$ACTION_REF_`, metadata prefixada e `multipart/form-data`;
- `next/dist/client/components/router-reducer/reducers/server-action-reducer.js`: fetch POST de action com `Next-Action`, `Accept: text/x-component` e encoder `encodeReply`.

O script resolve três IDs **no momento da execução** pelo manifesto `.next/server/server-reference-manifest.json`, com nome exportado, arquivo e worker exatos. Criação: GET do formulário real, um `$ACTION_ID_<id>` conferido com o manifesto, cópia dos hidden fields e POST multipart para a mesma URL. Edição: GET da URL do ID encontrado, conferência dos valores originais e cópia **verbatim** dos campos `$ACTION_REF_`/`$ACTION_*` e dos argumentos bound. Não há reconstrução de closures; eventual material criptografado permanece opaco.

Ambos os submits exigem 303 para o catálogo no mesmo origin, seguido de GET independente que confirme os valores persistidos. Exclusão: HTTP POST ao catálogo, `Next-Action` obtido do worker correspondente, corpo gerado pelo **encoder oficial instalado** `encodeReply([ownId])`. Exige 200 `text/x-component`, ausência de erro/redirect de action e, principalmente, desaparecimento do registro na busca e 404 na edição do ID. Não depende de considerar um 200 de action como sucesso de negócio.

Identidade temporária: código `HML-<UUID>`, nome com timestamp/UUID e descrição com marcador privado. Código, nome, ID e timestamp de rastreio ficam em memória e não entram no JSON público.

### Cleanup

O `finally` do CRUD é armado **antes** de disparar a criação. Mesmo se a resposta falhar depois do commit, a busca é repetida pelo código UUID, sem repetir create/update. A seleção exige no máximo uma linha de código exato; antes de excluir, confere ID conhecido quando disponível, nome/descrição privados, formulário de edição e zero almoxarifados vinculados. Só a action de exclusão desse ID é chamada; não há delete por prefixo, SQL direto, limpeza de catálogo inteiro ou remoção de auditoria.

Se a resposta de criação for ambígua e o registro não for encontrado nas três leituras de recuperação, o resultado é **FAIL / cleanup UNCONFIRMED**. O script não declara limpeza concluída nem amplia o delete. Interrupção abrupta do processo/servidor também não pode ser coberta por um `finally` em execução; o relatório nunca certifica um cenário que não confirmou.

## Saída e interpretação

- Somente JSON sanitizado em stdout: scope, origin allowlisted, status, contagem dos vinte domínios/checks, códigos estáticos de falha, status HTTP e resultado/cleanup do CRUD.
- Nenhum arquivo de evidência é criado pelo script. HTML privado, Flight, response bodies de identidade/auditoria, Set-Cookie, tokens, headers, e-mail, UID, claims, IDs de action e identidade temporária não são gravados ou impressos.
- Erros de bibliotecas são reduzidos a código estático, sem `message`, `stack` ou `cause` crus. Falha produz exit code 1; PASS do escopo solicitado produz 0.
- Timeout de 90 s por chamada da aplicação, 60 s no exchange Firebase; bodies privados limitados a 16 MiB em memória, exchange a 128 KiB. Não há retry automático de autenticação ou mutação.

## Verificação local desta frente

- `node --check .agent/drizzle-final-homologation.mjs`: **PASS**, após a revisão final.
- `node node_modules/eslint/bin/eslint.js .agent/drizzle-final-homologation.mjs --max-warnings=0`: **PASS**, zero erros/warnings.
- HTTP, emissão/exchange de token, sessão, audit read, CRUD, servidor, browser, PGlite, typecheck e build: **não executados nesta frente**.

A entrega prepara o procedimento; não é evidência de homologação autenticada PASS. O parent deve registrar o JSON sanitizado e o resultado depois do build final e da execução efetiva.
