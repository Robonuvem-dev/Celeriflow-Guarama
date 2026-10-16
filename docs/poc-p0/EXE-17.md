# P0 — EXE-17: Gestão de Dívida Ativa

Ente: **PREFEITURA**. 28 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-17.1

**Fonte:** PDF p.121–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir o cadastro de livro de registro e permitir a
emissão do livro do registro.

- **Diagnóstico da faixa:** PARCIAL; listagem atual não comprova livro completo e retorno altera status. Completar livro/folha/termo/registro e guardas/movimento contábil
- **Gap a conferir:** PARCIAL; listagem atual não comprova livro completo e retorno altera status. Completar livro/folha/termo/registro e guardas/movimento contábil
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:592; src/lib/tributacao/s9-service.ts:168; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:152; src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:142
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.2

**Fonte:** PDF p.121–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Em   cada   inscrição   em   dívida   permitir   o   usuário
visualizar o número do livro, data de inscrição em
dívida.

- **Diagnóstico da faixa:** PARCIAL; listagem atual não comprova livro completo e retorno altera status. Completar livro/folha/termo/registro e guardas/movimento contábil
- **Gap a conferir:** PARCIAL; listagem atual não comprova livro completo e retorno altera status. Completar livro/folha/termo/registro e guardas/movimento contábil
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:6; src/app/app-domain/tributacao/imoveis/property-actions.ts:6; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.3

**Fonte:** PDF p.121–121. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   rotinas   para   possibilitar   o   estorno   de   uma
inscrição em dívida ativa, caso a mesma não tenha
sofrido nenhuma movimentação posterior a inscrição.
Como por exemplo: se a inscrição não foi alvo de
parcelamentos, ações judiciais entre outros,   deverá
permitir   o   estorno   da   dívida,   retornando-a   para   o
exercício.   Em   todo   o   estorno   da   dívida   deve   ser
registrado um cancelamento automático desta parcela
em   dívida,   para   registrar   corretamente   sua
movimentação contábil.

- **Diagnóstico da faixa:** PARCIAL; listagem atual não comprova livro completo e retorno altera status. Completar livro/folha/termo/registro e guardas/movimento contábil
- **Gap a conferir:** PARCIAL; listagem atual não comprova livro completo e retorno altera status. Completar livro/folha/termo/registro e guardas/movimento contábil
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/index.ts:35; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.4

**Fonte:** PDF p.121–122. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir cadastrar e configurar diferentes opções de
parcelamentos,   programas   de   recuperação   fiscal,
possibilitando definir quantidade máxima de parcelas,
valores   mínimo   e   máximo   do   débito,   e   descontos
diferenciados para pessoas físicas e jurídicas. Permitir
definir o percentual de entrada nos parcelamentos,
tipos   de   dívidas   passíveis   de   parcelamento,   sendo
administrativo, judicial ou cartório.

- **Diagnóstico da faixa:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Gap a conferir:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Fases:** P5. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/fiscal-engine.ts:3; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.5

**Fonte:** PDF p.122–122. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   configurar   nas   opções   de   parcelamento   o
número   máximo   de   parcelamento   realizado   por
inscrição. Por exemplo: se informar o número máximo
de três acordos ao selecionar uma dívida que foi alvo
de   mais   de   três   parcelamentos,   o   sistema   deve
bloquear o novo parcelamento.

- **Diagnóstico da faixa:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Gap a conferir:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Fases:** P5. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:37; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/index.ts:66
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.6

**Fonte:** PDF p.122–122. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir controlar o prazo inicial e final de adesão de
cada modalidade de parcelamentos. Não permitindo
incluir acordos ou atribuir descontos fora do prazo legal
de adesão. Permitir configurar em cada modalidade de
parcelamento receitas possíveis de serem parceladas.
Por exemplo: Se na modalidade x está configurado para
permitir   parcelar   apenas   IPTU,   se   selecionar   uma
dívida de ISS o sistema não deverá permitir parcelar
nesta modalidade.

- **Diagnóstico da faixa:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Gap a conferir:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Fases:** P5. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:2; src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/index.ts:35; src/lib/tributacao/s8-service.ts:70
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.7

**Fonte:** PDF p.122–122. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir configurar descontos e prazo de adesão para
pagamento à vista.

- **Diagnóstico da faixa:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Gap a conferir:** PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência
- **Fases:** P5. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:391; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:30; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:922; src/lib/tributacao/s8-service.ts:207
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.8

**Fonte:** PDF p.122–122. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina para consultar todos os parcelamentos
realizados   por:   período,   contribuinte,   forma   de
pagamento,   quantidade   de   parcelas,   quantidade   de
parcelas   atrasadas,   status   do   parcelamento   (em
cobrança, pago, cancelado, suspenso, prescrito).

- **Diagnóstico da faixa:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Gap a conferir:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Fases:** P2, P5, P7, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s8-service.ts:44; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:27; src/lib/tributacao/s2-service.ts:39; src/lib/tributacao/s9-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.9

**Fonte:** PDF p.122–122. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina para parcelamento de dívida e impressão
do termo de parcelamento. Permitir informar no ato do
parcelamento   o   responsável.   Parcelar   débitos   do
contribuinte de diversas origens e exercícios, mantendo
informações sobre a origem dos créditos fiscais;

- **Diagnóstico da faixa:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Gap a conferir:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Fases:** P2, P5, P7, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/app/app-domain/tributacao/nfse/NfseClient.tsx:542
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.10

**Fonte:** PDF p.122–123. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir configurar e ativar o serviço de parcelamento
de dívida pelo portal do cidadão, onde os contribuintes
podem realizar seus acordos. Permitir a municipalidade
configurar   e   definir   quais   as   opções   possíveis   de
parcelamento   no   portal,   possibilitando   configurar   o
termo de aceite ou termo de parcelamento com ou sem
assinatura   digital.   Solicitar   documentos,   restringir
acesso para dívidas judiciais e/ou cartório.

- **Diagnóstico da faixa:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Gap a conferir:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Fases:** P2, P5, P7, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:17; src/lib/tributacao/s9-service.ts:91; src/lib/tributacao/s8-service.ts:81; src/app/app-domain/tributacao/nfse/NfseClient.tsx:318
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.11

**Fonte:** PDF p.123–123. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   configurar   acesso   de   opções   de
parcelamento por usuários. Por exemplo: Através desta
opção é possível definir que apenas o usuário X pode
parcelar dívidas na Lei Y. Evitando assim que usuários
de outras áreas parcelem dívidas incorretamente.

- **Diagnóstico da faixa:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Gap a conferir:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Fases:** P2, P5, P7, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/index.ts:29; src/lib/tributacao/s3-service.ts:95
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.12

**Fonte:** PDF p.123–123. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   cancelamento   de   parcelamento   de   forma
individual, geral e/ou automática, permitindo definir a
quantidade de parcelas em atraso para realização do
cancelamento   do   parcelamento.   Se   for   de   forma
automática,   permitir   configurar   os   tipos   de   acordos
(administrativo,   judicial   ou   cartório),   quantidade   de
parcelas   atrasadas,   dias   amigáveis,   data   base   do
parcelamento   inicial   e   final   e,   enviar   um   e-mail
automático   ao   responsável   pelo   setor   dos
parcelamentos cancelados. Definir e configurar dia e
horário para execução automática da rotina.

- **Diagnóstico da faixa:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Gap a conferir:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Fases:** P2, P5, P7, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.13

**Fonte:** PDF p.123–123. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   definir   o   método   do   cancelamento   de
parcelamento,   podendo   configurar   o   método   por
imputação ou pelo abatimento proporcional das dívidas.

- **Diagnóstico da faixa:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Gap a conferir:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Fases:** P2, P5, P7, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/app/app-domain/tributacao/cobranca/parcelamentos/[id]/termo/route.ts:3; src/lib/tributacao/index.ts:243; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:38
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.14

**Fonte:** PDF p.123–123. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   rotina   para   antecipação   de   pagamento   de
parcelamentos.   Gerenciar   e   consultar   todas   as
antecipações   realizadas,   como   também   permitir
estornar as antecipações, se necessário.

- **Diagnóstico da faixa:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Gap a conferir:** PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor
- **Fases:** P2, P5, P7, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:37; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:140; src/app/app-domain/tributacao/cobranca/parcelamentos/[id]/termo/route.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.15

**Fonte:** PDF p.123–124. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir uma consulta gerencial dos débitos em dívida
ativa, permitindo consultar por: imóvel, empresa ou
contribuinte.   Esta   consulta   deve   ser   organizada
separando as dívidas administrativas, judicial, cartório
e em parcelamento. Nesta mesma rotina gerencial a fim
de facilitar o atendimento ao cidadão deverá haver
ações   para   o   usuário:   parcelar   as   dívidas,   gerar
notificações   ou   avisos   de   débitos,   suspender,
prescrever,   cancelar,   abrir   processo,   gerar   ação
judicial, gerar CDA, gerar petição de dívida, emitir guia
normal e unificada, enquadrar as dívidas em algum
programa de recuperação fiscal.

- **Diagnóstico da faixa:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Gap a conferir:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:2; src/lib/tributacao/s8-service.ts:12; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:2
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.16

**Fonte:** PDF p.124–124. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na consulta gerencial das dívidas deverá informar ao
usuário quantas vezes a dívida foi parcelada, como
também detalhar dados do ajuizamento, se houver.

- **Diagnóstico da faixa:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Gap a conferir:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/divida-ativa/actions.ts:5; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/lib/tributacao/index.ts:29; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:207
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.17

**Fonte:** PDF p.124–124. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na consulta gerencial das dívidas listar os valores de
cada   inscrição   em   dívida   sendo,   tributo,   correção,
multa, juros, juros de parcelamento e permitir ainda
simular os valores em qualquer data de cálculo. Nesta
mesma consulta ser possível filtrar por outras situações
das   parcelas   como:   pagas,   canceladas,   prescritas,
suspensa, parceladas entre outras.

- **Diagnóstico da faixa:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Gap a conferir:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:22; src/lib/tributacao/index.ts:23; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.18

**Fonte:** PDF p.124–124. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir inserir responsáveis tributários nas dívidas de
forma individual ou geral.

- **Diagnóstico da faixa:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Gap a conferir:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:668; src/app/app-domain/tributacao/itbi/page.tsx:2; src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s4-engine.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.19

**Fonte:** PDF p.124–124. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Definir privilégios de acesso por usuário para dívidas
administrativas, judiciais e cartórios. Por exemplo, se
defino que um usuário X possui restrição em dívidas
Judiciais, este não poderá para estas dívidas: emitir
guias, parcelar dívidas judiciais, conceder descontos,
etc.

- **Diagnóstico da faixa:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Gap a conferir:** PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s3-service.ts:95; src/lib/tributacao/s7-service.ts:11; src/lib/tributacao/s9-service.ts:9; src/lib/tributacao/s2-service.ts:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.20

**Fonte:** PDF p.124–124. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir gerar individual ou em lote os processos de
execução fiscal, permitindo agrupar as dívidas por:
contribuinte,   imóvel,   empresa,   dívida,   possibilitando
definir um valor mínimo para abertura dos processos,
validar CPF/CNPJ válidos, com endereço válido. Nesta
mesma   rotina   de   abertura   em   lote   dos   processos
possibilitar gerar uma prévia para análise dos valores e
quantitativo de processo. Ao optar pela prévia, deve ser
gerado   um   relatório   constando   os   contribuintes   e
dívidas que serão afetadas.

- **Diagnóstico da faixa:** PARCIAL em CDA/processo interno; completar prévia, filtros/validações, peças e custas, sem presumir ajuizamento oficial por protocolo interno
- **Gap a conferir:** PARCIAL em CDA/processo interno; completar prévia, filtros/validações, peças e custas, sem presumir ajuizamento oficial por protocolo interno
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/lib/tributacao/s3-service.ts:42
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.21

**Fonte:** PDF p.124–124. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar a inserção de honorários ou custas judiciais
aos processos de execução fiscal podendo variar por
valor fixo ou percentual da dívida.

- **Diagnóstico da faixa:** PARCIAL em CDA/processo interno; completar prévia, filtros/validações, peças e custas, sem presumir ajuizamento oficial por protocolo interno
- **Gap a conferir:** PARCIAL em CDA/processo interno; completar prévia, filtros/validações, peças e custas, sem presumir ajuizamento oficial por protocolo interno
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:87; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:207; src/lib/tributacao/s9-engine.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.22

**Fonte:** PDF p.124–125. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o controle da execução fiscal permitindo
geração das CDAs e petição de dívida ativa. Possuir a
consulta   gerencial   dos   processos   no   qual   permite
estornar   o   processo,   inserir   novos   lançamentos   ao
processo ou até mesmo cancelar, se necessário.

- **Diagnóstico da faixa:** PARCIAL em CDA/processo interno; completar prévia, filtros/validações, peças e custas, sem presumir ajuizamento oficial por protocolo interno
- **Gap a conferir:** PARCIAL em CDA/processo interno; completar prévia, filtros/validações, peças e custas, sem presumir ajuizamento oficial por protocolo interno
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:91; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/lib/tributacao/s2-service.ts:3; src/lib/tributacao/s8-service.ts:81
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.23

**Fonte:** PDF p.125–125. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração das remessas para cobrança em
cartório em lote, com a possibilidade de validar a cidade
da   comarca   com   o   endereço   dos   contribuintes,
permitindo registrar para o CRA o contribuinte principal
e o responsável do imóvel ou das dívidas.

- **Diagnóstico da faixa:** PARCIAL/SIMULADO POC; remessa `REMESSA_INTERNA_CONTROLADA`. Preparar seleção no núcleo e validar arquivo/retorno/anuência oficialmente nas fases finais
- **Gap a conferir:** PARCIAL/SIMULADO POC; remessa `REMESSA_INTERNA_CONTROLADA`. Preparar seleção no núcleo e validar arquivo/retorno/anuência oficialmente nas fases finais
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:22; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:131; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:107
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.24

**Fonte:** PDF p.125–125. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   gerar   desistência   e   cancelamento   das
certidões enviadas para protestos.

- **Diagnóstico da faixa:** PARCIAL/SIMULADO POC; remessa `REMESSA_INTERNA_CONTROLADA`. Preparar seleção no núcleo e validar arquivo/retorno/anuência oficialmente nas fases finais
- **Gap a conferir:** PARCIAL/SIMULADO POC; remessa `REMESSA_INTERNA_CONTROLADA`. Preparar seleção no núcleo e validar arquivo/retorno/anuência oficialmente nas fases finais
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:389; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:51; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:405; src/app/app-domain/tributacao/nfse/NfseClient.tsx:477
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.25

**Fonte:** PDF p.125–125. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deverá integrar todas as movimentações da
dívida ativa com a contabilidade das movimentações
de:   descontos,   pagamentos,   cancelamentos,
prescrições   etc.   Possuir   rotinas   para   consultar   as
movimentações   diárias   da   dívida   ativa   com   a
contabilidade, demonstrando o tipo de movimentação,
data, valores contábeis e conta contábil.

- **Diagnóstico da faixa:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Gap a conferir:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s2-service.ts:19; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:8; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.26

**Fonte:** PDF p.125–125. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   configurar   a   inscrição   em   dívida   ativa   de
débitos de exercício que estiverem em atraso, seja feita
todos   os   meses   de   forma   automática,   sem   a
necessidade de algum usuário efetuar o procedimento
mensal. Deverá ainda enviar e-mail aos responsáveis a
cada nova execução;

- **Diagnóstico da faixa:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Gap a conferir:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/s7-service.ts:11; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/lib/tributacao/s2-service.ts:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.27

**Fonte:** PDF p.125–125. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   emissão   de   guias   de   dívida   ativa   não
parcelada pelo portal do cidadão, podendo configurar o
serviço para bloquear a emissão de dívidas cartório
e/ou   judicial,   com   a   possibilidade   de   parametrizar
mensagem quando o cidadão selecionar dívidas destas
modalidades. Possibilitar a geração do QrCode Pix para
pagamento.

- **Diagnóstico da faixa:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Gap a conferir:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/lib/tributacao/index.ts:82; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:11; src/lib/tributacao/s9-service.ts:91; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-17.28

**Fonte:** PDF p.125–126. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração de notificação e/ou aviso de débitos
em PDF para contribuintes com dívidas no município,
possibilitando a geração em lote, permitindo filtrar por:
valor mínimo, endereço bairro, logradouro. Permiti a
geração de arquivos para terceiros em formato TXT ou
XML. Inserir no PDF da notificação o boleto com código
de barras para pagamentos.

- **Diagnóstico da faixa:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Gap a conferir:** PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Tributação/Procuradoria (pessoa a designar).
- **Fontes municipais:** 080, 105, 115.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:320; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:238; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:27; src/lib/tributacao/s3-service.ts:43
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
