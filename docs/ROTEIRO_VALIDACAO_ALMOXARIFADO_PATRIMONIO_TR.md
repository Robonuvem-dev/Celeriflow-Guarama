# Roteiro Interno de Validação de Almoxarifado e Patrimônio

## 1. Finalidade

Este documento interno organiza a avaliação, os testes, a POC e as simulações dos 71 requisitos do Termo de Referência, requisitos de Almoxarifado e Patrimônio das páginas 58 a 65. Ele não define nomenclatura, identificação visual ou textos da interface do produto.

A numeração das listas serve apenas para controlar a execução deste roteiro e não representa códigos do sistema.

## 2. Registro da execução

| Campo | Preenchimento |
|---|---|
| Ambiente e versão |  |
| Data e horário |  |
| Órgão ou entidade |  |
| Responsável pela execução |  |
| Responsável pelo aceite |  |
| Banco ou conjunto de dados |  |
| Integrações habilitadas |  |
| Restrições ou ressalvas |  |

Para cada item, preencher **Resultado/observação** com `Aprovado`, `Reprovado`, `Bloqueado` ou `Não aplicável`, seguido de identificadores, divergências e providências. Anexar capturas, documentos, arquivos, consultas de conciliação e registros de auditoria quando forem relevantes.

## 3. Regras de massa

- Usar nomes realistas de materiais, equipamentos, servidores e estruturas municipais.
- Não usar sufixos `teste`, `fake` ou `mock`, nem numeração artificial em nomes e descrições.
- Não usar dados pessoais reais; pessoas fictícias devem ter nomes plausíveis e CPF, telefone, e-mail e endereço reservados ao ambiente de validação ou tecnicamente mascarados.
- Usar exemplos municipais plausíveis, como `Lâmpada fluorescente 40 W`, `Papel sulfite A4 75 g/m²`, `Cimento Portland CP II 50 kg`, `Paço Municipal`, `Secretaria Municipal de Administração` e `Almoxarifado Central`.
- Distinguir Executivo e Câmara com estruturas institucionais plausíveis, sem inserir rótulos artificiais nos nomes operacionais.
- Manter datas, quantidades, custos, contas, documentos e competências coerentes entre compras, estoque, patrimônio e contabilidade.
- Identificar e remover de forma controlada os registros transitórios antes da entrada em produção, sem apagar trilhas que devam ser preservadas.

## 4. Pré-condições

- Ambiente isolado, versão registrada, cópia de segurança disponível e restauração verificada.
- Executivo e Câmara cadastrados com unidades, departamentos, centros de custo e localizações próprios.
- Cadastro Único disponível ou conjunto temporário autorizado de pessoas, servidores, usuários, perfis, departamentos, unidades administrativas e fornecedores.
- Almoxarifados central e setorial, catálogo de materiais, unidades, frações, lotes, limites e saldos coerentes.
- Taxonomia patrimonial, PCASP, parâmetros de cálculo, tombamento, documentos e alçadas homologados.
- Compras e recebimentos aprovados disponíveis para entradas de material e incorporações.
- GED, geração de PDF, exportações, filas e observabilidade disponíveis.
- Horário, moeda, precisão decimal, exercício e competências configurados.
- Nenhum usuário deve acumular papéis incompatíveis no mesmo cenário, salvo verificação explícita de bloqueio.

## 5. Perfis necessários

| Perfil | Uso no roteiro |
|---|---|
| Solicitante | Criar e acompanhar requisição. |
| Aprovador de requisição | Aprovar ou recusar sem autoaprovação. |
| Almoxarife | Receber, entregar, devolver e transferir. |
| Inventariante de estoque | Contar e submeter inventário. |
| Gestor de almoxarifado | Autorizar perdas, ajustes e fechamento. |
| Responsável patrimonial | Incorporar, etiquetar, transferir e manter bens. |
| Comissão patrimonial | Executar inventário patrimonial. |
| Avaliador | Registrar reavaliação e redução ao valor recuperável. |
| Autoridade de baixa | Autorizar ou recusar baixa. |
| Contabilidade | Conciliar parâmetros e eventos contábeis. |
| Auditor ou consulta | Conferir registros, documentos e relatórios sem alterar dados. |
| Administrador de entidade | Configurar perfis e parâmetros apenas da entidade permitida. |

## 6. Integrações que exigem credenciais ou autorização

| Integração | Credencial ou autorização necessária | Registro esperado |
|---|---|---|
| Compras e recebimento | Usuário técnico e acesso às aquisições homologadas | Origem, item, documento e recebimento correlacionados. |
| Orçamento | Acesso a dotação, elemento e subelemento | Classificação preservada na movimentação. |
| Contabilidade | Credencial de integração e contas PCASP homologadas | Protocolo, lançamento ou pendência reprocessável. |
| Financeiro | Autorização para custos, indenizações e pagamentos aplicáveis | Vínculo e conciliação financeira. |
| GED e assinatura | Credencial, política de retenção e modelo de assinatura aprovados | Documento versionado, hash e participantes. |
| Frota | Acesso autorizado quando o bem também for veículo | Identificador comum e custos conciliados. |
| TCE | Certificado, usuário, leiaute vigente e autorização de envio | Validação, protocolo, recibo e retorno. |

Quando a credencial externa não estiver disponível, registrar o item como `Bloqueado`; não fabricar retorno, protocolo ou lançamento.

## 7. Checklist de Almoxarifado

Dados prévios comuns: entidades Executivo e Câmara; `Almoxarifado Central` e `Almoxarifado da Secretaria Municipal de Obras`; materiais `Lâmpada fluorescente 40 W`, `Papel sulfite A4 75 g/m²` e `Cimento Portland CP II 50 kg`; solicitante, aprovador, almoxarife e gestor distintos; compra e recebimento aprovados; lotes, custos e saldos conciliados.

| Nº | Requisito | Dados prévios e ação | Resultado esperado | Resultado/observação |
|---:|---|---|---|---|
| 1 | Permitir um ou mais almoxarifados | Consultar e operar os dois almoxarifados da entidade. | Cadastros e estoques permanecem independentes e restritos à entidade. |  |
| 2 | Permitir almoxarifado central | Configurar e consultar o `Almoxarifado Central`. | O tipo central segue a regra municipal e se relaciona corretamente aos setoriais. |  |
| 3 | Cadastrar grupo e material com unidade e fração | Cadastrar papel por resma e combustível por litro com fração autorizada. | Grupo, unidade e precisão são preservados nas movimentações. |  |
| 4 | Controlar dotação, elemento e subelemento | Receber item de compra com classificação orçamentária completa. | Classificação aparece no razão, documento e relatório sem divergência da origem. |  |
| 5 | Calcular custo médio | Registrar entradas do mesmo material com quantidades e custos distintos. | Custo médio ponderado e saldos anterior e posterior conferem na precisão homologada. |  |
| 6 | Disponibilizar solicitação online | Criar requisição autenticada para a Secretaria Municipal de Administração. | Solicitação recebe número, escopo, itens e acompanhamento pelo solicitante. |  |
| 7 | Controlar limites mínimo e máximo | Configurar limites do papel e movimentar o saldo abaixo do mínimo. | Política é específica do almoxarifado e gera alerta coerente. |  |
| 8 | Bloquear saída sem saldo | Solicitar saída superior ao disponível e executar saídas concorrentes. | Todas as operações que excedem o disponível são recusadas e o saldo não fica negativo. |  |
| 9 | Realizar inventário | Abrir campanha, contar divergência, submeter, autorizar e encerrar. | Posição é congelada, funções são segregadas e ajustes conciliam com o fechamento. |  |
| 10 | Registrar entrada por compra | Processar o recebimento aprovado do papel duas vezes. | Uma única entrada é registrada e permanece vinculada à compra, ao recebimento e ao documento. |  |
| 11 | Registrar entrada por devolução | Devolver parcialmente material entregue por requisição. | Entrada respeita quantidade e custo da saída original e registra motivo e documento. |  |
| 12 | Registrar saída por requisição | Atender item aprovado a partir do almoxarifado correto. | Saída referencia requisição, item, solicitante, departamento, entregador e recebedor. |  |
| 13 | Registrar saída por transferência | Despachar material do central e aceitar no almoxarifado de Obras. | Origem, trânsito e destino conciliam; o destino aumenta somente após o aceite. |  |
| 14 | Registrar saída por perda | Registrar perda de lâmpadas danificadas com autorização. | Ocorrência, autorização, saída, anexos e efeito contábil ficam correlacionados. |  |
| 15 | Estornar entrada e saída | Solicitar estorno autorizado de movimentos válidos. | Eventos compensatórios corrigem saldo e valor sem apagar nem duplicar o original. |  |
| 16 | Requisitar por usuário, unidade e departamento | Criar requisição na unidade permitida e tentar referenciar unidade da outra entidade. | Vínculos válidos são aceitos e referências cruzadas são recusadas. |  |
| 17 | Autorizar requisição | Tentar autoaprovação e depois aprovar com usuário autorizado. | Autoaprovação é bloqueada; decisão válida registra aprovador, data e quantidades. |  |
| 18 | Atender requisição parcialmente | Entregar o papel em duas etapas. | Estado e quantidades evoluem sem exceder o aprovado nem duplicar movimentos. |  |
| 19 | Baixar estoque automaticamente no atendimento | Concluir uma entrega autorizada. | Movimento, saldo e estado da requisição mudam atomicamente e conciliam. |  |
| 20 | Emitir comprovante da requisição | Concluir atendimento e emitir o comprovante. | PDF numerado contém itens, participantes, datas, aceite, versão e hash. |  |
| 21 | Relatório de movimentação | Emitir PDF, CSV e XLSX por período, material e almoxarifado. | Filtros e totais coincidem entre formatos e com o razão. |  |
| 22 | Relatório de consumo por centro de custo | Consumir materiais em dois centros de custo e consolidar o período. | Quantidades e valores são atribuídos e totalizados no centro correto. |  |
| 23 | Relatório de posição física e financeira | Emitir posição em data-base fechada. | Quantidades, custo médio e valor total coincidem com posições e razão. |  |
| 24 | Relatório de sugestão de compras | Manter saldos, limites, consumo e pedidos em aberto conhecidos. | Sugestão explica o cálculo e não recomenda quantidade já coberta por pedido ou estoque. |  |
| 25 | Relatório de materiais sem movimentação | Informar período de inatividade e filtrar grupo e almoxarifado. | Apenas materiais sem movimento no período aparecem, com quantidade e valor imobilizado corretos. |  |

## 8. Checklist de Patrimônio

Dados prévios comuns: Executivo e Câmara segregados; `Paço Municipal`, `Secretaria Municipal de Administração` e `Departamento de Tecnologia da Informação`; responsáveis fictícios plausíveis; `Notebook corporativo 14 polegadas`, `Veículo utilitário leve` e `Prédio administrativo municipal`; compra recebida; taxonomia, PCASP, parâmetros, comissão, GED e perfis autorizados.

| Nº | Requisito | Dados prévios e ação | Resultado esperado | Resultado/observação |
|---:|---|---|---|---|
| 1 | Controlar unidade gestora, órgão, unidade orçamentária e localização | Cadastrar e consultar bem na hierarquia do Executivo e tentar acesso pela Câmara. | Hierarquia é válida e o acesso cruzado é bloqueado em tela, API e exportação. |  |
| 2 | Cadastrar responsáveis | Atribuir e trocar responsável usando servidor do Cadastro Único. | Responsável ativo e entidade são validados e o histórico é preservado. |  |
| 3 | Cadastrar tipo, natureza, grupo, subgrupo, espécie e situação | Classificar notebook e prédio na taxonomia homologada. | Todos os níveis e a situação válida ficam registrados com versão e vigência. |  |
| 4 | Controlar bens móveis e imóveis | Cadastrar notebook e prédio com seus dados próprios. | Campos e regras obrigatórios variam corretamente conforme a natureza. |  |
| 5 | Incorporar por compra, doação, permuta, produção própria e outros | Incorporar bens por cada origem autorizada com documentos adequados. | Origem, avaliação, autorização, contabilização e documentos são rastreáveis. |  |
| 6 | Classificar contabilmente pelo PCASP | Incorporar bem de classe ligada a conta vigente. | Conta correta é exigida, registrada e rejeitada quando incompatível ou fora de vigência. |  |
| 7 | Tombar por numeração sequencial, automática ou manual | Gerar tombamento automático e informar número manual com permissão. | Sequência respeita entidade e exercício; duplicidade e uso manual não autorizado são bloqueados. |  |
| 8 | Gerar mais de um bem por incorporação | Incorporar lote de notebooks de uma compra recebida. | Cada unidade recebe bem e tombamento próprios, sem duplicidade em reexecução. |  |
| 9 | Identificar por etiqueta com código de barras ou QR Code | Gerar etiqueta e ler seu código. | Código identifica unicamente o bem autorizado e mantém tombamento legível. |  |
| 10 | Imprimir e reimprimir etiquetas | Imprimir lote e reimprimir uma etiqueta com justificativa. | Formato homologado é respeitado e reimpressão registra usuário, data e motivo. |  |
| 11 | Transferir bens individualmente e em lote | Transferir um notebook e depois um conjunto homogêneo. | Cada bem possui resultado, histórico e consistência transacional definida. |  |
| 12 | Transferir entre locais e responsáveis | Alterar local, responsável e ambos em operações sucessivas. | Estado atual e histórico cronológico refletem exatamente cada alteração. |  |
| 13 | Emitir termo de transferência | Concluir transferência com aceite. | Termo numerado contém partes, bens, motivo, assinaturas, versão e hash. |  |
| 14 | Controlar cessão, concessão, arrendamento e comodato | Registrar cada modalidade com contraparte, instrumento, vigência e bens. | Custódia, condições, documentos e situação permanecem vinculados e consultáveis. |  |
| 15 | Controlar prazo das concessões | Criar concessão próxima do vencimento, prorrogar e vencer outra. | Agenda, alertas, prorrogação, vencimento e bloqueios seguem a configuração. |  |
| 16 | Registrar retorno de concessões | Devolver parte dos bens com vistoria e divergência. | Retorno parcial, conservação, divergência, custódia e termo são registrados. |  |
| 17 | Baixar por alienação, doação, perda, furto, inutilização e outros | Solicitar baixa por cada motivo com documentos exigidos. | Catálogo, obrigatoriedades e efeitos contábeis variam corretamente por motivo. |  |
| 18 | Autorizar baixa | Tentar autoaprovação e autorizar com autoridade dentro da alçada. | Autoaprovação e alçada insuficiente são bloqueadas; decisão válida é auditada. |  |
| 19 | Emitir termo de baixa | Executar baixa autorizada e emitir termo. | Termo numerado contém autorização, motivo, valores, bens, anexos, assinaturas e hash. |  |
| 20 | Registrar reavaliação | Aplicar laudo com novo valor ao notebook. | Abertura, ajuste e fechamento conferem e permanecem ligados ao laudo. |  |
| 21 | Registrar redução ao valor recuperável | Registrar redução suportada por análise autorizada. | Sistema aceita apenas redução válida e recalcula prospectivamente o valor depreciável. |  |
| 22 | Calcular depreciação, amortização e exaustão | Processar ativos aplicáveis a cada tratamento. | Método, vida útil, taxa, residual e competência produzem valores corretos por natureza. |  |
| 23 | Parametrizar cálculo por classe e conta | Alterar parâmetro com nova vigência e manter bem anterior. | Nova vigência afeta somente períodos aplicáveis e o cálculo histórico não muda. |  |
| 24 | Executar cálculo mensal | Processar e reprocessar a mesma competência. | Um único resultado por bem é mantido, com fechamento e conciliação. |  |
| 25 | Contabilizar depreciação | Enviar competência calculada à contabilidade e repetir o envio. | Débito, crédito e valor conferem e não há lançamento duplicado. |  |
| 26 | Realizar inventário patrimonial por local e responsável | Abrir campanha no Paço Municipal e realizar coleta. | Escopo e posição são congelados e resultados conciliam por local e responsável. |  |
| 27 | Cadastrar comissão de inventário | Vincular portaria, membros, papéis, vigência e assinaturas. | Composição e impedimentos são validados antes da abertura da campanha. |  |
| 28 | Bloquear movimentação durante inventário | Tentar transferir bem dentro do escopo e autorizar exceção justificada. | Operação comum é bloqueada; exceção autorizada é destacada e auditada. |  |
| 29 | Coletar por leitor, código de barras ou QR Code | Ler etiquetas online, offline e repetir uma leitura. | Coleta sincroniza sem duplicar contagem e mantém autoria e horário. |  |
| 30 | Tratar sobras, faltas, localização e estado divergentes | Registrar um caso plausível de cada divergência. | Cada tipo exige dados, anexos e encaminhamento compatíveis. |  |
| 31 | Efetuar ajustes após inventário | Aprovar saneamento e encerrar campanha. | Eventos mostram antes e depois, autorização e vínculo com a divergência e a campanha. |  |
| 32 | Controlar manutenção preventiva e corretiva | Agendar preventiva e abrir corretiva para o veículo. | Plano, ordem, tipo, autorização, documentos e indisponibilidade são controlados. |  |
| 33 | Controlar custos de manutenção | Registrar peças e serviço e consolidar por bem e período. | Custos totalizam corretamente e conciliam com financeiro e contabilidade. |  |
| 34 | Controlar seguros e apólices | Cadastrar apólice com veículo, cobertura, prêmio e vigência. | Documentos, rateio, bens, cobertura e alertas são consistentes. |  |
| 35 | Controlar sinistros e indenizações | Registrar sinistro, aviso, regulação e indenização do veículo. | Eventos ligam bem, apólice, documentos, financeiro e eventual baixa. |  |
| 36 | Controlar garantia | Incorporar notebook com garantia e solicitar manutenção onerosa durante a vigência. | Garantia é herdada e o usuário recebe alerta antes da contratação. |  |
| 37 | Anexar documentos e imagens | Anexar arquivos ao bem e a eventos distintos e incluir nova versão. | Arquivos têm contexto, versão, autoria, integridade e controle de acesso. |  |
| 38 | Emitir termo de responsabilidade | Atribuir um lote de notebooks e colher aceite. | Termo individual ou coletivo é versionado e nova custódia substitui a anterior sem apagá-la. |  |
| 39 | Emitir termo de carga e descarga | Registrar carga e posterior descarga patrimonial. | Documento numerado contém bens, origem, destino, participantes e assinaturas. |  |
| 40 | Emitir relatório de ficha cadastral | Emitir ficha do notebook. | PDF reproduz cadastro, valores, documentos, custódia e histórico integral. |  |
| 41 | Emitir relatório por local e responsável | Emitir posição em data-base para o Paço Municipal. | Bens e totais coincidem com custódia e valores da data informada. |  |
| 42 | Emitir relatório de movimentações | Filtrar período, tipo, bem, local e responsável. | Eventos aparecem uma vez, em ordem, e conciliam com os históricos individuais. |  |
| 43 | Emitir relatório de incorporações e baixas | Emitir relatório mensal por origem e motivo. | Quantidades, valores e documentos coincidem com os eventos do período. |  |
| 44 | Emitir relatório de depreciação e reavaliação | Emitir memória mensal por classe e conta. | Saldos inicial, movimentos e saldo final conciliam com o histórico de valor. |  |
| 45 | Integrar com a contabilidade | Processar incorporação, cálculo, ajuste e baixa; simular indisponibilidade e retorno. | Todo o ciclo é idempotente, conciliável e reprocessável sem perda ou duplicidade. |  |
| 46 | Remeter dados ao TCE | Gerar, validar e enviar arquivo com credencial autorizada; corrigir rejeição quando houver. | Leiaute vigente é atendido e protocolo, recibo, retorno e reenvio ficam registrados. |  |

## 9. Roteiro por domínio

### 9.1 Almoxarifado

1. Validar entidade, perfis, almoxarifados, materiais, unidades, frações e políticas.
2. Receber compra aprovada e conciliar classificação, lote, custo médio, documento e razão.
3. Criar, autorizar e atender requisição parcial e integral com segregação de funções.
4. Executar devolução, transferência, perda e estorno, conciliando quantidade e valor.
5. Executar inventário completo, tratar divergência e validar bloqueios e aprovações.
6. Emitir comprovantes, relatórios e exportações e comparar os totais com o razão.
7. Repetir verificações de isolamento entre Executivo e Câmara por interface, API e arquivo.

### 9.2 Patrimônio

1. Validar hierarquia, taxonomia, PCASP, responsáveis, locais e parâmetros.
2. Incorporar bens por origens distintas, em unidade e lote, e validar tombamento e etiquetas.
3. Executar custódia, responsabilidade, transferência e modalidades temporárias com termos.
4. Registrar garantia, manutenção, seguro, sinistro, documentos e custos.
5. Processar depreciação, amortização, exaustão, reavaliação e redução ao valor recuperável.
6. Executar inventário patrimonial completo, incluindo coleta offline e quatro tipos de divergência.
7. Solicitar, autorizar e executar baixas por motivos distintos, com documentos e contabilização.
8. Emitir relatórios, conciliar o ciclo contábil e validar a remessa ao TCE.

## 10. Consolidação do resultado

| Domínio | Quantidade | Aprovados | Reprovados | Bloqueados | Não aplicáveis |
|---|---:|---:|---:|---:|---:|
| Almoxarifado | 25 |  |  |  |  |
| Patrimônio | 46 |  |  |  |  |
| **Total** | **71** |  |  |  |  |

Registrar ao final:

- divergências por requisito e severidade;
- responsável e prazo para correção;
- risco aceito e autoridade que o autorizou;
- itens que dependem de credencial, leiaute ou decisão externa;
- versão escolhida para nova execução;
- decisão final de aceite, aceite com ressalvas ou reprovação.
