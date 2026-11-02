# GED web — matriz dos 52 requisitos da POC

Data da análise: 01/11/2026. Versão declarada: 1.235.0.

## Escopo e conclusão

Análise do código local das telas, APIs, serviços, autorização e persistência do GED, cruzada com Configurações, Processos, Administração, Transparência e recursos documentais de áreas de negócio. Foram consultadas também as evidências já registradas de homologação. Esta rodada não executou novos testes, não acessou o banco nem verificou o deploy publicado.

**Já há uma base relevante e demonstrável, principalmente no módulo unificado GED e Assinatura Digital. Os 52 requisitos, considerados integralmente, ainda não estão cobertos.**

A análise anterior `ANALISE_GED_BLOB_POC.md` descreve o cenário anterior à unificação. Para funcionalidades atuais, devem prevalecer a implementação inspecionada e `IMPLEMENTACAO_GED_ASSINATURA_DIGITAL.md`. Busca no conteúdo, pastas inteligentes, importação em lote, versões/check-in/check-out, circuito editorial, modelos reais e OCR zonal já foram implementados.

O arquivo `GED_HOMOLOGACAO_RESULTADO.json` registra PASS em 30 verificações de 31/10/2026, com Neon, Blob, autenticação, OCR Tesseract real e navegador Chromium. Isso é evidência histórica do recorte ensaiado; não é uma nova homologação dos 52 itens ou de todos os navegadores.

### Classificação

- **Existe:** implementação localizada suficiente para o núcleo do requisito; preparar dados, permissões e ensaio na instância da apresentação.
- **Parcial:** há base reutilizável, mas falta parte expressa do requisito.
- **Desenvolver:** não foi localizada implementação operacional correspondente.
- **Validar/adequar:** há exigência de compatibilidade/homologação que não pode ser declarada atendida pela inspeção.

## Entradas para demonstração

| Módulo | Onde acessar | Papel na POC |
|---|---|---|
| GED e Assinatura Digital | `/assinatura-digital` | Entrada principal |
| Acervo | `/assinatura-digital/acervo` | Arquivos, pastas, versões, edição controlada, lote ZIP |
| Pesquisa | `/assinatura-digital/pesquisa` | Conteúdo, frase, fragmento, proximidade, thesaurus |
| Pastas inteligentes | `/assinatura-digital/pastas-inteligentes` | Consultas persistidas e reexecutadas |
| Importações | `/assinatura-digital/importacoes` | Lotes e manifesto CSV de metadados/hierarquia |
| OCR e indexação | `/assinatura-digital/processamento` | Fila persistida e execução/repetição de extração |
| Tarefas e fluxos | `/assinatura-digital/tarefas`, `/assinatura-digital/fluxos` | Circuito editorial vinculado à versão |
| Modelos | `/assinatura-digital/modelos` | Criação, importação DOCX, versões, marcadores e geração |
| Classes / thesaurus | `/assinatura-digital/classes`, `/assinatura-digital/thesaurus` | Consulta de classes e cadastro de equivalentes; classes ainda sem editor genérico completo nessa tela |
| Configurações | `/configuracoes/usuarios`, `/configuracoes/perfis`, `/configuracoes/instancia` | Usuários, perfis, capacidades GED e retenção global |
| Processos | `/configuracoes/processos`, `/protocolos/processos` | Configuração de etapas e tramitação de processos |
| Transparência | `/transparencia/publicacoes` | Gestão e publicação externa de documentos |
| Administração | `/administracao/instituicao`, `/administracao/calendario` | Identidade institucional e eventos por data |

## Matriz completa

| Item | Exigência resumida | Situação | Módulo e evidência funcional / complemento necessário |
|---|---|---|---|
| 1 | Armazenar, reter, incluir, alterar, excluir e pesquisar documentos OCR | **Parcial** | GED: ingresso real, Blob privado, OCR, busca, versões e retenção registrada. Falta ciclo completo de descarte/exclusão de documento gerenciado e aplicação operacional da temporalidade. A API nova exclui pasta vazia, mas não oferece exclusão de documento. |
| 2 | Importar documentação legada digitalizada | **Existe** | GED > Importações: lote real, referência do legado e manifesto CSV opcional com título, classe e caminho; cria a hierarquia e confere hash. |
| 3 | Armazenar, pesquisar e indexar todos os formatos listados, incluindo PDF/A-1 e PDF/A-2 | **Parcial** | GED gerenciado aceita PDF, TXT, DOCX, PNG, JPG/JPEG. Extrai texto/OCR nesses formatos. Upload compartilhado de outros módulos aceita alguns formatos adicionais, mas isso não os torna pesquisáveis no GED. Desenvolver ODF, DOC, RTF, XLS, PPTX, PPS, HTML, TIF/TIFF, BMP, GIF e respectivos extratores/conversores. PDF/A pode entrar como PDF, mas não há validação de conformidade ISO 19005-1/2. |
| 4 | Versionar com autor, alteração e data | **Parcial** | GED registra número/data/hash, autor e comentário da nova versão. A tela e o DTO do histórico exibem número, estado, hash e data, sem autor/comentário. Expor esses dados para a demonstração completa. Não foi localizado comparador de conteúdo. |
| 5 | Política de armazenamento de versões por tipo documental, sem limite de quantidade | **Parcial** | GED mantém versões sucessivas e histórico paginado; não foi encontrado teto funcional de versões. Falta política configurável por classe/tipo. A retenção atual é global, copiada para o documento. Paginação não é limite de armazenamento. |
| 6 | Interface única para metadados/conteúdo, semântica, sinônimos, booleanos, similaridade e acentos | **Parcial** | GED tem full text, equivalentes do thesaurus, fragmento, proximidade e normalização de acentos. Faltam busca semântica além de equivalentes, fuzzy/similaridade de grafia, parser booleano e pesquisa integrada completa de metadados. |
| 7 | Busca restrita, negação, campo, curingas, fuzzy e frase exata | **Parcial** | GED tem escopo autorizado, pasta/situação, frase e fragmento. Faltam NOT/negação, campos arbitrários de metadados, curingas e fuzzy. Fragmento literal não equivale a curinga ou tolerância a erro. |
| 8 | Conteúdo interno: palavras, frases, fragmentos, proximidade e thesaurus | **Existe** | GED > Pesquisa: modos palavras, frase, fragmento e proximidade de duas palavras, com distância configurável; expansão por equivalentes persistidos. A busca textual atua por página da versão atual indexada, não por toda combinação entre páginas. |
| 9 | Full text com ranking por tipo de documento | **Parcial** | GED retorna documentos, página e trecho. Ordenação atual é data/id; falta pontuação/relevância e ranking por tipo documental. |
| 10 | Criar/alterar fluxo em uso com ferramenta gráfica web | **Parcial** | GED tem quatro fases fixas; Processos tem definições versionadas por formulário. Falta editor gráfico e política de alteração de instância em andamento. Processos fixa a versão na abertura; publicar nova definição não atualiza automaticamente o processo no próximo acesso. |
| 11 | Regras e gerenciamento de pastas inteligentes | **Existe** | GED > Pastas inteligentes: consulta validada e persistida, reexecutada sobre o escopo de quem acessa. Interface oferece criação, abertura e exclusão pessoal; compartilhamento tem suporte de serviço por capacidade administrativa. |
| 12 | Pastas multinível com pesquisa hierárquica | **Existe** | GED: pai/filho, navegação multinível e pesquisa filtrada pela pasta escolhida. Busca não percorre automaticamente todas as descendentes. |
| 13 | Árvore conforme hierarquia do acervo | **Existe** | GED: exploração de subpastas e caminho; importação monta a hierarquia do manifesto. Apresentação atual é navegação expansiva por níveis, não árvore lateral simultânea de todos os ramos. |
| 14 | Pastas/subpastas no paradigma Explorer | **Existe** | GED: criação, navegação, realocação/renomeação, bloqueio de ciclos e seleção de pasta de destino. É equivalente funcional de organização; se exigido visual idêntico ao Explorer, complementar a árvore lateral. |
| 15 | Quantitativo de pastas, arquivos e documentos | **Parcial** | GED mostra totais paginados de documentos e número de subpastas imediatas. Falta visão consolidada com contagens de pastas/arquivos/documentos por ramo, inclusive recursivas. |
| 16 | Zoom dos documentos | **Parcial** | GED visualiza PDF/imagem para OCR, porém usa escala fixa e não tem controles próprios de zoom. PDF aberto externamente pode usar o leitor do navegador; implementar zoom interno para comprovação consistente. |
| 17 | Inserir digitalizados diretamente no GED | **Existe** | GED > Acervo/Importações: envio direto de PDFs e imagens ao Blob privado, com registro documental e versão. Isso é ingresso de arquivos digitalizados; não implica captura direta por scanner/TWAIN. |
| 18 | Transferência FTP e WebDAV | **Desenvolver** | Fluxo atual é HTTP/HTTPS com Blob. Não foi localizado cliente/servidor ou conector FTP/WebDAV. |
| 19 | Cadastrar usuários e grupos de usuários | **Parcial** | Configurações tem usuários, perfis e permissões; Administração tem setores. Não foi localizado cadastro específico de grupos de acesso documental com membros. |
| 20 | Atribuir usuários, grupos e perfis por documento/registro | **Parcial** | GED tem proprietário/setor e responsáveis por fase; Configurações tem capacidades por perfil. Falta ACL configurável por documento/registro para usuários, grupos e perfis. |
| 21 | Usuário pertencer a vários grupos simultaneamente | **Parcial** | Configurações já permite múltiplos perfis adicionais, considerados na autorização. Não foi localizada associação a múltiplos grupos independentes. Se o avaliador exigir grupos distintos de perfis, desenvolver esse cadastro/relação. |
| 22 | Usuários/grupos visualizarem somente objetos autorizados | **Parcial** | GED aplica escopo por proprietário, setor, responsável da fase ativa e administrador na listagem, busca e download. Falta delegação explícita por grupo e ACL de leitura por objeto. |
| 23 | LDAP v3 e Microsoft Active Directory | **Desenvolver** | Autenticação operacional é Firebase; o texto LDAP na tela de login não é conector. Não foram localizados integração LDAP/AD, sincronização ou mapeamento de grupos. |
| 24 | Customizar aparência | **Parcial** | Administração > Instituição configura nome, brasão/logo e dados institucionais; há preferências de colunas e modelo de relatórios. Falta editor geral de tema/aparência GED, se o aceite exigir cores, fontes e layout. |
| 25 | Administração/configuração/monitoramento/uso web, homologado IE/Chrome/Firefox | **Validar/adequar** | Interface web existe e há ensaio Chromium registrado. Não há homologação apresentada de Firefox/IE. A stack Next 16/React 19 exige navegadores modernos; não declarar suporte a Internet Explorer. |
| 26 | IE, Firefox, Chrome e Opera em versões atuais/superiores | **Validar/adequar** | Validar Firefox, Chrome e Opera nas versões da POC. Internet Explorer é legado e não está coberto; esclarecer o critério contratual e eventual aceitação de Edge. Não tratar Edge como substituição já autorizada. |
| 27 | Documentos de áreas/setores independentes e seguros | **Existe** | GED segmenta por proprietário/setor e aplica capacidades; módulos de negócio mantêm fluxos próprios de Processos, Planejamento, Financeiro, Obras, RH, Saúde, SST etc. A pesquisa do novo GED não abrange automaticamente todos os documentos dessas origens. |
| 28 | Elaboração, consenso, aprovação e homologação por tarefas | **Existe** | GED: quatro fases, responsáveis múltiplos, decisões/comentários, devolução, prazo e notificações internas, sempre vinculados à versão exata. |
| 29 | Criar tipos e campos de indexação próprios para cada tipo | **Parcial** | Existem classes, tipos especializados e campos fixos de ingresso. Falta construtor genérico de tipos com campos/metadados dinâmicos por tipo e pesquisa desses índices. A tela Classes é consultiva. |
| 30 | Configurar ações de pastas/tipos/etiquetas sem programação/scripts | **Parcial** | Pastas inteligentes, modelos/marcadores e etapas de processos podem ser operados por interface. Falta motor genérico no-code de eventos, condições e ações por pasta/tipo/etiqueta. Não há gestão completa de etiquetas GED. |
| 31 | Validade, e-mail aos responsáveis e tarefas automáticas de revalidar/cancelar | **Parcial** | Há retenção global registrada, prazo editorial e notificações internas de tarefas. Controle Interno tem agenda de obrigações reaproveitável. Falta fluxo específico de validade documental, agendamento, e-mail e criação automática de revalidação/cancelamento. Retenção não é validade. |
| 32 | Controlar versão documental | **Existe** | GED: versão inicial, check-in com incremento, preservação do original, hash e recuperação histórica. |
| 33 | Consulta rápida por palavras-chave, metadados e título/nome | **Parcial** | GED novo pesquisa conteúdo e filtra situação/pasta. Acervo integrado anterior pesquisa título/tipo/situação. Falta pesquisa única combinando conteúdo, título, nome de arquivo e índices/metadados. O campo textual da coleção nova não filtra `d.title`/`e.filename`. |
| 34 | Full text search | **Existe** | GED: texto por versão/página e índice PostgreSQL; PDF com texto, TXT/DOCX e OCR. Arquivos precisam ter processamento concluído. |
| 35 | Criar fluxos por ferramenta gráfica web | **Parcial** | Reutilizar GED e Processos como motor/base. Falta designer visual de nós, conexões e regras; a configuração atual é por formulários/listas e o circuito GED tem fases fixas. |
| 36 | Histórico das alterações documentais | **Existe** | GED preserva versões e registra eventos de auditoria, checkout/check-in e decisões. Para histórico unificado exibindo autor e comentário da versão, realizar complemento do item 4. Não há comparação visual automática de conteúdo. |
| 37 | Check-in/check-out | **Existe** | GED: reserva exclusiva, concorrência, proprietário, versão-base, cancelamento e devolução com nova versão/comentário, preservando históricos. |
| 38 | Acessos distintos de leitura, edição, aprovação e exclusão | **Parcial** | GED separa `read`, `import`, `edit`, `review`, `models`, `configure`. Falta capacidade específica de exclusão de documento gerenciado e sua operação, além de granularidade por objeto para o cenário completo. |
| 39 | Portal web de publicação de documentos | **Existe** | Transparência > Publicações: rascunho, classificação, publicação/retirada e download público. A publicação usa registros próprios; publicar no portal não é sincronização automática de toda versão GED. |
| 40 | Upload e download de múltiplos arquivos em lote | **Existe** | GED: envio sequencial de lote com resultados individuais/repetição e seleção de versões para ZIP com manifesto/hash. Limites atuais: 20 MiB/arquivo; ZIP até 50 itens e 60 MiB. |
| 41 | Importação em lote com indexação automática | **Parcial** | GED importa lote e cria job de indexação automaticamente. A extração/OCR exige acionamento na tela; não há worker agendado. Desenvolver processamento automático até índice pronto, com retentativas. |
| 42 | Relatório do resultado de busca avançada com dados e índices | **Parcial** | Há resultados com trecho e lote ZIP com manifesto; Transparência e módulos de negócio emitem relatórios próprios. Falta exportação/relatório específico da consulta avançada GED preservando filtros, principais dados e metadados/índices. |
| 43 | Publicar/enviar documento por drag-and-drop | **Desenvolver** | GED usa seletor `<input type="file" multiple>`. Não foi localizado dropzone com arrastar/soltar arquivos; o arraste do OCR seleciona região, não envia arquivo. |
| 44 | Favoritar, comentar e compartilhar documentos entre usuários | **Parcial** | Existem comentários de check-in e pareceres editoriais; acesso de responsáveis permite colaboração no circuito. Falta favoritos de documentos, comentários livres e compartilhamento explícito. Favoritos do Portal são de serviços, não de documentos. |
| 45 | Visualizar localização do documento na árvore | **Parcial** | GED mostra pasta imediata, navegação de caminho no explorador e seletor de destino. Falta abrir a árvore diretamente posicionada no documento e exibir breadcrumb completo no detalhe. |
| 46 | Criar e importar modelos de documentos | **Existe** | GED > Modelos: edição textual, importação real DOCX, marcadores, versões e geração de DOCX ligado ao modelo/valores. Importação extrai texto; a geração não preserva layout/estilos do DOCX original. |
| 47 | Calendário de eventos/atividades com descrição, hora, início e fim | **Parcial** | Administração > Calendário tem título, descrição e data única, sem horário/intervalo. SST tem agenda especializada com início/fim; isso não fornece calendário pessoal/documental genérico. Complementar modelo e interface genéricos. |
| 48 | Painel do calendário e eventos | **Parcial** | Administração lista eventos por data com gestão/pesquisa. Há agendas setoriais; falta painel visual de calendário documental/pessoal com os eventos/intervalos do item 47. |
| 49 | Painel de dashlets por usuário com tarefas, atividades e documentos | **Parcial** | GED tem Minhas tarefas, pendências de assinatura e entrada com cartões de navegação. BI fornece infraestrutura de painéis. Falta painel pessoal integrado com widgets/dashlets de tarefas, atividades e documentos autorizados. Cartões de navegação não são dashlets de dados. |
| 50 | OCR com zonas textuais | **Existe** | GED > detalhe > OCR por zonas: seleção visual por arraste/coordenadas, página/campo, texto/confiança e indexação. Tesseract real foi homologado em imagem/PDF digitalizado/zona. Serviço permanece local; preparar endpoint HTTPS acessível para POC em Vercel. |
| 51 | Gerar PDF a partir de imagens digitalizadas | **Desenvolver** | Há bibliotecas e emissores PDF em áreas de negócio, mas não foi localizado fluxo GED de converter imagens digitalizadas em PDF, reunir páginas e registrar a saída como documento/versão. |
| 52 | Gerar automaticamente PDF pesquisável na digitalização | **Desenvolver** | OCR grava texto separado no banco; não reconstrói PDF com camada textual. Desenvolver imagem + texto posicionado por página, saída PDF pesquisável, processamento automático e vínculo ao original. Pesquisa no sistema não equivale a PDF pesquisável baixado. |

## Detalhes que afetam o aceite

1. **OCR local versus Vercel:** conforme `GED_OCR_TESSERACT.md`, o endpoint 127.0.0.1 desta estação não é acessível pela Vercel. Existe imagem Docker preparada; publicação permanente e configuração HTTPS continuam pendentes na evidência consultada.
2. **Acervo gerenciado versus integrações:** documentos de outros módulos não recebem automaticamente `GedEntry`. A pesquisa nova consulta entradas gerenciadas e texto da versão atual; não todo o banco documental compartilhado.
3. **Formato aceito versus indexado:** o upload compartilhado aceita DOC, algumas variantes ODF, planilhas/apresentações e GIF, mas o pipeline GED gerenciado tem lista própria menor. Bibliotecas instaladas não comprovam extratores de todos os formatos.
4. **Thesaurus versus semântica/fuzzy:** o mecanismo atual expande equivalentes cadastrados. Não há motor de similaridade ortográfica ou semântica contextual.
5. **Booleanos internos versus operador de usuário:** a consulta combina palavras com AND e equivalentes com OR internamente. Isso não entrega uma linguagem livre `AND/OR/NOT`, parênteses e campos.
6. **Frase exata:** a implementação usa `phraseto_tsquery('simple', ...)`, isto é, frase por tokens normalizados. Para avaliação literal sensível a pontuação/espaços, definir o critério e complementar.
7. **Árvore funcional versus Explorer visual:** há hierarquia, expansão por níveis e caminho. Não foi localizado painel lateral com vários ramos abertos simultaneamente.
8. **Autor/comentário da versão:** são persistidos em `GedVersionFile`, mas não são retornados/exibidos no histórico atual. Auditoria e dados existentes reduzem o desenvolvimento necessário.
9. **Grupos versus perfis adicionais:** múltiplos perfis já existem e são efetivamente avaliados na autorização; não declarar que constituem grupos documentais independentes sem concordância do critério de aceite.
10. **Internet Explorer:** o requisito precisa de esclarecimento de compatibilidade; a arquitetura atual não é evidência de suporte a IE. Homologar Chromium não comprova Firefox/Opera.

## Desenvolvimento recomendado por frente

| Frente | Itens principalmente afetados | Entrega proposta |
|---|---|---|
| Pesquisa unificada e avançada | 6, 7, 9, 33, 42 | Metadados+título+nome+conteúdo na mesma consulta, AND/OR/NOT, campos, curingas, fuzzy, ranking por tipo e relatório exportável |
| Formatos e saída de digitalização | 3, 41, 50, 51, 52 | Novos formatos/extratores, validação PDF/A, worker automático, OCR publicado, imagem→PDF e camada textual no PDF |
| Segurança por objeto e identidades | 19–23, 38, 44 | Grupos/membros múltiplos, ACL por pasta/documento/registro, compartilhamento, LDAP/AD e capacidade de exclusão |
| Governança e configuração documental | 1, 4, 5, 29–31, 36 | Política por tipo, descarte, autor/comentário visíveis, metadados dinâmicos, etiquetas/regras no-code e validade com e-mail/tarefa |
| Workflow gráfico | 10, 28, 35 | Reaproveitar circuitos e motor existentes, adicionar designer e regra explícita de evolução das instâncias em curso |
| Experiência de operação | 15, 16, 24, 43–45, 47–49 | Contagens por ramo, zoom, personalização, dropzone, favoritos/comentários, caminho completo, calendário e painel pessoal |
| Homologação | 25, 26 e ensaio geral | Matriz de browsers e execução dos 52 critérios em ambiente final com perfis/setores distintos |
| Integração de transferência | 18 | Conector FTP/WebDAV com transferência real e registro do ingresso documental |

## Roteiro do que já pode ser preparado para demonstrar

1. **Entrada:** importar lote legado PDF/imagem/TXT/DOCX com manifesto, classe, referência e pastas.
2. **Organização:** navegar três ou mais níveis, mostrar documentos e mover uma pasta/documento.
3. **Conteúdo:** executar indexação; buscar termo exclusivo do corpo, frase, fragmento, proximidade e equivalente cadastrado.
4. **Pasta inteligente:** salvar consulta e demonstrar mudança automática dos resultados ao mudar a situação/conteúdo indexado de documento.
5. **Versões:** usuário A faz checkout; B não consegue reservar; A devolve versão 2 com comentário; recuperar original e nova versão.
6. **Editorial:** elaboração → consenso com participantes → aprovação → homologação, com notificações e decisões da versão.
7. **Modelos:** importar DOCX real, ajustar marcadores e gerar documento preenchido.
8. **OCR zonal:** selecionar região de imagem/PDF sem texto e pesquisar o valor reconhecido depois do processamento.
9. **Lote de saída:** selecionar versões e baixar ZIP; conferir manifesto e hashes.
10. **Publicação e segurança:** publicar documento autorizado na Transparência e comparar consultas de usuários de setores/perfis distintos.

As etapas acima demonstram capacidades existentes; a cobertura integral dos itens classificados como parciais depende dos complementos discriminados na matriz.

## Fontes técnicas principais

- `src/app/app-domain/assinatura-digital/page.tsx` e `navigation.ts`: entrada e navegação unificadas.
- `src/components/signatures/ged/GedWorkspace.tsx`: pesquisa, filtros, lotes, árvore, consultas salvas, modelos e processamento manual.
- `src/components/signatures/ged/GedDocumentDetail.tsx`: histórico, check-in/out, tarefas, decisões e pasta exibida.
- `src/components/signatures/ged/GedZoneViewer.tsx`: renderização fixa e seleção OCR.
- `src/lib/documents/ged-policy.ts`: formatos, operadores, fases e manifesto.
- `src/lib/documents/ged-service.ts`: ingresso, versões, retenção global, pastas, notificações, jobs, modelos e detalhe.
- `src/lib/documents/ged-storage.ts`: validação física, extração PDF/TXT/DOCX e contrato OCR.
- `src/db/repositories/documents/ged.ts`: pesquisa por página da versão atual, escopo, ordenação, filtros e listagens.
- `src/db/schema/ged-management.ts` e `document-workflow.ts`: persistência de autor/comentário, versões, pastas, classes, tarefas e índices textuais.
- `src/app/api/assinatura-digital/ged/route.ts`: operações expostas; ausência de exclusão de documento e de exportação da pesquisa.
- `src/lib/documents/ged-access.ts`: capacidades e escopo por proprietário/setor/fase.
- `src/app/app-domain/configuracoes/usuarios/additional-profile-actions.ts`, `src/db/schema/user-additional-profiles.ts`, `src/lib/platform/tenant-context.ts`: múltiplos perfis operacionais.
- `src/app/app-domain/configuracoes/processos/page.tsx`, `src/lib/protocols/generic-workflow-definition-service.ts`: configuração por formulário e publicação imutável.
- `src/app/app-domain/configuracoes/instancia/page.tsx`: retenção global e identidade institucional.
- `src/app/app-domain/administracao/instituicao/InstitutionForm.tsx`: brasão/logo.
- `src/app/app-domain/administracao/calendario/CalendarioClient.tsx`, `src/lib/administration/calendar-event.ts`: calendário com data única.
- `src/app/app-domain/sst/agenda/page.tsx`, `src/lib/sst/agenda-policy.ts`: agenda especializada com intervalo.
- `src/lib/c7/control-agenda.ts`: obrigações e responsáveis de Controle Interno, sem equivalência automática a validade GED.
- `src/app/app-domain/transparencia/publicacoes/page.tsx`: publicação e gestão de documentos públicos.
- `src/lib/platform/blob.ts`: lista de MIME do upload compartilhado, distinta da lista do GED gerenciado.
- `docs/IMPLEMENTACAO_GED_ASSINATURA_DIGITAL.md`, `docs/GED_HOMOLOGACAO_RESULTADO.json`, `docs/GED_OCR_TESSERACT.md`: entrega, ensaio histórico e limites de ambiente.
