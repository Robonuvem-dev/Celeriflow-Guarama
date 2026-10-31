# Plano de unificação — GED e Assinatura Digital

**Data:** 31/10/2026. **Base analisada:** repositório local, versão declarada 1.235.0.
**Entrega desta etapa:** análise e plano de implementação. As rotas, estruturas de dados e funcionalidades futuras abaixo são propostas; não estão implementadas por este documento.

**Evolução de implementação:** o código iniciado após a aprovação deste plano está descrito em [IMPLEMENTACAO_GED_ASSINATURA_DIGITAL.md](IMPLEMENTACAO_GED_ASSINATURA_DIGITAL.md), com recursos entregues, compatibilidade, testes e limites de homologação.

## 1. Direção da unificação

Reunir **Documentos e GED** e **Assinatura Digital** em um único módulo visível, chamado **GED e Assinatura Digital**, com este fluxo operacional:

**Importar/criar → organizar → extrair/OCR → pesquisar → elaborar/revisar → aprovar/homologar → assinar → publicar/recuperar.**

- Manter o código técnico `ASSINATURA_DIGITAL` e a base de rotas `/assinatura-digital`. Alterar nome, legenda, cartão, navegação e títulos. Evita criar uma terceira identidade de módulo.
- Incorporar painel, acervo, pastas, recentes, modelos e solicitações do GED. Reaproveitar os serviços documentais consumidos pelos demais domínios.
- Tratar os dez requisitos da POC como entregas funcionais com critérios de aceite próprios. A junção de menus é apenas a primeira parte.
- Usar **Drizzle em toda persistência**, DTOs independentes do ORM e migrações SQL pelo executor oficial.
- Aplicar às listagens o padrão operacional já documentado e implementado no projeto.

Esta decisão substitui, para a próxima implementação, a recomendação de recuperar o GED como módulo visível separado em [ANALISE_GED_BLOB_POC.md](ANALISE_GED_BLOB_POC.md). O inventário e as lacunas daquele relatório continuam sendo evidências da base analisada.

### Achados que determinam a arquitetura

1. **O GED atual já usa Drizzle.** A busca em `src` não encontrou import de Prisma, `PrismaClient`, chamadas `prisma.*` ou adaptadores de tenant Prisma; a referência encontrada era um comentário histórico em schema de outro domínio. O trabalho é evolução do núcleo atual, preservando IDs, nomes físicos e vínculos.
2. Existem **dois fluxos de assinatura**: versões documentais do GED e arquivos avulsos da Central. Precisam de uma operação integrada, com evidências e métodos originais preservados.
3. As duas páginas de pendentes já utilizam `listPendingDocumentSignatures`. Não criar outra fila para absorver `/documentos/assinaturas`.
4. `/assinatura-digital/documentos` é cadastro de **tipos documentais**, não acervo. O menu precisa esclarecer isso.
5. A Central armazena arquivos por **90 dias**; o GED registra retenção documental em meses. Unificar a interface não torna o acervo sujeito à exclusão temporária da Central.
6. A tabela `Document` é compartilhada por vários domínios. Pesquisa, contagens, árvore, prévias e download devem aplicar escopo de origem antes de expor o acervo ampliado.

## 2. Inventário das páginas e funções a incorporar

### 2.1 Todo o módulo atual Documentos e GED

| Origem atual | Recursos encontrados | Destino no módulo unificado | Trabalho necessário |
|---|---|---|---|
| `/documentos` | Indicadores de documentos, pastas e pendentes; entrada para GED | `/assinatura-digital` — Painel | Incorporar indicadores autorizados; incluir tarefas, processamento/OCR e assinaturas, com contagens distintas |
| `/documentos/ged` | Listagem, upload individual, criação de documento e versão, visualização/download, solicitação de assinatura, exclusão | `/assinatura-digital/acervo` | Migrar a operação; paginação/filtros no servidor; seleção múltipla; detalhe documental e histórico |
| `/documentos/ged?folderId=…` | Pastas/subpastas, criação dentro da pasta, contagens, pai imediato, raiz | Acervo com árvore e caminho completo | Preservar `folderId`; implementar árvore expansível, mudança de pasta e proteção contra ciclos |
| `/documentos/ged?view=recentes` | Visão recentes por ordenação de criação | Acervo — Recentes | Preservar parâmetro; aplicar recorte de acesso, filtros e paginação |
| `/documentos/modelos` | Listagem e cadastro/edição/exclusão de nome, notas e status | `/assinatura-digital/modelos` | Acrescentar arquivo real/conteúdo, marcadores, versões, prévia e geração; cadastro atual fabrica URL sem criar DOCX |
| `/documentos/assinaturas` | Pendentes do usuário e assinatura interna com reautenticação Firebase | `/assinatura-digital/pendentes` | Reunir a mesma consulta/fila e preservar contratos de erro; remover duplicidade operacional |
| Layout e manifesto de Documentos | Menu próprio e três listagens operacionais registradas | Shell/manifesto único | Consolidar títulos e menus; retirar entradas duplicadas do manifesto após realocação |

**Ações inventariadas:** `createFolder`, `createDocument`, `requestInternalSignatures`, `deleteDocument`, `deleteFolder`; `createModelo`, `updateModelo`, `deleteModelo`; `signDocumentInternally`. Seus consumidores em `GEDClient.tsx`, `ModelosClient.tsx` e `AssinaturasClient.tsx` devem ser conferidos novamente antes de cada alteração de contrato.

**Ajustes funcionais da base:** exclusão de documento não remove atualmente o Blob; exclusão de pasta trata somente filhos imediatos e sua confirmação diverge do comportamento de desvincular arquivos. Definir exclusão de pasta como remoção da estrutura vazia, permitindo realocação explícita do conteúdo. Documentos com vínculos, assinatura ou retenção vigente precisam de arquivamento e histórico compatíveis, em vez de remoção genérica que rompa referências. Limpeza física exige conferir todos os vínculos ao mesmo objeto.

### 2.2 Todo o módulo atual Assinatura Digital

| Rota atual | Função | Tratamento na unificação |
|---|---|---|
| `/assinatura-digital` | Redireciona para Assine Agora | Passa a ser o painel integrado |
| `/assinatura-digital/usuarios` | Cadastro de assinadores, vínculo com servidor/cidadão/conta, credencial e vigência | Manter; nome de menu **Assinadores** para distinguir de usuários administrativos |
| `/assinatura-digital/documentos` | Cadastro de tipos para assinatura | Manter URL; renomear menu para **Tipos documentais**; mapear relação com classes GED |
| `/assinatura-digital/assine-agora` | Lote de até 20 arquivos, até 3 MiB cada, método interno ou A1 e resultado por arquivo | Manter envio avulso e adicionar seleção de versão autorizada do acervo, sem reenviar o arquivo |
| `/assinatura-digital/validacao` | Validação de evidência da Central | Oferecer consulta unificada por origem/código/arquivo, com resposta discriminada |
| `/assinatura-digital/registros` | Histórico da Central, original, comprovante e prazo de armazenamento | Manter; acrescentar vínculo com acervo quando arquivado |
| `/assinatura-digital/integracoes` | A1 e-CPF/e-CNPJ, configuração pública e suspensão | Incorporar gestão de certificados GED por finalidade, com regras administrativas existentes |
| `/assinatura-digital/pendentes` | Solicitações de assinatura dos módulos ao usuário | Destino único dos pendentes GED e dos módulos |
| `/assinatura-digital/historico` | Histórico pessoal de solicitações GED | Manter; cruzar navegação com registros avulsos sem misturar contagens |
| `/assinatura-digital/integracoes/api` | GET/POST/PATCH da configuração A1 | Preservar contrato e restrição administrativa durante a consolidação |

### 2.3 Serviços e APIs que acompanham a junção

| Contrato existente | Responsabilidade e tratamento |
|---|---|
| `src/lib/documents/document-flow-service.ts` | Ingresso GED/processual, hash, versão final, classe, retenção, solicitações, assinatura interna, eventos e validação pública. Continua como núcleo reutilizável; evoluir por serviços auxiliares e adaptadores |
| `src/db/repositories/documents/queries.ts` | Painel, acervo, pastas, modelos e pendentes. Evoluir consultas com escopo, filtros, total real e paginação |
| `src/db/repositories/documents/central.ts` e `signature-history.ts` | Origens de assinadores, filtros de proprietário, registros da Central e histórico GED. Preservar semânticas de acesso |
| `src/lib/signatures/internal-signature.ts` e `a1-signature-service.ts` | Assinatura interna de versão e A1 do GED. Integrar pela mesma versão/hash, preservando política da classe |
| `src/lib/signatures/central-*.ts` | Cadastro, credencial própria, evidência, armazenamento, rate limit, HTTP, A1 e retenção da Central. Reutilizar com adaptador para acervo |
| `/api/upload` | Upload genérico hoje autorizado por `DOCUMENTOS`. Atualizar autorização através da camada documental e manter consumidores existentes |
| `/api/download?url=…` | Download compartilhado com verificações por origem. Preservar compatibilidade e extrair política reutilizável para acervo, versões e ZIP |
| `/api/protocolos/upload` | Ingresso e vínculo ao processo. Integrado ao núcleo, com autorização processual |
| `/api/assinatura-digital/{assinar,validar,origens}` | Contratos existentes da Central; evoluir sem forçar consumidores a mudar de uma vez |
| `/api/assinatura-digital/documentos/[id]` e `/comprovantes/[id]` | Original e comprovante da Central; manter códigos, URLs e autorização |
| `/api/assinatura-digital/retencao` e `vercel.json` | Cron de exclusão temporária; adaptar para respeitar arquivamento em andamento |
| `/validar-assinatura` | Validação pública da Central; permanecer compatível |
| `/validar-documento/[code]` | Validação pública das versões GED; códigos e QR existentes continuam válidos |
| `/configuracoes/certificados` | Cadastro/status de certificados, assinatura de versões finais ICP e auditoria. Incorporar acesso contextual em Integrações; manter destino antigo compatível e privilégio administrativo |

## 3. Menu e rotas propostos

Um único cartão **GED e Assinatura Digital**, com legenda **Acervo, gestão documental e assinaturas**.

| Grupo | Item | Rota proposta ou preservada |
|---|---|---|
| Visão geral | Painel | `/assinatura-digital` |
| Acervo | Documentos e pastas | `/assinatura-digital/acervo` |
| Acervo | Recentes | `/assinatura-digital/acervo?view=recentes` |
| Acervo | Importações e lotes | `/assinatura-digital/importacoes` |
| Acervo | Pesquisa avançada | `/assinatura-digital/pesquisa` |
| Acervo | Pastas inteligentes | `/assinatura-digital/pastas-inteligentes` |
| Gestão documental | Minhas tarefas | `/assinatura-digital/tarefas` |
| Gestão documental | Fluxos documentais | `/assinatura-digital/fluxos` |
| Gestão documental | Modelos | `/assinatura-digital/modelos` |
| Gestão documental | OCR e indexação | `/assinatura-digital/processamento` |
| Assinaturas | Assine Agora | `/assinatura-digital/assine-agora` |
| Assinaturas | Pendentes de assinatura | `/assinatura-digital/pendentes` |
| Assinaturas | Meu histórico de solicitações | `/assinatura-digital/historico` |
| Assinaturas | Registros e comprovantes | `/assinatura-digital/registros` |
| Assinaturas | Validação | `/assinatura-digital/validacao` |
| Cadastros e configuração | Assinadores | `/assinatura-digital/usuarios` |
| Cadastros e configuração | Tipos documentais | `/assinatura-digital/documentos` |
| Cadastros e configuração | Classes e políticas documentais | `/assinatura-digital/classes` |
| Cadastros e configuração | Thesaurus | `/assinatura-digital/thesaurus` |
| Cadastros e configuração | Integrações e certificados | `/assinatura-digital/integracoes` |

O detalhe `/assinatura-digital/acervo/[id]` reunirá metadados, original/prévia, versões, texto/OCR, reserva de edição, tarefas/decisões, assinaturas/evidências, origem, publicações e auditoria. Esse detalhe possui composição própria; cada listagem nele segue o padrão tabular sem tentar colocar várias tabelas de 20 linhas simultâneas na mesma área.

### Compatibilidade de navegação

- `/documentos` → `/assinatura-digital`.
- `/documentos/ged` → `/assinatura-digital/acervo`, preservando `folderId`, `view` e parâmetros de consulta suportados.
- `/documentos/modelos` → `/assinatura-digital/modelos`.
- `/documentos/assinaturas` → `/assinatura-digital/pendentes`.
- Atualizar links internos, breadcrumbs, notificações e `revalidatePath` por consumidor analisado individualmente.
- A rota antiga precisa redirecionar antes de um layout legado exigir `DOCUMENTOS`; caso contrário usuários migrados serão bloqueados antes de alcançar o novo destino.
- APIs compartilhadas e páginas públicas mantêm compatibilidade de contrato. Redirecionar navegação não substitui a adaptação das actions importadas pelos clientes antigos.

O guia instalado de Next, `node_modules/next/dist/docs/01-app/02-guides/redirecting.md`, foi consultado. Na implementação, reler os guias específicos de layouts, Server Actions e Route Handlers, respeitando parâmetros assíncronos e a execução de `redirect` fora de blocos que capturem sua exceção.

## 4. Integrações internas a preservar e ampliar

Os módulos de negócio continuam sendo a origem funcional dos documentos. O módulo unificado reúne sua gestão e acesso autorizado, com vínculos para voltar ao processo de origem.

| Integração | Evidências principais no código | Resultado esperado |
|---|---|---|
| Processos e Protocolo | `document-flow-service.ts`, `src/lib/protocols/generic-workflow-runtime.ts`, `src/lib/protocols/notifications.ts`, `src/app/app-domain/protocolos/actions.ts` | Anexo e versão vinculados, pendência única, tarefa/decisão e retorno ao processo |
| Planejamento e Câmara | `src/lib/planejamento/documents.ts`, `document-upload-response.ts`, `lookups.ts`, componentes em `src/components/app-ui/planejamento` | Preservar entidade Executivo/Legislativo, vínculo da peça/audiência e dupla autorização de origem/documental; atualizar as checagens explícitas de `DOCUMENTOS` |
| Financeiro/Contábil | `src/lib/financeiro/ged.ts`, `report-delivery.ts`, `src/db/repositories/finance/report-delivery.ts` | Documentos preservados na pasta financeira, origem de relatório e recuperação por versão/hash |
| Obras/Construção Civil | `src/lib/obras/construction-documents-service.ts`, `construction-project-stamp.ts`, `construction-internal-documents.ts`, `construction-extraction.ts` | Preservar emissões, modelos específicos, publicação, carimbo derivado, versão aprovada e escopo urbanístico; compartilhar extração por adaptador |
| Tributação/ITBI/alvarás | `src/lib/tributacao/itbi-portal-storage.ts`, `itbi-draft-storage.ts`, `itbi-document-models.ts`, `license-signatures.ts` | Anexos, gerações e A1 continuam ligados ao contribuinte/processo; modelos especializados mantêm seus contratos |
| RH/Portal do Servidor | `src/lib/portal-servidor/generated-documents.ts`, APIs de anexos do portal, `src/lib/rh/recertification-details.ts` | Emissões e anexos com acesso funcional/pessoal e solicitação de assinatura rastreável |
| Portal do Cidadão | `src/lib/portal-cidadao/evidence-storage.ts`, `catalog.ts` e rotas próprias | Documentos do titular e validação pública; não converter cadastro de assinador cidadão em autenticação pública de assinatura |
| Saúde | `src/lib/saude/clinical-document-service.ts`, `laboratory-service.ts`, `care-service.ts`, `regulation-service.ts`, actions de Saúde | Manter acesso clínico e por paciente/unidade; títulos, trechos e contagens do índice também obedecem ao escopo |
| SST | `src/lib/sst/aso-flow-document.ts`, `aso-flow-access.ts`, acesso clínico no download | Preservar restrição ocupacional e donos múltiplos do mesmo arquivo |
| Frotas | `src/lib/frotas/control-attachments.ts`, `control-access.ts` | Expor anexos somente dentro das permissões de frota/vínculo |
| Patrimônio | `src/app/app-domain/patrimonio/valorizacao/actions.ts` | Preservar documento/versão usados como evidência de valorização |
| Transparência | `src/lib/transparencia/publication-storage.ts`, `portal-public.ts`, `src/components/transparencia/PublicationUpload.tsx` | Publicar versão aprovada explicitamente, preservar hash/origem e retirada; upload no portal não implica automaticamente ingresso no GED |
| Controle Interno | `src/lib/c7/circumstantiated-report.ts` | Preservar certificado e publicação do relatório final; distinguir relatório próprio de ingresso no acervo |
| Atendimento/Ouvidoria | `src/app/api/download/route.ts`, repositório de downloads e contextos de atendimento | Reutilizar autorização por chamado/manifestação, inclusive no ZIP e na pesquisa |
| Cemitérios, Meio Ambiente e Cultura | APIs de anexos de Cemitérios, `src/app/app-domain/meio-ambiente/documentos`, `src/app/app-domain/cultura/documentos` | Manter vínculos e encaminhamentos; registros ambientais próprios exigem adaptador, não cópia indiscriminada para `Document` |
| Auditoria e notificações | `src/db/repositories/platform/audit.ts`, `notifications.ts` e notificações processuais | Registrar ingresso, edição, decisões, assinatura, download e processamento; tarefas GED avulsas não podem depender de possuir acesso a Processos |

Arquivos/relatórios apenas transmitidos ao navegador só entram no acervo mediante uma operação explícita de preservação. Documentos cadastrados por URL simulada em `/cadastros/documentos/novo` precisam de arquivo real antes de valer como prova de importação.

## 5. Integrações externas

| Serviço | Situação encontrada | Evolução planejada |
|---|---|---|
| PostgreSQL/Neon | Driver e transações Drizzle existentes | Persistência e índice textual; uma conexão por transação intermodular |
| Vercel Blob privado | Namespaces de documentos e Central separados por instância | Upload direto autorizado para lotes; acesso por identificador/versão; mesma política de namespace; limpeza e promoção coordenadas |
| Firebase Authentication | Sessão administrativa e reautenticação de assinatura GED | Preservar identidade, recência e correspondência com a sessão; credencial própria do assinador da Central permanece distinguida |
| A1 e-CPF/e-CNPJ | `src/lib/security/icp-brasil.ts`, certificados GED e integração A1 da Central | Unificar descoberta/configuração por finalidade, preservando cadeia, validade, titular, referência de segredo e auditoria |
| Serviço OCR | Adaptador por página de Construção Civil; endpoint ausente no ambiente local verificado anteriormente | Adaptador documental HTTP configurável com páginas/regiões, texto, confiança e processamento assíncrono; exige provedor real na instância da POC |
| Cron Vercel | Retenção diária da Central | Preservar execução; coordenar reservas de arquivamento; executar trabalhos pesados em unidades limitadas com retomada |
| Validação pública | Dois formatos de evidência e páginas públicas existentes | Interface comum com adaptadores e identificação do método; códigos e comprovantes antigos permanecem verificáveis |

Não foi localizado adaptador operacional de assinatura Gov.br, Clicksign, DocuSign ou equivalente no núcleo analisado. `EXTERNAL_PROVIDER_REQUIRED` é uma política, não uma integração implementada. A1 atual gera evidência criptográfica destacada; a junção não equivale a implementar assinatura PAdES embutida em PDF. Essas distinções devem aparecer corretamente na interface de métodos e validação.

O OCR documental deve compartilhar a capacidade de extração, sem herdar os campos urbanísticos nem exigir o provedor de IA de medições. Nenhuma chamada externa ou configuração de produção foi validada nesta etapa de planejamento.

## 6. Implementação dos dez requisitos da POC

| Nº | Entrega planejada | Reaproveitamento e complemento | Critério de aceite demonstrável |
|---|---|---|---|
| 1 | Importação de legado digitalizado | Importador de operador para PDF/imagens e metadados CSV, com pasta, classe, origem, data e identificador legado; lote persistido, pré-validação, hash, resultado individual e retomada idempotente | Importar um lote com estrutura de pastas, recuperar bytes corretos e repetir a mesma operação sem duplicação; listar rejeitados e motivo |
| 2 | Busca avançada por conteúdo | Índice por versão/página, palavras, frase exata, fragmento, distância entre termos e expansão por thesaurus; filtros de metadados combináveis | Cada operador retorna casos positivos e exclui negativos preparados; informar documento, versão, página/trecho e termos expandidos |
| 3 | Pastas inteligentes | Regras persistidas e versionadas de consulta, dono/compartilhamento e filtros; resultado dinâmico sob a permissão de quem consulta | Criar regra “aguardando assinatura”, alterar situação de um documento e observar entrada/saída sem mover o arquivo físico |
| 4 | Árvore de pastas | Reutilizar `Folder.parentId`; árvore expansível carregada por nível, breadcrumbs completos, mover/renomear e prevenir ciclos | Navegar por pelo menos quatro níveis, mover pasta válida e rejeitar movimento para descendente sem perder vínculos |
| 5 | Elaboração, consenso, aprovação e homologação | Integrar tarefas/decisões à infraestrutura de workflow, vinculadas à versão exata; responsáveis, prazo, comentários, devolução e notificações | Quatro usuários executam as quatro fases; consenso exige os participantes configurados; homologação registra a versão aprovada; nova versão exige novo ciclo |
| 6 | Full text | Mesma infraestrutura do item 2; texto de PDF/TXT/DOCX e OCR indexado, com status e reindexação | Buscar expressão presente só no corpo de `Acervo_001.pdf`, mostrar página e trecho; pesquisar também digitalizado após OCR |
| 7 | Check-out/check-in | Reserva editorial por documento/versão e usuário, operação atômica, cancelamento e devolução com comentário e nova versão imutável | Dois usuários tentam checkout simultâneo: um vence; check-in pelo dono cria versão 2, original continua recuperável e assinaturas da versão 1 permanecem ligadas a ela |
| 8 | Upload/download em lote | Upload direto ao Blob com estados individuais; seleção persistida de IDs/versões e ZIP autorizado com manifesto; exportação grande como job | Enviar múltiplos arquivos, repetir apenas falhas e baixar selecionados em um ZIP com nomes sem colisão e hashes; seleção preservada entre páginas |
| 9 | OCR por zonas | Visualizador com seleção de retângulo por página, coordenadas normalizadas, rotação/dimensões, modelo de zonas e resultado revisável ligado à versão | Em imagem sem camada textual, selecionar campo, obter texto real, conferir região/confiança e localizar o resultado na pesquisa; correção humana é identificada separadamente |
| 10 | Criar/importar modelos | Editor parametrizado e importação DOCX real; marcadores validados, versões, prévia, arquivo de origem e geração vinculada ao modelo | Criar um modelo e importar outro DOCX, preencher dados, gerar documento recuperável no acervo e identificar versão do modelo e dados usados |

### 6.1 Decisões de implementação da busca

- Base proposta: PostgreSQL full text com `tsvector` e GIN por conteúdo de versão, acompanhado por páginas/blocos para trechos e localização. Acesso e filtros entram antes de contagem/paginação dos resultados.
- Palavras/frases: normalização e configuração linguística explícitas, com preservação de posições para operadores de distância. Definir proximidade como quantidade máxima de palavras entre os termos e opção de ordem, com exemplos na UI; validar stopwords e limites entre páginas.
- Fragmentos: pesquisa literal normalizada no conteúdo, com `pg_trgm` quando disponível e autorizado na instância. Não confundir prefixo de lexema com fragmento arbitrário. A migração precisa verificar disponibilidade da extensão; uma execução sem índice deve declarar e medir o limite de volume.
- Thesaurus: cadastro em banco de termo preferido, equivalentes e relações; expansão controlada e parametrizada da consulta. Manter versão da regra e permitir desligar expansão. Não depender de arquivos de dicionário no servidor Neon.
- Separar texto de cada versão, texto OCR, correção revisada e metadados. Pesquisar versão vigente por padrão; versões históricas são filtro explícito com as mesmas permissões.
- Nenhum resultado, sugestão, trecho ou total pode revelar documento fora do escopo. Não retornar todo o acervo ao cliente para depois usar `includes`.

### 6.2 Trabalho assíncrono e arquivos

- Persistir intenção e itens do lote antes do processamento; estados `PENDING`, `RUNNING`, `SUCCEEDED`, `FAILED` e retomada por chave idempotente.
- Reservar trabalho com lease e impedir dois executores de confirmar o mesmo resultado. Usar checkpoints por arquivo/página, tentativas limitadas e diagnóstico por item.
- Blob e banco não compartilham transação. Confirmar artefato por hash e gravar vínculo de forma idempotente; limpar uploads órfãos somente após conferir que não foram vinculados.
- Upload, OCR e extração têm limites próprios de arquivo/páginas e concorrência; os 3 MiB/20 arquivos da assinatura avulsa não são limites automáticos do acervo. Medir limites efetivos de hospedagem e do provedor no ensaio.
- DOCX exige importação do conteúdo/marcadores com limites de descompressão. `docx`, `mammoth`, `jszip`, `pdfjs-dist`, `pdf-lib` e `sharp` já estão nas dependências, mas disponibilidade de biblioteca não comprova editor nem conversão DOCX→PDF com fidelidade. Definir saída DOCX para o importado e PDF para o editor parametrizado, com prévias verificadas.

### 6.3 Gestão editorial e assinatura

O checkout é uma reserva de edição; `DocumentVersion.lockedAt` continua representando congelamento para assinatura. São estados diferentes. Check-in nunca sobrescreve bytes assinados ou reaproveita aprovação de outra versão. Uma solicitação de assinatura pendente precisa ser concluída/cancelada segundo a política antes de iniciar uma revisão incompatível.

Reutilizar definições, responsáveis, prazos, decisões e notificações de workflow por adaptador documental. Complementar o runtime onde faltar consenso por participantes, homologação e vínculo de versão; não simular essas fases com quatro rótulos de status. GED avulso terá tarefas próprias sem fabricar processo setorial; quando houver processo, manter vínculo e eventos de origem.

Na assinatura de arquivo do acervo, o servidor resolve e lê a versão autorizada, confere o hash e aplica sua política de classe. O operador não fornece uma URL arbitrária para representar a versão. Assinatura interna GED continua associada ao usuário da sessão; assinatura por cadastro da Central conserva sua identidade e evidência específicas.

## 7. Dados e evolução com Drizzle

### 7.1 Estruturas existentes a preservar

| Schema Drizzle | Tabelas físicas relevantes |
|---|---|
| `src/db/schema/registry.ts` | `Document` |
| `src/db/schema/document-workflow.ts` | `Folder`, `DocumentClass`, `DocumentVersion`, `DocumentSignature`, `DigitalCertificate`, `DocumentIcpEvidence`, `CertificateUseAudit` |
| `src/db/schema/signature-central.ts` | `SignatureCentralSigner`, `SignatureCentralDocumentType`, `SignatureCentralRecord` |
| `src/db/schema/signature-central-a1.ts` | `SignatureCentralA1Integration` |

Preservar também tabelas de vínculos de processos e dos domínios. Não recriar o núcleo documental em um schema paralelo só por ter vindo de uma implementação histórica Prisma.

### 7.2 Acréscimos propostos

Nomes abaixo são de desenho; o DDL final deve conferir catálogo, convenções físicas e consumidores existentes.

| Estrutura proposta | Conteúdo e integridade essenciais |
|---|---|
| `DocumentOrigin` | Origem e chave de negócio, escopo/entidade e referência ao documento; vínculo que orienta autorização, sem substituir controles de domínio |
| `DocumentTypeClassMapping` | Relação explícita entre tipo da Central e classe GED; não equiparar automaticamente nomes iguais; cadastro legado com texto livre permanece rastreável |
| `DocumentImportBatch` / `DocumentImportItem` | Operador, origem, chave idempotente, metadados, hash, progresso/erro e documento/versão criados; unicidade por lote/item |
| `DocumentProcessingJob` | Extração, OCR, indexação e exportação; chave por tipo/versão/configuração, tentativas, lease, checkpoint e artefato |
| `DocumentTextPage` | Versão, página/bloco, texto original/normalizado, método, idioma, hash/configuração do extrator e revisão; índice textual |
| `DocumentOcrZone` / `DocumentOcrZoneTemplate` | Página e região normalizada, rotação/dimensões, campo, provedor, texto/confiança e configuração versionada |
| `DocumentSmartFolder` | Consulta em JSON validado e versionado, proprietário, compartilhamento e filtros permitidos; não armazenar SQL livre |
| `DocumentThesaurusTerm` / `DocumentThesaurusRelation` | Termos e relações normalizados, tipo, vigência e versão de expansão |
| `DocumentCheckout` | Documento, versão de origem, dono, retirada/devolução/cancelamento e motivo; índice único parcial para uma reserva ativa por documento |
| `DocumentWorkflowBinding` / `DocumentReviewTask` / `DocumentReviewDecision` | Instância/etapa e versão exata, responsáveis/participantes, prazo, decisão/comentário e auditoria; referências ao workflow reutilizado |
| `DocumentTemplate` / `DocumentTemplateVersion` | Conteúdo/arquivo real, formato, marcadores/esquema, versão, origem/importação, hash e autor; documento gerado referencia a versão usada |
| `DocumentCentralArchiveLink` | Registro da Central, documento/versão GED, hash original, intenção/estado da cópia e referência da evidência; unicidade evita arquivamentos duplicados |

Acrescentar metadados de autoria/origem da versão e referência do modelo gerador por alteração aditiva ou tabela complementar, sem redefinir globalmente os status atuais dos consumidores. Modelo legado `Document.documentType = 'Modelo'` recebe vínculo de migração quando houver bytes reais. URLs sintéticas não viram versões válidas por simples backfill.

### 7.3 Regras de persistência e migração

- Consultas em `src/db/repositories/documents`, regras em `src/lib/documents` e `src/lib/signatures`, contratos em `src/lib/contracts`; UI sem tipos ORM.
- Usar a conexão/contexto efetivos da operação e `withDatabaseTransaction`; operações intermodulares confirmam juntas na mesma conexão quando forem exclusivamente de banco.
- Preservar IDs, códigos públicos, hashes, evidências canônicas, timestamps e nomes físicos existentes. Colunas novas entram de forma aditiva; depois backfill idempotente, conferência e restrições compatíveis.
- FKs e índices novos exigem conferência dos dados existentes. Mudanças em `Document` e `DocumentVersion` alcançam muitos domínios, inclusive consumidores que importam diretamente o schema.
- Migrações futuras em `db/migrations/<AAAAMMDDhhmmss_nome>/migration.sql`, registradas com checksum pela autoridade `db/migration-authority.json`. Não usar Prisma CLI, `db push` nem editar SQL histórico para encaixar o novo desenho.
- Seguir `DRIZZLE_OPERACAO.md` e `MIGRACAO_DRIZZLE_CONTRATOS.md`: `verify-files` é offline; `plan` exige destino explícito; não repetir baseline já inicializada nem executar replay na base existente.
- Para funções exportadas, inventariar todos os imports/chamadas antes de alterar retorno/parâmetros. Actions aguardadas pela UI mantêm seu contrato de objeto de erro quando existente; actions de formulário mantêm `Promise<void>`.

## 8. Retenção e união dos fluxos de assinatura

### 8.1 Arquivo avulso e documento de acervo

- **Assinatura avulsa:** continua com armazenamento temporário de 90 dias, registro e comprovante preservados conforme o contrato existente.
- **Documento de acervo:** usa política documental própria, atualmente registrada em `Document.retentionMonths`; esse campo sozinho não comprova rotina de descarte implementada. Arquivar no GED não é promessa de retenção infinita.
- **Arquivar avulso no acervo:** copiar os bytes, conferir SHA-256 e vincular `SignatureCentralRecord` à versão GED. Manter a evidência/código originais e o verificador da Central; não reescrever a evidência para fingir que foi assinada com ID GED.

### 8.2 Concorrência com o cron

Antes de copiar, registrar uma intenção durável de arquivamento e reservar o registro contra a rotina de expiração. O cron e o arquivador precisam observar o mesmo bloqueio/lease e revalidar elegibilidade. Confirmar a cópia documental pelo hash, persistir o vínculo e só então liberar a reserva. Falha deve permitir retomada e liberar reservas abandonadas de modo verificável.

Uma cópia GED confirmada usa objeto físico próprio no namespace documental; a exclusão posterior do temporário não a remove. Registros já expirados e sem bytes não podem ser arquivados como se tivessem original. Metadados/comprovantes permanecem históricos e indicam a indisponibilidade.

### 8.3 Tipos, classes, assinadores e certificados

- Tipos da Central descrevem o arquivo; classes GED determinam políticas documentais/assinatura. Relacionar os cadastros, conservando IDs e evidências antigas.
- Usuário administrativo, servidor/pessoa e assinador da Central são entidades relacionadas, não intercambiáveis. A fila pessoal GED permanece vinculada ao usuário solicitável.
- `SignatureCentralA1Integration` já referencia `DigitalCertificate`. Consolidar gestão por finalidade e estado sem duplicar certificados nem tratar `active` da integração como substituto do status/validade do certificado.
- Validação integrada despacha ao verificador de origem e informa versão, hash, método, titular aplicável e resultado; assinatura interna, A1 destacada e eventual provedor futuro não recebem a mesma classificação.

## 9. Permissões e ativação

Um módulo visível pode reunir funcionalidades com autorizações distintas. A migração precisa contemplar `accessProfiles`, permissões individuais, perfis adicionais, ativação e escopo do documento.

1. Inventariar concessões efetivas de `DOCUMENTOS` e `ASSINATURA_DIGITAL`, incluindo as checagens cruzadas de Planejamento/Câmara e o upload/download genérico.
2. Manter `ASSINATURA_DIGITAL` como identidade visível e introduzir capacidades documentais específicas na política do módulo: acervo/leitura, importação, edição/checkout, revisão/homologação, assinatura, modelos e administração. A base atual só tem operações por módulo; essa extensão requer contrato e persistência próprios, não uma flag já existente.
3. Migrar de forma idempotente os direitos antigos de cada função para suas capacidades equivalentes. Um assinador avulso não ganha leitura geral do acervo por ter acesso ao cartão unificado; usuário GED preserva seu acesso documental sem receber gestão de assinadores/certificados.
4. Durante a transição, um adaptador de autorização documental consulta as concessões legadas necessárias. Não fazer um alias global por `DOCUMENTOS OU ASSINATURA_DIGITAL` dentro de `canViewModule`, pois ampliaria direitos de consumidores não relacionados.
5. Aplicar as mesmas políticas a listagem, totais, árvore, busca, snippet, sugestão, prévia, versão histórica, download e exportação. Reutilizar as regras de origem do download e completar as dos domínios no serviço de acesso documental.
6. Atualizar dashboard, matriz de perfis, nome cadastrado do módulo e gestão de ativação. Desativar definitivamente a dependência do código legado somente depois de migrar todos os consumidores e conferir a política de ativação das instâncias onde só um dos módulos está ativo.

Arquivos de integração da navegação/permissões: `src/app/app-domain/dashboard/page.tsx`, `src/app/app-domain/configuracoes/perfis/actions.ts`, `src/db/repositories/platform/system-administration.ts`, `instance-configuration.ts`, `src/lib/platform/tenant-context.ts`, `src/components/app-ui/operational/modules/assinatura-digital.ts`, `documentos-configuracoes.ts` e `index.ts`. Analisar também consumidores e testes de identidade/ativação antes de modificar APIs compartilhadas.

## 10. Padrão obrigatório de tabelas

Referências: [Padrão de Tabelas.md](Padrão%20de%20Tabelas.md), [TABELAS_CONTRATO_EXECUCAO.md](TABELAS_CONTRATO_EXECUCAO.md), [ENTREGA_PADRAO_TABELAS.md](ENTREGA_PADRAO_TABELAS.md) e o lote `docs/tabelas-lotes/documentos-configuracoes.md`.

- Reutilizar `OperationalTable`, `OperationalListFrame`, `OperationalFilters` e paginação compartilhada, com **20 registros por página**, uma linha visual por célula e ações em coluna própria.
- Priorizar paginação/filtros/ordenação no servidor para o acervo, com total filtrado real e desempate estável por ID; preservar parâmetros na navegação.
- Manter header compacto, uma faixa de filtros, menu recolhido em barra de ícones e paginação sempre acessível.
- Sem rolagem horizontal/vertical nas listagens de notebook/computador; permitida em tablet/celular conforme a decisão posterior do proprietário. Não inferir dispositivo só pela largura nem esconder overflow para declarar encaixe.
- Configurar mínimos/máximos reais por coluna, redimensionamento e detalhe somente quando houver overflow real ou conteúdo composto. Não empilhar atributos independentes para caber.
- Estado vazio, carregamento, erro e repetição devem usar o componente comum. Seleção em lote tem identificação estável e regra explícita para seleção entre páginas.
- Árvore de pastas recolhível/por níveis ou em sobreposição no espaço disponível; não reduzir a tabela a uma faixa estreita que viole os mínimos. Editor, OCR e prévia documental têm composição própria, preservando o padrão das listagens que contiverem.
- Atualizar manifesto, scanner e inventário por estrutura efetivamente renderizada. Preservar preferências existentes quando compatíveis; se mudar a estrutura, versionar sua configuração.

Listagens abrangidas: acervo, resultados da pesquisa, pastas inteligentes, lotes/itens, tarefas, fluxos, processamento, modelos/versões, classes, thesaurus, assinadores, tipos, pendentes, histórico, registros, integrações e auditoria/certificados incorporados. Medir também seletores e tabelas em abas/diálogos; checks estáticos não substituem homologação geométrica.

## 11. Sequência de execução e dependências

| Fase | Entregas e arquivos predominantes | Dependências | Critério de conclusão |
|---|---|---|---|
| **0 — Contratos e base** | Inventário de concessões/origens; DTOs; decisões de estados; schemas e primeiras migrações aditivas; dados controlados da POC | Plano atual | Contratos de acesso, retenção, versão e jobs definidos; migração verificada em base descartável |
| **1 — Módulo único** | Painel, cartão, layout/menu/manifestos; acervo/modelos GED sob `/assinatura-digital`; fila única; redirecionamentos; política de acesso e compatibilidade de actions/APIs | 0 | Operador percorre todas as funções antigas pelo novo módulo; links antigos funcionam; regressão de permissões aprovada |
| **2 — Acervo e versões** | Árvore, detalhe/histórico, check-out/check-in, importador/lote, upload direto e exportação ZIP; correção da gestão de pastas | 1 e infraestrutura de jobs | Itens 1, 4, 7 e 8 demonstráveis com concorrência, repetição e recuperação |
| **3 — Conteúdo e pesquisa** | Extração PDF/TXT/DOCX, OCR de digitalizados e zonas, índice/pesquisa, thesaurus, pastas inteligentes | 2 para originais/versões e provedor OCR real | Itens 2, 3, 6 e 9 demonstráveis, com resultados autorizados e reindexação |
| **4 — Modelos e circuito editorial** | Modelos reais/importação; geração; adaptação de workflow e tarefas de elaboração/consenso/aprovação/homologação | 2; pode avançar independentemente da UI de pesquisa | Itens 5 e 10 demonstráveis, vinculados à versão e com notificações |
| **5 — Assinatura integrada e publicação** | Assinar versão do acervo, relação tipo/classe, certificados por finalidade, arquivamento de avulsos e retenção coordenada; validação integrada; conexão com Transparência | 2 e contratos de 0; usa versões homologadas de 4 | Mesmo documento percorre aprovação, assinatura, validação, arquivamento e publicação com hash/evidência conferidos |
| **6 — Homologação completa** | Matriz POC, regressões intermodulares, medição de tabelas, verificações Drizzle, testes e build | 1–5 | Dez itens comprovados ponta a ponta e versão publicada conferida quando houver deploy |

Ordem crítica: **acesso/contratos → unificação → versões/importação → conteúdo/OCR/pesquisa e circuito editorial → assinatura integrada → ensaio**. O provedor OCR e um conjunto real de arquivos de teste precisam estar disponíveis para encerrar a fase 3. A duração depende do volume do acervo, do tempo do OCR e da fidelidade esperada dos modelos; não fixar prazo de implementação com base apenas na troca de menus.

## 12. Verificação e roteiro de aceite

### Regressões essenciais

- Reutilizar e ampliar as suítes `tests/document-flow.test.ts`, `digital-signature-module.test.ts`, `signature-central-backend.test.ts`, `signature-central-cadastros.test.ts`, `aurora-signature-history.test.ts`, testes de A1/tributação e suítes documentais de Construção Civil.
- Testar simultaneidade real de checkout/check-in, reserva de arquivamento versus cron, repetição de importação/job, perda de resposta após confirmação e recuperação por chave idempotente.
- Testar permissões negativas para documento de outro setor/entidade, paciente, ASO e titular; verificar que pesquisa e ZIP não criam atalhos aos controles de origem.
- Conferir contagens e filas sem duplicidade, links legados com `folderId/view`, comprovação antiga e validação após expiração do temporário.
- Medir notebook/computador e tablet/celular com 20 linhas, última página, zoom, nomes longos, seleção entre páginas e estados de erro. Registrar dimensões e conflitos reais.

### Ensaio integrado da POC

1. Importar PDFs e imagens de legado com metadados e árvore de quatro níveis; conferir o relatório do lote e repetir a importação.
2. Buscar termo exclusivo do corpo, frase exata, fragmento, proximidade e sinônimo cadastrado; abrir página e trecho corretos.
3. Criar pasta inteligente, mudar o documento e confirmar atualização automática da consulta.
4. Retirar para edição com usuário A, negar reserva concorrente a B e devolver nova versão com comentário.
5. Executar elaboração, consenso, aprovação e homologação com responsáveis distintos e tarefa/aviso em cada fase.
6. Reconhecer uma zona em imagem sem camada textual; conferir região/texto e pesquisar o conteúdo reconhecido.
7. Criar e importar modelos reais, gerar documento e rastrear a versão do modelo usado.
8. Selecionar arquivos em páginas diferentes e recuperar ZIP com manifesto de versões/hashes.
9. Assinar versão homologada e arquivo avulso; arquivar o avulso no GED e validar as evidências por seus códigos originais.
10. Publicar explicitamente uma versão autorizada na Transparência e testar a preservação documental diante da expiração do temporário, em ambiente de teste com relógio controlado.

Na integração final, seguir os scripts oficiais: `npm run verify:database-migration`, `npm run db:migrate:verify`, `npm run typecheck:auxiliary`, `npm run test:unit` e `npm run build`, além do lint dirigido e scanner tabular aplicável. Executar somente os checks correspondentes durante as etapas; consolidar o build completo após integração e obrigatoriamente antes de commit/push.

## 13. Publicação e conclusão esperada

Entregar migrações verificadas, documentação de operação, matriz dos dez aceites com evidências, inventário de telas e resultado real de testes/build. A publicação segue **GitHub → Vercel**, com identidade local e credencial **Robonuvem-dev**, preservando histórico e conferindo o SHA servido e os recibos de migração do destino.

**Resultado esperado:** uma entrada única para **GED e Assinatura Digital**, com os recursos atuais dos dois módulos incorporados e os dez requisitos documentais implementados. Serviços de origem, evidências e políticas continuam rastreáveis durante todo o ciclo documental.

### Limites da verificação deste plano

Esta etapa inspecionou código e documentação; não alterou runtime, schema, banco, configuração externa nem executou deploy. Os dados de ambiente citados vêm da análise anterior do banco local e não representam produção. A implementação só pode ser declarada aderente aos dez itens após os critérios acima serem executados na instância escolhida.

Verificação documental: 44 caminhos explícitos de arquivos/diretórios conferidos, todos existentes; `git diff --check -- docs/PLANO_UNIFICACAO_GED_ASSINATURA_DIGITAL.md` aprovado. Testes de aplicação e build ficam para a implementação, pois esta entrega altera somente documentação.
