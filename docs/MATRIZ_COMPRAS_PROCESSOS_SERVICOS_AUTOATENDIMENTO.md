# Matriz — Compras, Processos, Serviços Públicos e Autoatendimento

Data: 12/10/2026. Complemento de [PLANO_COMPRAS_PROCESSOS_SERVICOS_AUTOATENDIMENTO.md](PLANO_COMPRAS_PROCESSOS_SERVICOS_AUTOATENDIMENTO.md).

Fonte: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, módulos do Executivo. Cada linha preserva um número original, com síntese e fechamento; texto integral da fonte prevalece.

**Situação:** I = capacidade específica localizada em código, ainda sem comprovação operacional; P = parcial/base genérica; N = capacidade específica não localizada nos caminhos analisados; E = integração/leiaute oficial não comprovado; D = depende de provedor setorial cuja operação não foi integralmente auditada aqui. D exige verificar/entregar o adapter e a operação do provedor, não apenas um link.

**B01–B12:** mapa de arquivos, serviços e tabelas no plano. Em N, a base é o ponto de reaproveitamento, não prova de existência do recurso. **F01–F11:** fases do plano. Todas as fases indicadas são necessárias ao fechamento da linha. A análise é estática; I não é declaração de conformidade integral.

## Gestão de Compras e Licitações — CL — páginas 44–58 — 124 itens

| ID | Requisito sintetizado | Situação / base | Fase | Entrega para fechamento |
|---|---|---|---|---|
| CL-001 | Conformidade Lei 14.133/2021 | P · B01–B05 | F05/F06/F07/F11 | Regras, modalidades, fases, documentos, limites e integrações exigidos funcionando em conjunto. |
| CL-002 | Material: descrição e hierarquia/unidades | P · B01 | F05 | Sucinta/detalhada sem limite funcional; grupo/classe/subclasse e várias unidades. |
| CL-003 | Classificação e categoria de produto | P · B01 | F05 | Consumo/permanente/serviço/obra e perecível/estocável/combustível, utilizados no fluxo. |
| CL-004 | Campos configuráveis de produto | N · B01 | F05 | Numérico/texto/lista configurados sem alteração técnica por campo. |
| CL-005 | Marcas pré-aprovadas | N · B01 | F05 | Relação material/marca e seleção nas operações. |
| CL-006 | CATMAT | P · B01 | F05 | Código oficial explícito no material e catálogo integrado. |
| CL-007 | Imagens de referência | N · B01/B07 | F05 | Upload/consulta de imagem vinculada ao produto. |
| CL-008 | Desabilitar obsoleto preservando histórico | I · B01 | F05 | Conferir inativação e impedir uso novo sem perder movimentos antigos. |
| CL-009 | Produto/elemento de despesa | P · B01 | F05 | Relacionar e impedir compra com elemento incompatível, não só dotação informada. |
| CL-010 | Histórico de aquisições pelo material | P · B01/B04 | F05/F07 | Ordens/fornecedor/preço unitário e abertura das origens pela consulta. |
| CL-011 | Rol de itens | N · B01 | F05 | Listas reutilizáveis nas requisições/intenções/certames. |
| CL-012 | Solicitar cadastro de produto | N · B01/B07 | F05 | Pedido/aprovação/rejeição, aviso ao setor e retorno do código ou motivo ao solicitante. |
| CL-013 | Comissões/pregoeiro/designação | P · B03 | F06 | Portaria/decreto, comissão/natureza, membros/atribuições e vigência. |
| CL-014 | Processo/modalidade/fundamento legal | P · B02/B03 | F06 | Número/ano/objeto/data/requisições/preços e inciso da dispensa/inexigibilidade. |
| CL-015 | Numeração por modalidade ou ano | P · B03 | F06 | Configuração da sequência com geração sem colisões. |
| CL-016 | Processo sem modalidade inicialmente | P · B02/B03 | F06 | Escolha posterior após parecer jurídico; preservar referências existentes. |
| CL-017 | Workflow completo com cores/ajuda | P · B03/B06 | F06 | Etapas/decisões/liberação automática, ajuda por etapa e acompanhamento de todas as modalidades. |
| CL-018 | Anexos da minuta | P · B03/B07 | F06 | Documento anexado ao cadastro de minuta e ao processo de origem. |
| CL-019 | Documentos da minuta agrupados | P · B03/B07 | F06 | Consulta única por classificação e acesso aos arquivos. |
| CL-020 | Documentos de todas as fases | P · B03/B07 | F06 | Edital/atas/avisos/homologação/adjudicação/pareceres/propostas/lances, persistência e substituição. |
| CL-021 | Parecer contábil e impressão | P · B03/B04 | F06 | Registro específico e emissão com origem/autoria. |
| CL-022 | Parecer jurídico/técnico | P · B03/B07 | F06 | Conteúdo e documento vinculados à fase/processo. |
| CL-023 | Recurso/impugnação/julgamento | P · B03 | F06 | Pedido, decisão e texto da comissão/jurídico com histórico. |
| CL-024 | Anulação/revogação parcial ou total | P · B03 | F06 | Alcance por item/quantidade/valor e consequências nas etapas/saldos. |
| CL-025 | Classificação de propostas de pregão | P · B03 | F06 | Critérios legais aplicados e classificação rastreável. |
| CL-026 | Sessão presencial completa | P · B03 | F06 | Lances item/lote, declínio/desistência, mínimo configurável e cronômetro por rodada. |
| CL-027 | Negociação após lances | N · B03 | F06 | Negociar preço com vencedor do item e registrar resultado. |
| CL-028 | Julgamento LC 123/2006 | N · B03 | F06 | Regras por enquadramento de empresa aplicadas ao julgamento. |
| CL-029 | Documentos dos participantes | P · B03/B07 | F05/F06 | Documentos do fornecedor utilizados na participação/habilitação. |
| CL-030 | Propostas/preços/comparativo | P · B02/B03 | F06 | Unitário/total, comparativo por fornecedor e vencedores por item/lote. |
| CL-031 | Desclassificação com data/motivo | P · B03 | F06 | Decisão própria, data e motivo preservados. |
| CL-032 | Inabilitação e remanescente | P · B03 | F06 | Data/motivo; selecionar remanescente no presencial e negociar novo vencedor. |
| CL-033 | Consulta integral da licitação | P · B02/B03/B04 | F06/F07 | Lances/requisições/propostas/itens/participantes/dotações/ordens/homologação/adjudicação. |
| CL-034 | Licitação multientidade | N · B02/B03/B04 | F06/F07 | Principal/participantes, gerenciamento conjunto e contrato/ordem individual por entidade. |
| CL-035 | Publicidade Lei 12.232/2010 | N · B03 | F06 | Envelopes não identificados, sessões e proposta técnica/julgamento próprio. |
| CL-036 | Técnica/preço por pontuação | N · B03 | F06 | Índices/pontos por item e classificação automática calculada. |
| CL-037 | Comissão vinculada à licitação | I · B03 | F06 | Conferir designação e escolha dos membros participantes do julgamento. |
| CL-038 | Publicações do certame | P · B03/B05 | F06/F08 | Data/veículo/documento e histórico de publicação. |
| CL-039 | Reserva/liberação por compra | P · B01/B04 | F05/F07 | Recurso e reserva na licitação, liberação proporcional ao uso e consulta de saldo. |
| CL-040 | Ata de registro de preços | N · B03/B04 | F07 | Ata/saldos e alteração de quantidade/preço/fornecedor com histórico. |
| CL-041 | Fiscais/gestores da ata | P · B04 | F07 | Função/vigência especificamente na ata, além da responsabilidade contratual. |
| CL-042 | Reserva contábil/liberação final | P · B04 | F07 | Reservar ao ato parametrizado e liberar não utilizado ao concluir/encerrar. |
| CL-043 | Copiar processo licitatório | N · B02/B03 | F06 | Novo número/origem, seleção dos dados e preservação do original. |
| CL-044 | Cotas de credenciamento/chamamento | N · B03 | F06 | Cotas e consumo em dispensa/inexigibilidade com essa característica. |
| CL-045 | Publicação seletiva de dados/documentos | P · B05/B07 | F08 | Configurar itens/certidões/documentos/propostas/vencedores/contratos/ordens/atos/anexos. |
| CL-046 | Pesquisa de preços | I · B02 | F06 | Conferir pesquisa ligada à aquisição e completar os itens para estimativa. |
| CL-047 | Média/maior/menor e geração | P · B02 | F06 | Selecionar critério por item e gerar processo ou ordem pelo menor fornecedor quando requerido. |
| CL-048 | Cotação online por fornecedor | P · B02/B05 | F06/F08 | Preços por item, médias/mínimos/máximos automáticos e aproveitamento no certame. |
| CL-049 | Requisição gera processo digital | N · B01/B06 | F02/F05 | Abertura automática em `Process`, relação com compra e tramitação consultável. |
| CL-050 | Anexos compartilhados com protocolo | N · B03/B06/B07 | F02/F06 | Referências ao mesmo GED e consulta única dos arquivos de origem. |
| CL-051 | Solicitar itens homologados | P · B01/B03/B04 | F07 | Itens/vencedores/saldos de origem na solicitação de compra. |
| CL-052 | Autorizadas/pendentes/anuladas | P · B01 | F05 | Estados/ações e filtros coerentes com autorização/cancelamento. |
| CL-053 | Autorização de solicitação | I · B01 | F05 | Conferir autoria, permissões e efeitos orçamentários configurados. |
| CL-054 | Restrição por centro de custo | P · B01/B12 | F05 | Escopo por setor em leitura e criação/mutação, além de permissão de módulo. |
| CL-055 | Aviso de nova solicitação | N · B01/B07 | F05/F10 | Notificação ao setor ou e-mail e consulta do resultado. |
| CL-056 | Requisição com itens/recursos | I · B01/B02 | F05/F07 | Conferir geração de ordem ou processo a partir da requisição válida. |
| CL-057 | Reserva somente na autorização | P · B01/B04 | F05/F07 | Configurar momento da reserva e impedir reserva antecipada indevida. |
| CL-058 | Relatório da abertura à conclusão | P · B03/B07 | F10 | Dados/atos de todas as fases reconciliados com o certame. |
| CL-059 | Compras mensais para TCU | P · B04/B05 | F10 | Relação mensal conforme Lei 9.755/98, com período e origens. |
| CL-060 | Proposta só por lote/readequação online | P · B03/B05 | F06/F08 | Proposta sem subitens inicialmente; vencedor distribui preços e reconcilia total. |
| CL-061 | Assinantes/formatos/cópias/assinatura | P · B07 | F06/F07/F10 | Seleção em todos os documentos; PDF/HTML/DOC/XLS e quantidade de vias. |
| CL-062 | Plataforma eletrônica por API | E · B05 | F11 | Importar lances/participantes/documentos/atas quando a plataforma oferece meios técnicos. |
| CL-063 | Prestação de contas da licitação | E · B05 | F11 | Leiaute/regra do órgão correto e arquivo/retorno de origem. |
| CL-064 | Estados/modalidades completos | P · B03 | F06 | Parcial/total, descartada/aguardando julgamento e modalidades exigidas, incluindo dispensa/inexigibilidade. |
| CL-065 | Registro de preços Lei 14.133 art. 40 | P · B03/B04 | F07 | Gerenciar ata, itens, vigência/saldos e uso no fluxo de aquisição. |
| CL-066 | Solicitação de registro de preços | P · B01/B04 | F07 | Compra/serviço vinculados à ata e controle de entrega. |
| CL-067 | Modelos de edital | P · B03/B07 | F06 | Modelos editáveis reutilizáveis por modalidade/necessidade. |
| CL-068 | Proposta online criptografada | N · B03/B05 | F08 | Criptografia do conteúdo e senha de abertura; aproveitar dados sem redigitação. |
| CL-069 | Plano anual/intenção de licitar | P · B02 | F05 | Plano/ano com intenções; necessidade futura isolada é apenas base. |
| CL-070 | Intenção e compartilhamento | N · B02 | F05 | Objeto/centro de custo, adesão de outros setores e regra de novos itens. |
| CL-071 | Adesão de secretarias | N · B02 | F05 | Participação por órgão/setor e registro da adesão. |
| CL-072 | Quantitativo por participante | P · B02/B01 | F05 | Produto/unidade e quantidade individual por secretaria da intenção. |
| CL-073 | Planilha de preços pela intenção | N · B02 | F05/F06 | Aproveitar itens/quantidades da intenção e gerar processo posterior. |
| CL-074 | Rol de itens na intenção | N · B01/B02 | F05 | Importar composição do rol sem duplicar produto. |
| CL-075 | Contratos/publicações/aditivos/reajustes | P · B04 | F07 | Cadastro/gestão com vigência, publicação e efeitos das alterações. |
| CL-076 | Alerta de fim de contrato | P · B04/B07 | F07/F10 | Prazo/configuração e aviso derivado da vigência atualizada. |
| CL-077 | Liberar reserva na adjudicação | P · B03/B04 | F06/F07 | Diferença estimado/vencedor liberada nessa etapa, sem esperar consumir todo processo. |
| CL-078 | Rescisão com data/motivo | P · B04 | F07 | Campos e efeitos contratuais/documentais registrados. |
| CL-079 | Tipo de aditivo e unilateral/bilateral | P · B04 | F07 | Acréscimo/redução/equilíbrio/rescisão/outros e natureza da alteração. |
| CL-080 | Limites de acréscimo/supressão | N · B04 | F07 | Base legal e cálculo conforme art. 124, separando reajuste monetário. |
| CL-081 | Equilíbrio econômico-financeiro | P · B04 | F07 | Alteração classificada, motivo/base de cálculo/documento e efeito no saldo. |
| CL-082 | Apostila de contrato | N · B04/B07 | F07 | Reajuste/atualização financeira/dotações e documento vinculado. |
| CL-083 | Fiscais/gestores contrato/aditivo | P · B04 | F07 | Responsáveis/funções/vigências na execução integral e alterações. |
| CL-084 | Publicação de contrato | P · B04/B05 | F07/F08 | Data/veículo/arquivo, consulta e histórico. |
| CL-085 | Vencimentos de instrumentos | P · B04/B07 | F10 | Contratos/autorizações de fornecimento/aditivos com filtros. |
| CL-086 | CRC do fornecedor | P · B05/B12 | F05/F08 | Sequência, dados/objeto social/documentação e emissão/validação. |
| CL-087 | Validade documental no julgamento | P · B03/B12 | F05/F06 | Obrigatórios vigentes e irregularidades destacadas na decisão. |
| CL-088 | Suspensão/impedimento do fornecedor | N · B12/B03 | F05 | Tipo/período/reabilitação e bloqueio de participação indevida. |
| CL-089 | Controle de documentos vencidos/a vencer | P · B12/B07 | F05/F10 | Validade por fornecedor e relatório da documentação. |
| CL-090 | Relatório documental de fornecedor | P · B12/B07 | F10 | Relação vencidos/a vencer com filtros e situação. |
| CL-091 | Responsável legal/sócios | P · B12 | F05 | Cadastro empresarial e vínculo utilizável em fornecedor/contrato. |
| CL-092 | Índices contábeis de fornecedor | N · B12 | F05 | Ativos/passivos/patrimônio/solvência/capital e consulta do fornecedor. |
| CL-093 | Atestado de capacidade técnica | N · B04/B07 | F05/F10 | Documento pelos produtos/serviços efetivamente fornecidos. |
| CL-094 | Documentos válidos na contratação/ordem | P · B04/B12 | F07 | Verificar obrigatórios vigentes em cada ato, além da habilitação do certame. |
| CL-095 | Gerencial do fornecedor | P · B04/B05 | F10 | Ordens/licitações/contratos por exercício/consolidado/processo. |
| CL-096 | Ordem ordinária/global/estimativa | P · B04 | F07 | Emitir por licitação ou compra dispensável com origem preservada. |
| CL-097 | Dados da ordem usados no empenho | P · B04 | F07 | Emissão/vencimento/fornecedor/finalidade/dotação e parcelas na ponte financeira. |
| CL-098 | Parcelamento global/estimativa | P · B04 | F07 | Parcelas/quantidades/valores e empenho por subempenho. |
| CL-099 | Alteração da ordem antes do empenho | P · B04 | F07 | Finalidade/entrega/pagamento; impedir após empenhamento. |
| CL-100 | Estorno de ordem/itens por empenho | P · B04 | F07 | Reverter saldos e vínculo de origem automaticamente, sem estorno duplicado. |
| CL-101 | Retenção na ordem | P · B04 | F07 | Dados de retenção aproveitados na operação financeira. |
| CL-102 | Desconto na ordem | P · B04 | F07 | Desconto e cálculo de valor líquido/total na emissão. |
| CL-103 | Consumo imediato | P · B01/B04 | F07 | Produto marcado e efeitos contábeis/estoque no empenho conforme configuração. |
| CL-104 | Impedir ordem por ata vencida | N · B04 | F07 | Verificar vigência da ata de origem ao emitir. |
| CL-105 | Recebimento/saldo pendente | P · B04 | F07 | Consulta das quantidades/valores/pendências pela ordem. |
| CL-106 | Extrato de movimento da ordem | P · B04/B07 | F07/F10 | Emissão pelo registro com atos/recebimentos/estornos e saldo. |
| CL-107 | Débitos na ordem/contrato | D · B04/B12 | F07 | Consultar situação tributária da pessoa/empresa pelo provedor sem redigitação. |
| CL-108 | Prestação de contas de contratos | E · B04/B05 | F11 | Formato/regra do órgão vigente e origem dos registros. |
| CL-109 | Parcerias Lei 13.019/2014 | P · B04 | F07/F08 | Gestão específica dos instrumentos/seleção/prestação de contas. |
| CL-110 | MIS pelo portal | N · B04/B09 | F03/F08 | Manifestação de interesse social com protocolo e acompanhamento. |
| CL-111 | Consulta pública das parcerias | P · B04/B05 | F08 | Menu próprio com seleção/contratos/prestação de contas. |
| CL-112 | Agenda pública de licitações | P · B03/B05/B09 | F08 | Eventos de entrega/abertura gerados do certame, publicados no portal/transparência. |
| CL-113 | Concessão de imóvel ligada ao patrimônio | D · B04/B12 | F07 | Relacionar bens aos itens e permitir gerência patrimonial do vínculo. |
| CL-114 | PNCP integrado no lançamento/tela | E · B05 | F11 | Publicar ao lançar conforme regra e consultar retorno/dados na mesma tela. |
| CL-115 | SIM-AM/TCE-PR atualizado | E · B05 | F11 | Adapter correto por versão/competência; SAGRES atual não substitui SIM-AM. |
| CL-116 | Plataformas privadas: exportar/importar | E · B05 | F11 | Intercâmbio do julgamento eletrônico correlacionado ao processo. |
| CL-117 | Orçamento/parecer jurídico na mesma tela | P · B02/B03/B04 | F06 | Aproveitar dados/documentos de origem em todas as modalidades. |
| CL-118 | Itens da cotação/TR por requisitante | P · B02 | F06 | Importar/mover itens com origem do órgão e quantitativo. |
| CL-119 | Contrato/ata pelos vencedores importados | E · B03/B04/B05 | F07/F11 | Fornecedor/item/lote/unitário/total vindos da plataforma, sem cadastro duplicado. |
| CL-120 | Planilha de vencedores/Word | P · B03/B07 | F06/F10 | Descrição/lote/quantidade/unidade/unitário/total/marca/modelo exportáveis. |
| CL-121 | Atas/contratos de vários vencedores | N · B03/B04 | F07 | Um lote de emissão com resultado por instrumento e vínculo ao pregão. |
| CL-122 | Vigência e execução | P · B04 | F07 | Prazos de vigência/execução distintos e controle atualizado. |
| CL-123 | Publicações/reajustes/aditivos | P · B04/B05 | F07/F08 | Gerenciador integrado e efeitos/documentos de cada alteração. |
| CL-124 | Arquivo PNCP/lançamento | E · B05 | F11 | Geração/importação/transmissão do formato requerido e retorno de origem. |

## Protocolo e Processo Digital — PD — páginas 131–139 — 83 itens

| ID | Requisito sintetizado | Situação / base | Fase | Entrega para fechamento |
|---|---|---|---|---|
| PD-001 | Abertura/gestão digital completa | P · B06/B07 | F02/F03 | Interno/externo, movimentos, documentos, conclusão e arquivo relacionados. |
| PD-002 | Assinatura em abertura/movimento/encerramento | P · B07 | F02 | Documento/ato e assinatura eletrônica ou ICP-Brasil conforme configuração. |
| PD-003 | Abertura em todos os setores | I · B06 | F02 | Conferir permissão e uso da sequência anual única. |
| PD-004 | Responsável na abertura/alteração | P · B06 | F02 | Atribuição explícita com vigência/histórico, além do setor inicial. |
| PD-005 | Anônimo com telefone/e-mail opcional | P · B06/B08 | F02/F03 | Modalidade configurada sem interessado obrigatório; contatos próprios do pedido. |
| PD-006 | Finalidade público/interno | N · B06 | F02 | Campo de finalidade utilizado na abertura/consulta. |
| PD-007 | Outros processos do requerente na abertura | P · B06 | F02 | Consulta contextual dos registros autorizados já associados. |
| PD-008 | Requerentes adicionais | N · B06/B12 | F02 | Relação de vários interessados/representantes e alteração histórica. |
| PD-009 | Sequência reiniciada anualmente | I · B06 | F02 | Conferir concorrência e unicidade em `ProcessSequence`. |
| PD-010 | Abertura externa pelo requerente | P · B06/B09/B11 | F03 | Núcleo genérico externo com identidade; abertura urbanística é base específica. |
| PD-011 | Termo de aceite por assunto | P · B06/B11 | F01/F03 | Cadastro/versionamento e aceite obrigatório na abertura do serviço. |
| PD-012 | Cadastro único completo/validado | P · B06/B12 | F01/F02/F03 | CPF/CNPJ/RG/contato/endereço em interno/externo conforme regra aplicável. |
| PD-013 | Documentos obrigatórios na abertura | P · B07/B11 | F01/F03 | Lista por assunto/formulário e verificação antes de protocolar. |
| PD-014 | Roteiro automático por assunto | I · B06 | F02 | Conferir override por assunto e workflow publicado. |
| PD-015 | Prazo por etapa | I · B06 | F02 | Conferir configuração/calendário e prazo da instância. |
| PD-016 | Prazo com cores/ícones | I · B06 | F02 | Consulta reflete prazo atual/atraso por roteiro. |
| PD-017 | Taxas/guias por assunto | D · B06/B12 | F02 | Emissão padrão bancário e configuração integrada ao provedor tributário. |
| PD-018 | Reimpressão de taxa interno/externo | D · B06/B09/B12 | F02/F03 | Mesma guia sem novo débito/código indevido, pelo titular autorizado. |
| PD-019 | Cancelar processo por taxa cancelada | N · B06/B12 | F02 | Regra configurada e evento financeiro de origem idempotente. |
| PD-020 | Impedir recebimento com taxa aberta | N · B06/B12 | F02 | Parâmetro e verificação na action de recebimento. |
| PD-021 | Avisar destinatário na tramitação | I · B06/B07 | F02 | Conferir notificação aos responsáveis autorizados do destino. |
| PD-022 | Impedir tramitação com taxa aberta | N · B06/B12 | F02 | Regra aplicada em todo caminho de movimentação. |
| PD-023 | Prioridade/ícones | P · B06 | F02 | Cadastro e indicativos por prioridade no gestor. |
| PD-024 | Orientação ao cidadão na abertura | P · B09/B11 | F01/F03 | Texto por serviço/assunto e apresentação contextual. |
| PD-025 | Fases até arquivo | I · B06 | F02 | Conferir estados/transições e consulta de todas as fases. |
| PD-026 | Histórico e assinatura de movimentos | P · B06/B07 | F02 | Abertura/trâmite/recebimento e marcação dos atos assinados. |
| PD-027 | Linha do tempo completa | P · B06/B07 | F02/F03 | Abertura/trâmite/complemento/recebimento/conclusão/arquivo/cancelamento/paralisação/reabertura com autoria/data. |
| PD-028 | Apensamento e movimentos conjuntos | N · B06 | F02 | Relação e sincronização dos atos conforme o vínculo. |
| PD-029 | Anexos em abertura/movimentos/complementos | P · B07 | F02/F03 | PDF/DOC/DOCX/XLS/XLSX/JPG/PNG/ODT e vínculo ao pedido/ato. |
| PD-030 | Preservar anexos após transferência | I · B06/B07 | F02 | Conferir arquivo/versionamento persistente e acesso autorizado da origem/destino. |
| PD-031 | Documentação física/digital | N · B06/B07 | F02 | Identificação e consulta dessa característica. |
| PD-032 | Download de todos os anexos | N · B07 | F02 | Pacote completo de arquivos autorizados do processo. |
| PD-033 | Visualização agrupada por formato | N · B07 | F02 | Visualizador/consolidação por formato preservando arquivos de origem. |
| PD-034 | Modelos de documentos de processo | P · B07 | F02 | Repositório e criação de documento a partir do modelo. |
| PD-035 | Tramitar por setor/usuário | I · B06 | F02 | Conferir destino do setor e servidor específico e recebimento. |
| PD-036 | Textos sem limite funcional | P · B06 | F02 | Campos/actions/editor suportam abertura e movimentos sem limite artificial inadequado. |
| PD-037 | Transferência entre arquivos | N · B06/B07 | F02 | Local de arquivo após arquivamento e histórico de transferência. |
| PD-038 | Recebimento coletivo | I · B06 | F02 | Resultado por processo, escopo e efeitos individuais. |
| PD-039 | Tramitação coletiva com parecer individual | N · B06 | F02 | Seleção e texto distinto por processo; sem perder falhas por item. |
| PD-040 | Excluir trâmite/complemento pela tela | P · B06 | F02 | Cancelamento/exclusão permitida com reversão/histórico e ação na consulta. |
| PD-041 | Histórico de alterações do processo | P · B06/B12 | F02 | Requerente/assunto/subassunto/imóvel/endereço, anterior/novo e autor. |
| PD-042 | Configurar exclusão do último trâmite | P · B06 | F02 | Política explícita e validação de movimento já recebido/consequências. |
| PD-043 | Arquivamento coletivo | N · B06 | F02 | Lote com validação/situação/motivo por processo. |
| PD-044 | Paralisação por limite de prazo | N · B06 | F02 | Ação/situação e tratamento do prazo vigente. |
| PD-045 | Encerramento coletivo com motivo/parecer | N · B06 | F02 | Lote de conclusão e autoria por item. |
| PD-046 | Reabertura coletiva | P · B06 | F02 | Reabertura individual existe; completar operação coletiva e prazos. |
| PD-047 | E-mail/push ao requerente por movimento | P · B07/B09 | F03/F10 | Parametrização, envio externo e histórico, além de notificação interna. |
| PD-048 | Escopo por centros de custo | P · B06/B12 | F02 | Vários setores autorizados e caixa conforme permissões configuradas. |
| PD-049 | Consulta única da responsabilidade | I · B06 | F02 | Usuário/setor e ações operacionais relacionadas. |
| PD-050 | Filtrar pela repartição | I · B06 | F02 | Conferir filtros e escopo do usuário no servidor. |
| PD-051 | Ordenar última movimentação | P · B06 | F02 | Usar evento de movimento, não presumir que toda atualização cadastral equivale a tramitação. |
| PD-052 | Gerenciar pela visualização | I · B06/B07 | F02 | Anexar/receber/tramitar/complementar e situação coerente. |
| PD-053 | Imprimir movimento ou histórico completo | P · B06/B07 | F02/F10 | Emissão individual/completa pela visualização do processo. |
| PD-054 | Gestores de processos | P · B06/B12 | F02 | Papel configurável além de administrador global. |
| PD-055 | Gestor consulta todos os setores | P · B06 | F02 | Escopo do papel gestor e registros visíveis conforme sigilo. |
| PD-056 | Processo sigiloso por envolvidos | N · B06/B08 | F02 | Participantes/acessos definidos e restrição aplicada em listagem/documentos/mutações. |
| PD-057 | Readequação e aviso ao requerente | P · B06/B11 | F03/F10 | Pendência estruturada, mensagem e e-mail vinculados ao pedido. |
| PD-058 | Acompanhar/complementar via web | P · B06/B09/B11 | F03 | Número/código ou titularidade validada; movimentos/situação/datas/horas/anexos/readequação. |
| PD-059 | Solicitação de parecer a setor/usuário | P · B06/B07/B11 | F02 | Parecer geral reutiliza experiência urbanística e avisa destinatário. |
| PD-060 | Resposta de parecer no histórico | P · B06/B11 | F02 | Resposta ligada ao pedido e linha do tempo processual. |
| PD-061 | Gadget de gestão processual | P · B06 | F02/F10 | Número/ano/data/último trâmite/requerente/assunto/subassunto/situação por responsabilidade. |
| PD-062 | Despachar pelo gadget | N · B06 | F02 | Ações rápidas com mesmas regras, sem abrir consulta global. |
| PD-063 | Fluxograma no mesmo sistema/banco | P · B06 | F02 | Editor/visualização de fluxo e execução versionada, sem integrador externo. |
| PD-064 | Retorno ao requerente por tipo | N · B06/B09 | F02/F03 | Configuração de participação externa na readequação do workflow. |
| PD-065 | Atividades externas de workflow | P · B06/B11 | F03 | Responder campos/enviar documentos da etapa atribuída ao titular/representante. |
| PD-066 | Relatórios/gráficos/etiquetas | P · B06/B07 | F10 | Processo/centro de custo/assunto/subassunto e emissões correspondentes. |
| PD-067 | Relatório estatístico e filtros | P · B06/B07 | F10 | Assunto/subassunto/setor/requerente/parecer/situação/abertura/número/usuário. |
| PD-068 | Comprovantes processuais | P · B06/B07 | F02/F03 | Abertura/trâmite/conclusão/arquivo derivados dos atos persistidos. |
| PD-069 | Etiquetas personalizáveis | P · B07 | F10 | Número/ano/assunto/subassunto/data/situação e modelo editável. |
| PD-070 | Gráficos dos processos | P · B06/B07 | F10 | Assunto/subassunto/setor/situação calculados da origem. |
| PD-071 | Todos os movimentos em arquivo único | N · B07 | F02/F10 | Documento único completo da movimentação. |
| PD-072 | Relatório de Acesso à Informação | P · B08/B09 | F03/F10 | Requerente/último trâmite/abertura/situação e gráficos pelas solicitações e-SIC. |
| PD-073 | Processo completo em ordem cronológica | N · B07 | F02/F10 | Movimentos e arquivos vinculados no mesmo pacote de impressão. |
| PD-074 | Ícones de relações/dados do processo | P · B06/B07/B12 | F02 | Requerentes adicionais/informações adicionais/suspensão de cobrança/viabilidade comercial/atividades comerciais/aceite/processos relacionados ou apensados/legislação/contato/endereço. |
| PD-075 | Quantidade/percentual de aberturas | P · B06/B07 | F10 | Totais e percentuais pelo recorte, com origem auditável. |
| PD-076 | Aberturas por ano/mês | P · B06/B07 | F10 | Série temporal calculada pelo registro de abertura. |
| PD-077 | Comparar últimos dois exercícios | N · B06/B07 | F10 | Quantitativos anuais e recorte equivalente. |
| PD-078 | Comparativo mensal entre exercícios | N · B06/B07 | F10 | Meses/anos selecionados e gráfico coerente. |
| PD-079 | Ranking de número de processos | N · B06/B07 | F10 | Critério/grupo do ranking definido e consulta de registros de origem. |
| PD-080 | Crescimento de abertura/encerramento | N · B06/B07 | F10 | Séries e comparativo temporal das duas operações. |
| PD-081 | Percentual pendente/encerrado | P · B06/B07 | F10 | Denominador total de aberturas e classificação de estados explícita. |
| PD-082 | Percentual de prazo excedido em workflow | P · B06/B07 | F10 | Instâncias/prazos e denominador do mesmo período. |
| PD-083 | Workflow atrasado por setor/usuário | P · B06/B07 | F10 | Quantidade por responsável e setor, incluindo etapa ativa. |

## Gestão de Serviços Públicos — SP — páginas 139–141 — 30 itens

| ID | Requisito sintetizado | Situação / base | Fase | Entrega para fechamento |
|---|---|---|---|---|
| SP-001 | Origem da ocorrência | P · B08/B10 | F04 | Canal/origem configurável e registrada, além do texto de protocolo. |
| SP-002 | Tipo publicado no portal/aplicativo | P · B08/B09/B10 | F01/F04 | Tipo/catálogo operacional disponível à abertura externa. |
| SP-003 | Campos exigidos por tipo | N · B08/B10 | F01/F04 | Formulário configurável e versão utilizada na ocorrência. |
| SP-004 | Documentos obrigatórios por tipo | N · B07/B10 | F01/F04 | Regras e validação dos anexos na abertura. |
| SP-005 | Processo automático por tipo | P · B08/B06 | F04 | Parametrizar criação no registro; conversão interna manual atual é somente base. |
| SP-006 | Gerenciador e filtros de ocorrências | P · B08/B10 | F04 | Tipo/processo/endereço/origem/situação e consulta contextual. |
| SP-007 | Ocorrência com solicitante/local/mapa | P · B08/B10 | F04 | Tipo/solicitante/endereço/coordenadas/descrição em uma abertura vinculada. |
| SP-008 | Ocorrências do usuário | P · B09/B08 | F03/F04 | Titular autenticado consulta somente pedidos autorizados. |
| SP-009 | Mapa preenche endereço | N · B10/B12 | F04 | Seleção do ponto e resolução do endereço com confirmação do cidadão. |
| SP-010 | Bloqueio fora do município | N · B10 | F04 | Limite municipal e comportamento parametrizado na gravação. |
| SP-011 | Ver/alterar/excluir aberta | P · B08/B10 | F04 | Ações por situação/titular, com histórico e relações preservadas. |
| SP-012 | Programar ocorrência | P · B10 | F04 | Data/responsável/tipo vistoria-execução-fiscalização e vínculo ao pedido. |
| SP-013 | Histórico cronológico de programação | N · B10 | F04 | Múltiplas programações e histórico de alterações por serviço. |
| SP-014 | Programação da ocorrência selecionada | P · B10 | F04 | Consulta contextual sem misturar serviços. |
| SP-015 | Programações do executor | P · B10 | F04 | Agenda por usuário responsável/equipe autorizada. |
| SP-016 | Várias ocorrências na programação | N · B10 | F04 | Relação múltipla e consulta de todos os pedidos atendidos. |
| SP-017 | Equipe da programação | P · B10 | F04 | Reutilizar alocação de equipe, associada à programação e período. |
| SP-018 | Equipamentos da programação | P · B10 | F04 | Reutilizar patrimônio/equipamentos e registrar alocação no evento. |
| SP-019 | Impressão da programação/equipe | P · B10/B07 | F04 | Documento de ocorrência/execução com equipe e dados da agenda. |
| SP-020 | Reprogramar com motivo | P · B10 | F04 | Nova data/responsável/tipo/motivo; preservar programação anterior. |
| SP-021 | Custo previsto automático | P · B10 | F04 | Quantidades/unitários de materiais e mão de obra, com totais calculados. |
| SP-022 | Custo executado automático | P · B10 | F04 | Quantidades/unitários realizados de materiais e mão de obra. |
| SP-023 | Itens utilizados | I · B10 | F04 | Conferir vínculo ao material/estoque/movimento da execução. |
| SP-024 | Cancelar preservando consulta | P · B08/B10 | F04 | Estado de cancelamento e histórico; inativar não equivale a cancelar. |
| SP-025 | Imagens/documentos da ocorrência | P · B07/B10 | F04 | Upload e ligação ao pedido/execução com consulta autorizada. |
| SP-026 | Relatório da ocorrência | P · B10/B07 | F04/F10 | Informações/gravações do pedido e execução na emissão. |
| SP-027 | Relatório de serviços executados | P · B10/B07 | F10 | Recorte/status/período e dados realizados, não apenas programados. |
| SP-028 | Ordem de serviço | P · B10/B07 | F04 | Emissão com número/origem/executor/agenda/itens e consulta posterior. |
| SP-029 | Histórico de todos os movimentos | P · B08/B10 | F04 | Abertura/triagem/programação/reprogramação/execução/cancelamento/conclusão. |
| SP-030 | Cronograma das solicitações do portal | N · B09/B10 | F03/F04 | Cidadão acompanha programação e situação do mesmo pedido de origem. |

## Portal de Autoatendimento — PA — páginas 151–163 — 119 itens

| ID | Requisito sintetizado | Situação / base | Fase | Entrega para fechamento |
|---|---|---|---|---|
| PA-001 | Acesso por solicitação do contribuinte | N · B09/B12 | F01 | Cadastro/pedido/análise/liberação com identidade comum e perfil externo. |
| PA-002 | Processo integrado a imóvel/empresa/taxa | P · B06/B11/B12 | F02/F03/F09 | Abertura externa e vínculos imobiliário/econômico, com guia padrão bancário. |
| PA-003 | Serviços específicos e roteiro por assunto | P · B06/B09 | F01/F03 | Catálogo configurável ligado a processo e roteiro correto. |
| PA-004 | Serviço de terceiro por token | N · B09 | F01/F11 | Adapter/token de acesso por identidade e serviço, com destino definido. |
| PA-005 | Requerimento e-SIC | P · B09/B08 | F03 | Formulário/protocolo/resposta/acompanhamento além da página informativa. |
| PA-006 | Ouvidoria identificada/anônima | P · B08/B09 | F03 | Entrada externa de denúncia/dúvida/sugestão e distribuição à Ouvidoria. |
| PA-007 | Acompanhamento por número/código ou documento | P · B06/B09 | F03 | Consulta autorizada da tramitação; avisos publicados não substituem pedido pessoal. |
| PA-008 | Alterar/recuperar senha | P · B09 | F01 | Fluxos externos com validação cadastral/configuração e mesma credencial. |
| PA-009 | Pedir atualização cadastral | N · B09/B12 | F01/F03 | Dados declarados, análise quando exigida, atualização e histórico. |
| PA-010 | Aviso de cadastro desatualizado | N · B09/B12 | F01 | Data de revisão/política e alerta ao titular logado. |
| PA-011 | Autenticidade CRC | P · B05/B09 | F05/F08 | Código/consulta e situação do certificado emitido. |
| PA-012 | Readequação do vencedor por subitem | P · B03/B05 | F08 | Unitários/subitens do lote reconciliados ao total vencedor. |
| PA-013 | Proposta comercial online criptografada | N · B03/B05 | F08 | Conteúdo cifrado/senha de abertura e uso sem redigitação. |
| PA-014 | Consulta dos convites de cotação | I · B02/B05 | F08 | Conferir acesso aos próprios convites e envio de preços no prazo. |
| PA-015 | Agenda pública de licitações | P · B03/B09 | F08 | Datas/horas por evento do certame e consulta pelo portal. |
| PA-016 | Informação licitatória selecionável | P · B05/B09 | F08 | Configurar edital/anexos/pareceres/impugnação/atas/contrato/certidões/propostas/vencedores/ordens. |
| PA-017 | Consulta Lei 13.019/2014 | P · B04/B05 | F08 | Consulta específica de parcerias, com tipo/legalidade/origem. |
| PA-018 | MIS por entidade civil | N · B04/B09 | F03/F08 | Serviço de manifestação de interesse social com protocolo/retorno. |
| PA-019 | Prestação de contas financeira/objeto | P · B04/B09 | F08 | Área autorizada da entidade, evidências/análise e situação do instrumento. |
| PA-020 | Retenções dos empenhos do fornecedor | D · B04/B05/B12 | F08/F09 | Consulta restrita ao fornecedor e origem financeira. |
| PA-021 | Saldo a receber por empenho/data | D · B04/B05/B12 | F08/F09 | Credor autorizado, filtros e saldo calculado pelo financeiro. |
| PA-022 | Empenhos/pagos/retenções/saldos | D · B04/B05/B12 | F08/F09 | Consulta integral do fornecedor com acesso às próprias origens. |
| PA-023 | Folha de pagamento e layout | D · B11 | F09 | Emissão pessoal pelo RH/servidor com layout configurado. |
| PA-024 | Períodos/saldos de férias | D · B11 | F09 | Relatório pessoal do provedor RH e vigência correta. |
| PA-025 | Ficha financeira por período | D · B11 | F09 | Dados do servidor autorizado e pagamentos do recorte. |
| PA-026 | Espelho de ponto/totalizadores | D · B11 | F09 | Período e configuração dos totais na emissão pessoal. |
| PA-027 | Comprovante de IRRF | D · B11 | F09 | Emissão pelo titular com valores/exercício de origem. |
| PA-028 | Tempo de serviço/layout | D · B11 | F09 | Dados funcionais e modelo definido pela instituição. |
| PA-029 | Declaração de tempo no magistério | D · B11 | F09 | Períodos/cargo/regras do provedor RH, documento pessoal. |
| PA-030 | Atualizar nome/documentos/dependentes | D · B11/B12 | F01/F09 | Solicitação de revisão do servidor integrada à base comum/RH. |
| PA-031 | Relatório de empréstimos | D · B11 | F09 | Contratos/parcelas do titular e documento de origem. |
| PA-032 | Solicitações de RH por assunto | D · B11/B06 | F03/F09 | Férias/cursos/outros assuntos configurados, protocolo e andamento. |
| PA-033 | Ajuste de ponto | D · B11 | F09 | Solicitação abono/justificativa/registro com avaliação e retorno. |
| PA-034 | Autenticidade de recibo | D · B11/B07 | F09 | Consulta por chave com documento/situação correspondente. |
| PA-035 | Descontos por entidade/departamento conveniado | D · B11/B12 | F09 | Convenente autorizado, lançamentos para servidores no escopo permitido. |
| PA-036 | Editais de concurso/PSS | D · B11/B09 | F09 | Publicação do provedor RH no catálogo/consulta externa. |
| PA-037 | Inscrição em concurso/PSS | D · B11 | F09 | Inscrição por identidade, edital/regras/comprovante/situação. |
| PA-038 | Avaliação de desempenho | D · B11 | F09 | Autoavaliação/comissão com fases e permissões do provedor. |
| PA-039 | Estágio probatório | D · B11 | F09 | Autoavaliação/comissão e resultados do processo próprio. |
| PA-040 | Atestados por departamento | D · B11 | F09 | Servidores do escopo, anexos e processamento do RH/SST. |
| PA-041 | Contribuições previdenciárias anuais | D · B11 | F09 | Ano/previdência e valores do servidor, relatório pessoal. |
| PA-042 | Margem consignável/banco | D · B11 | F09 | Bancos conveniados e cálculo/controle de emissão do RH. |
| PA-043 | Pedido de férias/análise/programação | D · B11 | F09 | Solicitação, decisão do RH e programação originada pelo pedido. |
| PA-044 | Períodos de licença-prêmio | D · B11 | F09 | Direito/gozo/saldo do titular pelo provedor RH. |
| PA-045 | Termo de rescisão | D · B11 | F09 | Documento da rescisão do titular autorizado. |
| PA-046 | Ficha de registro de funcionário | D · B11 | F09 | Emissão pessoal com dados funcionais de origem. |
| PA-047 | Registro de ponto externo restrito | D · B11 | F09 | Servidores habilitados, regra/registro do provedor e autoria. |
| PA-048 | Relatório de aniversariantes | D · B11 | F09 | Consulta/emissão no escopo funcional autorizado. |
| PA-049 | Certificados de cursos/treinamentos | D · B11/B07 | F09 | Documentos do participante com vínculo ao evento. |
| PA-050 | Inscrição em cursos/treinamentos | D · B11 | F09 | Regras/vagas/inscrição/comprovante pelo servidor autorizado. |
| PA-051 | Afastamentos/faltas | D · B11 | F09 | Histórico/relatório do titular com recorte e origem. |
| PA-052 | Compensação/banco de horas | D · B11 | F09 | Relatório de horas/créditos/débitos/saldos pelo RH/ponto. |
| PA-053 | Declaração de vínculo empregatício | D · B11/B07 | F09 | Documento pessoal com vínculo vigente/histórico conforme solicitação. |
| PA-054 | Licenças-prêmio gozadas | D · B11 | F09 | Consulta dos períodos realizados do titular. |
| PA-055 | Inscrição para eleição CIPA | D · B11 | F09 | Eleição/elegibilidade/inscrição e situação pelo SST. |
| PA-056 | Votação CIPA | D · B11 | F09 | Eleitor habilitado e votação no processo eleitoral do SST. |
| PA-057 | Atos legais do servidor | D · B11/B07 | F09 | Consulta dos atos vinculados ao titular. |
| PA-058 | PPP | D · B11 | F09 | Emissão do perfil profissiográfico pelo provedor SST/RH. |
| PA-059 | CAT pelo servidor | D · B11 | F09 | Registro de acidente/anexos e acompanhamento no SST. |
| PA-060 | Contribuições de outras previdências | D · B11 | F09 | Relatório pessoal por previdência/período. |
| PA-061 | Recibo de férias | D · B11 | F09 | Documento vinculado ao cálculo de férias do titular. |
| PA-062 | Mensalidades/despesas de planos de saúde | D · B11 | F09 | Titular/dependentes/período, com valores do RH/SST. |
| PA-063 | Histórico de adicional de tempo | D · B11 | F09 | Evolução/percentuais e datas do vínculo do servidor. |
| PA-064 | Agendar em SST | D · B11 | F09 | Agenda/profissional/unidade, vagas e comprovante pessoal. |
| PA-065 | Recadastramento funcional | D · B11/B12 | F09 | Período elegível, formulário/documentos/análise e atualização cadastral. |
| PA-066 | Consulta de obras públicas | D · B10/B09 | F09 | Número/ano/valor/descrição publicados pelo provedor Obras. |
| PA-067 | Guias atualizadas/PIX/cartão | D · B11/B12 | F09/F11 | Tributos/serviços exigidos; acréscimos automáticos, meios condicionados ao convênio/contratação. |
| PA-068 | Extratos contribuinte/empresa/imóvel | D · B11 | F09 | Titular/representação e recorte por vínculo tributário. |
| PA-069 | Débitos na página inicial | D · B09/B11 | F09 | Indicativo calculado dos débitos do usuário autorizado. |
| PA-070 | Dados/imagens/espelho do imóvel | D · B11/B12 | F09 | Relação autorizada com imóvel e documentos do cadastro imobiliário. |
| PA-071 | Doação a programa social | D · B11/B12 | F09 | Programa definido, solicitação/valor/recebimento pelo executor responsável. |
| PA-072 | Atualizar endereço de correspondência | D · B11/B12 | F01/F09 | Pedido para imóvel/empresa/pessoa com autorização e atualização da base comum. |
| PA-073 | Alvará localização/funcionamento/sanitário | D · B11 | F09 | Consulta e emissão pelo estabelecimento autorizado no provedor correto. |
| PA-074 | CND e autenticidade | D · B11/B07 | F09 | Emissão/consulta de validade por chave, usando situação tributária. |
| PA-075 | Comprovante de retenção ISS | D · B11 | F09 | Documento pelo contribuinte/relação de retenção de origem. |
| PA-076 | NFS-e avulsa e consulta | D · B11 | F09 | Emissão/regras e documentos próprios do usuário, não apenas página de validação. |
| PA-077 | Contador representa clientes | D · B11/B12 | F09 | Poderes/vigência para CND/guias/atualização dos clientes autorizados. |
| PA-078 | Extrato por abas e guias | D · B11/B09 | F09 | Tipos de débitos e emissão contextual pelo contribuinte. |
| PA-079 | Alvará construção/habite-se | P · B11 | F09 | Consolidar fluxo urbanístico externo e ligação ao acompanhamento institucional. |
| PA-080 | Documentos obrigatórios das solicitações | P · B09/B11 | F01/F03/F09 | Catálogo/formulário exibem requisitos atuais de cada serviço. |
| PA-081 | ITBI externo | D · B11/B12 | F09 | Imóvel urbano/rural, transmitente/adquirente/matrícula/valores e processo de origem. |
| PA-082 | Reserva de espaço público | N · B09/B06 | F03/F09 | Serviço com disponibilidade/solicitação e processo digital ligado ao executor. |
| PA-083 | Direitos do titular — art. 18 LGPD | N · B09/B06/B12 | F03/F09 | Solicitação por titularidade validada e resposta/documento do controlador. |
| PA-084 | Relatório de tratamentos — art. 23 LGPD | D · B12/B07 | F09/F10 | Relatório a partir do registro de tratamentos da instituição, não de formulário vazio. |
| PA-085 | Legislação por categoria/assunto/ementa | P · B09/B12 | F09 | Consulta pública do catálogo de atos e filtros exigidos. |
| PA-086 | Diário Oficial | P · B09/B12 | F09/F11 | Acesso ao canal/edições oficiais conforme provedor institucional. |
| PA-087 | Processos administrativos | P · B06/B09 | F03 | Acompanhamento pessoal do processo, além da consulta a avisos publicados. |
| PA-088 | Comunicações por número/ano/código | D · B07/B12 | F09 | Consulta autorizada da comunicação digital e documento de origem. |
| PA-089 | Assinar documentos solicitados | P · B07/B09 | F09 | Caixa de solicitações do titular, assinatura e consulta da versão assinada. |
| PA-090 | Pedido de manutenção integrado | P · B08/B09/B10 | F03/F04 | Abertura do cidadão ligada à ocorrência e execução municipal. |
| PA-091 | Cronograma da manutenção | N · B09/B10 | F03/F04 | Programação/status do pedido do titular e atualização pela execução. |
| PA-092 | Atendimento presencial por guichê | P · B08/B09 | F09 | Guichês/agenda/vagas, solicitação e comprovante de horário. |
| PA-093 | Recados com ou sem login | N · B09 | F09 | Configuração de público-alvo e exibição institucional. |
| PA-094 | Boxes de débitos/processos | N · B09/B11 | F09 | Quantidades/valores do titular calculados e links contextuais. |
| PA-095 | Boxes de serviço ou texto | N · B09 | F09 | Cadastro de conteúdo/destino e exibição pelo catálogo. |
| PA-096 | Serviços em destaque | P · B09 | F01/F09 | Configuração de destaque; lista fixa atual é somente base visual. |
| PA-097 | Favoritos do cidadão | N · B09 | F09 | Preferências persistidas por identidade, com serviços disponíveis. |
| PA-098 | Endereço/contato institucional | I · B09/B12 | F09 | Conferir dados e atualização pelo cadastro da instituição. |
| PA-099 | Pesquisa de serviços | P · B09 | F01/F09 | Buscar catálogo operacional/informativo, filtros e destinos corretos. |
| PA-100 | Acessibilidade | P · B09 | F09 | Área/alto contraste/atalhos/ajuste de fonte efetivos nas páginas operacionais. |
| PA-101 | Aviso pop-up | N · B09 | F09 | Cadastro/vigência/público e apresentação configurável. |
| PA-102 | CAPTCHA nos serviços sem login | N · B09 | F03/F09 | Verificação no envio externo; rate limit do login não substitui mecanismo do serviço. |
| PA-103 | Serviços informativos configuráveis | P · B09 | F01/F09 | Requisitos/orientações editáveis e consumo de `PublicService`. |
| PA-104 | Carta de Serviços completa | P · B09 | F01/F09 | Todos os serviços, necessidade de login e acesso direto conforme Lei 13.460/2017. |
| PA-105 | Satisfação com serviço | P · B08/B09 | F09 | Avaliação por serviço/pedido e identidade quando cabível. |
| PA-106 | Qualidade do atendimento | P · B08/B09 | F09 | Quesito específico persistido, não apenas nota global. |
| PA-107 | Prazos e compromissos | P · B08/B09 | F09 | Quesito específico e vínculo ao serviço avaliado. |
| PA-108 | Descrição da avaliação | P · B08/B09 | F09 | Texto ligado aos três quesitos e serviço/pedido. |
| PA-109 | Resultados das avaliações | N · B09/B07 | F09/F10 | Consulta agregada por serviço pela Carta, com recorte/origem definidos. |
| PA-110 | Solicitar alvará sanitário | D · B11 | F09 | Estabelecimento autorizado, formulário/documentos e andamento no provedor Vigilância. |
| PA-111 | Solicitar licença de transporte | D · B11 | F09 | Veículo/estabelecimento e operação de Vigilância vinculados ao pedido. |
| PA-112 | Alvará de evento | D · B11 | F09 | Evento/requisitos/análise/documento pelo provedor responsável. |
| PA-113 | Alvará temporário | D · B11 | F09 | Período/requisitos/análise/documento e acompanhamento do estabelecimento. |
| PA-114 | Carteira de saúde de funcionário | D · B11/B12 | F09 | Relação estabelecimento/funcionário, pedido e emissão pelo provedor. |
| PA-115 | Denúncia à Vigilância | D · B08/B11 | F03/F09 | Entrada externa direcionada à Vigilância, modalidade e acompanhamento pertinentes. |
| PA-116 | Todos os processos da Vigilância | D · B11/B09 | F09 | Lista por estabelecimento autorizado e detalhe/status/pendências. |
| PA-117 | Retirada de documento sanitário assinado | D · B11/B07 | F09 | Alvará/licença/carteira disponível após assinatura digital do fiscal. |
| PA-118 | Notificações de receita por médico/clínica | D · B11 | F09 | Identidade profissional/estabelecimento, pedido/análise/resultado de origem. |
| PA-119 | Assunção/baixa de responsabilidade técnica | D · B11 | F09 | Solicitação específica e certidão emitida pelo provedor de Vigilância. |

## Conferência de cobertura

**124 CL + 83 PD + 30 SP + 119 PA = 356 itens.** A matriz não inclui os blocos Legislativo, Aplicativo Mobile ou Transparência como novos requisitos independentes; suas estruturas existentes são reaproveitadas onde estes quatro blocos pedem integração/publicação.

As linhas D permanecem pendentes até o provider e sua operação serem verificados e vinculados à rota externa. As linhas E permanecem pendentes até leiaute/operação/retorno do destino requerido. Atualizar a situação com evidência de origem e execução ao concluir cada entrega.
