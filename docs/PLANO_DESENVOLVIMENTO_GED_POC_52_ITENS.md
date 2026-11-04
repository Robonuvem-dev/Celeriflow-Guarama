# Plano de desenvolvimento — GED web / POC de 52 itens

Data: 01/11/2026.

Base: [análise dos 52 requisitos](ANALISE_GED_52_REQUISITOS_POC.md).

## 1. Objetivo e ordem de execução

Completar as lacunas dos 52 requisitos aproveitando o módulo **GED e Assinatura Digital** e os recursos existentes de Configurações, Processos, Administração, BI e Transparência.

**Ordem aprovada para o plano:** fundamentos → funcionalidades internas → integrações externas → testes e homologação final.

Este documento é o plano de execução. As entregas abaixo estão planejadas, não implementadas por sua criação.

### Execução autorizada das fases internas

Em 01/11/2026 o proprietário autorizou implementar as fases **1 a 9**. O código em desenvolvimento, a migração aditiva, os contratos e as condições operacionais estão registrados em [GED_OPERACAO_FASES_1_A_9.md](GED_OPERACAO_FASES_1_A_9.md). Os cenários preparados, todos ainda não executados, estão em [GED_CENARIOS_ACEITE_FASES_1_A_9.md](GED_CENARIOS_ACEITE_FASES_1_A_9.md).

Não confundir implementação em código com aceite dos 52 itens. Não foram executados migração, testes, lint, typecheck, build, commit/push ou deploy nesta etapa. Os pontos de integração de origem e as condições de encerramento estão discriminados no manual de operação.

### Diretriz de testes solicitada pelo proprietário

- Concentrar **todos os testes na fase 11**, após concluir as fases de implementação e de integração externa.
- Não executar suites unitárias, integração, E2E, ensaios de navegador, verificações funcionais ou builds de conferência ao término de cada fase.
- Durante a implementação, realizar leitura de consumidores, revisão de contratos, análise estática por inspeção e registro das alterações. Escrever critérios/casos de aceite não significa executá-los antecipadamente.
- Antecipar uma verificação executável somente quando for **extremamente necessária e impeditiva para continuar**: por exemplo, confirmar que uma capacidade indispensável do banco ou um contrato desconhecido de ferramenta permite implementar a solução escolhida.
- Nessa exceção, registrar o bloqueio, por que a inspeção não o resolve, a verificação mínima e seu resultado. Não aproveitar a exceção para rodar regressões completas.
- Quando a execução oficial de uma migração exigir validação indispensável à sua aplicação, executar apenas o procedimento mínimo obrigatório e registrar a justificativa.
- O projeto exige `npm run build` aprovado antes de commit/push. Por isso, programar commit/push de entrega após a validação final. Se houver necessidade de commit antecipado, o build passa a ser obrigatório antes dele; não realizar esse commit como rotina intermediária.

## 2. Diretrizes de arquitetura

1. Manter o GED unificado em `/assinatura-digital`, com capacidades próprias e vínculo explícito às versões.
2. Evoluir os serviços, DTOs, consultas e tabelas existentes; usar Drizzle e migrações aditivas pela autoridade de migração do projeto.
3. Antes de alterar assinatura ou retorno de função exportada, localizar todos os consumidores. Preservar os contratos de erro de forms e chamadas client.
4. Ler a documentação relevante de Next em `node_modules/next/dist/docs/` antes de implementar rotas, jobs ou componentes dependentes das APIs do framework.
5. Inspecionar e editar cada arquivo individualmente; não usar scripts genéricos de substituição em massa.
6. Aplicar a mesma autorização a lista, busca, totais, trechos, árvore, relatórios, jobs, downloads, comentários, calendários e painéis.
7. Preservar originais, versões e evidências de assinatura. Conversões geram artefatos derivados rastreáveis, com hash e vínculo à origem.
8. Introduzir novos comportamentos no GED gerenciado sem mudar automaticamente escopos e regras dos documentos clínicos, financeiros ou de outros módulos.
9. Preparar contratos de provedores durante as fases internas. Conexão, credenciais, publicação e operação contra serviços externos ficam na fase 10.
10. Reutilizar Neon, Blob e autenticação já existentes. Essa infraestrutura continua disponível ao desenvolvimento; novas integrações externas ficam para o final.

## 3. Visão geral das fases

| Fase | Entrega | Dependência principal | Requisitos |
|---|---|---|---|
| 0 | Contratos, desenho e critérios de aceite | Análise existente | Todos |
| 1 | Tipos, metadados, grupos e permissões por objeto | 0 | 19–22, 27, 29, 38 |
| 2 | Governança, versões, validade e descarte | 1 | 1, 4, 5, 31, 32, 36, 37, 38 |
| 3 | Acervo, Explorer, visualização e colaboração | 1–2 | 2, 11–17, 24, 40, 43–45 |
| 4 | Formatos, processamento automático e PDFs | 1–2 | 3, 17, 40, 41, 46, 50–52 |
| 5 | Pesquisa completa, semântica, ranking e relatórios | 1, 3–4 | 6–9, 11, 12, 33, 34, 42 |
| 6 | Designer de workflow e regras sem programação | 1–2 | 10, 28, 30, 31, 35 |
| 7 | Calendário e painel pessoal | 2, 3, 6 | 31, 47–49 |
| 8 | Integração interna e publicação | 3–7 | 27, 28, 39, 46 |
| 9 | Preparação operacional e compatibilidade | 1–8 | 24–26 e operação web |
| 10 | Integrações externas e publicação dos serviços | 1–9 | 18, 23, 31 e dependências de 3, 6, 41, 50–52 |
| 11 | Todos os testes, correções e homologação final | 0–10 concluídas | Todos os 52 |

Os requisitos já existentes também entram na homologação final, como regressão e comprovação. A fase vinculada ao item indica a principal frente, não uma declaração de atendimento concluído.

## 4. Fases de desenvolvimento

### Fase 0 — Contratos e desenho funcional

**Entregas:**

- Inventário dos serviços, telas, consumidores e tabelas que serão afetados.
- Desenho das migrações e dos DTOs de tipos, índices/metadados, grupos, permissões, regras, fluxos e eventos.
- Matriz de rastreabilidade: cada um dos 52 itens ligado à entrega e a um cenário final de demonstração.
- Definição explícita de pesquisa literal versus normalizada; proximidade por página; comportamento em subpastas e versões históricas.
- Especificação do que será considerado busca semântica. Planejar recuperação por significado com modelo local de embeddings e índice vetorial, além do thesaurus; não tratar apenas sinônimos como implementação integral.
- Especificação de ODF: identificar variantes textuais, planilhas e apresentações previstas para o acervo, com arquivos de referência para cada uma.
- Decisão de escopo de 01/11/2026: acesso ao GED somente dentro do sistema. FTP/WebDAV não será implementado nesta entrega; o requisito original fica fora do escopo aprovado, sem presumir atendimento técnico.
- Registrar o tratamento contratual de Internet Explorer. A solução atual não oferece esse suporte. Planejar homologação de navegadores modernos e registrar aceite formal de eventual substituição; sem esse aceite, os itens 25/26 continuam pendentes de adequação.

**Saída documental:** contratos e critérios definidos antes das migrações dependentes. Nenhum ensaio de navegador ou execução de teste nesta fase.

### Fase 1 — Tipos documentais, metadados e segurança por objeto

**Implementar:**

- CRUD completo de tipos/classes documentais, mantendo os vínculos e políticas de assinatura existentes.
- Construtor de campos de indexação por tipo: texto, número, data, seleção e booleano, com obrigatoriedade, ordenação e validações configuráveis.
- Versionamento da definição dos campos para preservar interpretação de documentos antigos.
- Cadastro de grupos documentais, membros e pertencimento simultâneo a vários grupos, independente dos perfis adicionais existentes.
- Permissões por pasta, documento e registro para usuário, grupo ou perfil: leitura, inclusão, edição, aprovação, exclusão e compartilhamento.
- Herança de permissões por pasta, quebra explícita de herança e regras determinísticas de concessão/restrição.
- Exibição da origem do acesso efetivo, para o administrador compreender por que um usuário acessa o documento.
- Aplicação centralizada do escopo em todas as operações, incluindo jobs e artefatos derivados.

**Resultado esperado para o aceite final:** dois setores independentes, grupos com membros múltiplos e documentos com acessos diferentes de leitura, edição, aprovação e exclusão.

### Fase 2 — Governança, versões, validade e descarte

**Implementar:**

- Exibir autor, data e comentário de alteração no histórico de versões e na consulta de detalhe.
- Histórico unificado de alterações de arquivo, metadados, permissões, movimentações e decisões.
- Política de retenção documental e armazenamento de versões por tipo, sem limite arbitrário de quantidade de versões.
- Separar validade do documento, retenção do acervo e retenção temporária da Central.
- Campos de validade, responsáveis e antecedência de alertas por tipo/documento.
- Exclusão lógica/arquivamento, restauração quando aplicável e descarte físico conforme política, dependências e evidências existentes.
- Capacidade específica de exclusão; impedir que uma exclusão remova bytes ainda referenciados por outra versão/registro.
- Registrar descarte e seu resultado; permitir retomada de falhas entre banco e Blob.
- Gerar intenções internas de alerta e tarefas de revalidação/cancelamento. O envio de e-mail real será conectado na fase 10.
- Preservar as regras atuais de check-in/check-out, concorrência e vínculo de assinatura à versão exata.

**Resultado esperado para o aceite final:** política por tipo, histórico legível e ciclo de validade/descarte auditável sem perda de originais referenciados.

### Fase 3 — Acervo, Explorer, visualização e colaboração

**Implementar:**

- Árvore lateral expansível com múltiplos ramos abertos, caminho completo e ação “mostrar na pasta”.
- Contagens de pastas, arquivos e documentos por ramo, com opção de totais recursivos autorizados.
- Busca na pasta atual e opção explícita de incluir subpastas.
- Upload drag-and-drop integrado ao lote, com seleção convencional equivalente e retomada de pendentes.
- Zoom interno de PDF/imagem, ajuste à largura e navegação de páginas; manter coordenadas OCR consistentes com a escala.
- Favoritos documentais, comentários livres e compartilhamento interno sujeito às permissões por objeto.
- Gestão completa de pastas inteligentes: editar regras, renomear, compartilhar e excluir, sempre reavaliando o acesso de quem consulta.
- Personalização de aparência suportada por configuração: identidade institucional, cores e preferências de apresentação.
- Preservar seleção de versões e geração ZIP com manifesto e hash.

**Resultado esperado para o aceite final:** operação do acervo em uma interface coerente, com localização completa, lote e colaboração.

### Fase 4 — Formatos, processamento automático e saída de digitalização

**Implementar:**

- Pipeline único: arquivo original → inspeção → extração/conversão/OCR → indexação → derivados, com estado por etapa.
- Suporte aos formatos exigidos: ODF, DOC, DOCX, RTF, PDF, XLS, TXT, PPTX, PPS, HTML, TIF/TIFF, PNG, JPG/JPEG, BMP, GIF e PDF/A-1/PDF/A-2.
- Definir extrator/conversor real por formato; normalizar encoding, páginas e conteúdo, incluindo TIFF multipágina e formatos Office legados.
- Validação de conformidade PDF/A com ferramenta apropriada; registrar perfil, resultado e relatório. Receber um PDF não comprova conformidade PDF/A.
- Worker com fila persistida, lease, tentativas, retomada, limites de recursos e processamento automático após o ingresso.
- Agrupar/reordenar imagens digitalizadas e gerar PDF multipágina vinculado aos originais.
- Evoluir o contrato OCR para retornar palavras/linhas com coordenadas, além do texto/confiança de página/zona.
- Gerar PDF pesquisável com imagem original e camada textual posicionada; preservar o original e registrar o derivado/hash.
- Encadear automaticamente importação → OCR quando necessário → PDF pesquisável → índice pronto.
- Manter criação/importação/versionamento de modelos e geração documental; tornar explícito quando a geração usa conteúdo textual ou preserva layout do modelo.
- Preparar adaptadores para conversor Office, validador PDF/A e motor OCR. Serviços podem executar localmente durante o desenvolvimento; hospedagem permanente e conexão externa ficam para a fase 10.

**Resultado esperado para o aceite final:** arquivo de cada formato armazenado e pesquisável; imagem/PDF digitalizado produzindo PDF pesquisável baixável, sem depender apenas do texto salvo no banco.

### Fase 5 — Pesquisa unificada, semântica e relatórios

**Implementar:**

- Interface única para título, nome de arquivo, palavras-chave, metadados dinâmicos e conteúdo.
- Parser de AND/OR/NOT, parênteses e pesquisa por campo, com construção segura da consulta.
- Frases exatas, fragmentos, curingas, fuzzy, proximidade e insensibilidade a acentos.
- Dicionário de sinônimos/thesaurus com manutenção por interface.
- Recuperação semântica por significado com embeddings e combinação com busca lexical; execução local do modelo como preferência para evitar dependência de API externa.
- Índice vetorial quando necessário, alinhado às capacidades do banco/serviço escolhido. Se exigir provedor externo, deixar sua conexão para a fase 10.
- Ranking com pontuação, pesos configuráveis por tipo documental e indicação da relevância nos resultados.
- Filtros de pasta/subpastas, tipo, setor, situação, datas e metadados; opção explícita de versão atual ou histórico.
- Aplicar autorização antes da paginação, contagem e apresentação de trechos, inclusive na recuperação semântica.
- Relatório da busca em PDF/CSV/XLSX com filtros, principais dados, índices e identificação das versões.
- Usar a mesma consulta validada para resultados, pastas inteligentes e relatórios, evitando divergência de critérios.

**Resultado esperado para o aceite final:** pesquisar o mesmo acervo por todas as modalidades e exportar os resultados autorizados com ranking e metadados.

### Fase 6 — Workflow gráfico e regras sem programação

**Implementar:**

- Designer web de etapas/nós, conexões, condições, responsáveis, prazos e saídas.
- Reutilizar elaboração, consenso, aprovação e homologação como modelo inicial, preservando o vínculo à versão documental.
- Versionar definições de fluxo, regras e formulários.
- Permitir alteração de fluxo durante o uso: aplicar nova definição no próximo acesso/transição elegível, conforme política configurada.
- Preservar decisões e etapas concluídas; mapear tarefas ativas e registrar qual versão passou a valer. Alterações incompatíveis precisam de tratamento explícito, sem reescrever o histórico.
- Motor no-code de evento → condição → ação para pasta, tipo e etiqueta.
- Cadastro e aplicação de etiquetas.
- Ações iniciais: classificar, mover, etiquetar, atribuir tarefa, iniciar fluxo, notificar, agendar revalidação e encaminhar publicação.
- Proteger contra execução duplicada e ciclos de automação; registrar resultado por ação.
- Integrar vencimento documental às tarefas de revalidação/cancelamento e às notificações internas.

**Resultado esperado para o aceite final:** criar fluxo visual, alterar definição com instância em uso e configurar automações sem script.

### Fase 7 — Calendário e painel pessoal

**Implementar:**

- Eventos com descrição, início/fim, horário, fuso, responsáveis e vínculo opcional a documento/tarefa.
- Visões de calendário mensal, semanal e diária, além da listagem.
- Alimentação de atividades, tarefas e vencimentos documentais, com atualização para evitar duplicidades.
- Painel pessoal com dashlets de minhas tarefas, atividades, documentos recentes, favoritos, aprovações e vencimentos.
- Preferências de disposição/visibilidade dos dashlets, reaproveitando componentes BI quando compatíveis.
- Contagens e cartões calculados pelo acesso efetivo do usuário.

**Resultado esperado para o aceite final:** cada usuário vê seu calendário e painel com tarefas/documentos coerentes com suas permissões.

### Fase 8 — Integrações internas e publicação documental

**Implementar:**

- Ponte explícita entre documento/versão homologada e publicação na Transparência, com autorização, hash e rastreabilidade.
- Retirada de publicação e tratamento de nova versão sem publicar automaticamente documentos restritos.
- Contrato de ingresso e consulta para Processos, Planejamento, Financeiro, Obras, RH e demais origens já integradas.
- Inclusão de documentos dessas origens no acervo gerenciado somente por regra/vínculo explícito, respeitando suas autorizações específicas.
- Preservar fluxos e downloads de Saúde/SST e outras origens com escopo próprio.
- Relacionar modelos, documentos gerados, processos, tarefas, assinaturas e publicações na navegação do GED.

**Resultado esperado para o aceite final:** narrativa integrada de importar → pesquisar → revisar → homologar → assinar → publicar → recuperar.

### Fase 9 — Preparação operacional e compatibilidade

**Implementar/preparar, sem executar testes:**

- Tela administrativa de fila, estados, falhas, tentativas, processamento e armazenamento documental.
- Configuração por interface dos parâmetros operacionais e provedores, mantendo segredos no servidor.
- Paginação, processamento em lotes e exportações compatíveis com os limites do ambiente.
- Ajustes de implementação para navegadores modernos conforme documentação das dependências.
- Documentação operacional de migrações, workers, conversores, OCR, índices e retenção.
- Montar o acervo e os roteiros de teste final: formatos, versões, grupos, setores, tarefas, palavras exclusivas e digitalizados sem texto embutido.
- Preparar perfis de administrador, operador, leitor, revisor, aprovador e usuário de outro setor.
- Consolidar os cenários finais sem executá-los nesta fase.

### Fase 10 — Serviços internos de processamento e pendências de integração

**Hospedagem corrigida por decisão do usuário:** executar a solução na própria Vercel, junto ao projeto de `guarama.celeriflow.com.br`. Implementação com Functions, fila existente e Sandbox sob demanda, sem VPS nem domínio adicional. A criação do snapshot e a ativação exigem autenticação no projeto Vercel. Procedimento vigente: `GED_VERCEL_PROCESSAMENTO_INTERNO.md`. A dependência anterior de host permanente foi substituída por essa configuração Vercel; não há homologação presumida.

**Começar somente após as fases internas 1–9.**

**Implementação própria preparada em 01/11/2026:** OCR Tesseract, servidor de conversão LibreOffice/validação veraPDF, serviço semântico interno com revisão de modelo fixa, worker contínuo e pacote Docker Compose/TLS/configuração. Instruções em `GED_SERVICOS_INTERNOS_FASE_10.md`. **Ativação pendente:** é necessário definir host e domínio, instalar os serviços e conectar os ambientes. Esta máquina não tem Docker disponível. Não foram executados testes, migração, build ou publicação; aceite permanece na fase 11. E-mail continua pendente para o final.

| Ordem | Integração | Entrega |
|---|---|---|
| 10.1 | OCR, conversores, validador PDF/A e workers próprios | Implementação preparada com Tesseract/Tesseract.js, LibreOffice e veraPDF, conforme autorização do usuário. Instalar os serviços e worker no host escolhido; não há API paga obrigatória. Qualidade e funcionamento real serão medidos na fase 11 |
| 10.2 | Busca semântica interna — decisão aprovada | Usar o serviço próprio de `services/ged-semantic/`, com SentenceTransformers e modelo multilíngue executados em infraestrutura nossa, sem API comercial de embeddings. Operacionalizar hospedagem, indexação e consulta autorizada |
| 10.3 | E-mail — pendente para o final | Preservar intenções, fila e contratos preparados. Conexão com provedor, remetente e envio real ficam pendentes; não bloquear o escopo atual por ausência do provedor |
| 10.4 | FTP/WebDAV — fora do escopo por decisão do usuário | Acesso ao GED apenas dentro do sistema; não implementar conectores nem exposição do acervo por FTP/WebDAV nesta entrega |

**LDAP/AD (antiga etapa 10.5) removido deste plano de execução por decisão do usuário em 01/11/2026.** A preparação de login mencionada pelo usuário será preservada; não realizar conclusão ou homologação do conector agora. Isso não comprova integração LDAP/AD funcionando.

Preparar tratamento de indisponibilidade, expiração de credenciais, retomada e observabilidade por integração. A conexão real aos ambientes e a publicação dos serviços pertencem a esta fase; os testes de ponta a ponta continuam concentrados na fase 11.

**Dependências do escopo ativo:** host com recursos para OCR, conversão e modelo semântico, acesso ao agendador e comunicação autenticada entre aplicação e serviços. Software gratuito não elimina o custo da infraestrutura. Provedor de e-mail permanece pendente para o final; FTP/WebDAV e LDAP/AD não são dependências desta entrega. Dependência ausente deve ser registrada como pendência, não como atendimento comprovado.

## 5. Fase 11 — Todos os testes, correções e homologação final

### 11.1 — Verificações técnicas finais

- Executar checagens de tipos, lint e verificações oficiais de migração pertinentes às alterações.
- Executar testes unitários relevantes de regras complexas: consulta booleana, permissões/herança, temporalidade, evolução de fluxo, concorrência e idempotência.
- Executar testes de integração de banco/Blob, extração/conversão, índice textual/vetorial, filas, modelos, versões e derivados.
- Executar testes reais dos serviços ativos da fase 10; envio de e-mail fica pendente até sua conexão posterior. FTP/WebDAV e LDAP/AD não integram o aceite desta entrega por decisão de escopo.
- Executar `npm run build` e corrigir os impedimentos encontrados.

### 11.2 — Aceite funcional dos 52 itens

Manter uma matriz com: item, cenário, usuário/perfil, dados, ação, resultado esperado, resultado observado, evidência e pendência.

Cobertura mínima:

1. Ingresso, alteração, exclusão/restauração/descarte e retenção por tipo.
2. Upload/download em lote, manifesto, hierarquia, drag-and-drop, retomada e hashes.
3. Um arquivo real de **cada formato exigido**, incluindo DOC/XLS/PPS legados, TIFF multipágina e documentos ODF.
4. PDF/A-1/PDF/A-2 conformes e não conformes, com relatório do validador.
5. Versões com autor/comentário/data, originais preservados e concorrência de check-in/out.
6. Todos os operadores de pesquisa, acentos, erros de grafia, proximidade, semântica, ranking e filtros combinados.
7. Termo exclusivo do corpo, documento com nome diferente do conteúdo e resultados sem vazamento de outros setores.
8. Árvore profunda, contagens, caminho completo, zoom, favoritos, comentários e compartilhamento.
9. Grupos simultâneos, perfis e permissões distintas por pasta/documento/registro.
10. Fluxo gráfico, consenso com vários participantes e alteração da definição durante uma instância em uso.
11. Regras por pasta/tipo/etiqueta, vencimento, e-mail e tarefa de revalidação/cancelamento sem duplicação.
12. Modelos reais importados e documentos gerados vinculados à versão do modelo.
13. Calendário e dashlets pessoais com isolamento por usuário.
14. OCR de digitalizado sem camada textual, seleção de zona e texto reconhecido pesquisável.
15. Imagens convertidas em PDF; baixar o PDF pesquisável e localizar/copiar texto em leitor independente.
16. Publicação/retirada no portal e preservação da relação com documento/versão.
17. Transferências FTP/WebDAV e integração real LDAP/AD.

### 11.3 — Navegadores, regressão e operação

- Homologar Chrome, Firefox e Opera, registrando versões; incluir Edge se aceito no critério de compatibilidade.
- Executar as verificações de desktop, notebook, tablet e celular pertinentes às telas alteradas.
- Registrar explicitamente o desfecho de Internet Explorer. Não marcar os itens 25/26 como completos apenas por aprovação nos navegadores modernos.
- Regressão de assinatura interna/A1 quando aplicável, validação pública, Central, Processos, Transparência e downloads especializados afetados.
- Conferir processamento automático, retentativa após falha, concorrência, fila, volume representativo e recuperação de operações interrompidas.

### 11.4 — Correções e fechamento

- Corrigir os defeitos dentro desta fase final e repetir os cenários afetados e as regressões justificadas.
- Reexecutar o build após as correções finais de código, antes do commit/push.
- Preparar evidências sanitizadas e atualizar a matriz de aderência dos 52 itens.
- Fazer commit/push de entrega com a identidade e o remoto determinados pelo `AGENTS.md`; confirmar deploy e realizar a conferência final no ambiente publicado ainda nesta fase.
- Entregar roteiro da POC, acessos/perfis, acervo de demonstração, manual operacional e lista explícita de pendências externas/contratuais, caso existam.

## 6. Critério de conclusão do plano

O plano estará concluído quando:

1. As fases de implementação e integrações estiverem entregues.
2. Os 52 itens tiverem resultado individual documentado na homologação final.
3. Os defeitos impeditivos encontrados nessa homologação estiverem corrigidos.
4. O build final estiver aprovado e o deploy conferido.
5. As evidências diferenciarem atendimento demonstrado, restrição contratual e dependência ainda não disponibilizada.

## 7. Atualização da retomada de implementação

**Conferência posterior de padronização (01/11/2026):** foram identificadas adequações pendentes na interface nova do GED, descritas em `GED_REVISAO_PADRAO_MODULOS.md`. A preparação do acervo está concluída, mas as telas novas não podem ser declaradas integralmente alinhadas ao padrão global. Adequar a composição antes do aceite final; manter os testes na fase 11.

Foram complementados os adaptadores e a navegação de origens internas, configuração administrativa dos provedores, fila paginada, filtros dinâmicos/setor, diagnóstico de ACL, limites/ordem de índices, aparência e agrupamento ordenado de versões de imagens. Detalhes e limites estão em `GED_OPERACAO_FASES_1_A_9.md`.

Acervo sintético e referências públicas preparados em `docs/ged-poc-acervo/`; perfis/grupos especificados em `docs/ged-poc-profiles.json`. A preparação não executou cenários nem a aplicação. A última pendência de formato foi encerrada com o PPS binário público “Prazos Pit Gov”, da FAPES (Governo do Espírito Santo), preservado em `referencia-fapes-prazos-pitch-gov.pps`, com URL de origem, tamanho e SHA-256 no manifesto.

**Fase 9 encerrada quanto à implementação e preparação operacional em 01/11/2026, sem homologação.** O manifesto deixa para a fase 11 apenas a criação de versões/assinaturas/vínculos no fluxo da aplicação. Internet Explorer segue aguardando definição contratual, conforme fase 0; o encerramento da preparação não declara suporte a esse navegador nem aprovação dos itens 25/26. A próxima fase do plano é a 10 (integrações externas); testes e aceite permanecem na fase 11.

Nenhum teste, lint, typecheck, build, migração, commit, push ou deploy foi executado nesta retomada. A migração foi ampliada com a reserva de ingresso por origem/versão e continua não aplicada. Testes e homologação permanecem na fase 11.
