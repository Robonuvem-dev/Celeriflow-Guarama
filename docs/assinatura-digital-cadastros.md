# Central de Assinaturas — lote cadastros

## Entrega

- `/assinatura-digital/usuarios`: listagem integral, cadastro, edição e ativação/inativação; nome, cargo, CPF/CNPJ, telefone, celular, e-mail, validade com horário local e senha pessoal somente para gravação. Na edição, senha vazia preserva a existente. Conta do aplicativo opcional por ID, validada pelo serviço, sem alteração de perfil/permissões.
- Origens Servidor RH/Cidadão: busca com debounce, cancelamento de requisições antigas, mínimo 2 caracteres, máximo 100 caracteres e 20 candidatos. Candidatos preenchem nome/cargo/documento/contatos e IDs de origem; a associação e os dados canônicos continuam sujeitos à validação do serviço. Trocar o tipo de origem limpa os vínculos antigos.
- **Revisão principal:** cidadão inicia no modo **Manual**, com CPF ou CNPJ válido e `personId/employeeId = null`; pode optar por importar cadastro existente. Servidor exige seleção no RH. O modo fica no rascunho da UI, sem ampliar o DTO; alternar modo limpa vínculos sem apagar os dados digitados. Candidatos são apresentados em select nativo com acesso aos 20 resultados, sem lista com rolagem vertical desktop.
- `/assinatura-digital/documentos`: tipos documentais com nome, descrição e estado ativo. A edição mantém o ID original, inclusive após falhas e troca de seleção. Limites de 160 caracteres no nome e 2.000 na descrição.
- Tabelas reutilizam `OperationalTable`, `OperationalPagination` e `OperationalListFrame`: padrão operacional 13px/24px/20 linhas. Busca e filtros de situação/validade são aplicados ao conjunto completo antes do recorte; página é limitada ao intervalo disponível.
- Usuários tem **12 colunas independentes**: Nome, Cargo, CPF/CNPJ, Telefone, Celular, E-mail, Origem, Validade (data/hora), Vigência, Senha, Situação, Ações. A soma dos mínimos é **1.050px**; o componente compartilhado mede o espaço e oferece detalhes somente quando houver overflow. Senha exibe exclusivamente **Definida/Pendente** a partir de `hasPassword`.
- Formulários em diálogos acessíveis com título/descrição, labels, status e erros anunciados. Rascunhos por registro ficam no componente pai durante fechamento, troca de seleção e filtros. Gravações bloqueiam reenvio/fechamento concorrentes. Falha retornada, falha de rede ou resposta sem registro confirmado mantém os dados; sucesso atualiza a lista com o DTO confirmado pelo servidor.
- Ambos os diálogos usam `OperationalPagedContent` com `device` de `useOperationalWorkspace`, layout flex e máximo `calc(100dvh - 16px)`. Cabeçalho e rodapé ficam visíveis; o corpo é paginado no desktop e pode rolar em tablet/celular. O formulário é único, com controles habilitados/montados em todas as partes, preservando validação nativa fora da página.

## Fronteiras de servidor

- Actions `saveSignerAction` e `saveDocumentTypeAction`, chamadas com `await`, retornam `{ error: string | null }` e o respectivo DTO seguro apenas quando há sucesso.
- Cada action chama `getTenantContextForModuleOperation("ASSINATURA_DIGITAL", id ? "update" : "create")`; entradas passam por schemas Zod com allowlist, removendo propriedades extras antes da chamada ao serviço.
- Normalizador de usuários alinhado às regras do core consultadas: nome de 2–200 caracteres, cargo até 160, sem caracteres de controle; CPF/CNPJ com dígitos verificadores, enviado sem máscara; contatos opcionais de 8–15 dígitos e até 40 caracteres, e-mail aparado/minúsculo até 254 caracteres, validade ISO canônica; senha nova de no mínimo 8 caracteres e até 1.024 bytes UTF-8, senha vazia permitida na edição; IDs opcionais vazios viram `null`. Não há truncamento silencioso. RH obrigatório e cidadão sem vínculo RH são validados antes do serviço.
- Conta opcional não carrega/exibe dados de outro usuário. A UI explica a exigência de correspondência documental; o ID segue para a validação de CPF/CNPJ/e-mail/RH do backend e não representa concessão de acesso pela UI.
- Páginas usam o guard de leitura do módulo e permissões independentes de criação/atualização para os controles.
- `GET /api/assinatura-digital/origens?kind=SERVIDOR|CIDADAO&q=...` usa o guard do módulo, `searchCentralOrigins`, resposta mínima e `Cache-Control: no-store`. O serviço reafirma create/update na busca e suas próprias regras sobre as fontes.
- DTOs de saída têm allowlist explícita; nenhuma senha/hash é encaminhada na leitura ou no retorno de gravação. Validade é serializada como ISO, preservando milissegundos na edição e convertendo para horário local apenas no controle de formulário.
- Integração exclusivamente com as cinco funções previstas no contrato: `listCentralSigners`, `saveCentralSigner`, `listCentralDocumentTypes`, `saveCentralDocumentType`, `searchCentralOrigins`.
- Exclusão operacional por inativação: o contrato não expõe exclusão física.

## Verificação executada

```powershell
node --import tsx --test "tests/signature-central-cadastros.test.ts"
node --test "tests/signature-central-cadastros.browser.test.mjs"
node "tests/signature-central-cadastros-typecheck.mjs"
npx eslint --max-warnings=0 "src/app/app-domain/assinatura-digital/usuarios" "src/app/app-domain/assinatura-digital/documentos" "src/app/api/assinatura-digital/origens/route.ts" "tests/signature-central-cadastros.test.ts" "tests/signature-central-cadastros-typecheck.mjs" "tests/signature-central-cadastros.browser.test.mjs" "tests/signature-central-cadastros-browser.fixture.tsx"
```

Resultado da revisão: **10 testes unitários/handlers + 4 testes em Chromium aprovados**, lint sem erros/avisos, TypeScript **strict/noEmit sem diagnósticos**, incluindo dependências importadas e fixture TSX. O runner de tipos não gera arquivos nem executa typegen/build.

Casos cobertos: datas inválidas e roundtrip local/ISO; limite exato da validade; ausência de senha/hash em DTOs; allowlist nas gravações; senha inicial versus atualização vazia; preenchimento de candidato preservando demais campos; 20/20/1 e busca posterior à primeira página; combinação de situação/validade; guards create/update e bloqueio antes do serviço; erros retornados; mínimo/máximo/limite e payload mínimo da API; estado dos formulários após erro/rede, fechamento e troca de seleção; manutenção do ID no retry; atualização da lista confirmada; consulta/criação/edição com permissões independentes; bloqueio de envio duplicado e resposta sem DTO.

Testes de browser usam os componentes React, Base UI, tabela/paginação/paged content e CSS Modules/Tailwind reais, em **1280×650**, com fixture de **80 registros**. Cobrem: visibilidade das 12 colunas e dados individuais; linha 24px/fonte 13px e ausência de conflito de medição; status Definida/Pendente; cidadão manual CPF e CNPJ; seleção do 20º candidato; mudança RH/importação/manual limpando vínculos; nós DOM preservados; foco e validação nativa de campo obrigatório fora da página; rascunhos de registros 1 e 80 entre páginas, fechamento, erro e retry; edição com senha vazia; cabeçalho/rodapé/popup dentro do viewport e corpo desktop sem rolagem livre. O teste utiliza Playwright Core já instalado em `C:/Users/thiag/AppData/Local/Temp/opencode/node_modules/playwright-core` (override `PLAYWRIGHT_MODULE_PATH`) e Chrome local (override `CHROMIUM_PATH`).

Nos testes unitários, handlers/estado são exercitados por harness de hooks. No Chromium, somente a fronteira de actions/HTTP é substituída por serviço de teste em memória, inclusive a preservação da senha. Esses testes verificam binding/contratos e layout real, sem afirmar integração com banco ou criptografia real. Build, acesso ao banco real, commits e push não foram executados.

## Ponto de integração para executor backend/principal

O ponto de contexto/transação apontado na primeira entrega foi corrigido pelo executor core: a implementação consultada agora aceita o `context.database === db` normal. Também foram observadas no core as regras de cidadão manual, contato e correspondência da conta opcional; o normalizador deste lote acompanha os limites acima. Revalidação de origem importada, persistência canônica, regra SQL e vínculo de conta continuam sob responsabilidade do core. As actions passam o `AppContext` normal e o mesmo DTO, sem alterar backend, navegação ou permissões compartilhadas. Não foram executadas transações reais.

## Arquivos do lote

- `src/app/app-domain/assinatura-digital/usuarios/{page.tsx,UsuariosClient.tsx,actions.ts,cadastro-model.ts}`
- `src/app/app-domain/assinatura-digital/documentos/{page.tsx,DocumentosClient.tsx,actions.ts,cadastro-model.ts}`
- `src/app/api/assinatura-digital/origens/route.ts`
- `tests/signature-central-cadastros.test.ts`
- `tests/signature-central-cadastros-typecheck.mjs`
- `tests/signature-central-cadastros-browser.fixture.tsx`
- `tests/signature-central-cadastros.browser.test.mjs`
- Este documento.
