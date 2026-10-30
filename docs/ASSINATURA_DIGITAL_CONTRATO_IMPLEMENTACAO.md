# Central de assinatura — contrato de implementação

Solicitação de 29/10/2026: Cadastro de Usuários; Documentos (tipos); Assine Agora; Validação; Integrações A1 e-CPF/e-CNPJ. Os documentos agora **devem ser armazenados no Blob por 90 dias**, decisão posterior que substitui a ausência de retenção inicialmente pedida. Após a expiração, downloads ficam indisponíveis e a rotina exclui os blobs; metadados/hashes/evidência permanecem para validação e histórico. Não alterar os fluxos antigos dos outros módulos. Verificar Portal do Cidadão e informar disponibilidade, sem implantar assinatura pública ainda.

## Limites entre executores

- Principal: contrato DTO, navegação/manifesto, integração geral, Vercel cron, documentação, revisão de permissões, verificação final/build.
- Backend central: `src/db/schema/signature-central.ts`, `src/db/repositories/documents/central.ts`, `src/lib/signatures/central-{service,evidence,password,retention,storage}.ts`, SQL futuro `db/migrations/20261029190000_signature_central/*`, APIs `/api/assinatura-digital/{assinar,validar,documentos/[id],comprovantes/[id],retencao}`. Testes exclusivos backend.
- Cadastros: páginas/components/actions sob `/assinatura-digital/usuarios` e `/assinatura-digital/documentos`, endpoint `/api/assinatura-digital/origens`. Sem schema/migração/backend central.
- Operação UI: `/assinatura-digital/assine-agora`, `/assinatura-digital/validacao`, `/assinatura-digital/registros`, componente compartilhado público `src/components/signatures/CentralValidationForm.tsx`, página pública `/validar-assinatura`. Sem outras páginas antigas, APIs/schema/core.
- A1: `/assinatura-digital/integracoes/*`, `src/lib/signatures/central-a1.ts`, schema `signature-central-a1.ts`, SQL futuro `db/migrations/20261029190100_signature_central_a1/*`. Testes exclusivos A1. Não alterar `icp-brasil.ts` nem serviço A1 existente.

Todos usam Drizzle, AGENTS.md e docs Next instalados. Ler cada arquivo e consumidores antes alterar exports. Sem scripts replace, commits/push, seeds ou alterações no banco real. Apenas principal roda build/typegen. Cada executor registra resultado em `docs/assinatura-digital-<lote>.md`, com testes reais e limites.

## Contratos tipados

DTOs em `src/lib/contracts/signature-central.ts` pertencem ao principal. Datas retornadas ao client são ISO strings. Nunca retornar hash de senha ou chaves privadas.

Backend central deve exportar de `central-service.ts`:

```ts
listCentralSigners(context: AppContext): Promise<CentralSigner[]>
saveCentralSigner(context: AppContext, input: CentralSignerInput): Promise<CentralSigner>
listCentralDocumentTypes(context: AppContext): Promise<CentralDocumentType[]>
saveCentralDocumentType(context: AppContext, input: { id?: string; name: string; description: string; active: boolean }): Promise<CentralDocumentType>
searchCentralOrigins(context: AppContext, kind: CentralSignerKind, query: string): Promise<CentralOrigin[]>
listCentralSignatureRecords(context: AppContext): Promise<CentralSignatureRecord[]>
```

Esses serviços reafirmam permissões `ASSINATURA_DIGITAL`: view nas leituras, create/update conforme id nas gravações, create/update na busca de origem. `AppContext` é o tipo existente; APIs/actions também usam `getTenantContextForModule[Operation]`.

Backend pode exportar funções internas adicionais para APIs/testes. Password: scrypt com salt aleatório, timing-safe, nunca plaintext persistido/listado; cadastro exige senha inicial, atualização vazia preserva a existente. Não permitir prazo vencido/inativo na assinatura. Validar CPF/CNPJ, vínculo RH/pessoa e existência de accountUserId no servidor, usando fontes canônicas e dados mínimos. Busca mínimo 2 caracteres, máximo 20 candidatos. Contadores e filas não podem ser truncados silenciosamente.

## Assine Agora / APIs

- `POST /api/assinatura-digital/assinar`: sessão normal + operação create; multipart com **um arquivo por requisição**, campos `file`, `signerId`, `documentTypeId`, `method` (`INTERNAL|A1_ECPF|A1_ECNPJ`), `integrationId` opcional, `password` (senha pessoal do assinador), `requestId` (UUID idempotência por usuário). Resposta `{ record: CentralSignatureRecord }` ou `{ error: string }` com status apropriado. A UI processa lote com requests individuais e mantém IDs estáveis nos retries, não reenvia os concluídos e mostra sucesso/erro individual.
- Limite de arquivo **3 MiB**, máximo **20 documentos por lote UI**. Tipos PDF, JPEG, PNG, TXT, DOC/DOCX, ODT; verificar tipo/assinatura física quando aplicável e nome seguro. Hash **servidor** SHA-256 dos bytes reais. Não aceitar hash/URL escolhido pelo cliente como prova de arquivo.
- Arquivo original preservado + comprovante/evidência destacada. Não afirmar PAdES nem alterar visualmente o PDF. Blob **privado**; URL jamais retornada como acesso público; downloads por endpoint autenticado, expiração obrigatória tanto no endpoint quanto na limpeza. Evidência assina metadados canônicos, identidade/CPF/cargo capturados, tipo, arquivo/hash/tamanho, código, prazo, ator e instante. INTERNAL com chave persistente protegida do servidor (`SIGNATURE_CENTRAL_PRIVATE_KEY_PEM`, nunca gerar chave descartável automaticamente); chave pública e fingerprint em snapshot para verificação histórica. Publicar estado de configuração na página Integrações. Criar comprovante JSON a partir da evidência persistida, sem depender de Blob após 90 dias.
- A1: usar `central-a1.ts` abaixo, assinar hash do envelope canônico (que contém o hash real do arquivo), não só metadados mutáveis. Verificar assinatura, cadeia, validade na data da assinatura e vínculo do titular ao CPF/CNPJ selecionado. Rotação posterior de chave/configuração não invalida snapshots históricos. Consulta pública mascara CPF/CNPJ e omite telefone/e-mail/URL blob/segredos.
- `POST /api/assinatura-digital/validar`: público, multipart `file?` e/ou `code`; exige um dos dois, até3MiB, hash real no servidor. Resposta `CentralValidation` com comparação de arquivo indicada. Código+arquivo divergentes deve dar inválido, nunca buscar outro registro e afirmar sucesso. Somente arquivo pode retornar múltiplas assinaturas válidas do mesmo hash. A expiração do Blob não invalida a prova de assinatura. `Cache-Control: no-store`.
- `GET /api/assinatura-digital/documentos/[id]`: autenticado, escopo ator da assinatura, accountUserId do assinador ou administrador; depois expiresAt retorna410, sem retornar URL. `GET .../comprovantes/[id]`: mesma autorização, funciona depois do prazo usando registro. Nenhuma leitura por URL arbitrária.
- `GET /api/assinatura-digital/retencao`: CRON_SECRET, comparação segura, exclui somente prefixo próprio de arquivos vencidos. Retry idempotente, não apaga evidências, não marca excluído quando del falha; registrar erros com IDs/códigos sem senhas/conteúdo. Principal adiciona cron diário em vercel.json. Não modificar retenção de arquivos de outros módulos. Tratar falhas de upload/DB/idempotência sem blobs permanentes órfãos.

## Integrações A1 (executor A1)

`central-a1.ts` deve exportar:

```ts
type CentralA1Input = { id?:string; kind:"A1_ECPF"|"A1_ECNPJ"; alias:string; ownerName:string; documentId:string; credentialReference:string; certificatePem:string; intermediatePems:string[]; trustedRootPem:string; active:boolean };
listCentralA1Integrations(context: AppContext): Promise<CentralA1Integration[]>
saveCentralA1Integration(context: AppContext, input: CentralA1Input): Promise<CentralA1Integration>
signCentralA1Envelope(context: AppContext, input: { integrationId:string; method:"A1_ECPF"|"A1_ECNPJ"; signerDocument:string; recordId:string; envelopeHash:string }): Promise<{ evidence: DocumentHashSignatureResult; intermediatePems:string[]; trustedRootPem:string; integrationId:string; kind:"A1_ECPF"|"A1_ECNPJ" }>
```

`DocumentHashSignatureResult` é de `security/icp-brasil.ts`; datas na evidência persistida precisam reconstrução na leitura. Cadastro e alterações A1 exclusivos de administrador do sistema com permissão create/update do módulo. Leitura do inventário para module view (sem segredo). `signCentralA1Envelope` reafirma create, status/validade/CPF-CNPJ/tipo; não amplia acesso de outros módulos. Usar public certificate metadata e referência ENV existente (`PREFIX_PRIVATE_KEY_PEM`, `PREFIX_PRIVATE_KEY_PASSPHRASE`), sem persistir chave privada/senha. Não confiar que o usuário digitou titular compatível: extrair CPF/CNPJ do certificado por campos/OIDs suportados e conferir; caso certificado não permita comprovar, rejeitar a ativação com explicação específica. Reutilizar APIs de criptografia existentes, sem relaxar cadeia confiável.

Integrações exibe também status interno (`SIGNATURE_CENTRAL_PRIVATE_KEY_PEM` presente e válida; Blob configurado), instruções operacionais e regra90dias. Não retornar valores das ENV. Certificados de teste/fixtures devem ser isolados, nunca configurar confiança de produção.

## UI

Tabelas pelo padrão operacional13px/24px/20linhas; fontes, filtros, colunas/detalhes e ações compactas. Formulários em diálogos acessíveis/painéis ou páginas específicas excluídas do workspace de tabela. Regra90dias explícita em AssineAgora e Registros (data de expiração por documento), campo senha somente gravação. Lotes mantêm estados/arquivos no pai e exibição paginada sem perder itens; sequencial limita carga. Validação visível válido/inválido/indisponível (falha técnica não significa documento adulterado), aceita upload ou código e dá leitura externa pela página pública específica. Portal do Cidadão: apenas conferir, não adicionar menu/fluxo sem pedido futuro.
