# P0 — EXE-16: Gestão de Arrecadação

Ente: **PREFEITURA**. 56 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-16.1

**Fonte:** PDF p.111–112. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   cadastro   único   de   bancos,   agências   e
convênios bancários, permitindo cadastrar e configurar
convênios   por   entidade   e   ainda   relacionar   as
taxas/impostos   que   poderão   ser   geradas   em   cada
convênio bancário.

- **Diagnóstico da faixa:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Gap a conferir:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Fases:** P1, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s7-service.ts:168; src/lib/tributacao/s9-service.ts:4; src/lib/tributacao/index.ts:23; src/lib/tributacao/s2-service.ts:64
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.2

**Fonte:** PDF p.112–112. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro único de contribuintes possibilitando o
relacionamento   deste   contribuinte   em   propriedades
imobiliárias, empresas, cálculos tributários. O cadastro
de contribuinte deverá ser totalmente único podendo
ser utilizado em todo o sistema.

- **Diagnóstico da faixa:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Gap a conferir:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Fases:** P1, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:186; src/app/app-domain/tributacao/page.tsx:25; src/lib/tributacao/s8-service.ts:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.3

**Fonte:** PDF p.112–112. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastro único de moeda de diferentes
tipos: moeda, indexadores, permitindo ainda cadastrar
seus valores mensais ou anuais. Este cadastro também
deve ser único sendo possível utilizá-lo em todo o
sistema tributário.

- **Diagnóstico da faixa:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Gap a conferir:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Fases:** P1, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.4

**Fonte:** PDF p.112–112. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastro de receitas como exemplo: IPTU,
ISS, Taxas diversas, Contribuição de melhoria, ITBI
entre outros, se o usuário desejar cadastrar novas
receita o mesmo poderá cadastrar a qualquer momento
sem intervenção técnica de empresa especializada.

- **Diagnóstico da faixa:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Gap a conferir:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Fases:** P1, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s8-service.ts:12; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:388; src/lib/tributacao/s7-service.ts:11; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.5

**Fonte:** PDF p.112–112. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   cadastramentos   e   configurações   de
cálculos de cada serviço/impostos. O sistema deverá
dispor de rotinas para possibilitar o cadastramento de
qualquer serviço ou imposto a qualquer momento. Este
cadastramento deve ser completo sendo necessário
definir o nome, entidade que será destinado o cálculo
tributário,   relacionamento   do   convênio   bancários,
definir   o   vínculo   do   débito   se:   imóvel,   empresa,
contribuinte e permitir inserir os tributos que   serão
lançados cada qual com sua fórmula de cálculo. A
configuração da fórmula de cálculo deverá ser anual,
podendo em uma mesma receita fórmulas distintas
para cada exercício e tributo.

- **Diagnóstico da faixa:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Gap a conferir:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Fases:** P1, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/s7-service.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.6

**Fonte:** PDF p.112–112. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deverá   dispor   de   rotina   para   copiar   as
configurações   das   receitas   de   qualquer   exercício,
copiando as suas fórmulas e configurações, sem que o
usuário precise configurar cada exercício novamente.

- **Diagnóstico da faixa:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Gap a conferir:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Fases:** P1, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:388; src/app/app-domain/tributacao/imoveis/property-actions.ts:6; src/lib/tributacao/index.ts:29; src/lib/tributacao/s2-service.ts:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.7

**Fonte:** PDF p.112–113. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   adicionar   e   configurar   informações
adicionais   em   um   serviço/imposto,   através   de
formulários, como por exemplo: No cálculo tributário de
horas máquinas, permitir cadastrar tipos de máquinas,
quantidade de horas, serviço a ser realizado etc. Estes
campos podem e devem ser utilizados em fórmulas de
cálculo para geração dos valores de cada tributo. Estes
campos podem ser criados a qualquer momento pelo
usuário sem intervenção técnica, podendo definir o tipo
de campo sendo: valores, lista, alfanumérico, data, lista
dinâmica, hora e booleano.

- **Diagnóstico da faixa:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Gap a conferir:** PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos
- **Fases:** P1, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:29; src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s4-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.8

**Fonte:** PDF p.113–113. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir definir mais de uma opção de pagamento em
uma taxa/imposto. Por exemplo: o cálculo de IPTU
poderá haver três opções de pagamento sendo duas a
vista com datas e descontos distinta e outra opção
parcelada.

- **Diagnóstico da faixa:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Gap a conferir:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:6; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:15; src/lib/tributacao/s3-service.ts:4; src/lib/tributacao/s8-service.ts:39
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.9

**Fonte:** PDF p.113–113. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar definir e configurar valores mínimos para
geração   do   débito   e   para   a   parcela,   inclusive
possibilitando diferenciar estes valores entre pessoa
física e/ou jurídica.

- **Diagnóstico da faixa:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Gap a conferir:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:44; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/app/app-domain/tributacao/pessoas/page.tsx:13; src/lib/tributacao/s9-service.ts:91
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.10

**Fonte:** PDF p.113–113. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar configurar no próprio cadastro da taxa ou
imposto desconto diferenciado caso ocorra existência
de débitos, possibilitando configurar o vinculo da busca
sendo: contribuinte, imóvel ou empresa. Permitir ainda
definir os tipos de débitos a serem buscados sendo:
Dívida ativa, exercício, parcelamento, reparcelamento
ou todos os débitos.

- **Diagnóstico da faixa:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Gap a conferir:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/index.ts:6; src/lib/tributacao/s2-service.ts:4; src/lib/tributacao/s8-service.ts:39
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.11

**Fonte:** PDF p.113–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir geração de cálculo tributário geral ou individual
do tipo simulado ou normal. Se simulado os valores não
devem constar no extrato de contribuinte. Em todo o
cálculo simulado sistema deverá gerar um identificador,
este   possibilitando   a   conferência   pelo   usuário   a
qualquer   momento.   Através   deste   identificador   o
usuário   poderá   efetivar   o   cálculo   sem   necessitar
executar   um   novo   cálculo,   ser   possível   imprimir   o
resumo do cálculo, visualizar os logs de cálculo se
ocorreu algum tipo de inconsistência, permitir excluir o
cálculo ou remover apenas alguns lançamentos do
cálculo.

- **Diagnóstico da faixa:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Gap a conferir:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.12

**Fonte:** PDF p.114–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar cadastrar e configurar os parâmetros de
atualização dos lançamentos, podendo definir o método
de cálculo de correção, multa, juros ou juros Selic.

- **Diagnóstico da faixa:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Gap a conferir:** PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:240; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:58; src/lib/tributacao/fiscal-engine.ts:49; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.13

**Fonte:** PDF p.114–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a emissão de guias ou segunda via das guias
no padrão FEBRABAN.

- **Diagnóstico da faixa:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Gap a conferir:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s7-service.ts:282; src/lib/tributacao/s9-service.ts:124; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:755; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:152
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.14

**Fonte:** PDF p.114–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   integração   dos   registros   bancários   via
webservices caso a instituição financeira do convênio
bancário do município possuir este tipo de integração.

- **Diagnóstico da faixa:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Gap a conferir:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:351; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:511; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:138; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:65
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.15

**Fonte:** PDF p.114–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração de PIX para pagamentos de tributos
municipais, caso o município possua convênio bancário
para este fim.

- **Diagnóstico da faixa:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Gap a conferir:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:140; src/lib/tributacao/s2-service.ts:176; src/lib/tributacao/s9-service.ts:351; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:51
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.16

**Fonte:** PDF p.114–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir uma consulta de todos os carnês emitidos com
no   mínimo   os   filtros:   Data   de   emissão,   data   de
vencimento, Convênio bancário, Contribuinte, Imóvel,
Empresa, valor a pagar, valor de desconto, se possui
PIX, status do registro bancário, linha degitável e código
de barras. E ainda nesta consulta permitir reimprimir a
guia sem gerar um novo código de barras, e permitir o
envio de e-mail das guias selecionadas ou envio geral
por período.

- **Diagnóstico da faixa:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Gap a conferir:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:21; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33; src/lib/tributacao/index.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.17

**Fonte:** PDF p.114–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a emissão de guia unificada e definir desconto
para emissão, podendo conceder desconto na multa ou
juros na emissão via portal do cidadão e na emissão
interna;

- **Diagnóstico da faixa:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Gap a conferir:** PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:755; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:77; src/lib/tributacao/index.ts:149; src/lib/tributacao/s7-engine.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.18

**Fonte:** PDF p.114–114. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastramento de restrição de contribuintes,
imóvel ou empresa. Possibilitando cadastrar tipos de
restrição, inicio do alerta e ainda definir os usuários que
poderão ter acesso a este alerta.   Nas consultas do
sistema como extrato de débitos e ficha financeira, caso
selecionado um contribuinte, imóvel ou empresa que
possui esta restrição cadastrada, o sistema deve alertar
o usuário relatando o motivo da restrição.

- **Diagnóstico da faixa:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Gap a conferir:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s3-service.ts:48; src/lib/tributacao/s7-service.ts:11; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:2
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.19

**Fonte:** PDF p.114–115. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deverá dispor de uma consulta de todos os
débitos   em   aberto   de   um   contribuinte/imóvel   ou
empresa, detalhando os valores vencidos e a vencer de
tributo, correção, multa e juros. Nesta consulta deverá
ser possível a emissão das guias individuais ou guia
unificada,   gerar   notificação   e/ou   aviso   de   débitos,
permitir parcelar ou reparcelar as dívidas. A consulta
deve ser organizada separando as dívidas de exercício,
dívida   ativa,   dívida   ativa   judicial   ou   cartório   e
parcelamentos. Possibilitar a emissão do extrato nesta
mesma consulta.

- **Diagnóstico da faixa:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Gap a conferir:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/index.ts:35; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.20

**Fonte:** PDF p.115–115. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na   rotina   de   consulta   dos   débitos   em   aberto   do
contribuinte,   ao   selecionar   uma   divida   especifica,
sistema deverá dar a opção para o usuário detalhar
todo o histórico desta divida, detalhando no mínimo:
Carnês   emitidos,   notificações   e   avisos   emitidos,
histórico   de   parcelamento   (demonstrando   quantas
parcelas   realizadas   e   quais   foram   pagas),
cancelamentos   realizados,   suspenção,   processos
judiciais e cartórios, protocolos, recálculos, data do
cálculo, usuários que efetuaram as movimentações.

- **Diagnóstico da faixa:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Gap a conferir:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/lib/tributacao/s9-service.ts:9; src/lib/tributacao/index.ts:29; src/lib/tributacao/s8-service.ts:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.21

**Fonte:** PDF p.115–115. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o registro de carnês recebidos/devolvidos de
forma   individual   ou   geral,   informando   o   motivo   da
devolução e permitir o registro e controle de entrega e
devolução   de   documentos   emitidos,   podendo
registrar/devolver:   Carnês,   Notificações,   aviso   de
débitos,   certidão,   termo   de   parcelamento.   Permitir
registrar a entrega e devolução de forma Individual e/ou
geral.   No   registro   de   entrega/Devolução   possibilitar
anexar arquivos.

- **Diagnóstico da faixa:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Gap a conferir:** PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.22

**Fonte:** PDF p.115–116. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   o   cadastramento   e   configuração   das
finalidades   de   certidões   de   débitos.   Possibilitando
definir se a mesma estará visível para emissão via
portal do cidadão e se possui algum tipo de restrição.
Permitir configurar a data de validade por documento,
por   exemplo,   certidão   negativa   válida   por   60   dias,
certidão positiva por 30 dias e certidão positiva com
efeito   de   negativa   por   20   dias.   Possibilitar   o
cadastramento de formulários a ser visível no ato da
emissão da Certidão.

- **Diagnóstico da faixa:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Gap a conferir:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:45; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:19; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.23

**Fonte:** PDF p.116–116. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir Certidão Negativa, Positiva e Positiva com Efeito
de Negativa dos tributos municipais;

- **Diagnóstico da faixa:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Gap a conferir:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:56; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:19; src/lib/tributacao/s6-engine.ts:54; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:290
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.24

**Fonte:** PDF p.116–116. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   consulta   de   todas   as   certidões   emitidas,
permitindo desativar ou ativar a certidão, permitir a
reimpressão do documento.

- **Diagnóstico da faixa:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Gap a conferir:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:165; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:19; src/lib/tributacao/s8-service.ts:531; src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:45
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.25

**Fonte:** PDF p.116–116. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Todas as certidões emitidas no sistema, sejam elas
emitidas através do portal de autoatendimento pelo
cidadão,   ou   emitida   internamente   por   usuário   da
contratante, devem possuir um QrCode que autentica o
documento. Dispor de um serviço no portal de consulta
de autenticidade de CND.

- **Diagnóstico da faixa:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Gap a conferir:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:17; src/lib/tributacao/s8-service.ts:12; src/app/app-domain/tributacao/nfse/NfseClient.tsx:181; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.26

**Fonte:** PDF p.116–116. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   o   cadastramento   e   configurações   de
documentos diversos a qualquer momento pelo usuário
sem   intervenção   técnica.   Por   Exemplo:   Permitir
cadastrar um documento diverso relacionado a uma
certidão narrativa de imóvel, neste cadastramento o
usuário   poderá   definir   o   layout   do   documento,
formulário de emissão, dias de vencimento, vínculo do
débito (imóvel, empresa ou contribuinte) e se estará
disponível para emissão via portal de autoatendimento.
Possuir rotina especifica para geração e consulta dos
documentos   diversos,   possibilitando   a   reimpressão,
desativar/ativar   e   permitir   a   consulta   por   data   de
emissão, por tipo de documento, contribuinte, imóvel e
empresa.

- **Diagnóstico da faixa:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Gap a conferir:** PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/lib/tributacao/s8-service.ts:12; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:17; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.27

**Fonte:** PDF p.116–116. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Realizar baixas de pagamento dos débitos de qualquer
origem tributária de forma centralizada, através dos
arquivos   bancários   fornecidos   pelas   instituições
financeiras. Em todo o processo de baixa o sistema
deverá emitir um resumo do processo demonstrando as
consistências ao usuário e os valores baixados.

- **Diagnóstico da faixa:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Gap a conferir:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Fases:** P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:207; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.28

**Fonte:** PDF p.116–117. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Em cada processo de baixa de pagamento deve ser
gerado um lote ID de pagamento que irá receber os
registros de pagamentos demonstrando: lançamentos
tributários envolvidos, contribuinte, valor a pagar, valor
pago. Neste mesmo lote de pagamento devera ser
possível efetuar o download do arquivo de retorno a
qualquer momento para uma possível conferência ou
auditoria dos registros.

- **Diagnóstico da faixa:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Gap a conferir:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Fases:** P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/s2-service.ts:8; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:22; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.29

**Fonte:** PDF p.117–117. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a baixa manual de um determinado débito.
Permitir   efetuar   a   baixa   por   tipo   de   pagamento:
Pagamento normal, duplicado, dação em pagamento,
Pagamento por depósito e pagamento parcial.

- **Diagnóstico da faixa:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Gap a conferir:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Fases:** P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:91; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:4; src/lib/tributacao/index.ts:174
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.30

**Fonte:** PDF p.117–117. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar   diferenças   de   pagamento   de   forma
automática   e   centralizada,   podendo   realizar
lançamento   complementar   da   diferença   (quando
recolhimento a menor).   Deverá conter configuração
para definir a forma de lançamento da diferença de
pagamento,   possibilitando   o   usuário   configurar   o
lançamento por receita e o valor mínimo para gerar a
diferença.   Ao finalizar o processo de baixa magnética
ou manual, ao atualizar os registros de pagamento, o
sistema deverá dar um alerta ao usuário das diferenças
que serão geradas, possibilitando o usuário analisar e
efetivar o lançamento das diferenças.

- **Diagnóstico da faixa:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Gap a conferir:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Fases:** P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:207; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:4; src/lib/tributacao/index.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.31

**Fonte:** PDF p.117–117. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastramento e configuração de tipos de
compensação   de   débitos.   Realizar   e   gerenciar   as
compensações   de   valores,   sendo   que   os   créditos
pagos a maior, pagos duplicados ou até pagos de forma
equivocadas, possam ser compensados com outros
créditos   do   mesmo   contribuinte,   ou   de   outro
contribuinte   que   estejam   em   aberto,   podendo
compensar o crédito em aberto em sua totalidade ou
não;

- **Diagnóstico da faixa:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Gap a conferir:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Fases:** P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:223; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:39
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.32

**Fonte:** PDF p.117–117. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastramento e gerenciar as restituições
de créditos tributários, sendo que os débitos pagos em
duplicidades   ou   pagos   erroneamente,   possam   ser
restituídos.

- **Diagnóstico da faixa:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Gap a conferir:** PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final
- **Fases:** P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s6-engine.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279; src/app/app-domain/tributacao/cobranca/relatorios/beneficios/route.ts:3; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:753
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.33

**Fonte:** PDF p.117–118. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   o   cadastramento   e   gerenciamento   de
massas   falidas,   relacionado   a   um   processo
administrativo   ou   judicial,   relacionado   dívidas
envolvidas no processo de massa falida.

- **Diagnóstico da faixa:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Gap a conferir:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:257; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:84; src/app/app-domain/tributacao/divida-ativa/actions.ts:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.34

**Fonte:** PDF p.118–118. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   o   cadastramento   e   gerenciamento   de
transações, estas por sua vez são dividas tributários ou
não tributárias, que podem ser abatidas por troca de
serviços,   bens   imóveis   e   ou   aluguéis   de   imóveis
privados para o ente público, respeitando a legislação
municipal. Em todo processo de transação caso ocorra
o abatimento da dívida, a mesma deve ser registrada
como dação em pagamento.

- **Diagnóstico da faixa:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Gap a conferir:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/index.ts:66; src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:45
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.35

**Fonte:** PDF p.118–118. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o gerenciamento e cadastramento de outorga
onerosa vinculado a imóveis. O processo de outorga
onerosa deve seguir rigorosamente todas as etapas de
análise,   deferimento   do   processo   e   geração   dos
valores. O sistema deverá dispor de rotina que permita
cadastrar e configurar os tipos de outorga, com suas
respectivas fórmulas de cálculos. O sistema deverá
dispor ao usuário consulta para controlar os saldos de
cada processo de outorga onerosa, demonstrando de
forma   clara   o   valor   lançado,   valor   pago,   valor
compensado e o saldo final. No mesmo processo de
outorga   onerosa   deverá   dispor   de   rotinas   para
compensação dos valores permitindo abater o valor da
outorga   por   obras   públicas.   Em   cada   processo   de
compensação será possível relacionar várias obras,
informando   o   valor   reservado   de   cada   obra,   como
também controlar os saldos de cada uma destas obras,
em todo abatimento dos valores deve permitir o fiscal
registrar as notas fiscais e por fim remissão automática
dos valores, e caso o abatimento não for total registrar
a remissão parcial automática.

- **Diagnóstico da faixa:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Gap a conferir:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/s3-service.ts:34; src/lib/tributacao/index.ts:13; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.36

**Fonte:** PDF p.118–118. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a prorrogação dos débitos de forma individual,
por data ou geral por receita.

- **Diagnóstico da faixa:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Gap a conferir:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:22; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.37

**Fonte:** PDF p.118–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   o   controle   dos   processos   de   isenções,
permitir   cadastrar   tipos   de   isenções   conforme
legislação municipal e permitir na mesma rotina incluir
os   processos   de   isenções,   realizar   o
deferimento/indeferimento   e   que   permita   consultar
todas   as   isenções   por   tipo,   situação,   período   e
contribuintes.   Permitir   nesta   mesma   consulta
impressão do comprovante e requerimento de isenção,
inserir anexos ao processo de isenção.

- **Diagnóstico da faixa:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Gap a conferir:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:28; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:49; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:267
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.38

**Fonte:** PDF p.119–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o relacionamento com protocolo em processos
de: cancelamento, suspensão e remissão de qualquer
lançamento tributário, com possibilidade de incluir o
motivo e observação;

- **Diagnóstico da faixa:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Gap a conferir:** PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:22; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:58; src/lib/tributacao/s2-service.ts:58
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.39

**Fonte:** PDF p.119–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir inscrever débitos de IPTU e Taxas em Dívida
Ativa, transferindo os demais proprietários do imóvel
como coproprietários do débito.

- **Diagnóstico da faixa:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Gap a conferir:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Fases:** P1, P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:159; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/lib/tributacao/s2-service.ts:39; src/lib/tributacao/s8-service.ts:39
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.40

**Fonte:** PDF p.119–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir inscrição em dívida de qualquer receita.

- **Diagnóstico da faixa:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Gap a conferir:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Fases:** P1, P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/app/app-domain/tributacao/divida/DividaClient.tsx:46; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:237; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.41

**Fonte:** PDF p.119–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar configurar a forma de inscrever os débitos
em dívida, sendo possível configurar para gerar uma
inscrição em dívida por tributo, agrupada em apenas
um   único   lançamento   em   dívida,   ou   agrupada   por
parcela.   Esta   configuração   deve   ser   definida   nas
configurações de cada receita.

- **Diagnóstico da faixa:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Gap a conferir:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Fases:** P1, P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:2; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/index.ts:35
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.42

**Fonte:** PDF p.119–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar configurar a inscrição em dívida ativa de
forma automática através de um período, permitindo
definir dias de vencimentos e dias amigáveis, para a
inscrição automática dos débitos para em dívida ativa.

- **Diagnóstico da faixa:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Gap a conferir:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Fases:** P1, P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:159; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.43

**Fonte:** PDF p.119–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

No cadastramento dos tributos os mesmos devem ser
classificados conformes tipos de créditos definidos nos
layouts do tribunal de contas, classificando por tipos:
IPTU, TAXA, ISS, ITBI entre outros.

- **Diagnóstico da faixa:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Gap a conferir:** PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único
- **Fases:** P1, P2, P5, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s3-engine.ts:11; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:38; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:389; src/app/app-domain/tributacao/layout.tsx:18
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.44

**Fonte:** PDF p.119–119. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir integração total diária com a contabilidade de
todas   as   movimentações   tributárias   seja   elas:
pagamentos,   pagamento   a   maior,   descontos,
cancelamentos,   isenções,   imunidades,   prescrição,
remissões etc.

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas. Motor contábil por tipo e reconciliação diária; atualização preserva posição histórica, memória e falhas
- **Gap a conferir:** PARCIAL com lacunas confirmadas. Motor contábil por tipo e reconciliação diária; atualização preserva posição histórica, memória e falhas
- **Fases:** P2, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:19; src/lib/tributacao/fiscal-engine.ts:25; src/lib/tributacao/index.ts:13; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.45

**Fonte:** PDF p.119–120. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta de todas as movimentações tributárias
disponíveis ou contabilizadas. Nessa consulta deverá
ser   possível   filtrar   por:   data,   tributo,   tipo   de
movimentação   (pagamentos,   pagamento   a   maior,
descontos,   cancelamentos,   isenções,   imunidades,
prescrição,   remissões,   etc),   conta   contábil,   valor
contábil. Permitir ainda a impressão dos valores.

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas. Motor contábil por tipo e reconciliação diária; atualização preserva posição histórica, memória e falhas
- **Gap a conferir:** PARCIAL com lacunas confirmadas. Motor contábil por tipo e reconciliação diária; atualização preserva posição histórica, memória e falhas
- **Fases:** P2, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:13; src/lib/tributacao/s2-service.ts:8; src/lib/tributacao/s9-service.ts:26; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.46

**Fonte:** PDF p.120–120. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deverá controlar a atualização de todo o
estoque da dívida ativa e exercício de forma mensal, a
fim de demonstrar os valores a receber em cada mês
de   forma   atualizada.   Inclusive   permitir   o   usuário
analisar   os   valores   mensais   da   dívida   através   de
indicadores   de   gestão.   Caso   ocorra   alguma
inconsistência na atualização de valores, deve estar
relacionado ao log de execução para possível ajuste.

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas. Motor contábil por tipo e reconciliação diária; atualização preserva posição histórica, memória e falhas
- **Gap a conferir:** PARCIAL com lacunas confirmadas. Motor contábil por tipo e reconciliação diária; atualização preserva posição histórica, memória e falhas
- **Fases:** P2, P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s7-service.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.47

**Fonte:** PDF p.120–120. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração de arquivos de carnês para terceiros
de qualquer receita em formato TXT ou XML. O sistema
deverá dispor de uma consulta de todos os arquivos
gerados permitindo filtrar por período, convênio, receita,
permitindo   inclusive   o   download   dos   arquivos   a
qualquer momento.

- **Diagnóstico da faixa:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Gap a conferir:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s5-service.ts:6; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:323; src/lib/tributacao/s6-service.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.48

**Fonte:** PDF p.120–120. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   geração   de   arquivos   dos   carnês   para
terceiros em segundo plano.

- **Diagnóstico da faixa:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Gap a conferir:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:23; src/app/app-domain/tributacao/fiscalizacao/s7-actions.ts:15; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:32; src/lib/tributacao/index.ts:149
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.49

**Fonte:** PDF p.120–120. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deverá inicializar de forma automática dia
01/01 de cada exercício os parâmetros de cálculo,
lançamento tributários sem intervenção de usuário.

- **Diagnóstico da faixa:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Gap a conferir:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/index.ts:29; src/lib/tributacao/s2-service.ts:19; src/lib/tributacao/s3-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.50

**Fonte:** PDF p.120–120. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Em todo o lançamento tributário deverá ser possível
depurar   a   fórmula   de   cálculo   para   o   usuário   ter
conhecimento de como sistema chegou a determinado
valor. Além de permitir imprimir a fórmula de cada
cálculo de cada tributo que compõe o lançamento, o
sistema também deverá disponibilizar ao usuário quais
os parâmetros de correção, multa e juros que está
sendo   aplicado   em   determinada   parcela   do
lançamento.

- **Diagnóstico da faixa:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Gap a conferir:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:3; src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/index.ts:13; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:2
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.51

**Fonte:** PDF p.120–120. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Dispor de configuração para não permitir efetuar cálculo
tributário   com   CPF/CNPJ   inválido.   Por   exemplo,
CPF/CNPJ zerado bloquear o cálculo.

- **Diagnóstico da faixa:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Gap a conferir:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/lib/tributacao/nfse-danfse.ts:4; src/lib/tributacao/s10-service.ts:37
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.52

**Fonte:** PDF p.120–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cálculo geral de qualquer receita em segundo
plano. Por exemplo, o usuário poderá calcular o IPTU
de forma geral, habilitar a opção segundo plano, fechar
o   sistema   que   o   cálculo   irá   ser   processado
normalmente.

- **Diagnóstico da faixa:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Gap a conferir:** PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s5-service.ts:6; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:58; src/lib/tributacao/s6-service.ts:5; src/lib/tributacao/s7-service.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.53

**Fonte:** PDF p.121–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatórios de maiores devedores e maiores
pagadores, dispondo do filtro por data e tipo de dívida.

- **Diagnóstico da faixa:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Gap a conferir:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Fases:** P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:26; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.54

**Fonte:** PDF p.121–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório de valores lançados, dispondo do filtro
por receita e período de vencimento.

- **Diagnóstico da faixa:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Gap a conferir:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Fases:** P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:323; src/lib/tributacao/fiscal-engine.ts:40; src/lib/tributacao/s5-service.ts:6; src/lib/tributacao/s7-service.ts:865
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.55

**Fonte:** PDF p.121–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório de valores a receber, dispondo do filtro
de receita, vencimento, tipo de débito.

- **Diagnóstico da faixa:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Gap a conferir:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Fases:** P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:91; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:237; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:409
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-16.56

**Fonte:** PDF p.121–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possui   relatório   de   débitos   isentos,   imunes,
cancelados,   pagos,   remido,   suspenso   dispondo   de
filtros   de:   período   de   vencimento,   receita,   data   de
pagamento,   data   de   cancelamento,   contribuinte,
imóvel, empresa, valor inicial e final.

- **Diagnóstico da faixa:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Gap a conferir:** NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas
- **Fases:** P7. **Responsável funcional:** Tributação/Arrecadação (pessoa a designar).
- **Fontes municipais:** 080, 105, 113, 114, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:13; src/lib/tributacao/s2-service.ts:8; src/lib/tributacao/s7-service.ts:47; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
