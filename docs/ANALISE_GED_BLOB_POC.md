# Análise de documentos, Blob e aderência à POC

Data: 31/10/2026. Referência: código local, versão declarada 1.235.0.

## 1. Conclusão executiva

O módulo antigo existe como **Documentos e GED**, código `DOCUMENTOS`, com painel, acervo, pastas, modelos e assinaturas. Seu núcleo continua sendo utilizado por diversos módulos. Ele foi retirado da exposição principal: não consta nos cartões do dashboard, é filtrado da gestão de módulos e não pode receber novas concessões pela matriz editável de perfis.

**Recomendação: recuperar a exposição do GED como central de acervo e evoluir os recursos documentais nele, mantendo Processos, Assinatura Digital, Planejamento e Transparência como fluxos integrados.** Somente redistribuir a demonstração entre módulos existentes não atende aos dez requisitos apresentados: busca no conteúdo, pastas inteligentes, check-in/check-out, OCR por zonas e importação real de modelos têm lacunas.

Não foi identificada uma segunda implementação independente com o nome “Documentação”. As funções documentais atuais estão no GED e nos módulos de negócio relacionados neste relatório.

### Verificação de ambiente

Consulta exclusivamente de leitura ao banco apontado pelo `.env` local:

| Verificação | Resultado |
|---|---|
| `DOCUMENTOS` | Ativo, nome cadastrado “Documentos / GED” |
| `ASSINATURA_DIGITAL`, `PROCESSOS`, `TRANSPARENCIA`, `PLANEJAMENTO` | Ativos |
| Documentos / pastas / versões / modelos genéricos | 0 / 0 / 0 / 0 |
| Classes documentais ativas | 7 |
| Token do Blob na configuração local | Presente; conectividade não testada |
| Endpoint OCR de Construção Civil na configuração local | Ausente |

Esses resultados descrevem o banco e a configuração consultados; não comprovam a configuração do deploy Vercel nem de outra instância. Não houve navegação autenticada ou teste completo de envio/download. A ausência de registros nas tabelas do GED não significa ausência de arquivos físicos no Blob ou de registros nas tabelas próprias de outros módulos.

## 2. Por que o GED não aparece como antes

| Camada | Evidência |
|---|---|
| Telas preservadas | `src/app/app-domain/documentos/layout.tsx`: `/documentos`, `/documentos/ged`, `/documentos/modelos`, `/documentos/assinaturas` |
| Cartões do painel | `src/app/app-domain/dashboard/page.tsx`: lista `menuItems` sem `DOCUMENTOS` |
| Gestão de módulos | `src/db/repositories/platform/system-administration.ts`, `listSystemModules`: exclui explicitamente `DOCUMENTOS` |
| Indicador de módulos ativos | `src/db/repositories/platform/instance-configuration.ts`: também exclui `DOCUMENTOS` da contagem |
| Gestão de perfis | `src/app/app-domain/configuracoes/perfis/actions.ts`: `MODULE_CODES` não contém `DOCUMENTOS`; preserva concessões antigas ao editar perfis, com comentário de que GED é interno |
| Acesso às rotas | `src/lib/platform/tenant-context.ts`: verifica ativação do módulo e permissões do usuário |

Portanto, **reativar a apresentação não é simplesmente mudar `ativo` para verdadeiro**, pois esse valor já está verdadeiro no banco consultado. Exige devolver o acesso à navegação, à administração de módulos e à matriz de permissões. O acesso direto às rotas preservadas depende das autorizações e da configuração do domínio.

## 3. Como documentos e Blob estão organizados

### 3.1 Armazenamento compartilhado

`src/lib/platform/blob.ts` concentra a integração compartilhada com **Vercel Blob privado**:

- Namespace: `instances/<instância>/documents/`.
- `uploadFile`: arquivo genérico, validação de MIME e até 20 MB.
- `uploadProcessFile`: PDF/JPEG/PNG, até 10 MB, subpasta `processos/`.
- `uploadGeneratedReport`: CSV preservado em `relatorios/`.
- `uploadGeneratedFinancialFile`: artefatos gerados em `financeiro/`.
- `archiveBankStatement`: conteúdo original de extratos em `extratos/`.
- `getFile`: leitura privada e conferência de pertencimento ao namespace da instância.
- `deleteUploadedDocument`: exclusão física de arquivo no namespace autorizado.

O Blob guarda bytes. Os metadados e vínculos ficam no banco. No núcleo do GED, as principais estruturas são `Document`, `Folder`, `DocumentClass`, `DocumentVersion`, `DocumentSignature` e `DocumentIcpEvidence`.

`ingestGedDocument`, em `src/lib/documents/document-flow-service.ts`, registra documento, versão inicial finalizada, SHA-256, código público de validação e auditoria. Esse ingresso não extrai nem indexa o texto do arquivo.

### 3.2 Armazenamentos relacionados, mas distintos

- **Central de Assinaturas:** usa `instances/<instância>/signature-central/`, serviço próprio e retenção física de 90 dias. Não equivale ao acervo permanente do GED. Evidência: `src/lib/signatures/central-storage.ts`.
- **Transparência:** usa registros próprios de publicações, incluindo arquivos privados no namespace documental e acesso público mediado por API. Estar na Transparência não implica automaticamente possuir `DocumentVersion` no GED.
- **Relatórios:** parte é gerada e transmitida diretamente ao navegador; parte é preservada no Blob. Exportação de relatório não significa automaticamente arquivamento no GED.

## 4. Mapa dos módulos e operações documentais

As rotas abaixo são os caminhos de uso previstos pelo sistema. Sua disponibilidade para a apresentação depende das permissões, dados e configuração da instância.

| Módulo / entrada | Envio e armazenamento | Download, geração e finalidade |
|---|---|---|
| **Documentos e GED** — `/documentos/ged` | Upload individual por `/api/upload`; criação de documento e versão; pastas e subpastas | Visualização/leitura por `/api/download?url=...`; solicitação de assinaturas. Melhor base para centralizar o acervo |
| **Processos e Protocolo** — `/protocolos/processos/[id]` | `/api/protocolos/upload`; anexo entra no GED e é vinculado ao processo | Download autorizado, tramitação, histórico, solicitações de assinatura e notificações |
| **Assinatura Digital** — `/assinatura-digital/assine-agora`, `/assinatura-digital/registros` | Seleção de até 20 arquivos, até 3 MiB cada, envio sequencial com controle individual e repetição de falhas | Download individual do original e comprovante JSON; validação e retenção de 90 dias. `/assinatura-digital/documentos` cadastra tipos documentais, não é explorador de acervo |
| **Transparência** — `/transparencia/publicacoes` | Upload múltiplo direto ao Blob, até 100 MB por arquivo nos formatos aceitos; rascunhos com assunto, exercício, competência e versão | Conferência interna, publicação/retirada e download público em `/api/transparencia/publicacoes/[publicKey]`; geração e preservação de relatórios de consultas |
| **Financeiro e Contábil** — `/financeiro/relatorios`, `/financeiro/download-extratos` | Preservação de arquivos gerados e extratos; serviço que salva documentos na pasta GED “Financeiro” | Emissão PDF/CSV/XLSX/TXT/impressão; download de extratos; snapshots específicos. Nem toda emissão passa pelo Blob |
| **Planejamento e Câmara** — peças, audiências e publicações | Ingresso GED e vínculo de anexos, atos e atas; exige também permissões documentais | Download da versão vinculada com conferência de hash; publicação de relatório PDF/CSV preservado no Blob |
| **Obras / Construção Civil** — `/obras/construcao-civil` | Documentos de abertura e complementares, pranchas, PDFs derivados e versões GED | Emissões por modelos, assinatura, publicação, download, validação, anotações de PDF e extração textual/OCR configurável |
| **Tributário / ITBI** — `/tributacao/itbi`, portal tributário | Anexos de solicitação e comunicação com uploads diretos ao Blob e vínculos GED; outros fluxos utilizam documentos comprobatórios | Download autorizado de anexos, modelos configuráveis de declaração, documentos fiscais/cadastrais. Algumas saídas são geradas pela API sem Blob |
| **RH / Portal do Servidor** — `/portal-servidor` | Anexos de recadastramento e requerimentos; emissões funcionais geradas e armazenadas no Blob/GED | Download de documentos próprios, atos e emissões; políticas de modelo, assinatura e autenticidade |
| **Saúde** — `/saude/administracao/documentos` e prontuários | Upload de documentos administrativos e anexos clínicos em rotas próprias | Download por contexto: paciente, família, atendimento e processo judicial; relatórios em serviços próprios |
| **SST** — `/sst` | Upload de documentos ocupacionais e emissão de ASO com integração documental | Download com autorização clínica específica; relatórios e documentos de saúde ocupacional |
| **Frotas** — `/frotas/gestao/anexos` | Upload direto ao Blob, registro do anexo e versão GED | Leitura autorizada por vínculo/escopo; comprovantes e relatórios de controle |
| **Cemitérios** — `/cemiterios` | `/api/cemiterios/anexos`: upload e registro GED; também permite vincular documento existente | Download em `/api/cemiterios/anexos/[id]` |
| **Meio Ambiente** — `/meio-ambiente/documentos` | Upload real por `createEnvDocument`, armazenamento de metadados próprios | Download pela rota compartilhada, que reconhece o proprietário ambiental |
| **Patrimônio** — valorização | Upload de evidência no fluxo de valorização | Uso de documento/versão como suporte de conciliação; não oferece GED geral alternativo |
| **Atendimento / Ouvidoria** — `/atendimento` | `/api/atendimento/upload`; arquivos vinculados a chamados/manifestações | Download compartilhado verifica acesso ao chamado ou manifestação |
| **Cultura** — `/cultura/documentos` | Consulta documental e encaminhamento ao GED | Porta de acesso ao acervo relacionado, não implementação independente dos requisitos avançados |
| **Cadastros** — `/cadastros/documentos/novo` | **Upload simulado**: grava `/uploads/simulated-...`, sem envio real ao Blob | Não serve como evidência de importação física ou recuperação do arquivo |

Educação, Assistência Social e outras áreas também possuem emissão de documentos e relatórios. A existência dessas telas, isoladamente, não comprova tratamento de arquivos no Blob nem os recursos avançados de acervo exigidos nesta POC.

### Fontes complementares do mapa

- Processos: `src/app/api/protocolos/upload/route.ts` e `src/lib/documents/document-flow-service.ts`.
- Download compartilhado e autorização por origem: `src/app/api/download/route.ts`.
- Transparência: `src/components/transparencia/PublicationUpload.tsx`, `src/app/app-domain/transparencia/publicacoes/page.tsx`, `src/lib/transparencia/publication-storage.ts`.
- Financeiro: `src/lib/financeiro/ged.ts`, `src/lib/financeiro/report-delivery.ts`, `src/app/api/financeiro/relatorios/route.ts`.
- Planejamento: `src/lib/planejamento/documents.ts`, `document-response.ts` e `publication.ts`.
- Tributário: `src/lib/tributacao/itbi-portal-storage.ts`, `itbi-draft-storage.ts`, `itbi-document-models.ts`.
- Portal do Servidor: `src/lib/portal-servidor/generated-documents.ts`.
- Frotas: `src/lib/frotas/control-attachments.ts`.
- Cadastros: `src/app/app-domain/cadastros/documentos/novo/page.tsx`, linhas 29–34.

## 5. Matriz dos dez requisitos da POC

Classificação por inspeção: “parcial” significa que existe uma parte demonstrável no código, mas não o requisito integral. Não significa recurso homologado em execução.

| Nº | Requisito | Situação encontrada | Onde demonstrar / complemento necessário |
|---|---|---|---|
| 1 | Importar documentação legada digitalizada | **Parcial, com upload real existente.** GED aceita arquivo individual; Transparência aceita múltiplos arquivos. Existe importador técnico específico de acervo antigo | Demonstrar PDFs/imagens já digitalizados no GED ou Transparência. Completar importação genérica de acervo com metadados, hierarquia, origem e relatório de inconsistências, se isso fizer parte da avaliação |
| 2 | Buscar conteúdo por palavras, frases, fragmentos, proximidade e thesaurus | **Não localizado como recurso do acervo.** A busca do GED aplica `includes` em título/tipo/status dos documentos carregados | Implementar extração, índice e operadores explícitos. Pesquisar título ou localizar texto no visualizador PDF não comprova busca interna do acervo |
| 3 | Criar regras e gerenciar pastas inteligentes | **Não localizado.** Há pastas físicas e visão “Recentes”, sem gerenciador de regras persistentes | Implementar pastas virtuais baseadas em consulta salva, com critérios e atualização automática |
| 4 | Estrutura de pastas em árvore conforme hierarquia do acervo | **Parcial.** `Folder.parentId`, criação de subpastas, navegação pai/filho e retorno à raiz existem. Não há explorador visual de árvore expansível | Demonstrar hierarquia navegável; complementar árvore visual e caminho completo para cobrir a exigência literal |
| 5 | Elaboração, consenso, aprovação e homologação por comunicação de tarefas | **Parcial.** Processos tem etapas, aprovação/devolução/rejeição/conclusão, prazos, notificações e exigência de documento assinado; GED tem solicitações de assinatura | Configurar e validar processo documental com quatro fases. Falta comprovar consenso editorial, tarefas de revisão e homologação vinculados à versão exata do documento |
| 6 | Pesquisa full text | **Não localizada no GED.** O ingresso não extrai texto nem cria índice textual | Entregar junto do item 2. Testar termo presente somente no corpo, com retorno de documento, página e trecho |
| 7 | Check-in/check-out | **Não localizado.** Há `lockedAt` para congelamento na assinatura; não há reserva de edição por usuário nem devolução com nova versão | Implementar checkout, proprietário da reserva, concorrência, cancelamento e check-in com comentário e nova versão, preservando o original |
| 8 | Upload e download de múltiplos arquivos em lote | **Parcial.** Upload múltiplo na Transparência e Central de Assinaturas. GED envia um arquivo; downloads encontrados nesses acervos são individuais | Mostrar upload já existente e complementar seleção de documentos + download ZIP. ZIP já enviado e pacotes específicos de exportação não comprovam montagem de lote selecionável do acervo |
| 9 | OCR com zonas de reconhecimento textual | **Parcial apenas como base técnica; requisito zonal não atendido.** Construção Civil tem extração de texto PDF e adaptador OCR externo por página, sem regiões textuais configuráveis | Endpoint OCR local ausente. Implementar seleção de área por página, coordenadas, texto reconhecido e persistência para pesquisa. Zoneamento urbanístico não é zona OCR |
| 10 | Criar e importar modelos de documentos | **Parcial no conjunto; insuficiente no GED genérico.** Modelos de ITBI e Construção Civil têm conteúdo parametrizado/versionado; GED cadastra nome/notas e uma URL `.docx`, sem criar arquivo | Demonstrar criação parametrizada nos módulos de negócio. Implementar upload/importação real de modelo, conteúdo, marcadores, versão e geração de documento a partir dele |

### Evidências decisivas

1. **Busca apenas em metadados:** `src/app/app-domain/documentos/ged/GEDClient.tsx`, linhas 69–75; `src/db/repositories/documents/queries.ts`, `listGedDocuments`.
2. **Upload unitário GED:** mesmo componente, `handleUpload` e seletor `files?.[0]`.
3. **Pastas hierárquicas:** `src/db/schema/document-workflow.ts`, `documentFolders`; `src/app/app-domain/documentos/ged/page.tsx`.
4. **Workflow existente:** `src/lib/protocols/generic-workflow-runtime.ts`; assinatura/notificação em `src/lib/documents/document-flow-service.ts`.
5. **Bloqueio de assinatura:** `createInternalDocumentSignatures` coloca versão em `PENDING_SIGNATURE` e define `lockedAt`. Isso não é checkout editorial.
6. **OCR por página:** `src/lib/obras/construction-extraction.ts`, `extractConstructionPlan`, envia `pdfBase64`, `pages` e `language`; recebe página e texto, sem zonas/retângulos.
7. **Modelo genérico sem bytes:** `src/app/app-domain/documentos/modelos/actions.ts`, `createModelo`, apenas registra `/modelos/<timestamp>_<título>.docx`.
8. **Lotes reais de envio:** `src/components/transparencia/PublicationUpload.tsx`; `src/app/app-domain/assinatura-digital/assine-agora/batch.ts`.
9. **Importação técnica legada:** `scripts/import-transparency-archive.ts`, carga específica de 136 fontes catalogadas do antigo portal de Ibema, com hash e conferência de armazenamento. É um script específico, não importador genérico disponível ao operador; sua existência não comprova execução no banco consultado.

## 6. Estratégia recomendada

### Opção A — Demonstrar somente pelos módulos hoje expostos

É viável para mostrar ingresso de arquivos, envio em lote, tramitação, assinatura, geração de documentos e publicação/download de relatórios. Tem menor alteração de navegação, mas deixa os requisitos avançados de acervo sem cobertura integral e fragmenta a apresentação.

**Uso indicado:** apresentação preliminar dos fluxos que já existem, com identificação explícita das pendências. Não resolve a POC completa por si só.

### Opção B — Recuperar o GED e integrá-lo aos módulos existentes — recomendada

O GED vira a entrada para acervo, pesquisa, árvore, pastas inteligentes, versões, checkout e modelos. Processos controla o circuito de trabalho; Central de Assinaturas e solicitações GED cuidam da assinatura em seus contextos; Transparência controla a publicação externa; módulos de negócio mantêm os vínculos e a geração especializada.

Isso reaproveita as estruturas existentes e oferece uma narrativa única: **importar → organizar → pesquisar → revisar → aprovar → assinar → publicar → recuperar**.

### Etapas propostas

1. **Exposição e preparação:** restaurar cartão e menus do GED; disponibilizar ativação e permissões; preparar usuários e acervo de demonstração; validar upload/download real na instância da POC.
2. **Acervo operacional:** upload múltiplo reutilizando o padrão de envio direto da Transparência, árvore visual, seleção múltipla/download ZIP e importação real de modelos.
3. **Conteúdo pesquisável:** extrair texto de PDF/TXT/DOCX e realizar OCR de digitalizados; persistir conteúdo por versão/página; indexar e oferecer pesquisa. Adicionar OCR por zonas, frases, fragmentos, proximidade e thesaurus com critérios próprios de aceitação.
4. **Gestão documental:** pastas inteligentes, checkout/check-in e vínculo das tarefas/decisões à versão documental; parametrizar elaboração, consenso, aprovação e homologação.
5. **Ensaio da POC:** executar a matriz ponta a ponta com perfis distintos, guardar evidências e corrigir divergências antes da apresentação.

Para a busca, PostgreSQL full text é uma base possível para termos e frases; fragmentos podem requerer trigramas, e proximidade/thesaurus precisam de configuração e testes próprios. Não presumir que um índice textual básico entrega todos os operadores solicitados.

Para as pastas inteligentes, exemplos úteis são “Contratos próximos ao vencimento”, “Documentos aguardando assinatura”, “Acervo legado ainda sem OCR” e “Relatórios por exercício/secretaria”. Elas devem armazenar regras, não apenas agrupar documentos manualmente.

## 7. Roteiro sugerido para a apresentação

| Cena | Ação do apresentador | Evidência esperada | Condição atual |
|---|---|---|---|
| 1 — Legado | Selecionar três PDFs/imagens antigos e enviar em uma operação | Arquivos recuperáveis, origem, classificação e resultado individual | Pode começar na Transparência; lote geral GED precisa complemento |
| 2 — Organização | Abrir `Secretaria > Exercício > Tipo documental` | Hierarquia e caminho do arquivo | Navegação existente; árvore visual pendente |
| 3 — Conteúdo | Buscar termo exclusivo do corpo de um documento e depois frase/fragmento | Documento, página, trecho e operador utilizado | Pendente |
| 4 — Pasta inteligente | Salvar regra “aguardando assinatura” e fazer um documento entrar/sair automaticamente | Regra persistida e conjunto atualizado | Pendente |
| 5 — Colaboração | Usuário A retira para edição; usuário B tenta editar; A devolve versão 2 | Reserva, bloqueio concorrente, comentário, histórico e original preservado | Pendente |
| 6 — Workflow | Tramitar elaboração, consenso, aprovação e homologação entre responsáveis | Tarefa, aviso, decisão e versão vinculada em cada fase | Base de processos existente; circuito documental precisa validação/complemento |
| 7 — OCR zonal | Selecionar região “número do contrato” em imagem digitalizada | Coordenadas e texto reconhecido, posteriormente pesquisável | Pendente |
| 8 — Modelos | Importar DOCX, definir marcadores e gerar documento preenchido | Arquivo real, modelo versionado e documento derivado | Criação textual especializada existe; importação geral pendente |
| 9 — Lote de saída | Selecionar documentos distintos e baixar todos | ZIP com arquivos corretos e identificação das versões | Pendente no acervo geral |
| 10 — Relatórios/publicação | Gerar relatório, preservar arquivo e publicar | Download do mesmo artefato/hash e origem rastreável | Há fluxos implementados em Financeiro, Planejamento e Transparência; ensaiar com dados |

Para o teste de full text, usar arquivo chamado, por exemplo, `Acervo_001.pdf`, contendo no corpo uma expressão única. Isso evita confundir pesquisa por nome com pesquisa por conteúdo. Para OCR, usar uma imagem digitalizada sem camada de texto e conferir o resultado reconhecido.

## 8. Pontos de implementação que influenciam a decisão

- Há compartilhamento da tabela `Document` entre documentos gerais e áreas com escopos próprios. A listagem atual do GED não aplica os mesmos recortes por origem usados em downloads especializados. Ao expor o acervo para mais perfis, definir o recorte de listagem/pesquisa de forma consistente com esses acessos.
- A exclusão de documento no GED remove o registro, mas não chama `deleteUploadedDocument`; isso não comprova exclusão física do Blob. A exclusão de pastas trata filhos imediatos, sem percorrer recursivamente todos os níveis. Convém ajustar o comportamento antes de demonstrar gestão profunda de acervo.
- O GED possui suporte estrutural a versões, mas a tela geral não oferece um ciclo completo de substituição/edição com histórico navegável. Versões produzidas em fluxos especializados não substituem esse ciclo editorial.
- A validação compartilhada admite 20 MB, mas o upload geral passa pelo servidor em `/api/upload`. O limite efetivo do ambiente de hospedagem deve ser conferido no ensaio; o envio direto ao Blob já usado na Transparência é um padrão reaproveitável para lotes.
- A Central de Assinaturas preserva arquivos por 90 dias. Acervo legado deve ter política documental própria; não utilizar essa retenção temporária como armazenamento definitivo do GED.
- Relatórios por API e publicações em tabelas próprias precisam ser diferenciados de documentos realmente ingressados no GED, para que a demonstração não prometa um acervo unificado que ainda não está implementado.

## 9. Decisão proposta

**Recuperar o GED como módulo visível e investir nele para os requisitos de acervo.** Reaproveitar Transparência para importação/publicação pública e envio em lote; Processos para tarefas e decisões; Assinatura Digital para assinatura; Planejamento/Financeiro/ITBI/Construção Civil para demonstrar documentos e relatórios de negócio.

Há uma base reutilizável relevante, mas **não há evidência de atendimento integral aos dez itens apenas com a implementação atual**. A recuperação da navegação é uma etapa; a conclusão funcional da POC é outra, com entregas especialmente concentradas em conteúdo pesquisável/OCR, regras de pasta, edição controlada e modelos reais.
