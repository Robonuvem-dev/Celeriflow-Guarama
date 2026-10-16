# Construção Civil — documentos, carimbo e evidências da comissão

## Fluxos internos implementados

- Modelos textuais editáveis e versionados para viabilidade, alvará e habite-se: `/obras/construcao-civil/documentos`. Campos permitidos do processo, corpo, carimbo institucional e política de assinatura são preservados na emissão.
- Emissão em `/obras/construcao-civil/[id]/documentos`, no mesmo `Process`, com sequência por tipo/exercício, PDF real, SHA-256, cópia física content-addressed e vínculo GED.
- Habite-se exige conclusão, vistorias, alvará publicado e gates do lifecycle. No modo interno demonstrativo a emissão solicita assinatura GED automaticamente; `signerIds` define os requeridos e, quando omitido, o emitente é o signatário requerido.
- Correção e renovação são pedidos vinculados ao documento publicado. Cada pedido exige seu próprio ciclo tributário `DOCUMENT_REQUEST:<id>`; taxas originais ou de outro pedido não o liberam. O original só é substituído quando a nova emissão estiver assinada e publicada.
- PDF anotado permite texto, notas, setas, retângulos, elipses e cores por página/coordenada. Gera nova versão e preserva bytes, hash, assinaturas e backup físico do original. Uma anotação livre não constitui deferimento.

## Requisito 30 — natureza do carimbo a apresentar à comissão

O botão **“Carimbar projeto aprovado e solicitar assinatura”** cria uma **cópia derivada demonstrativa**, separada do documento original. Exige gestor, deferimento `PROJECT` aprovado da revisão vigente e PDF/versão presente na evidência dessa decisão. O carimbo aplica o modelo institucional versionado e referencia o número do alvará publicado; na ausência dele, referencia protocolo e deferimento.

A cópia derivada recebe seu próprio `DocumentVersion`, hash, backup, código de validação e solicitações de assinatura no serviço central GED. Não se reutiliza a assinatura do original para autorizar a cópia. O portal e os downloads, inclusive o endpoint de complementos e o download genérico, exigem a versão assinada correspondente e publicação. Complementos ordinários `FINAL` permanecem acessíveis pelas regras existentes.

O PDF carimbado declara expressamente **cópia derivada demonstrativa**, **sem homologação oficial**, **assinatura interna GED requerida** e **sem PAdES**. A evidência fica em `ConstructionProjectStamp`, introduzida pela migration aditiva `20261010340000_construction_project_stamp`; a migration 23 já aplicada não recebe esse ledger.

## Assinaturas e armazenamento

- Assinatura interna central GED: identidade do signatário, confirmação recente de senha na action, versão exata, hash SHA-256, código verificável, auditoria e bloqueio de versões. É uma assinatura interna demonstrativa, não um certificado ICP-Brasil.
- Emissões configuradas como `ICP_REQUIRED` usam o serviço A1 já existente, certificado autorizado e chave privada referenciada de forma segura. A evidência criptográfica é **destacada sobre o hash**, verificada pelo GED. Não se declara assinatura PAdES embutida no PDF, homologação oficial, carimbo de tempo qualificado ou certificado real sem esses insumos.
- Carimbo de projeto nesta frente usa explicitamente modelo `PERMIT` com política `INTERNAL_ALLOWED`. A integração de certificado/formato exigido para assinatura oficial das pranchas é um limite externo identificado.
- Com Blob configurado, o mesmo PDF é persistido no armazenamento privado e no backup físico. Sem Blob, a demonstração usa armazenamento físico privado content-addressed. `CONSTRUCTION_DOCUMENT_BACKUP_DIR` deve apontar para volume persistente em implantação; a pasta local padrão não oferece persistência entre instâncias efêmeras de hospedagem.
- O original anterior à transformação e a revisão são copiados fisicamente; hashes são conferidos após gravação e leitura. Retenção, replicação/off-site e recuperação entre servidores dependem do destino físico configurado pela operação.

## Verificação reproduzível

```powershell
node --conditions=react-server --import tsx --test tests/construction-documents*.test.ts
```

`construction-documents.test.ts` valida PDFs reais, conteúdo extraído com PDF.js, desenhos serializados, preservação do original, limites geométricos, modelos e gates de assinatura.

`construction-documents-service.test.ts` aplica migrations municipais em PGlite, usa PostgreSQL wire protocol e Prisma reais, sem mocks de CRUD, e exercita emissão/GED/assinaturas/publicação, assinatura parcial, integridade física, correção e renovação com ciclos separados, gates do habite-se, revisão PDF e cópia carimbada com assinatura própria e bloqueios do helper de download usado pelo portal de complementos.

## Fechamento possível enquanto chegam os documentos oficiais

- Após integração remota, a bateria completa foi repetida: **67/67 testes aprovados**, incluindo leitura e integridade dos backups físicos nos fluxos documentais reais em banco isolado.
- Auditoria operacional somente de leitura: `npx tsx scripts/audit-construction-backups.ts`. Percorre emissões em lotes de 100, lê o backup físico e compara SHA-256 ao ledger, sem alterar banco/arquivos nem expor caminhos ou credenciais.
- Execução no ambiente configurado: **nenhuma emissão encontrada** (`NO_ISSUED_DOCUMENTS`). Portanto não há evidência de recuperação de documentos operacionais desse banco; a auditoria deve ser repetida após a primeira emissão legítima.
- Navegador novamente consultado: desconectado. Percurso autenticado, aparência e impressão permanecem pendentes. Parâmetros municipais, formulários oficiais e integrações continuam conforme os limites acima.
