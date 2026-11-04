# GED — acervo e cenários preparados para o aceite final

Data: 01/11/2026. **Todos os cenários abaixo estão NÃO EXECUTADOS.**

Este roteiro especifica os dados a provisionar no ambiente de homologação. Não cria usuários, não altera perfis reais e não presume arquivos externos disponíveis.

O acervo de arquivos foi preparado em `docs/ged-poc-acervo/`, com proveniência e hashes em `manifesto.json`. Inclui o PPS binário público `referencia-fapes-prazos-pitch-gov.pps`, obtido em https://fapes.es.gov.br/orientacoes (FAPES, Governo do Espírito Santo), além dos formatos sintéticos e referências LibreOffice/veraPDF. A preparação da fase 9 está encerrada; importação, extração, conversão e conformidade continuam **NÃO EXECUTADAS**. Para o cenário PPS, usar essa amostra original sem alterar sua extensão ou seus bytes e registrar o resultado real do conversor na fase 11.

## Perfis e massa

| Identidade de ensaio | Setor | Capacidades GED | Grupos |
|---|---|---|---|
| Administrador | Administração | Todas; configurar; excluir; compartilhar | Administração GED |
| Operador A | Educação | Ler, importar, editar | Indexadores; Equipe A |
| Leitor A | Educação | Ler | Equipe A |
| Revisor A | Educação | Ler, revisar | Revisores; Equipe A |
| Aprovador B | Administração | Ler, revisar | Aprovadores |
| Usuário B | Saúde | Ler, importar, editar | Equipe B |

Usar contas específicas de homologação, com perfis adicionais quando necessário. Não usar dados clínicos reais. Grupos documentais são distintos de perfis de acesso.

Tipos de ensaio:

- `POC_PORTARIA`: número obrigatório, exercício numérico, data, assunto textual, situação de seleção e indicador booleano; retenção de 12 meses, validade de 30 dias, alerta de 7 dias.
- `POC_CONTRATO`: contraparte, valor, início e fim; peso de relevância 2; retenção de 60 meses.
- Criar uma segunda definição de `POC_PORTARIA` acrescentando campo; preservar documento com a definição anterior.

Árvore: `POC / Educação / 2026 / Portarias`, `POC / Administração / Contratos`, `POC / Setor B / Restritos`. Preparar um ramo com herança interrompida.

Acervo final a disponibilizar:

1. Um original real por formato: ODF/ODT/ODS/ODP, DOC/DOCX, RTF, PDF, XLS/XLSX, TXT UTF-8, PPTX, PPS, HTML, TIF/TIFF multipágina, PNG, JPEG, BMP e GIF.
2. PDF/A-1 e PDF/A-2 válidos com referência de origem e PDFs comuns/não conformes.
3. PDF digitalizado sem texto embutido e páginas com orientação variada.
4. Imagens de três páginas, com ordem conhecida, para gerar PDF multipágina.
5. Dois documentos com mesmo título, conteúdos distintos e termos exclusivos `educacaojasmim` e `administracaotucano`.
6. Documento restrito contendo termo exclusivo `reservadopitangueira`, para buscas negativas por outro setor.
7. Documento com duas versões de nomes e formatos diferentes, autores/comentários distintos e palavra presente apenas na versão histórica.
8. Documento com assinatura/evidência, publicação e vínculo de origem, para impedir descarte.
9. Documento antigo elegível ao descarte e documento ainda dentro do prazo.
10. Par semântico em português com sinônimos e nomes de arquivo sem pistas sobre o conteúdo.

## Matriz de cenários

| ID | Área | Ação e resultado esperado | Estado |
|---|---|---|---|
| G01 | Tipos | Criar/editar/desativar tipo; documentos antigos mantêm sua definição | Não executado |
| G02 | Índices | Preencher todos os tipos de campo; obrigatoriedade e limites rejeitam valores inválidos | Não executado |
| G03 | Grupos | Um usuário pertence a dois grupos; remover membro revoga somente a origem correspondente | Não executado |
| G04 | ACL | Combinar usuário/grupo/perfil e negação; confirmar leitura/edição/revisão/exclusão independentes | Não executado |
| G05 | Herança | Quebrar herança em pasta/documento; consultar explicação e contagens sem revelar outro setor | Não executado |
| G06 | Versões | Check-out, check-in e concorrência; autor/data/comentário e hash de cada versão | Não executado |
| G07 | Validade | Gerar uma tarefa, notificação e intenção de e-mail por ciclo; alterar validade cria novo ciclo | Não executado |
| G08 | Lixeira | Excluir/restaurar; impedir exclusão com reserva/fluxo/assinatura pendente | Não executado |
| G09 | Descarte | Prazo vigente recusa; referências impedem remoção; retomar falha de Blob sem falso sucesso | Não executado |
| G10 | Explorer | Vários ramos abertos, caminho, mostrar na pasta, contagens e atualização após movimentação | Não executado |
| G11 | Lotes | Arrastar/selecionar lote; interromper e retomar sem reenviar concluídos | Não executado |
| G12 | Visualizador | PDF/imagem, páginas, zoom e coordenadas OCR coerentes em todas as escalas | Não executado |
| G13 | Colaboração | Favoritar, comentar e compartilhar leitura com usuário autorizado | Não executado |
| G14 | Consultas | Criar/editar/renomear/compartilhar/excluir pasta inteligente; reavaliar escopo | Não executado |
| G15 | Formatos | Extrair cada arquivo real da massa; comparar páginas e termos reconhecidos | Não executado |
| G16 | PDF/A | Distinguir conformidade, perfil e falhas em PDF/A-1/2 e PDF comum | Não executado |
| G17 | OCR | Digitalizado gera derivado; baixar em leitor independente e localizar/copiar o texto | Não executado |
| G18 | Imagens | Agrupar na ordem escolhida; preservar referências aos originais e hash do novo PDF | Não executado |
| G19 | Pesquisa | AND/OR/NOT, parênteses/campos, frase/fragmento, curingas, fuzzy, proximidade e acentos | Não executado |
| G20 | Semântica | Sinônimos e paráfrases em português, ranking híbrido, troca de modelo e isolamento | Não executado |
| G21 | Filtros | Pasta/subpastas, datas/tipo/setor/índices e versão atual/histórica | Não executado |
| G22 | Relatórios | PDF/CSV/XLSX reproduzem consulta, versões, filtros e escopo; verificar células de planilha | Não executado |
| G23 | Workflow | Criar graficamente, publicar, iniciar; participação múltipla e desvios por metadado | Não executado |
| G24 | Evolução | Alterar definição em uso; preservar decisões/participantes e registrar adoção compatível | Não executado |
| G25 | Regras | Cada evento/condição/ação; duplicação, falhas, reinício, idempotência e histórico | Não executado |
| G26 | Calendário | Mês/semana/dia/lista, horários/fuso, edição/exclusão e atividades documentais | Não executado |
| G27 | Painel | Preferências/disposição persistidas; tarefas/favoritos/aprovações/vencimentos autorizados | Não executado |
| G28 | Modelos | Importar/versionar modelo e gerar DOCX textual com índices; explicitar limite de layout | Não executado |
| G29 | Publicação | Homologar/assinar/publicar/retirar; nova versão não altera publicação anterior | Não executado |
| G30 | Origens | Contrato servidor, autorização específica e cópia vinculada; regressão de Saúde/SST | Não executado |
| G31 | Operação | Lease, tentativas, retomada e volume; trabalho simultâneo e queda do worker | Não executado |
| G32 | Navegadores | Chrome/Firefox/Opera e dispositivos; registrar desfecho contratual do IE | Não executado |

## Procedimento reservado à fase 11

1. Provisionar a massa acima e registrar hashes dos originais.
2. Validar e aplicar a migração pelo procedimento oficial; executar as checagens técnicas e o build do projeto.
3. Executar cenários de segurança, concorrência, formatos e workflow antes da narrativa completa da POC.
4. Executar integrações externas já conectadas na fase 10.
5. Registrar usuário, ambiente, data, resultado observado e evidência em cada cenário; corrigir e repetir os afetados.
6. Relacionar os cenários aos 52 itens da matriz de análise, sem marcar pendências contratuais como atendidas.
