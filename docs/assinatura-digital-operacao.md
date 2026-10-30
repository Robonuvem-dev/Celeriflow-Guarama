# Central de Assinaturas — lote Operação UI

Data: 29/10/2026.

## Entrega

- `/assinatura-digital/assine-agora`: dados iniciais pelos serviços `listCentralSigners`, `listCentralDocumentTypes`, `listCentralA1Integrations`, com contexto/permissão de módulo. Seleção de assinador, tipo, INTERNAL/A1 e-CPF/A1 e-CNPJ e integração. Senha pessoal do assinador selecionado, apagada do estado após cada tentativa e nunca persistida no navegador.
- Lote de até 20 arquivos, 3 MiB por arquivo, formatos previstos no contrato. Os objetos `File` e os UUIDs ficam no componente pai. A seleção acima de 20 é rejeitada por inteiro, sem truncamento silencioso. Arquivos inválidos são identificados individualmente e não enviados.
- `POST /api/assinatura-digital/assinar` real, multipart, um arquivo por requisição, processamento sequencial. Resultados individuais, continuação após uma falha, arquivos preservados para retry, UUID estável, sucessos não reenviados. Metadados da tentativa ficam bloqueados para impedir mudança do envelope com o mesmo requestId. A senha pode ser corrigida no retry. Novo lote descarta explicitamente os pendentes e cria novas intenções; retry deve usar o lote existente, especialmente se a resposta anterior foi perdida.
- Inativo, vencido, sem senha cadastrada, tipo inativo e integração incompatível/inativa/fora da validade bloqueiam o envio. Validade é atualizada no cliente e reavaliada no submit; autorização/vínculo do titular continuam reafirmados pelo backend.
- Original preservado e comprovante JSON destacado apresentados como artefatos diferentes, sem alegação PAdES. Regra de Blob privado por 90 dias e `expiresAt` visíveis. Downloads por fetch autenticado para `/documentos/[id]` ou `/comprovantes/[id]`, com mensagem de falha/410. Nenhuma URL remota/Blob pública é usada. O comprovante continua acessível após o fim da retenção do original.
- `/assinatura-digital/registros`: `listCentralSignatureRecords(context)` é a fonte integral já autorizada por ator/assinador/administrador. Busca no conjunto completo antes de recortar; total real e página corrigida; 20 registros/página. Componentes `OperationalListFrame`, `OperationalTable`, `OperationalLinkPagination` existentes, com fonte 13px, linhas de 24px, larguras/detalhes e ações compactas. Painel de detalhes com hash, datas, dados do registro e downloads autenticados.
- `/assinatura-digital/validacao` e `/validar-assinatura`, `/validar-assinatura/[code]`: formulário compartilhado acessível, envio público multipart POST real, arquivo/código/ambos, confirmação explícita pelo botão, sem envio automático ao abrir o link. Código em query `?code=` aceito. Estados válido/inválido/indisponível distintos e indicação `fileCompared`. Falha técnica não é tratada como prova inválida. Arquivo e código permanecem após erro.
- Exibição pública somente dos campos permitidos pelo `CentralValidation`, incluindo `signerDocumentMasked`; sem identidade privada, telefone, e-mail, URL Blob, senha ou certificado/chave. Nenhum spread de dados do backend na UI pública.
- Entrada de URL apenas extrai código de `/validar-assinatura/[code]` ou `?code=`. Não navega nem faz fetch para a origem digitada, ignora parâmetros adicionais como `next`, rejeita caracteres de controle/caminho/esquema no código, renderiza texto escapado pelo React. Não fixa prefixo CFS nem regex de UUID no frontend.
- Loading/error boundaries próprias para carregamento de Assine Agora e Registros; erro de submissão é local e não desmonta o rascunho.

## Evidências executadas

1. `node --import tsx --test tests/central-operation-ui.test.ts`: **4/4 passando**. Verifica multipart com bytes originais, senha e seleção corretas, concorrência máxima 1, continuação após falha de rede, retenção do mesmo File, UUID de retry e exclusão dos sucessos. Também testa limite exato de 3 MiB, validade/inativo, busca após o 20º registro, total/paginação e extração segura de código/URL.
2. `tests/central-operation-browser.test.mjs`: **1/1 passando em Microsoft Edge headless/Playwright**. Renderiza os componentes reais e seus controles, bundle isolado via esbuild e servidor HTTP local stub; não inicia Next nem importa serviços/banco. Testa inativo/vencido, rejeição de seleção com 21 arquivos, preservação ao mudar controles, submissão real por botão, campos/bytes multipart, sequência, falha individual, senha limpa após tentativa, arquivos retidos, retry com mesmo UUID, sucesso não repetido, downloads reais do original/JSON pelos endpoints previstos. Validação por código, ambos, somente arquivo; CPF mascarado, `fileCompared`, válido/inválido/503, retirada do resultado anterior e retry sem novo upload. Zero erros JavaScript no navegador.
   - Playwright foi instalado somente em `C:\Users\thiag\AppData\Local\Temp\opencode\signature-ui-browser`; dependências do projeto não foram alteradas.
   - Reprodução PowerShell: `$env:CENTRAL_UI_PLAYWRIGHT='C:\Users\thiag\AppData\Local\Temp\opencode\signature-ui-browser\node_modules\playwright'; $env:CENTRAL_UI_BROWSER_CHANNEL='msedge'; node --test tests/central-operation-browser.test.mjs`.
   - Em outro ambiente pode-se usar um módulo Playwright já instalado e omitir o channel para Chromium.
3. `node --max-old-space-size=8192 tests/central-operation-typecheck.mjs`: **18 arquivos próprios, zero diagnósticos próprios**, reexecutado após o ajuste do diálogo. Resolve dependências para verificar os imports/DTOs existentes, filtra diagnósticos ao escopo próprio. Não é declaração de aprovação do typecheck global.
4. ESLint direcionado às três rotas, validação pública, componente compartilhado e `tests/central-operation*`: **zero erros/avisos**.
5. `tests/central-operation-records-browser.test.mjs`: **1/1 passando em Edge headless, viewport 1280×650**, com dois cenários (CPF e CNPJ), nome/título longos e hash SHA-256 completo. Usa CSS real do módulo e utilitários Tailwind dos componentes, provider operacional desktop e controles reais. Verifica popup contido na viewport, `overflow:hidden` no diálogo/corpo, ausência de rolagem global, navegação por partes e leitura integral de nome/hash/CPF/CNPJ. Rodapé, download, validação e Fechar permanecem disponíveis em todas as partes; wheel não altera a página de leitura. Fechar devolve foco ao disparador. Com original expirado/excluído, o botão do original fica desabilitado e o comprovante é baixado pelo GET autenticado previsto; `downloadedReceipt` é JSON idêntico ao corpo HTTP stub, com `record.expiresAt` vencido, evidência, `verified:true` e `format:detached-evidence-v1`, sem erro na UI. Não há exportação CSV nem credenciais na fixture/recibo. Zero erros JavaScript.
   - Mesmo ENV Playwright/channel da evidência 2; executar `node --test tests/central-operation-records-browser.test.mjs`.
   - ESLint focado em `RecordActions.tsx` e nos novos testes: zero erros/avisos.

## Ajuste final de geometria — antes do build principal

`RecordActions.tsx` agora obtém `device` por `useOperationalWorkspace`, usa o diálogo operacional com altura limitada a `min(42rem, 100dvh - 16px)` e `OperationalPagedContent`. Cabeçalho de tamanho estável, dados longos no corpo paginado, campos marcados como blocos de leitura e rodapé permanente com downloads/validação/Fechar. O nome do arquivo deixou de expandir o cabeçalho. Em desktop não há `overflow-auto` global; o componente operacional controla a leitura por partes. Estados de erro de download continuam no rodapé. Esse foi o único arquivo de produção alterado nesta revisão.

Não houve execução de build, typegen, npm ci, seed/migração, escrita em banco, commit ou push. Os testes de navegador não comprovam Blob/criptografia/autorização no backend: exercitam a integração HTTP da UI com stubs isolados.

## Integração e lacunas resolvidas

1. **Proxy resolvido pelo principal e conferido por leitura:** `src/proxy.ts` agora reconhece `^/validar-assinatura(?:/[^/]+)?/?$` junto das validações públicas, antes do rewrite/autenticação. Esta frente não alterou proxy.
2. **Navegação/workspace resolvidos pelo principal e conferidos por leitura:** a navegação inclui Assine Agora, Validação e Registros; o manifesto registra Registros e mantém Assine Agora/Validação fora da listagem operacional. Esta frente não alterou nav/manifesto/layout.
3. **Código resolvido por decisão do principal:** o contrato real mantém UUID de 36 caracteres; não há pendência para implementar prefixo CFS. O validador extrai o código como texto e o backend continua sendo a autoridade do formato. Referências CFS nas fixtures originais são dados sintéticos do stub, sem promessa de suporte backend. O novo teste de Registros/download usa UUID real de formato compatível. Links usam a página exclusiva da Central.
4. **Geometria do diálogo resolvida nesta revisão:** corpo limitado/paginado e rodapé fixo, comprovados em 1280×650 com dados longos, conforme evidência 5.
5. **Verificação global/deploy:** build/typegen e verificação integrada final seguem com o principal. Conforme retorno do principal, backend possui limite de 60/min por ator, bloqueio por 10 falhas de senha por assinador e lote real de 20 aprovado; essas evidências backend não foram reexecutadas por esta frente. Nenhuma lacuna adicional de contrato identificada nesta revisão. Os testes locais continuam isolados de banco/Blob.

## Portal do Cidadão — conferência de código, somente leitura

Existem a entrada administrativa `src/app/app-domain/portal-cidadao/page.tsx`, o portal público `src/app/portal/page.tsx`, login `/portal/entrar` e área do cidadão `/portal/minha-area`. A página administrativa oferece “Abrir Portal Público” para `/portal`. Isso comprova disponibilidade das rotas no código, não disponibilidade de produção/DB. Nenhum menu/fluxo de assinatura do Portal do Cidadão foi adicionado ou alterado.

## Regras consultadas

`AGENTS.md`, `docs/ASSINATURA_DIGITAL_CONTRATO_IMPLEMENTACAO.md`, `src/lib/contracts/signature-central.ts`, docs instalados Next `page.md` e `use-client.md`, componentes operacionais e assinaturas atuais dos serviços central/A1. `params`/`searchParams` tratados como Promises; serviços no servidor e somente DTOs serializáveis no client.
