# Frota — podemos demonstrar os 50 itens da POC?

> **Atualização:** os complementos dos itens 03, 07, 20 e 43 e o script de carga foram implementados posteriormente a esta análise. Consultas, catálogo com 416 enquadramentos, reexecução de carga e dossiê PDF passaram nos testes isolados; build aprovado. Roteiro/comandos/escopo estão em `FROTA_POC_ITENS_03_07_20_43_E_CARGA.md`. A matriz abaixo registra a situação anterior e a carga ainda precisa ser aplicada/ensaiada no ambiente da apresentação.

## Critério desta revisão

Fonte: checklist original, Gestão de Frota, páginas 66–70 do PDF em `docs/Termo de Referencia/`. Revisão em 13/10/2026, orientada à **demonstração funcional**, não à prontidão integral para implantação.

Um caminho demonstrável precisa permitir preencher a operação, confirmar, consultar o resultado e emitir o documento quando solicitado. Não exige integrações ou automatismos que o item não pediu. A análise conferiu formulários, consultas, ações e relatórios; não é registro de uma demonstração autenticada já realizada na banca.

### Conclusão

- **45 itens têm caminho funcional no código**, desde que os dados e acessos da apresentação sejam preparados.
- **3 itens têm demonstração parcial e merecem ajuste de funcionalidade/UI:** 03, 07 e 43.
- **1 item não permite check integral com os dados atuais:** 20, tabela com todos os tipos de infração CTB.
- **1 item exige ensaio operacional antes de prometer o check:** 11, upload/recuperação dos formatos exigidos.

**Isso não significa 45 checks já obtidos.** Na leitura do banco configurado, em `2026-10-13T22:55:35Z`, todos os cadastros e movimentos de Frota estavam vazios. Não havia unidades, condutores, apólices, contratos de combustível, componentes, multas, anexos ou catálogos. Também não havia estoque positivo em litros. A leitura foi executada em transação READ ONLY, sem inserir dados.

Blob está configurado nesse ambiente, mas presença de configuração não comprova que os 14 formatos já passaram pelo upload e download.

## Legenda

- **D — demonstrável com preparação:** existe um caminho funcional; cadastrar/selecionar os dados e ensaiar a operação.
- **P — parcial:** ainda não contaria como check positivo integral; realizar o ajuste indicado.
- **N — não demonstrável integralmente:** falta conteúdo obrigatório.
- **V — validar antes:** mecanismo existe; dependência operacional ainda precisa de ensaio.

## Matriz de demonstração

| Item | Requisito resumido | Estado | Como demonstrar / o que falta |
|---:|---|:---:|---|
| 01 | Cadastro completo de veículos | D | `/frotas`: placa, RENAVAM, marca/modelo/ano e Patrimônio; Gestão → Cadastro: aquisição, espécie, cor, combustível, tanque e centro; aba Seguros para apólice. Não precisa reunir todos em um único formulário para mostrar os campos. |
| 02 | Ocorrências/avarias | D | Gestão → Ocorrências/sinistros: criar AVARIA, confirmar e reabrir na consulta. |
| 03 | Controle dos débitos dos veículos | P | Há documentos de licenciamento/seguro com valor/vencimento/cumprimento e multas com parcelas/saldo, mas a consulta está fragmentada. Recomenda-se uma consulta de débitos por veículo com natureza, valor, vencimento, situação e saldo de multa; não apresentar cumprimento administrativo como pagamento financeiro. |
| 04 | Identificação/marca/troca de bateria | D | Cadastrar duas BATERIAS; instalar a primeira e trocar pela segunda na mesma posição. Consultar marca, datas de instalação/retirada e histórico. |
| 05 | Lançamento/emissão de autorização de abastecimento | D | Gestão → Autorizações de combustível: emitir, consultar e clicar Imprimir autorização. Preparar posto/contrato/saldo ou lote próprio. |
| 06 | Autorização de abastecimento e OS | D | Mostrar uma AA e a OS criada por autorização de serviço; emissão nas duas rotinas. |
| 07 | Agenda por veículo/departamento/motorista | P | Há agenda por unidade e motorista e escopo por repartição. Falta seleção explícita de departamento na consulta e identificação legível do departamento/motorista na listagem. Para o check integral, adicionar esse filtro/visualização; usuário de um setor não deve poder selecionar outro. |
| 08 | Pátio: entrada/saída, horário/km e posse | D | Gestão → Viagens/guarita: saída com condutor, consulta de viagem aberta, retorno e dois eventos. A posse é demonstrada pela viagem aberta. |
| 09 | Gastos de veículos/máquinas/equipamentos | D | `/frotas?area=gastos`: filtrar unidades das três categorias e mostrar gastos de origem/custos. |
| 10 | Integração com Patrimônio e reflexo de transferência | D | Vincular um bem real da base de demonstração; transferir seu setor em Patrimônio e reconsultar Frota. Exige acessos aos dois módulos e exemplo preparado. |
| 11 | Anexos png/bmp/jpg/gif/doc/docx/ppt/pptx/xls/xlsx/pdf/odt/ods/dwg | V | Gestão → Anexos: os 14 formatos constam da rotina. Ensaiar upload, associação e download com arquivos reais válidos de cada formato. Não usar apenas seleção no input como prova de armazenamento. |
| 12 | Autorização em branco ou já cadastrada | D | Links Autorização de abastecimento em branco e Imprimir autorização de uma AA. |
| 13 | Cadastro de autorização de serviço/abastecimento | D | Emitir AS e AA, consultar números/validade/origem e imprimir. |
| 14 | Despesa a partir da autorização de serviço | D | Emitir AS própria, iniciar sua OS na rotina original e concluir pela autorização. Mostrar o gasto único. Oficina externa também pode ser apresentada com envio/conferência. |
| 15 | Despesa referente a ordem de compra/dispensa/licitação | D | AS com vínculo a processo canônico de Compras, opcionalmente contrato; executar e mostrar as referências no gasto/dossiê. Preparar processos dos dois exemplos. Não precisa transmissão bancária para este item. |
| 16 | Troca de pneus com despesa automática | D | Cadastrar dois pneus; instalar e substituir na mesma posição; consultar retirada/instalação e gasto automático de cada instalação. |
| 17 | Manutenção própria/terceirizada e serviços variados | D | Revisão/OS com descrição de serviços, lubrificante/óleo nos consumos e pneus nos componentes. Demonstrar AS própria e AS terceirizada. |
| 18 | Vínculo de marca/modelo conforme FIPE | D | Importar uma edição/amostra identificada de **dados FIPE reais**, escolher um modelo e vincular veículo compatível. O item não pede toda a tabela FIPE nem consulta de preço online. Dados fictícios não comprovam “conforme FIPE”. |
| 19 | Obrigações de seguro/licenciamento | D | `/frotas?area=obrigacoes` e `?area=seguros`: cadastro, vencimento, consulta e providência registrada. |
| 20 | Tabela com todos os tipos de infração CTB | N | Há importação versionada e seletor pesquisável, mas **nenhum catálogo carregado**. O enunciado diz “todos”: carregar fonte integral conferida e disponibilizar consulta de seus registros; uma amostra de infrações não encerra o item. |
| 21 | Multas: cidade/CTB/motorista/vencimento | D | Gestão → CTB/multas: preencher campos e reconsultar. Requer previamente carregar infrações de origem real para a seleção. Pode mostrar o fluxo sem ainda encerrar a completude do item 20. |
| 22 | Consulta de multas | D | Consultar por unidade, condutor, cidade/auto, período e situação. |
| 23 | Registro de pagamento de multa | D | Anexar comprovante, selecionar GED e registrar parcela; consultar valor/data/total/saldo. Não exige executar pagamento bancário. |
| 24 | Deslocamento e planilhas | D | Saída/retorno com leituras; imprimir planilha preenchida e planilha de viagem em branco. |
| 25 | Agendamento de viagem/serviço/conserto | D | Gestão → Agenda: criar um registro VIAGEM, um SERVICO e um CONSERTO para a unidade. Integração automática a OS não é exigida pelo enunciado. |
| 26 | Rotas de veículos/máquinas e rotas fixas | D | `/frotas?area=rotas`: cadastrar percurso; Gestão → Cadastro: atribuir rota fixa; saída/agenda usa a rota. Repetir com máquina. |
| 27 | Consultas de manutenção/taxas previstas e realizadas | D | Mostrar planos previstos, OS/manutenções executadas e documentos de licenciamento/seguro obrigatório/facultativo. Não exige nova tela consolidada nem remessa contábil para este item. |
| 28 | Guarita registra e consulta entrada/saída | D | Gestão → Viagens/guarita: repetir entrada/saída com consulta e horários. |
| 29 | Seguro facultativo | D | Aba Seguros: tipo FACULTATIVO, seguradora, apólice, vigência e valor; reabrir. |
| 30 | Bloqueio por CNH ausente/vencida | D | Preparar servidor sem motorista/CNH e motorista com CNH vencida. Tentar utilização/saída; mostrar bloqueio. Comparar com condutor válido. |
| 31 | Motorista RH/terceirizado com dados CNH | D | Gestão → Motoristas/CNH: um servidor com pessoa canônica no RH e uma pessoa terceirizada; número/categorias/validade. |
| 32 | Controle de 20 pontos na saída | D | Configurar política limite 20/janela; preparar multas que somem 20 pontos não cancelados; tentar saída e mostrar bloqueio. Não precisa declarar que 20 é a legislação universal vigente. |
| 33 | Hodômetro/horímetro/sem marcador | D | Configurar três unidades; uso em km, uso em h e uso sem leitura. Consultar e imprimir para evidenciar a diferença. |
| 34 | Campos diferenciados/obrigatórios de máquinas | D | Configurar tipo de máquina, selecionar no cadastro e mostrar campos dinâmicos. Campo obrigatório vazio deve impedir envio; campo opcional pode ficar vazio. Editor do tipo usa JSON, mas funciona. |
| 35 | Visibilidade/manutenção só da repartição | D | Duas contas de setores diferentes; cada uma consulta seu conjunto e não altera unidade do outro setor. Não usar administrador como prova dessa restrição. |
| 36 | Frentista externo registra abastecimento | D | Emitir AA com posto/CNPJ/credencial; outra janela em `/portal/frota/atendimento`, confirmar litros/leitura; conferir consumo e gasto no ERP. |
| 37 | Destinos para veículos/máquinas | D | Gestão → Destinos: nome/cidade/endereço/distância/setor; usar seleção em agenda/saída das duas categorias. |
| 38 | Períodos de utilização/obrigações pela agenda | D | Agenda com início/fim, unidade veículo/máquina e tipo OBRIGACAO com finalidade. Ligação automática ao documento de seguro não foi pedida e não precisa ser desenvolvida só para esse check. |
| 39 | Combustível disponível proveniente de licitação | D | Gestão → Saldos contratuais: contrato/item/posto, contratado/reservado/consumido/disponível. Emitir AA e confirmar parcialmente; mostrar mudança do saldo. |
| 40 | Estoque próprio e despesa própria/terceiro | D | Criar combustível em L no Almoxarifado; autorização própria → confirmação → baixa real. Comparar com abastecimento externo e mostrar Origem no consumo/gasto. |
| 41 | Consulta de modelos de veículos | D | Gestão → Modelos FIPE: pesquisar/consultar edição previamente carregada. |
| 42 | Despesas agrupadas por setor/período/veículo/fornecedor | D | Emitir relatório integral/dossiê: seção de agrupamentos contém as quatro dimensões. Preparar unidades de dois setores, dois períodos e dois fornecedores; IDs nos agrupamentos são menos legíveis, mas existem. |
| 43 | Todas as informações de um/vários veículos e filtros | P | Dossiê reúne muitas operações e API aceita `unitIds`, mas a UI não seleciona um subconjunto de vários veículos. O cabeçalho não inclui toda a ficha básica (ex.: RENAVAM, marca/modelo/ano), nem dados completos de condutores. Completar ficha no dossiê e adicionar seleção multiveículo/filtros preservados antes de contar check integral. |
| 44 | Média e relatório alto/normal/baixo | D | Cadastro/marcadores calcula média por unidade e classificação; relatório da área inclui situação. Preparar três veículos com dois abastecimentos cada e consumos diferentes. Lançamentos avulsos antigos sem leitura não alimentam essa média: usar autorizações executadas. |
| 45 | Coordenadas na ocorrência | D | Ocorrência com latitude/longitude, consultar o par. O item não exige mapa navegável. |
| 46 | Sinistro originado da ocorrência | D | Criar ACIDENTE e abrir sinistro usando seu registro. |
| 47 | Responsabilidade própria/terceiro/outros | D | Campo Responsabilidade do sinistro tem as três opções; consultar resultado gravado. |
| 48 | Seguradora/apólice automática no sinistro | D | Preparar uma apólice vigente na data do acidente; abrir sinistro sem escolher apólice; consulta mostra snapshot automático com seguradora/número. Evitar duas apólices vigentes na primeira apresentação. |
| 49 | Identificar oficina de encaminhamento | D | Credenciar oficina com Fornecedores; selecionar na abertura/encaminhamento do sinistro. Consulta exibe vínculo por ID, seletor apresenta a empresa. Melhorar nome/CNPJ na consulta facilita a apresentação, mas o vínculo já funciona. |
| 50 | Partes: veículo/proprietário/condutor | D | Preencher array de partes no formulário do sinistro e reconsultar. Usa JSON; não é ausência da funcionalidade. Recomenda-se editor com adicionar/remover partes para uma apresentação fluida. |

## Desenvolvimento mínimo recomendado para a POC

### Prioridade 1 — check ainda incompleto

1. **Item 03:** consulta clara de débitos/obrigações, reunindo licenciamento/seguros e multas, valor/vencimento/situação e saldo das multas. Reutilizar as fontes existentes; não criar outro financeiro só para a POC.
2. **Item 07:** filtro de departamento e nomes do setor/motorista na agenda, preservando escopo de usuário.
3. **Item 43:** completar a ficha básica no dossiê; oferecer seleção de um subconjunto de vários veículos e conservar filtros na impressão.
4. **Item 20:** obter/carregar CTB integral com fonte e vigência e possibilitar consultar seus registros. Principal lacuna é conteúdo, acompanhado de uma consulta simples; não se resolve marcando uma amostra como completa.

### Prioridade 2 — apresentação sem digitar IDs/JSON

São melhorias de fluidez, sem tratar os respectivos itens como inexistentes:

- ações na própria linha: retornar viagem, confirmar abastecimento, concluir AS, registrar parcela e abrir sinistro;
- mostrar nomes/códigos do veículo, motorista, rota, oficina e fornecedor no lugar dos IDs isolados;
- editor visual das partes do sinistro e dos campos de configuração de máquinas;
- impressão da autorização com nome/CNH do condutor e combustível/leitura além dos dados já exibidos;
- links entre o gasto gerado e a autorização/OS/instalação que o originou.

## Preparação da base — maior bloqueio atual

Não foi criado seed nesta revisão. Preparar dados identificados de demonstração no ambiente escolhido, usando fluxos que realmente persistem e produzem os resultados:

1. Dois departamentos, um usuário operador de cada setor e um administrador; acessos Frota, Patrimônio, RH/Cadastros e Compras conforme o cenário.
2. Três veículos para alto/normal/baixo consumo; uma máquina com horímetro, outra sem marcador e um equipamento para a consulta de gastos. Ao menos uma unidade vinculada ao bem patrimonial.
3. Condutor RH válido, terceirizado válido, CNH vencida, servidor sem motorista/CNH e condutor com 20 pontos. Categorias admitidas das unidades configuradas.
4. Posto, oficina e seguradora em Fornecedores; contratos/processos de licitação e dispensa com evidência; item combustível em L.
5. Estoque próprio positivo em L, com lote/custo; saldo contratual maior que a soma dos volumes da apresentação. Nenhum estoque em litros estava disponível na leitura desta revisão.
6. Rotas, rota fixa, destinos e agendas com três tipos, mais obrigação com início/fim.
7. Duas baterias e dois pneus para substituição da mesma posição; plano de manutenção, OS própria e terceirizada.
8. Apólice facultativa vigente e obrigações de licenciamento/seguro; ocorrência de avaria e acidente com coordenadas/partes.
9. Catálogo FIPE real representativo; CTB integral conferido; multas com parcelas/comprovantes. Arquivos válidos nos 14 formatos.
10. Gastos de diferentes setores/períodos/fornecedores e movimentos suficientes para emissão integral.

### Exemplo reproduzível de consumo do item 44

Configurar os três veículos com consumo esperado **8 km/L**, tolerância **10%**, marcador inicial **1000 km** e combustível igual ao contrato. Em cada veículo, confirmar um primeiro abastecimento com leitura 1000 e depois um segundo de **40 L**:

| Veículo | Leitura do segundo abastecimento | Média | Status de consumo esperado |
|---|---:|---:|---|
| Consumo alto | 1240 | 6 km/L | ALTO |
| Consumo normal | 1320 | 8 km/L | NORMAL |
| Consumo baixo | 1400 | 10 km/L | BAIXO |

O cálculo utiliza o volume posterior ao primeiro marcador. As leituras devem ser crescentes; não reutilizar unidades cuja leitura atual já ultrapassou o cenário. Os dados são de ensaio, e as autorizações/consumos precisam ser confirmados de verdade.

## Ordem sugerida da apresentação

1. Cadastro completo e integração patrimonial — 01, 09, 10, 18, 33, 34, 41.
2. Motoristas/CNH e acessos por setor — 30, 31, 32, 35.
3. Rotas/destinos/agenda/guarita e planilhas — 07, 08, 24, 25, 26, 28, 37, 38.
4. Combustível próprio/contratual, autorização em branco e posto externo — 05, 06, 12, 13, 36, 39, 40, 44.
5. Manutenção/AS/OS, pneus/baterias e gastos de compra — 04, 14, 15, 16, 17, 27.
6. Obrigações/seguros, tabela CTB, multas e pagamento — 03, 19, 20, 21, 22, 23, 29.
7. Ocorrência, coordenadas, sinistro, seguradora/oficina/partes e anexos — 02, 11, 45, 46, 47, 48, 49, 50.
8. Relatórios de agrupamento e dossiê com seleção — 42, 43.

Antes da banca, executar esse roteiro autenticado, baixar os PDFs e reabrir os registros gravados. Sucesso de teste automatizado ou existência de botão não substitui esse ensaio.
