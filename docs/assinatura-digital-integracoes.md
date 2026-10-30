# Central de Assinaturas — lote Integrações A1

## Entrega e fronteiras

- Página `/assinatura-digital/integracoes`: inventário operacional de 20 linhas/página, busca antes da paginação, detalhes de conteúdo integral pelo componente padrão, ações de edição/ativação e suspensão, formulários em Dialog de três etapas e contexto operacional isolado. Uma superfície operacional local permite abrir a página enquanto o executor principal integra o manifesto.
- API autenticada `/assinatura-digital/integracoes/api`: GET inventário (view); GET `?id=` configuração **pública** para edição (admin + update); POST cadastro/atualização; PATCH `{id,active:false}` suspensão. POST/PATCH exigem JSON de mesma origem, com corpo limitado a 384000 bytes. Leituras têm `Cache-Control: no-store`. Erros de validação são retornados como `{error:string}`, sem detalhes SQL/OpenSSL/segredos.
- Exports contratuais em `src/lib/signatures/central-a1.ts`: `listCentralA1Integrations`, `saveCentralA1Integration`, `signCentralA1Envelope`, com parâmetros e retornos do contrato de implementação. `CentralA1Input` exportado. Exports adicionais restritos à gestão: `getCentralA1PublicConfiguration` e `suspendCentralA1Integration`.
- `SignatureCentralA1Integration` tem FK RESTRICT para o inventário público `DigitalCertificate`. O schema importa somente inventário compartilhado e utilitário de IDs, nunca o schema principal da Central. Finalidade exclusiva `SIGNATURE_CENTRAL`, revalidada na assinatura e atualização. Nenhuma alteração nos serviços A1 anteriores ou em `icp-brasil.ts`.

## Identidade, cadeia e evidência

`central-a1-certificate.ts` lê DER do SAN `otherName`, sem usar CN, texto livre ou titular autodeclarado como prova:

- `2.16.76.1.3.1`: data de nascimento (8 dígitos) seguida de CPF (11), com dígitos verificadores válidos.
- `2.16.76.1.3.3`: CNPJ (14), com dígitos verificadores válidos. A presença desse OID vincula o tipo e-CNPJ, mesmo havendo CPF da pessoa responsável no mesmo certificado.
- Valores ausentes, ambíguos, inválidos ou não suportados são rejeitados com explicação. CA não pode ser cadastrada como certificado do titular. O nome digitado é apenas rótulo de gestão.

Cadastro/atualização, inclusive inativos, exigem prova de titular, tipo/documento correspondente e validação criptográfica real da configuração. A resolução ENV, correspondência da chave, validade de folha/intermediárias/raiz, vínculo da cadeia e assinatura/verificação usam as APIs existentes sem relaxar seus controles. Suspender continua possível com ENV ausente ou certificado vencido.

Assinatura reafirma create de `ASSINATURA_DIGITAL`, integração ativa, status do certificado, finalidade exclusiva, tipo/método e igualdade do documento do assinador com o titular configurado e com o documento extraído do certificado. Locks compartilhados protegem integração e certificado durante a assinatura; funciona também dentro da transação do backend principal (savepoint, validado no PGlite).

O hash do envelope é assinado como `DocumentHashSignatureResult`, com `documentVersionId=recordId`. O retorno inclui certificado público na evidência, cadeia intermediária e raiz em snapshot; o consumidor deve persistir esses valores e reconstruir `evidence.signedAt` como Date na leitura. Teste verifica snapshot após atualização/suspensão/alteração de ENV, sem consultar a configuração atual. O backend do outro executor já consome o helper e reutiliza a prova de titular na verificação histórica.

## Configuração operacional

1. Administrador prepara certificado A1 público, intermediárias em ordem e raiz confiável, conferindo sua origem oficial ICP-Brasil.
2. Fora da aplicação, configure `PREFIX_PRIVATE_KEY_PEM` e, para chave cifrada, `PREFIX_PRIVATE_KEY_PASSPHRASE`. No cadastro envie somente `PREFIX` em `credentialReference`. Nenhuma chave privada, senha ou PFX é recebida/persistida/retornada pelo cadastro. Referências ENV são metadados, não valores secretos.
3. Configure assinatura **interna** separadamente com `SIGNATURE_CENTRAL_PRIVATE_KEY_PEM`: RSA >=2048 bits, EC ou Ed25519. O indicador valida tipo e assinatura/verificação real, alinhado ao backend interno. Não gera chave temporária automaticamente.
4. Configure `BLOB_READ_WRITE_TOKEN` para armazenamento privado. O indicador informa somente presença da configuração, não conectividade ou permissões reais do provedor.
5. Arquivos têm retenção de **90 dias**; após expiração não há download do original. Metadados, hashes e evidências públicas persistem para histórico e verificação. Original preservado + evidência destacada; não se produz nem se promete PAdES.

Certificados/chaves de fixtures são gerados em diretório temporário isolado, têm CA própria e são removidos no finally. Nunca adicionar essas raízes a confiança de produção. ENV de fixtures é restaurada após os testes.

## Migração e rollback

SQL futuro: `db/migrations/20261029190100_signature_central_a1/migration.sql`. Depende da tabela compartilhada `DigitalCertificate` já existente. Não depende da migração principal da Central. Inclui restrição tipo/comprimento do documento, FK e unicidade do vínculo de certificado.

Rollback manual: `DROP TABLE "SignatureCentralA1Integration";`. Preserva o inventário compartilhado e seus certificados públicos; não apaga certificados em uso por outros módulos. O teste aplica o SQL exato, exercita FK/check, faz rollback, confirma preservação do inventário e reaplica a migração. Nenhum comando foi executado em banco real.

## Verificações offline

```powershell
node --conditions=react-server --import tsx --test tests/central-a1.test.ts
node tests/helpers/check-central-a1-types.mjs
npx eslint "src/lib/signatures/central-a1.ts" "src/lib/signatures/central-a1-certificate.ts" "src/db/schema/signature-central-a1.ts" "src/app/app-domain/assinatura-digital/integracoes" "tests/central-a1.test.ts" "tests/helpers/central-a1-certificates.ts" "tests/helpers/check-central-a1-types.mjs"
```

Os testes usam OpenSSL real e PGlite em memória, sem mocks de criptografia ou serviços de persistência. A fronteira HTTP substitui somente resolução de sessão por contextos controlados, mantendo handlers e serviços reais. Cobertura: raiz/intermediária/folha; e-CPF/e-CNPJ; CPF da pessoa responsável não confundido com titular CNPJ; CPF/CNPJ divergentes; tipo incompatível; certificado sem prova SAN mesmo com CPF no CN; raiz errada/cadeia incompleta; chave incompatível/ausente; chave cifrada com senha correta/incorreta; certificado vencido; view/create/admin; isolamento de finalidade; hash adulterado; snapshot histórico; transação aninhada; rollback atômico em conflito de fingerprint; API cadastrar/editar/ativar/suspender, mesma origem, payload excessivo/campo secreto inesperado; ausência de segredo em DTO e banco; status interno RSA/EC/Ed25519, RSA fraca e ENV inválida/ausente.

Typecheck usa TypeScript Program em dez entrypoints (incluindo declaração global do Next instalado e fixture standalone de navegador) e dependências importadas. Sem build, typegen, npm ci, commit ou push.

Resultado: **2 testes passaram, 0 falhas, 0 skips**; typecheck focado passou; ESLint dos arquivos do lote passou sem erros/avisos. Os dois testes agregam os cenários listados acima; não se trata de dois testes de presença de código. A verificação histórica inclui rotação real do certificado/chave e compara fingerprints anterior/posterior.

## Lacunas de evidência / integração do principal

- Navegação e manifesto operacional pertencem ao executor principal: incluir `/assinatura-digital/integracoes` como inventário operacional; não tratar Dialog/formulário paginado como tabela. Este lote não edita esses arquivos.
- Ensaio standalone em navegador real concluído em **1366×650**, com componentes e CSS/Tailwind reais: 13px de fonte, 24px por linha, 20/1 registros entre páginas; as três etapas do Dialog e erros de gravação cabem sem overflow/clipping/rolagem; foco contido nas etapas e nos alertas; preservação dos campos ao voltar; edição com DTO público; POST/PATCH sem campos de chave/senha; permissões somente leitura; texto de 90 dias e ausência de promessa PAdES. A API HTTP deste ensaio é fixture, não sessão Firebase/banco real. Outras resoluções e fluxo Next autenticado ainda dependem de inspeção integrada.
- Fixtures comprovam criptografia e regras dos OIDs suportados, não homologação com certificado comercial ICP-Brasil, consulta OCSP/LCR ou revogação externa. A confiança de produção continua sendo a raiz configurada pelo administrador, conforme mecanismo preexistente; este lote não implementa catálogo nacional de raízes/políticas A1/A3.
- Sem leitura de valores secretos nem teste de conectividade Blob/ENV de produção. O indicador Blob só comprova presença de configuração.
- Migração real, build/typegen e validação ponta a ponta arquivo → retenção/download → validação pública são da revisão integrada do principal. Este lote comprova assinatura do hash do envelope recebido e snapshots; cálculo dos bytes reais, composição/persistência do envelope, armazenamento e limpeza pertencem ao backend principal.

## Revisão UX solicitada pelo principal

- `canManage=isSystemAdministrator(user)` é equivalente à gestão create/update neste core: `canPerformModuleOperation` retorna true imediatamente para administrador do sistema. O guard `getTenantContextForModule` impede acesso com o módulo inativo antes da renderização. Nenhuma mudança redundante de permissão foi necessária; o backend continua reafirmando admin + operação.
- Status interno/Ed25519 foi preservado.
- `getCentralA1PublicConfiguration` constrói DTO por whitelist, sem espalhar o registro legado `DigitalCertificate`; teste HTTP afirma as dez chaves exatas, cadeia pública e ausência de campos/valores de chave privada/senha.
- Teste de suspensão reforçado: com ENV da chave ausente, configuração pública permanece idêntica exceto `active=false`, registro público do certificado fica integralmente inalterado e a prova anterior continua válida.
- O ensaio real encontrou perda de foco ao desabilitar o botão durante erro de gravação. A UI agora posiciona foco no primeiro controle de cada etapa e no alerta de erro. Respostas não JSON são convertidas em mensagem fixa, sem mostrar conteúdo bruto do servidor.
- Novo teste dirigido: `node --test tests/central-a1-browser.test.mjs`. Usa esbuild em memória + PostCSS/Tailwind e Edge headless via Playwright externo ao workspace; não inicia Next, não faz build/typegen e não lê ENV da aplicação. Dependência externa opcional: `CENTRAL_UI_PLAYWRIGHT` (caminho do módulo Playwright); navegador configurável por `CENTRAL_UI_BROWSER_CHANNEL` (padrão `msedge`).
- Resultado desta revisão: navegador standalone **1 passou / 0 falhas / 0 skips**; teste dirigido `node --conditions=react-server --import tsx --test --test-name-pattern "Central A1:" tests/central-a1.test.ts` **1 passou / 0 falhas / 0 skips**, incluindo DTO público e retenção integral de metadados na suspensão; typecheck dos dez entrypoints passou; ESLint dos arquivos alterados/novos passou. Os cenários cripto anteriores já estavam cobertos; não foram executadas suítes amplas da aplicação.
