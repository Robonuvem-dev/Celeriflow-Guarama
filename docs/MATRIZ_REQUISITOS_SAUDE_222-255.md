# Matriz de requisitos da Saúde — páginas 222–255

Complemento obrigatório de [PLANO_GERAL_SAUDE_CHECKLIST_222-255.md](PLANO_GERAL_SAUDE_CHECKLIST_222-255.md). Data: 12/10/2026.

Fonte: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`. Cada linha corresponde a um item original, com síntese operacional; o texto integral da fonte prevalece. A coluna de fechamento inclui as condições essenciais, não apenas o título do requisito.

## Legenda

- **I:** ação/estrutura específica localizada no código; conferir o fluxo completo antes de encerrar o item.
- **P:** implementação parcial, estrutura genérica ou requisito com condições adicionais ainda não fechadas.
- **N:** capacidade específica não localizada nos caminhos analisados; implementar sobre as bases citadas, após reconferência do repositório.
- **E:** intercâmbio oficial pendente ou não comprovado; a base encontrada usa outro contrato/processamento.

I não significa conformidade integral nem operação executada no banco. Não houve comprovação operacional nesta análise. Ausência de um nome numa busca, isoladamente, não comprova ausência funcional; as classificações consideram também as telas, contratos, serviços e modelos descritos no plano.

**Execução posterior (15/10/2026):** as evidências da retomada estão em [EXECUCAO_SAUDE_CHECKLIST_222-255.md](EXECUCAO_SAUDE_CHECKLIST_222-255.md). As linhas F05 atualizadas para P abaixo têm modelos, serviços e interfaces, com testes de regras/persistência descritos nesse documento. Continuam abertas até conferir todas as condições operacionais, documentos e interfaces correspondentes. As classificações restantes conservam a análise original enquanto aguardam reconferência individual.

**Bases E01–E12:** mapa de telas, serviços e tabelas na seção 2 do plano geral. Na linha N, a base indica o ponto de integração/reaproveitamento, não a existência da capacidade específica. **Fases F01–F12:** entregas da seção 7. Múltiplas fases indicam que o item só se encerra depois de todos os componentes.

## 1. Gestão da Saúde — GS — 42 itens

| ID | Página | Requisito sintetizado | Situação / base | Fase | Fechamento necessário |
|---|---:|---|---|---|---|
| GS-001 | 222 | Pessoa no padrão e-SUS | P · E01/E07 | F01 | Nome, nascimento, sexo, CNS e raça/cor no fluxo cadastral; validar campos exigidos. |
| GS-002 | 223 | Filiação obrigatória ou desconhecida | P · E01 | F01 | Mãe/pai e desconhecimento de cada filiação; regra aplicada ao cadastro completo. |
| GS-003 | 223 | Familiaridade socioafetiva | N · E01/E12 | F01 | Registrar relações socioafetivas estruturadas e consultáveis. |
| GS-004 | 223 | Endereço completo | P · E01 | F01 | CEP, município, tipo/logradouro, bairro e número pela tela de paciente. |
| GS-005 | 223 | Endereço comercial | P · E01 | F01 | Tipo comercial e vínculo ao cidadão, sem substituir endereço residencial. |
| GS-006 | 223 | Estabelecimento responsável | I · E01/E02 | F01 | Conferir vínculo à unidade de referência e sua consulta/alteração. |
| GS-007 | 223 | Telefone, celular e e-mail | P · E01 | F01 | Expor/atualizar contatos comuns e regras e-SUS pelo cadastro de Saúde. |
| GS-008 | 223 | Telefones adicionais e parentesco | N · E01 | F01 | Vários contatos com grau de parentesco, além de dois campos telefônicos. |
| GS-009 | 223 | Idade de obrigatoriedade do CPF | N · E01 | F01 | Parametrizar idade e compatibilizar CPF obrigatório no schema/actions atuais. |
| GS-010 | 223 | Foto do paciente | N · E01/E11 | F01 | Upload, vínculo e exibição no cadastro, com arquivo persistido. |
| GS-011 | 223 | Horários para contato | N · E01 | F01 | Registrar faixas e apresentar nos fluxos de contato/busca ativa. |
| GS-012 | 223 | Ocupação/local de trabalho | P · E01/E12 | F01 | Situação laboral, ocupação e local; reaproveitar dados comuns/perfil social autorizado. |
| GS-013 | 224 | Pré-cadastro e atualização obrigatória | N · E01 | F01 | Permitir campos reduzidos e exigir complementação ao vencer a política aplicável. |
| GS-014 | 224 | Atualização cadastral | P · E01 | F01 | Action atual altera perfil; completar dados da pessoa, contatos e endereços. |
| GS-015 | 224 | Validade do pré-cadastro | N · E01/E02 | F01 | Prazo configurável e data-base da validade. |
| GS-016 | 224 | Validade do cadastro | N · E01/E02 | F01 | Prazo/data de revisão com vencimento calculado. |
| GS-017 | 224 | Validade por unidade e urgência | N · E01/E04 | F01 | Política por unidade; atendimento de urgência pode admitir cadastro desatualizado. |
| GS-018 | 224 | Pesquisa cadastral avançada | P · E01 | F01 | Nome, CPF, CNS, nascimento e sexo combináveis na consulta. |
| GS-019 | 224 | Registro de contato telefônico | N · E01/E08 | F01 | Data, usuário, contato e resultado vinculados ao cidadão. |
| GS-020 | 224 | Prontuário físico digitalizado | P · E01/E11 | F01 | Anexar e consultar pelo paciente, não somente pelo atendimento aberto. |
| GS-021 | 224 | Impressão da ficha cadastral | P · E01/E11 | F01 | Modelo cadastral completo emitido pelo próprio cadastro. |
| GS-022 | 224 | CADSUS por CPF | E · E01/E10 | F12 | Consulta nacional por CPF e seleção dos dados retornados. |
| GS-023 | 224 | CADSUS por nome+nascimento | E · E01/E10 | F12 | Pesquisa avançada exige a combinação dos dois campos. |
| GS-024 | 225 | Cartão de saúde configurável | P · E11 | F01 | Cartão nacional/modelo alterável; emissão a partir do paciente. |
| GS-025 | 225 | Falecimento pelo cadastro | P · E01 | F01 | Registrar óbito pelo paciente e refletir em `Person`/situação do paciente. |
| GS-026 | 225 | Registro do óbito | N · E01 | F01 | Data de emissão e município do registro, além da data do falecimento. |
| GS-027 | 225 | Motivo/CID do óbito | N · E01/E03 | F01 | Condições/causas estruturadas e vínculo ao CID. |
| GS-028 | 225 | Histórico integral do paciente | P · E11/E03/E08 | F04/F05/F07 | Médicos, odontológicos, dispensações, receitas, urgência, exames, esperas de consultas/exames/programas e vacinas; ampliar timeline. |
| GS-029 | 225 | Unificação de duplicidades | P · E01/E11 | F01 | Transferir todas as relações de paciente, inclusive laboratório/regulação/TFD/produção e as novas tabelas. |
| GS-030 | 226 | Histórico de alterações cadastrais | P · E01/E11 | F01 | Mostrar campo, anterior/novo, data e autoria; evento genérico não substitui detalhe. |
| GS-031 | 226 | Pasta documental do paciente | P · E01/E11 | F01 | Vínculo ao paciente/pessoa e consulta central dos documentos. |
| GS-032 | 226 | SIGTAP e seus relacionamentos | E · E02 | F11 | Importar pacote oficial, incluir/atualizar procedimentos e relações por competência. |
| GS-033 | 226 | SIGTAP automático por competência | E · E02/E10 | F11 | Criação de competência aciona atualização e registra resultado/versão. |
| GS-034 | 226 | Unidades por CNES XML | E · E02 | F11 | Suportar XML de origem CNES e atualização das unidades existentes. |
| GS-035 | 226 | CNES: estabelecimento/profissional/vínculo | E · E02 | F11 | Importar as três entidades e reconciliar os relacionamentos. |
| GS-036 | 226 | Mantenedoras | N · E02 | F01 | Nome/CNPJ/endereço, banco, serviços de apoio e caracterização do estabelecimento. |
| GS-037 | 226 | Unidade responsável BNAFAR | N · E02/E10 | F01/F12 | Relacionar unidades ao responsável pelo envio e usar o vínculo na remessa. |
| GS-038 | 226 | Profissionais com contato/endereço | P · E02 | F01 | Usar cadastro comum/RH, expor contatos/endereço na Saúde e evitar duplicação. |
| GS-039 | 226–227 | Expediente por profissional/unidade | P · E02/E04 | F01 | Entrada/saída por vínculo; turno da unidade não substitui expediente individual. |
| GS-040 | 227 | Vínculos profissionais | P · E02 | F01 | Criação/alteração de unidade, especialidade e carga horária com vigência. |
| GS-041 | 227 | Gráficos de evolução anual | P · E11 | F10 | Séries anuais de dispensação, vacinas, visitas, consultas médicas e odontológicas. |
| GS-042 | 227–228 | Indicadores APS e busca ativa | P · E11/E03/E07 | F05/F10 | Gestante/puérpera, idoso, hipertenso, diabético, infantil, mulher/câncer, e-Multi e odontologia; listas com telefone/endereço. |

## 2. Gestão do Faturamento — GF — 43 itens

| ID | Página | Requisito sintetizado | Situação / base | Fase | Fechamento necessário |
|---|---:|---|---|---|---|
| GF-001 | 228 | Inclusão de convênios | P · E02/E08 | F01/F09 | Perfil assistencial e cadastro utilizável pela agenda antes de F03; completar gestão de faturamento em F09. |
| GF-002 | 228 | Procedimentos por convênio | P · E02/E08 | F01/F09 | Cobertura/vigência em agenda e produção manual; tabela específica exige cobertura integral dos itens. Reconciliar todos os caminhos clínicos antes de fechar. |
| GF-003 | 228 | Unidade/convênio/procedimento | P · E02/E08 | F01/F09 | Unidade/convênio/procedimento usados na cobertura, agenda e preços. Conferir executáveis e incompatibilidade em cada fluxo, inclusive caminhos legados. |
| GF-004 | 228 | Grupo/subgrupo de procedimentos | P · E02 | F09 | Filtros explícitos por grupo/subgrupo, origem e competência, com paginação preservada; interface conferida, carga oficial SIGTAP permanece em F11. |
| GF-005 | 228 | Procedimento por profissional e crítica | P · E03/E10 | F04/F09 | Gerar ato correspondente à especialidade e alertar durante o lançamento. |
| GF-006 | 228 | Farmácia e unidade enviadora BNAFAR | N · E02/E05 | F01/F12 | Configurar responsável distinto para unidade exclusiva de controle farmacêutico. |
| GF-007 | 228 | Prestadora da demanda espontânea | P · E02/E04 | F01/F09 | Configuração é fotografada no ingresso espontâneo e consumida na precificação/prévia/BPA; alteração posterior não troca a prestadora histórica. Conferir operação real e legado sem snapshot. |
| GF-008 | 228 | Tabelas auxiliares e preços | P · E02/E10 | F09 | Tabelas imutáveis por unidade/convênio/versão/vigência, valores Decimal e memória de cálculo por fato. Repetição, precedência e preservação histórica testadas; conferir preços contratuais reais. |
| GF-009 | 228 | APAC em SIA/SUS sem redigitação | E · E10/E03 | F09/F11 | Gestor de origem APAC e adaptador de arquivo SIA a partir dos laudos/programas. |
| GF-010 | 229 | AIH em SIH/SUS sem redigitação | E · E10/E03 | F09/F11 | Laudo/internação de origem e adaptador SIH; arquivo próprio atual não fecha o formato. |
| GF-011 | 229 | BPA-C/BPA-I magnético | E · E10 | F09/F11 | Geração separada, monitoramento e formatos exigidos derivados da produção. |
| GF-012 | 229 | BPA agrupado ou por unidade | P · E10 | F09/F11 | Escolha agrupada/individual aplicada aos dois formatos BPA e à competência. |
| GF-013 | 229 | Custo do paciente até desfecho | P · E03/E05/E10/E11 | F09 | Valores de atos separados do consumo físico, com movimentos líquidos, cancelamentos/devoluções, itens próprios e rateio de diluente. Cenário de R$ 17 → R$ 3 aprovado; conferir todos os episódios/documentos operacionais. |
| GF-014 | 229 | Prévias por unidade/profissional/geral | P · E10/E11 | F09 | Prévia completa por unidade/profissional/geral, origem dos valores, críticas e pendências separadas; preços capturados e desconhecidos preservados. PDF/CSV e interface conferidos; conciliação operacional final pendente. |
| GF-015 | 229 | Produção manual de implantação | I · E10 | F09 | Conferir cadastro, competência aberta, origem manual e crítica; sem duplicar captura automática. |
| GF-016 | 229 | RAAS domiciliar/psicossocial | E · E07/E10 | F02/F05/F09/F11 | Preparação interna deriva episódios de atendimentos domiciliares e prontuários CAPS, com IDs, avaliação, diagnósticos/procedimentos e críticas. Leiaute/elegibilidade oficial e exportação RAAS continuam em F11. |
| GF-017 | 229–230 | Envio e-SUS sem redigitação | E · E07/E10 | F12 | Gerar/envio a partir dos registros operacionais, além de validação interna. |
| GF-018 | 230 | API e-SUS de faturamento | E · E10 | F12 | Adaptador API, configuração, transmissão e retorno correlacionado. |
| GF-019 | 230 | RIRA: requisições/lista de espera | E · E08/E10 | F10/F12 | Contrato próprio versionado/receptor e posterior comunicação ao destino oficial. |
| GF-020 | 230 | RNDS: vacinas autorizadas | E · E06/E10 | F07/F12 | Configuração de vacinas autorizadas e envio/retorno RNDS. |
| GF-021 | 230 | Consolidação BNAFAR | E · E05/E10 | F12 | Dados farmacêuticos e transmissão conforme responsável e contrato confirmado. |
| GF-022 | 230 | BPA consolidado impresso | P · E10/E11 | F09 | PDF consolida competência/unidade/prestadora/procedimento/CBO/situação e valores conhecidos; documento emitido no navegador. Conferir dados completos e apresentação operacional. |
| GF-023 | 230 | BPA individualizado impresso | P · E10/E11 | F09 | PDF nominal com CNS/nascimento/sexo/município/CID/procedimento/profissional/CNES e origem; sem preencher ausências artificialmente. Conferir emissão operacional com cadastro completo. |
| GF-024 | 230 | Prévia BPA impressa | P · E10/E11 | F09 | PDF/CSV usam o mesmo recorte integral e memória da produção, separando validado/criticado/pendente; conferir prévia real antes de fechar competência. |
| GF-025 | 230 | Órgãos emissores | P · E02/E10 | F09 | Cadastro com código/tipo/fonte e vínculo à faixa/autorização; conferir os tipos oficiais da Portaria DATASUS 637/2005. |
| GF-026 | 230 | Faixa AIH | P · E10 | F09 | Limites/validade/saldo/próximo número e consumo exclusivo implementados; concorrência real aprovada, carga oficial ainda não executada. |
| GF-027 | 230 | Laudo AIH detalhado | P · E03/E10 | F09 | Dados clínicos, vários procedimentos/executores, origem opcional em atendimento e versões imutáveis; conferir emissão operacional. |
| GF-028 | 231 | Impressão automática do laudo AIH | P · E11 | F09 | Salvar abre PDF da versão persistida; PDF testado em banco isolado, impressão operacional ainda em conferência. |
| GF-029 | 231 | AIH paga manualmente | P · E10 | F09 | Identificação manual com referência/data/usuário e evento; não produz pagamento financeiro paralelo. Conferir uso operacional. |
| GF-030 | 231 | Aprovação/glosa/arquivo AIH | P · E10 | F09 | Estados e eventos persistidos; glosa exige revisão e encerramento admite arquivo. Conferir interface individual. |
| GF-031 | 231 | Autorização AIH individual | P · E10 | F09 | Próxima numeração apresentada e conferida novamente na transação; faixa/tipo/validade/saldo guardados. Conferir numeração oficial. |
| GF-032 | 231 | Autorização AIH coletiva | P · E10 | F09 | Lote atômico com número exclusivo por laudo e resultado individual; teste de disputa do último número aprovado. Conferir seleção operacional. |
| GF-033 | 231 | AIH em duas vias | P · E11 | F09 | PDF em duas vias com versão solicitada, número, órgão e autorizador; emissão real ainda em conferência. |
| GF-034 | 231 | Cancelar AIH com senha parametrizada | P · E10 | F09 | Política por unidade, reautenticação Firebase quando exigida, autoria e numeração não reciclada; conferência de senha real pendente. |
| GF-035 | 231 | Saída e óbito da internação | P · E01/E04/E10 | F09 | Registrar saída; alta por óbito atualiza cadastro, data e usuário. |
| GF-036 | 231 | Faixa APAC | P · E10 | F09 | Faixas independentes por tipo, com validade/saldo e consumo exclusivo; conferir fonte oficial da numeração. |
| GF-037 | 231 | Laudo APAC detalhado | P · E03/E10 | F09 | Diagnóstico/história/exames/justificativa e procedimentos versionados, com paciente/profissional/unidade compartilhados. Conferir emissão operacional. |
| GF-038 | 232 | Aprovação/glosa/arquivo APAC | P · E10 | F09 | Decisões e revisões com autoria/motivo; conferência da interface individual pendente. |
| GF-039 | 232 | Autorização APAC individual | P · E10 | F09 | Prévia da próxima numeração, validade e versão autorizada persistidas; conferir numeração e operação reais. |
| GF-040 | 232 | APAC em duas vias | P · E11 | F09 | PDF em duas vias com paciente/solicitação/número/autorizador/validade; conferir impressão operacional. |
| GF-041 | 232 | Cancelamento APAC | P · E10 | F09 | Cancelamento preserva autorização e número consumido, com data/usuário/motivo; conferir interface. |
| GF-042 | 232 | Renovação APAC vencida | P · E10 | F09 | Novo laudo copia dados/procedimentos e liga ao anterior vencido, sem reutilizar número; repetição recusada em teste isolado. Conferir operação. |
| GF-043 | 232 | Permanência APAC inicial | P · E10 | F09 | Exige inicial/autorizada/vigente e motivo, com evento imutável; limites testados, interface individual em conferência. |

## 3. Gestão da Atenção Primária — AP — 41 itens

| ID | Página | Requisito sintetizado | Situação / base | Fase | Fechamento necessário |
|---|---:|---|---|---|---|
| AP-001 | 232 | Família com abrangência e classificação | P · E07/E12 | F02 | Responsável/endereço/unidade/equipe/classe/tipo sobre família comum. |
| AP-002 | 232 | Integrantes e parentesco | I · E07/E12 | F02 | Conferir vínculo à pessoa e sincronização dos perfis familiares. |
| AP-003 | 232 | Histórico de composição familiar | P · E07/E12 | F02 | Entrada/saída/mudança com período, usuário e consulta de movimentos. |
| AP-004 | 233 | Pasta documental familiar | N · E07/E11 | F02 | Anexos vinculados à família e acesso pelo gestor familiar. |
| AP-005 | 233 | Domicílio conforme ficha e-SUS | P · E07 | F02 | Atributos completos da ficha domiciliar/territorial, além do código e microárea. |
| AP-006 | 233 | Família/domicílio/área/microárea | I · E07 | F02 | Conferir organização territorial e consulta dos vínculos, sem duplicar família. |
| AP-007 | 233 | Transferência familiar | N · E07/E12 | F02 | Novo domicílio ou fora do município com histórico da localização anterior. |
| AP-008 | 233 | Imunobiológico e-SUS/RNDS | P · E06/E05 | F07/F12 | Mapeamento por versão/fonte e snapshot da aplicação implementados/testados; códigos oficiais e intercâmbio devem ser configurados/conferidos no destino. |
| AP-009 | 233 | Incompatibilidades e intervalo | I · E06 | F07 | Relações/intervalos e idade aplicados na aplicação/carteira; casos de intervalo precoce e incompatibilidade testados. |
| AP-010 | 233 | ESAVI ligado ao imunobiológico | I · E06 | F07 | Gestor nominal e vínculo validado a paciente/imunobiológico/aplicação; persistência e interface conferidas. |
| AP-011 | 233 | Lesão e conduta ESAVI | I · E06/E03 | F07 | Tipo/local/gravidade e condutas com profissional/data/usuário; histórico testado. |
| AP-012 | 233 | Fabricante e código RNDS | P · E06/E05 | F07/F12 | Fabricante/código/fonte e snapshot por lote/aplicação implementados; tabela/códigos oficiais do produtor permanecem na conferência externa. |
| AP-013 | 233 | Diluentes | I · E05/E06 | F07 | Tipo DILUENT no material único, relação e consumo por frasco preparado; saldo não é baixado de novo a cada paciente. Testado. |
| AP-014 | 234 | Calendário vacinal | I · E06 | F07 | Calendário por dose/estratégia/faixa/intervalo/repetição e versão/vigência; idade mensal/bissexta e exigibilidade testadas. |
| AP-015 | 234 | Campanhas de vacinação | I · E06 | F07 | Campanha com início/fim/divulgação; vínculo validado à data da aplicação e divulgação no portal. |
| AP-016 | 234 | Carteira e ações vacinais | I · E06/E11 | F07 | Carteira oferece aplicação/indicação/resgate/aprazamento com origem/autoria; resgate não movimenta estoque. Serviços e quatro ações no browser conferidos. |
| AP-017 | 234 | Contraindicação na carteira | I · E06 | F07 | Contraindicação por imunobiológico/dose, vigência/revogação e efeito na exigibilidade/aplicação testados. |
| AP-018 | 234 | Aplicação completa | I · E06 | F07 | Data/hora, profissional aplicado distinto do usuário registrador, grupo/estratégia/local e fonte persistidos; campos e data real testados. |
| AP-019 | 234 | Profissional da indicação | I · E06 | F07 | Aplicação referencia indicação; teste distingue indicador e administrador e consulta ambos na carteira/documento. |
| AP-020 | 234 | Estoque vacinal e diluentes | I · E05/E06 | F06/F07 | Estoque em doses com embalagem por lote; frasco/preparo/diluente rastreados e conciliação sem criar saldo. Cenário integrado testado. |
| AP-021 | 234 | Entrada de vacinas | I · E05/E06 | F07 | Frascos × doses por frasco convertem quantidade/custo; validade/fabricante/lote e aprovação preservados. Testado. |
| AP-022 | 234 | Baixa de doses | I · E05/E06 | F07 | Aplicação de uma dose e perda com chave contra repetição atualizam lote/frasco; saldos e replay testados. |
| AP-023 | 235 | Bloqueio de lote vacinal | I · E05/E06 | F07 | Bloqueio/validade impedem aplicação; consulta expõe situação e teste inclui frasco vencido após preparo. |
| AP-024 | 235 | Requisição/transferência entre unidades | I · E05/E06 | F07 | Reutiliza cadeia F06; remessa de frascos fechados preserva dados de lote no destino; aceite seguido de aplicação/diluente testado. |
| AP-025 | 235 | Inventário vacinal | I · E05/E06 | F07 | Inventário compartilhado por posição/lote com contagem inteira de doses; frascos conciliados sem nova entrada. Fluxo F06 e domínio vacinal testados. |
| AP-026 | 235 | Carteira impressa | I · E06/E11 | F07 | PDF de calendário/situação/aplicações/resgates/aprazamentos/contraindicações; geração válida e download real de paciente importado conferidos. |
| AP-027 | 235 | Certidão de regularidade vacinal | I · E06/E11 | F07 | PDF informa regularidade calculada/pedências e base do calendário; emissão por sessão do cidadão; documento testado em banco isolado. |
| AP-028 | 235 | Pendências e busca ativa vacinal | I · E06/E11 | F07 | Cálculo completo antes da paginação, nominal com telefone/endereço e ligação à carteira; cadastro incompleto separado de dose pendente. Testado. |
| AP-029 | 235 | Atividade coletiva por tipo | P · E07 | F02 | Gestor operacional além da ficha genérica; autoria e participantes. |
| AP-030 | 235 | Temas/práticas por tipo | P · E07 | F02 | Listas/regras por tipo e armazenamento estruturado. |
| AP-031 | 235 | Procedimento da atividade coletiva | N · E07/E10 | F02/F09 | Vínculo ao procedimento e geração de produção sem redigitação. |
| AP-032 | 235 | Atenção domiciliar | P · E07/E03 | F02 | Solicitação, avaliação e atendimentos relacionados. |
| AP-033 | 235 | Elegibilidade e atendimento e-SUS | P · E07 | F02 | Conjunto de campos/regras exigidos e decisão de elegibilidade persistida. |
| AP-034 | 236 | Modalidade/CID/caráter domiciliar | P · E07/E03 | F02 | Campos estruturados na avaliação/atendimento domiciliar. |
| AP-035 | 236 | Solicitação antes da avaliação | N · E07 | F02 | Avaliação precede atendimento e ambos apontam ao pedido. |
| AP-036 | 236 | Marcadores de consumo alimentar | P · E07 | F02 | Completar ficha de marcadores, faixas etárias e histórico; refeição isolada é insuficiente. |
| AP-037 | 236 | Visita domiciliar | I · E07 | F02 | Conferir família/domicílio/agente/data e consulta da visita. |
| AP-038 | 236 | Integrante novo pela visita | P · E07/E12 | F02 | Inclusão contextual pela visita e atualização da composição comum. |
| AP-039 | 236 | Ausência de integrantes | P · E07 | F02 | Registrar por integrante e na visita, não apenas desfecho geral da ficha. |
| AP-040 | 236 | Recusa da visita | P · E07 | F02 | Desfecho/motivo persistidos no gestor de visita e ficha correspondente. |
| AP-041 | 236 | Antropometria/sinais vitais na visita | N · E07/E03 | F02 | Valores por pessoa, data e unidade de medida vinculados à visita. |

## 4. Assistência à Saúde — AS — 74 itens

| ID | Página | Requisito sintetizado | Situação / base | Fase | Fechamento necessário |
|---|---:|---|---|---|---|
| AS-001 | 236 | Consultas agendadas por profissional | I · E04 | F03 | Conferir gerenciador e filtros no perfil/unidade autorizados. |
| AS-002 | 236 | Escuta inicial pelo gerenciador | P · E03/E04 | F04 | Acesso contextual à escuta, sem perder paciente/agendamento. |
| AS-003 | 236 | Atendimento pelo gerenciador | I · E03/E04 | F04 | Iniciar/abrir prontuário a partir da consulta e manter a origem. |
| AS-004 | 237 | Demanda espontânea na mesma central | I · E03/E04 | F04 | Inclusão e gerenciamento contextual com o mesmo núcleo clínico. |
| AS-005 | 237 | Chamada no painel da unidade | P · E04 | F03 | Evento de chamada existe; entregar painel consumidor por unidade. |
| AS-006 | 237 | Vacinação pela central agendada | I · E04/E06 | F04/F07 | Agenda abre carteira com agendamento; aplicação valida paciente/unidade/chegada e guarda origem, testada no cenário integrado. |
| AS-007 | 237 | Indicação de triagem realizada | I · E03/E04 | F04 | Estado visual coerente com a triagem registrada. |
| AS-008 | 237 | Procedimentos preenchidos pelos atos | P · E03/E10 | F04/F09 | Regras de geração por ato e origem; não exigir lançamento duplicado. |
| AS-009 | 237 | Biometria multiprofissional | N · E03/E04 | F04/F12 | Habilitação/troca de profissional e interface de leitor; conexão/captura na implantação. |
| AS-010 | 237 | Campos por especialidade | N · E03 | F04 | Configuração de campos/grupos, obrigatoriedade e consumo no atendimento. |
| AS-011 | 237 | Requisição de exame no atendimento | I · E03 | F04 | Conferir pedido persistido, ordem laboratorial e origem no prontuário. |
| AS-012 | 237 | Avaliação clínica de exames | P · E03 | F04 | Avaliar exame/resultado durante atendimento e registrar parecer. |
| AS-013 | 237 | Datas/alteração/prestador do exame | P · E03 | F04 | Realização, resultado, alteração e prestador na avaliação. |
| AS-014 | 237 | Resultado integrado no atendimento | P · E03/E10 | F04/F12 | Exibir laudo recebido do prestador, correlacionado à requisição e paciente. |
| AS-015 | 238 | Questionário obrigatório por condição | P · E03/E07 | F04 | Questionário clínico personalizável e regra por condição; ficha e-SUS/laboratorial não substitui. |
| AS-016 | 238 | Problemas/condições e evolução | P · E03 | F04 | Condição longitudinal, início e narrativa; CID do episódio é somente parte. |
| AS-017 | 238 | Prescrição completa | P · E03 | F04 | Posologia/quantidade/tipo de uso/dias estruturados e documentados. |
| AS-018 | 238 | Contrarreferência de especialista | P · E03/E08/E12 | F04 | Registro específico de retorno relacionado ao encaminhamento e atendimento. |
| AS-019 | 238 | Medicamento manipulado | P · E03/E05 | F04 | Tipo de receita, descrição e posologia; nome livre não fecha classificação. |
| AS-020 | 238 | Separação automática de receitas | N · E03 | F04 | Agrupar conforme tipo/classificação dos medicamentos prescritos. |
| AS-021 | 238 | Separação manual de receitas | N · E03 | F04 | Organizar itens e emitir receitas separadas preservando prescrição. |
| AS-022 | 238 | Receituários padrões | P · E03/E05/E11 | F04 | Modelo de receita com itens/posologias reutilizáveis; modelo por medicamento é apenas base. |
| AS-023 | 238 | Administração no atendimento | N · E03/E05 | F04/F06 | Medicamento/dose/profissional/data; estoque da unidade ou propriedade do paciente. |
| AS-024 | 239 | Materiais da administração | N · E03/E05 | F04/F06 | Materiais/quantidades e movimentos associados ao ato. |
| AS-025 | 239 | Notificação de agravo | P · E03 | F04 | Tipo e data dos primeiros sintomas vinculados ao atendimento/paciente. |
| AS-026 | 239 | Blocos por grupo de atendimento | P · E03/E07 | F04/F05 | Habilitar blocos de gestação/crônicos e outros configurados pelo grupo. |
| AS-027 | 239 | Indicativo alérgico | N · E03 | F04 | Alergia estruturada e alerta visível no atendimento. |
| AS-028 | 239 | Indicativo de uso contínuo | P · E03/E05 | F04 | Estado de medicamento em uso, início/fim e indicação no atendimento. |
| AS-029 | 239 | Histórico anterior por privilégio | P · E03/E11 | F04 | Histórico no atendimento, com escopo aplicado a cada origem consultada. |
| AS-030 | 239 | Desfecho em observação | P · E03/E04 | F04 | Criar/vincular episódio ao concluir; hoje desfecho e observação são separados. |
| AS-031 | 239 | Evolução de todo o episódio | P · E03/E04 | F04 | Consulta da observação e de suas evoluções com origem/autoria. |
| AS-032 | 239 | Família durante o atendimento | P · E01/E07/E12 | F02/F04 | Responsável, composição e domicílio comuns; informação social autorizada. |
| AS-033 | 239 | Consumo alimentar e histórico | P · E03/E07 | F02/F04 | Registrar/consultar marcadores alimentares por paciente no atendimento. |
| AS-034 | 239–240 | Voz em todos os campos textuais | N · E03 | F04 | Captação/transcrição com revisão nos campos de texto do atendimento. |
| AS-035 | 240 | Atestado/comparecimento no desfecho | P · E03/E11 | F04 | Emitir documentos pela finalização, preenchidos com atendimento/paciente. |
| AS-036 | 240 | Receita no desfecho | P · E03/E11 | F04 | Formato de receituário com itens/posologia e origem persistida. |
| AS-037 | 240 | Espelho com triagem e atendimento | P · E03/E11 | F04 | Documento integral dos dados de escuta/triagem/atendimento. |
| AS-038 | 240 | Guia de encaminhamento no desfecho | P · E03/E08/E11 | F04 | Guia derivada do encaminhamento registrado, com destino e motivo. |
| AS-039 | 240 | Assinatura digital dos documentos | P · E11 | F04 | Usar fluxo de assinatura da plataforma no desfecho e consultar versão assinada. |
| AS-040 | 240 | Modelos de documentos formatáveis | P · E11 | F04 | Criar/formatar modelos e disponibilizar na finalização. |
| AS-041 | 240 | Alteração após atendimento por horas | N · E03 | F04 | Parametrizar janela e revisão; remover conflito com bloqueio absoluto de concluído. |
| AS-042 | 240 | Chegada espontânea e urgência | I · E03/E04 | F04 | Motivo/sintomas/classificação e registro na fila. |
| AS-043 | 240–241 | Núcleo completo na demanda espontânea | P · E03/E04 | F04 | Chamada/triagem/exames/evolução/prescrição/administração/encaminhamento/desfecho. |
| AS-044 | 241 | Documentos do atendimento espontâneo | P · E03/E11 | F04/F08/F09 | Receita/atestado/comparecimento/guia/BPA-I/TFD/espelho conforme dados do episódio. |
| AS-045 | 241 | Vacinação pelo atendimento | I · E03/E06 | F04/F07 | Prontuário abre carteira com atendimento de origem; persistência, histórico e espelho usam a mesma aplicação. Origem testada. |
| AS-046 | 241 | Justificativa de não atendimento | P · E04 | F04 | Falta ou não atendimento com motivo persistido/consultável. |
| AS-047 | 241 | Rastreamento citopatológico | P · E03 | F05 | Elegibilidade/exame/resultado persistidos em `HealthClinicalScreening`, com gestor e teste integrado; conferir fluxo visual e busca ativa. |
| AS-048 | 241 | Acompanhamento de mamografias | P · E03 | F05 | `HealthClinicalScreening` e gestor com solicitação/realização/resultado; conferir caso mamográfico e população enquadrada. |
| AS-049 | 241 | Gestante pelo atendimento e gestor | P · E03/E07 | F05 | Cadastro de gestação aberto no atendimento e acompanhado em gestor próprio. |
| AS-050 | 241 | DPP/idade gestacional automáticas | P · E03/E07 | F05 | `care-lines-policy.ts`: DUM/ultrassom, DPP e referência temporal testados; conferir apresentação no atendimento. |
| AS-051 | 241–242 | Dados iniciais da gestação | P · E03/E07 | F05 | DUM/ultrassom/peso/altura/tipo/gravidez anterior/último preventivo. |
| AS-052 | 242 | Blocos por trimestre | P · E03 | F05 | `HealthPregnancyVisit` preserva trimestre/idade/data; página agrupa as evoluções. Conferir os três trimestres no fluxo visual. |
| AS-053 | 242 | Consulta puerperal | P · E03 | F05 | `HealthPostpartumVisit` guarda idade gestacional, tipo/local/data do parto e condições; conferir caso de parto completo. |
| AS-054 | 242 | Aborto na consulta puerperal | P · E03 | F05 | Teste integrado confirma desfecho MISCARRIAGE e preservação das consultas; conferir interface e histórico do paciente. |
| AS-055 | 242 | Desfecho administrativo gestacional | P · E03 | F05 | Encerramento administrativo exige motivo/condições e preserva visitas; conferir caso administrativo completo. |
| AS-056 | 242 | IMC gestacional por semana | P · E03/E11 | F05 | Peso/altura/idade originam IMC por consulta; gráfico contextual implementado. Cálculo testado; conferir gráfico visual. |
| AS-057 | 242 | Indicação de gestante no atendimento | P · E03/E07 | F05 | Derivar da gestação ativa, não somente marca de uma ficha. |
| AS-058 | 242 | Gestor de hipertensão/diabetes | P · E03 | F05 | Pressão/glicemia/fatores de risco/complicações e acompanhamento longitudinal. |
| AS-059 | 242 | Indicação hipertenso/diabético | P · E03 | F05 | Condições longitudinais e indicativos na página principal implementados; conferir exibição após gravação e revisão do cadastro. |
| AS-060 | 242 | Encaminhamento interno para fila | P · E03/E04/E08 | F04 | Selecionar fila de destino e mover o paciente mantendo o episódio. |
| AS-061 | 243 | Atendimento odontológico | P · E03/E07 | F05 | Agendado e espontâneo com dados e procedimentos odontológicos estruturados. |
| AS-062 | 243 | Triagem odontológica | P · E03/E04 | F05 | Disponível pelo gerenciador odontológico e vinculada ao episódio. |
| AS-063 | 243 | Odontograma visual | P · E03 | F05 | `Odontogram.tsx` e `HealthDentalMark` persistem seleção/histórico; conferir interação no navegador. |
| AS-064 | 243 | Arcadas adulta/infantil/ambas | P · E03 | F05 | 32 permanentes/20 decíduos, alternância e validação de compatibilidade testadas; conferir representações visuais. |
| AS-065 | 243 | Situação do dente | P · E03 | F05 | Situação/superfície/narrativa/histórico persistidos; conferir alteração e consulta contextual. |
| AS-066 | 243 | Procedimento por dente | P · E03/E10 | F05/F09 | Teste confirma marcação ligada a `HealthPerformedProcedure`; reconciliar com produção/faturamento em F09. |
| AS-067 | 243 | Tipo de marcação odontológica | P · E03 | F05 | Dente/arcada/quadrante/boca/sextante com códigos próprios e validação testada; conferir seleção e leitura visual por região. |
| AS-068 | 243 | Evolução odontológica | P · E03 | F05 | Núcleo de evolução disponível e associado às marcações/procedimentos. |
| AS-069 | 243 | Sessões fisioterapia/psicologia | P · E12/E03 | F05 | Plano/sessões e estados; contador de evoluções não substitui controle de sessões. |
| AS-070 | 243 | Informações SISPRENATAL | P · E03/E07/E10 | F05/F10/F12 | Dados gestacionais estruturados e contrato próprio; adequação ao padrão confirmado na integração. |
| AS-071 | 243 | Informações HIPERDIA | P · E03/E10 | F05/F10/F12 | Dados crônicos estruturados e contrato próprio; adequação ao padrão confirmado na integração. |
| AS-072 | 243 | Painéis por unidade | N · E04 | F03 | Cadastro/configuração e exibição de chamada pela unidade. |
| AS-073 | 244 | Mensagem da chamada | N · E04 | F03 | Mensagem configurável aplicada ao evento de chamada. |
| AS-074 | 244 | Notícias no painel | N · E04 | F03 | Conteúdo municipal configurado e exibido no painel da unidade. |

## 5. Assistência Farmacêutica — AF — 57 itens

| ID | Página | Requisito sintetizado | Situação / base | Fase | Fechamento necessário |
|---|---:|---|---|---|---|
| AF-001 | 244 | Produto/CATMAT | I · E05 | F06 | `HealthMaterialProfile.catmatCode` ligado ao material único, serviço validado e interface de catálogo conferida; ver execução F06. |
| AF-002 | 244 | Unidade de fornecimento | I · E05 | F06 | Cadastro distingue unidade/fator de fornecimento e unidade do estoque; interface conferida e conversão de NF-e testada. |
| AF-003 | 244 | Princípio ativo | I · E05 | F06 | Conferir cadastro/consulta e associação ao medicamento. |
| AF-004 | 244 | Apresentação | I · E05 | F06 | Conferir comprimido/pomada/tubo/frasco e uso na prescrição/dispensação. |
| AF-005 | 244 | Classificação RENAME | I · E05 | F06 | Pertencimento/referência obrigatória, filtro de consulta e persistência testados; fonte da relação precisa ser fornecida na implantação. |
| AF-006 | 244 | Classificação REMUME | I · E05 | F06 | Pertencimento/referência municipal, filtro e persistência testados; catálogo conferido no browser. |
| AF-007 | 244 | Lista DCB Anvisa 2007 com CAS | P · E05 | F06 | `HealthDcbSubstance` guarda código/denominação/CAS com dígito verificador, fonte e versão; vínculo testado. Lista oficial Anvisa 2007 ainda não carregada/validada. |
| AF-008 | 244 | Recomendação no receituário | P · E05/E03 | F06 | Recomendação do produto copiada para o item prescrito e consumida pelo emissor PDF; cópia testada, conferir documento impresso. |
| AF-009 | 244 | Entrada no estoque | I · E05 | F06 | Conferir entrada e atualização de saldo somente após aprovação quando configurada. |
| AF-010 | 244 | Consulta das entradas | P · E05/E11 | F06 | Gerenciador com todas as entradas e detalhes/estado, além do relatório por nota. |
| AF-011 | 245 | Dados da nota fiscal | P · E05 | F06 | Nota, emissão e demais dados do recebimento expostos na entrada. |
| AF-012 | 245 | XML da nota fiscal | I · E05 | F06 | Parser NF-e dedicado e `/saude/farmacia/notas`; testes de fornecedor/CNPJ, itens/lotes, conversão, aprovação e repetição sem novo saldo; prévia/mapeamento conferidos em navegador. Evidências em `EXECUCAO_SAUDE_CHECKLIST_222-255.md`. |
| AF-013 | 245 | Tipo de entrada | I · E05 | F06 | Conferir fornecedor/doação/ajuste e regras por tipo. |
| AF-014 | 245 | Doação exige só nome do doador | N · E05 | F06 | Não exigir fornecedor/documentação cadastral do doador além do nome. |
| AF-015 | 245 | Itens do recebimento | I · E05 | F06 | Vários itens associados à mesma entrada com consulta. |
| AF-016 | 245 | Lote/validade/quantidade/custo obrigatórios | P · E05 | F06 | Exigir validade no contrato/tela e demais campos; hoje validade pode ficar ausente. |
| AF-017 | 245 | Fabricante na entrada | N · E05 | F06 | Identificar fabricante por item/lote recebido. |
| AF-018 | 245 | Aprovação antes do estoque | N · E05 | F06 | Configurar exigência; pendente não gera movimento; aprovação efetiva uma vez. |
| AF-019 | 245 | Baixa por vencimento/extravio | I · E05 | F06 | Motivo, produto/lote/quantidade e consulta do movimento. |
| AF-020 | 245 | Bloqueio de lotes | I · E05 | F06 | Conferir que lote bloqueado não é dispensado, inclusive por caminhos alternativos. |
| AF-021 | 245 | Transferência entre unidades | I · E05 | F06 | Envio/aceite com lote, custo de saída e chave de repetição; saldo transitório/recebido testado, inclusive em PostgreSQL local real. |
| AF-022 | 245 | Requisitar onde há estoque | I · E05 | F06 | Gestor consulta saldo por produto/unidade autorizada e seleciona origem; criação exige saldo válido quando a origem é definida. Formulário conferido no navegador. |
| AF-023 | 246 | Processo requisição/transferência | I · E05 | F06 | Itens de remessas ligados aos pedidos; parcial/trânsito/aceite/pendência com bloqueio de sobre-envio. Repetição e conclusão testadas. |
| AF-024 | 246 | Demanda reprimida de produtos | I · E05/E11 | F06 | Pedido do paciente, medicamento/correlato, entrega posterior, saldo e recomposição integrados. Cenário transacional e gestor conferidos. |
| AF-025 | 246 | Inventário e ajustes | I · E05 | F06 | Gestor por estoque/lote reutiliza inventário de Patrimônio; abertura/fechamento concorrentes, contagem, aprovação e ajuste únicos testados em banco isolado real. |
| AF-026 | 246 | Judicialização farmacêutica | I · E05/E11 | F06 | Gestor `/saude/farmacia/judicial`, paciente/produtos, decisões e entregas vinculadas; persistência e limites testados. |
| AF-027 | 246 | Cadastro de advogados | I · E01/E05 | F06 | `HealthPharmacyLawyer` referencia a mesma `Person`, inscrição/UF e papel no processo; serviço testado e formulário conferido. |
| AF-028 | 246 | Processo/paciente/data/advogado | I · E05/E11 | F06 | Abertura com paciente/unidade/data/advogado/produtos; protocolo do paciente e compra existentes vinculados no teste integrado. |
| AF-029 | 246 | Digitalizações e pedido de compra | P · E05/E11 | F06 | Upload GED/download por processo e referência à compra implementados; vínculos/consulta no extrato testados. Conferir transferência real de digitalização e download. |
| AF-030 | 246 | Fases/cancelamento/renovação judicial | I · E05/E11 | F06 | Eventos com motivo/data/usuário; renovação cria versão e aprovação arquiva autorização anterior. Transições, replay e preservação testados. |
| AF-031 | 246 | Dispensar pelo processo aprovado | I · E05 | F06 | Ação contextual e guardas compartilhadas na dispensação: aprovação, vigência, origem e quantidade; cancelamento/recomposição testados. |
| AF-032 | 246 | Extrato do processo | I · E11 | F06 | PDF com identidade, paciente/advogado, origem/compra, produtos/saldos/entregas/fases/documentos; geração da origem e validade do PDF testadas. |
| AF-033 | 246 | Entregas de kits | I · E05 | F06 | Geração sem baixa, retirada por paciente/retirante, lotes e movimentos por item; teste de atomicidade, repetição e retorno. |
| AF-034 | 246 | Cadastro de kits/produtos | I · E05 | F06 | Composição versionada no material único; atualização não altera itens de kits já gerados. Persistência e formulário múltiplo conferidos. |
| AF-035 | 247 | Quantidade padrão por item do kit | I · E05 | F06 | Quantidade positiva por produto é copiada à geração; teste mantém a composição anterior após nova versão. |
| AF-036 | 247 | Gerar kits por critérios | I · E05/E03 | F06 | Receita válida, bairro residencial atual, vínculo programático com vigência e seleção de pacientes; origem preservada e revalidada na retirada. Testes de elegibilidade/encerramento e formulário. |
| AF-037 | 247 | Não retirada do kit | I · E05 | F06 | Estado NOT_COLLECTED exige motivo, data e usuário em evento; transição e ausência de baixa testadas. |
| AF-038 | 247 | Retorno de kits ao estoque | I · E05 | F06 | Retorno recompõe apenas movimentos existentes e receitas; repetição não aumenta saldo; não retirado sem baixa não gera entrada. Cenários testados. |
| AF-039 | 247 | Código de barras do receituário | P · E03/E05/E11 | F06 | Código persistido/Code39 emitido e busca sem distinção de caixa no gestor; conferir leitura do PDF/código contra uma receita emitida. |
| AF-040 | 247 | Receitas selecionadas pelo paciente | I · E05 | F06 | Gestor filtra paciente, organiza itens/saldos ativos e permite dispensar a origem; limite/recomposição testados. |
| AF-041 | 247 | Dispensação manual por lote/quantidade | I · E05 | F06 | Serviço sem item de prescrição obrigatório, com paciente/produto/lote/quantidade e movimento; persistência testada e formulário conferido. |
| AF-042 | 247 | Prescritor obrigatório em receita especial | I · E03/E05 | F06 | Tipo especial/controlado exige prescritor na operação manual; controlado não usa receita simples. Regras e identificação do prescritor testadas. |
| AF-043 | 247 | Estoque do produto em outras unidades | P · E05 | F06 | Consulta contextual de todas as unidades com saldo permitido ao perfil. |
| AF-044 | 247 | Declaração de recebimento | P · E05/E11 | F06 | Origem/retirante/vínculo/medicamento/quantidade/lote/data/unidade no emissor; linhas de recibo testadas e cancelada recusada. Conferir PDF final. |
| AF-045 | 247 | Gerenciador de dispensações | I · E05/E11 | F06 | `/saude/farmacia/dispensacoes`, filtros combinados, 20 registros por página, detalhe/histórico; gestor e formulário conferidos no browser. |
| AF-046 | 247 | Retirada por outra pessoa | I · E01/E05 | F06 | Retirante usa `Person`; vínculo obrigatório quando diferente do paciente. Persistência e inclusão na declaração testadas. |
| AF-047 | 248 | Dispensação por tipo de receita | I · E03/E05 | F06 | Tipos simples/especial/controlado/manipulado preservados; prescritor obrigatório e bloqueio de controlado como simples testados. |
| AF-048 | 248 | Editar/excluir dispensação | I · E05 | F06 | Correção/cancelamento transacionais com estorno compartilhado, histórico e recomposição da receita. Replay e rollback de correção inválida testados. |
| AF-049 | 248 | Integração BNAFAR | E · E05/E10 | F12 | Conector específico com transmissão e retorno, não substituído por Hórus/SIGAF. |
| AF-050 | 248 | Equivalência de unidades CATMAT | P · E05/E10 | F06/F12 | Mapeamento versionado por referência e conversão de quantidade testados (`pharmacyQuantityInOfficialUnits`); consumo no adaptador BNAFAR permanece em F12. |
| AF-051 | 248 | Ambiente/endereço/credenciais BNAFAR | E · E10 | F12 | Configuração por destino/ambiente e operação da conexão. |
| AF-052 | 248 | Envio automático de entradas/posição | E · E05/E10 | F12 | Agendar/acionar quando integração ativa e registrar retorno por remessa. |
| AF-053 | 248 | Componentes farmacêuticos | E · E05/E10 | F06/F12 | Básico/Especializado/Estratégico classificados e transmitidos. |
| AF-054 | 248 | Resultado detalhado BNAFAR | E · E10 | F12 | Mensagem, protocolo, inconsistências e sucessos originados no receptor. |
| AF-055 | 248 | Consulta de envios BNAFAR | E · E10 | F12 | Histórico/situação por WebService e acesso ao retorno correspondente. |
| AF-056 | 248 | Situação visual das exportações | P · E10 | F12 | Estados de geração/envio/resultado aplicados especificamente às remessas BNAFAR. |
| AF-057 | 248 | Chamada da Farmácia | I · E04/E05 | F03/F06 | `/saude/farmacia/chamadas` utiliza painel F03, mensagem/notícias/setor e pedido do paciente; mensagem, origem e escopo testados. |

## 6. Central de Regulação — CR — 82 itens

| ID | Página | Requisito sintetizado | Situação / base | Fase | Fechamento necessário |
|---|---:|---|---|---|---|
| CR-001 | 249 | Agenda por unidade/procedimento | P · E04/E08 | F03 | Procedimentos agendáveis por unidade com vagas/local. |
| CR-002 | 249 | Agenda do profissional completa | P · E04/E08 | F03 | Prestadora/convênio/local/horário/dias e vínculo profissional. |
| CR-003 | 249 | Convênio compatível com especialidade | N · E02/E04/E08 | F01/F03 | Somente convênios que cobrem a especialidade podem ser vinculados; cobertura preparada em F01. |
| CR-004 | 249 | Agenda por especialidade sem profissional | I · E04 | F03 | Conferir criação/consulta/disponibilidade sem profissional vinculado. |
| CR-005 | 249 | Vigência da agenda | N · E04 | F03 | Data inicial/final aplicada à disponibilidade e agendamento. |
| CR-006 | 249 | Restrição por sexo/idade | N · E04 | F03 | Faixas/sexo configurados e verificados ao agendar. |
| CR-007 | 249 | Cadastro de feriados | P · E04 | F03 | Reaproveitar calendário e exposição no gerenciamento de Saúde. |
| CR-008 | 249 | Agenda aberta em feriado | N · E04 | F03 | Exceção configurável ao bloqueio global atual. |
| CR-009 | 249 | Local distinto da prestadora | N · E04/E02 | F03 | Dois vínculos distintos no cadastro e comprovante. |
| CR-010 | 249 | Liberar vaga por ausência | P · E04 | F03 | Vaga volta à disponibilidade quando marcada falta, conforme configuração. |
| CR-011 | 249 | Comprovante com horário marcado/fixo | P · E04/E11 | F03 | Parâmetro de agenda aplicado à emissão/reimpressão. |
| CR-012 | 250 | Confirmação de presença parametrizada | P · E04 | F03 | Exigir ou dispensar confirmação por agenda. |
| CR-013 | 250 | Agendas por vínculos do profissional | P · E02/E04 | F03 | Múltiplas agendas associadas ao vínculo correto. |
| CR-014 | 250 | Bloqueio por período | P · E04 | F03 | Intervalos bloqueados, não apenas estado de bloqueio do cronograma inteiro. |
| CR-015 | 250 | Encaminhamento automático por especialidade | P · E03/E08 | F03 | Automatismo existe para encaminhamento; parametrizar quais especialidades o utilizam. |
| CR-016 | 250 | Cotas de consultas | I · E08 | F03 | Conferir cota por consulta/especialidade, período e responsável. |
| CR-017 | 250 | Cotas de procedimentos | I · E08 | F03 | Conferir procedimento e aplicação no agendamento correspondente. |
| CR-018 | 250 | Consulta de consumo de cotas | P · E08 | F03 | Abrir solicitações/agendamentos que consumiram cada cota. |
| CR-019 | 250 | Cotas por quantidade | I · E08 | F03 | Conferir total/reservado/realizado e saldo consistente. |
| CR-020 | 250 | Total e distribuição por solicitante | P · E08 | F03 | Cota total com distribuição por unidades solicitantes. |
| CR-021 | 250 | Saldo visível e bloqueio ao esgotar | P · E08/E04 | F03 | Integrar cota ao agendamento; repetição/cancelamento não deixa saldo incorreto. |
| CR-022 | 250–251 | Consulta de agendamentos e filtros | P · E04/E08 | F03 | Data/prestadora/solicitante/profissional/paciente/convênio/especialidade combináveis. |
| CR-023 | 251 | Consulta por convênio/prestadora/especialidade | P · E04/E08 | F01/F03 | Campos ligados às coberturas estabelecidas em F01 e criação da consulta. |
| CR-024 | 251 | Profissionais disponíveis | P · E02/E04 | F03 | Filtrar vínculo/agenda/especialidade/convênio para a escolha. |
| CR-025 | 251 | Datas/horários disponíveis | P · E04 | F03 | Exibir horários válidos calculados, não somente total de vagas. |
| CR-026 | 251 | Exclusão de agendamento | P · E04 | F03 | Ação de remoção com liberação de vaga/cota e preservação do evento histórico. |
| CR-027 | 251 | Atualizar CPF/CNS/celular ao agendar | N · E01/E04 | F03 | Atualização contextual do cadastro comum com validação. |
| CR-028 | 251 | Comprovante imediato/reimpressão | P · E04/E11 | F03 | Emitir após inclusão e reabrir depois pelo agendamento. |
| CR-029 | 251 | Transferir data/horário | I · E04 | F03 | Conferir destino/agenda válida e devolução/consumo de vagas/cotas. |
| CR-030 | 251 | Procedimentos agendados e filtros | P · E04/E08 | F03 | Data/prestadora/solicitante/procedimento/paciente/convênio combináveis. |
| CR-031 | 251 | Procedimento por convênio/prestadora/local | P · E04/E08 | F01/F03 | Agendamento ligado ao pedido/cobertura/local; cobertura disponível desde F01. |
| CR-032 | 251 | Busca de procedimento | P · E02/E04 | F03 | Pesquisa do catálogo no fluxo de agendamento de procedimento. |
| CR-033 | 252 | Indicativo visual de cota disponível | P · E08/E04 | F03 | Situação/saldo no momento de selecionar e confirmar. |
| CR-034 | 252 | Agendamento pela requisição | P · E03/E08/E04 | F03 | Vincular agendamento à requisição existente, sem gerar pedido duplicado. |
| CR-035 | 252 | Profissional solicitante | P · E03/E08 | F03 | Registrar solicitante no procedimento, distinto do executor. |
| CR-036 | 252 | Comprovante de procedimento | P · E11/E04 | F03 | Documento com procedimento/prestadora/local/paciente/dados de agenda. |
| CR-037 | 252 | Exclusão de procedimento agendado | P · E04/E08 | F03 | Liberar vaga/cota e manter histórico do pedido. |
| CR-038 | 252 | Confirmar presença | I · E04 | F03 | Conferir consulta/procedimento e integração com início do atendimento. |
| CR-039 | 252 | Gerenciador de regulação de consultas | I · E08 | F03 | Conferir filtro/tipo e execução completa da análise de consultas. |
| CR-040 | 252 | Gerenciador de regulação de procedimentos | I · E08 | F03 | Conferir filtro/tipo e análise vinculada ao procedimento solicitado. |
| CR-041 | 252 | Regulação administrativa parametrizada | N · E08 | F03 | Etapa administrativa e configuração de exigência por fluxo. |
| CR-042 | 252 | Regulação técnica parametrizada | N · E08 | F03 | Etapa técnica e configuração de exigência, com profissional responsável. |
| CR-043 | 252 | Complementação da regulação | P · E08 | F03 | Solicitar/gravar complementos e histórico da informação adicionada. |
| CR-044 | 252 | Linha do tempo da regulação | P · E08/E11 | F03 | Exibir eventos/etapas/pareceres do mesmo pedido em ordem cronológica. |
| CR-045 | 252 | Prioridade/parecer/motivo | P · E08 | F03 | Dados em cada decisão, com vocabulário consistente. |
| CR-046 | 253 | Anexos na regulação | I · E08/E11 | F03 | Conferir upload/consulta GED pelo pedido e acesso de unidade. |
| CR-047 | 253 | Aprovação aloca na espera | N · E08/E04 | F03 | Criar/vincular entrada de espera automaticamente ao aprovar. |
| CR-048 | 253 | Contato telefônico do pedido | N · E08 | F03 | Histórico de ligações e resultado, não somente campo `contactPhone`. |
| CR-049 | 253 | Espera de consultas | I · E04/E08 | F03 | Conferir lista e ligação ao pedido/regulação. |
| CR-050 | 253 | Espera de procedimentos | P · E04/E08 | F03 | Tipo/procedimento/pedido e gestor com situações próprias. |
| CR-051 | 253 | Filtrar esperas liberadas | P · E04/E08 | F03 | Situação refletida na elegibilidade ao agendamento. |
| CR-052 | 253 | Agendar pela espera | I · E04 | F03 | Conferir criação de agenda e vínculo de retorno à entrada/pedido. |
| CR-053 | 253 | Regulação pela espera | P · E08/E04 | F03 | Abrir a análise original da entrada sem busca manual. |
| CR-054 | 253 | Aviso de agendamento por e-mail | N · E04/E10 | F03 | Enviar se cidadão tem e-mail; vincular resultado do envio ao agendamento. |
| CR-055 | 253 | Requisição de exame pela espera | P · E03/E08/E11 | F03 | Impressão da requisição de origem pelo registro de procedimento. |
| CR-056 | 253 | Espera de programas de saúde | N · E04/E07 | F03 | Gestor de programa/paciente/situação de vaga. |
| CR-057 | 253 | Inclusão programa/paciente/urgência | N · E04/E07 | F03 | Campos exigidos e data/autoria do ingresso na espera. |
| CR-058 | 254 | Tipo/marca/veículo | P · E09 | F08 | Reutilizar cadastro de Frotas e expor seleção na Saúde. |
| CR-059 | 254 | Rotas | P · E09 | F08 | Reutilizar estrutura de rotas existente quando adequada e vincular ao transporte. |
| CR-060 | 254 | Locais | P · E09/E04 | F08 | Locais de transporte/embarque/destino; destino clínico em texto é somente base. |
| CR-061 | 254 | Viagem completa | P · E09 | F08 | Motivo/origem/destino/veículo/motorista/auxiliar e gestão. |
| CR-062 | 254 | Adiantamento ao responsável da viagem | P · E09 | F08 | Vínculo ao adiantamento RH deferido do responsável e snapshot do valor autorizado; pagamento/prestação permanecem na origem RH/Financeiro. Conferir concessão financeira real. |
| CR-063 | 254 | Integrantes pela viagem | I · E09 | F08 | Conferir seleção de pacientes/acompanhantes e capacidade. |
| CR-064 | 254 | Confirmação da viagem | P · E09 | F08 | Ação/estado explícito de confirmação antes da execução. |
| CR-065 | 254 | Relação de passageiros | I · E09/E11 | F08 | Conferir listagem impressa da viagem selecionada. |
| CR-066 | 254 | Ordem de tráfego | P · E09/E11 | F08 | PDF próprio da viagem com veículo/condutor/auxiliar/responsável/origem/destino/agenda/manifesto e eventos; conferir impressão operacional. |
| CR-067 | 254 | Gerenciador de transportes | P · E09 | F08 | Consultar/organizar agendamentos vinculados a rotas/viagens/pacientes. |
| CR-068 | 254 | Rotas disponíveis pelo destino | P · E09 | F08 | Gestor filtra agendas reais de Frotas pelas rotas do destino selecionado e repartição autorizada; conferir interface com agenda operacional. |
| CR-069 | 254 | Pacientes ocupantes | I · E09 | F08 | Conferir seleção e ocupação sem duplicidade/capacidade excedida. |
| CR-070 | 254 | Local de embarque individual | P · E09 | F08 | Local por ocupante persistido, presente na viagem e ordem de tráfego; conferência visual/documental pendente. |
| CR-071 | 254 | Histórico de faltas em viagens | P · E09 | F08 | Presença/falta com autoria e eventos; gestor consulta anteriores dos integrantes no escopo autorizado. Conferir novo agendamento e impressão. |
| CR-072 | 255 | Acompanhantes e organização de vagas | P · E09 | F08 | Necessidade e vagas para acompanhante explicitamente contabilizadas. |
| CR-073 | 255 | Laudo TFD detalhado | P · E09/E03 | F08 | Paciente/diagnóstico/tratamento/necessidade de transporte; pedido simples não basta. |
| CR-074 | 255 | Laudo TFD automático/reimpressão | P · E09/E11 | F08 | Laudo clínico após inclusão; relatório atual de viagem não o substitui. |
| CR-075 | 255 | Complementos do laudo TFD | P · E09 | F08 | Complementos imutáveis ligados à versão, com data/hora/usuário e conteúdo no PDF e processo; conferir interface/documento operacional. |
| CR-076 | 255 | Situações do laudo TFD | P · E09 | F08 | Aprovação/glosa/arquivo/alteração/negação com eventos automáticos. |
| CR-077 | 255 | Autorização após aprovação | P · E09 | F08 | Separar aprovação/autorização e registrar usuário autorizador. |
| CR-078 | 255 | Pedido TFD autorizado/cancelamento | P · E09/E11 | F08 | Imprimir pedido de tratamento, permitir cancelamento e manter histórico. |
| CR-079 | 255 | Transporte após autorização | P · E09 | F08 | Liberação e direcionamento contextual ao gestor de transporte. |
| CR-080 | 255 | Trâmites TFD do paciente | P · E09/E11 | F08 | Linha do tempo persistida de inclusão, revisões, decisões, autorização, benefícios e complementos; conferir consulta por paciente e documentos. |
| CR-081 | 255 | Relatórios detalhados TFD | P · E09/E11 | F08 | Unidade solicitante/destino/procedimento/profissional e dados dos laudos/processos. |
| CR-082 | 255 | Benefícios ao paciente | P · E09/E12 | F08 | Cadastro/autorização/entrega vinculados ao processo e versão do laudo, recebedor Person e referência de comprovante; concorrência/replay testados. Conferência operacional pendente. |

## Fechamento da matriz

São 42 GS + 43 GF + 41 AP + 74 AS + 57 AF + 82 CR = **339 linhas normativas**, sem numeração global artificial. O atendimento de um requisito que utiliza outra fase depende da conclusão de todas as fases indicadas.

Ao executar o plano, atualizar a situação com a evidência operacional de cada item. Manter referência às bases reaproveitadas e às tabelas novas efetivamente criadas. A mera conclusão das fases internas não encerra os itens que exigem formato, transmissão ou retorno externo.
