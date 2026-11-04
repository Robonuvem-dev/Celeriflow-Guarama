import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelamentoOp,
  confirmacaoOp,
  consultarDebitoDividaAtivaOp,
  consultarDebitoIPTUOp,
  consultarDebitoISSOp,
  consultarDebitoParcelamentoOp,
  generateFebrabanSegment6Barcode,
  getFebrabanArrecadacaoState,
  getFebrabanWsdlDescriptor,
} from "../src/lib/tributacao/febraban-arrecadacao-service";
import {
  acceptCredenciadoResponsibilityTerm,
  generateCardAdministratorDam,
  getDecredOverviewState,
  getFiscalReportAllEquipments,
  getFiscalReportByNaturezaOperacao,
  receiveCardDeclarationViaWebService,
  submitCardAdministratorDeclaration,
  upsertCardEquipment,
} from "../src/lib/tributacao/card-administrators-decred-service";

test("CF26 (26.1 a 26.7): Arrecadação Online FEBRABAN via WebService — consultarDebitoIPTUOp, consultarDebitoISSOp, consultarDebitoDividaAtivaOp, consultarDebitoParcelamentoOp, confirmacaoOp e cancelamentoOp", () => {
  // 26.1: Modelo padrão FEBRABAN de arrecadação online via webservice e código de barras Segmento 6
  const barcode = generateFebrabanSegment6Barcode({
    valorTotal: 828.0,
    vencimentoYYYYMMDD: "2026-11-15",
    nossoNumeroGuia: "2026000100101",
  });
  assert.equal(barcode.codigoBarras44.length, 44);
  assert.ok(barcode.codigoBarras44.startsWith("816"));
  assert.ok(barcode.linhaDigitavel48.includes("-"));

  const wsdl = getFebrabanWsdlDescriptor();
  assert.ok(wsdl.includes("consultarDebitoIPTUOp"));
  assert.ok(wsdl.includes("consultarDebitoISSOp"));
  assert.ok(wsdl.includes("consultarDebitoDividaAtivaOp"));
  assert.ok(wsdl.includes("consultarDebitoParcelamentoOp"));
  assert.ok(wsdl.includes("cancelamentoOp"));
  assert.ok(wsdl.includes("confirmacaoOp"));

  // 26.2: consultarDebitoIPTUOp
  const iptu = consultarDebitoIPTUOp({ inscricaoImobiliaria: "01.02.034.0120.001", exercicio: 2026 });
  assert.equal(iptu.operation, "consultarDebitoIPTUOp");
  assert.equal(iptu.codigoRetornoFebraban, "00");
  assert.ok(iptu.debitos.length >= 1);
  assert.equal(iptu.debitos[0].natureza, "IPTU");

  // 26.3: consultarDebitoISSOp
  const iss = consultarDebitoISSOp({ inscricaoMunicipal: "IM-44510", competencia: "10/2026" });
  assert.equal(iss.operation, "consultarDebitoISSOp");
  assert.equal(iss.codigoRetornoFebraban, "00");
  assert.ok(iss.debitos.length >= 1);
  assert.equal(iss.debitos[0].natureza, "ISS");

  // 26.4: consultarDebitoDividaAtivaOp
  const divida = consultarDebitoDividaAtivaOp({ numeroCda: "CDA-2025/00894" });
  assert.equal(divida.operation, "consultarDebitoDividaAtivaOp");
  assert.equal(divida.codigoRetornoFebraban, "00");
  assert.ok(divida.debitos.length >= 1);
  assert.equal(divida.debitos[0].natureza, "DIVIDA_ATIVA");

  // 26.5: consultarDebitoParcelamentoOp
  const parcelamento = consultarDebitoParcelamentoOp({ numeroAcordoParcelamento: "PARC-2026/00312" });
  assert.equal(parcelamento.operation, "consultarDebitoParcelamentoOp");
  assert.equal(parcelamento.codigoRetornoFebraban, "00");
  assert.ok(parcelamento.debitos.length >= 1);
  assert.equal(parcelamento.debitos[0].natureza, "PARCELAMENTO");

  // 26.7: confirmacaoOp
  const targetGuia = iptu.debitos[0].nossoNumeroGuia;
  const confirmacao = confirmacaoOp({
    nossoNumeroGuia: targetGuia,
    codigoBanco: "001",
    valorPago: iptu.debitos[0].valorTotalCobrado,
  });
  assert.equal(confirmacao.operation, "confirmacaoOp");
  assert.equal(confirmacao.guia.status, "PAGO_ONLINE");
  assert.ok(confirmacao.autenticacaoEletronica?.startsWith("FEB-001-"));

  // 26.6: cancelamentoOp
  const cancelamento = cancelamentoOp({
    nossoNumeroGuia: targetGuia,
    codigoAutenticacaoFebraban: confirmacao.autenticacaoEletronica,
    motivoCancelamento: "Estorno solicitado pela instituição bancária dentro da janela FEBRABAN",
  });
  assert.equal(cancelamento.operation, "cancelamentoOp");
  assert.equal(cancelamento.guia.status, "ESTORNADO_CANCELADO");

  const finalState = getFebrabanArrecadacaoState();
  assert.ok(finalState.auditLogs.length >= 6);
});

test("CF29 (29.1, 29.3, 29.4, 29.5, 29.7, 29.8 e 29.9): Equipamentos POS/TEF, Termo de Responsabilidade, Declaração, DAM, Recepção WebService e Relatórios de Fiscalização", () => {
  // 29.3: Aceite obrigatório do Termo de Responsabilidade pelo usuário credenciado
  assert.throws(
    () =>
      acceptCredenciadoResponsibilityTerm({
        credenciadoLogin: "teste@operadora.com.br",
        credenciadoNome: "Teste Sem Aceite",
        credenciadoCpfCnpj: "14.582.900/0001-42",
        inscricaoMunicipal: "IM-44510",
        accepted: false,
      }),
    /obrigatório aceitar o Termo de Responsabilidade/,
  );

  const term = acceptCredenciadoResponsibilityTerm({
    credenciadoLogin: "credenciado@stone.com.br",
    credenciadoNome: "Mariana Ferreira",
    credenciadoCpfCnpj: "16.501.555/0001-57",
    inscricaoMunicipal: "IM-90112",
    accepted: true,
  });
  assert.equal(term.accepted, true);

  // 29.1: Inclusão, Consulta e Edição de equipamentos utilizados por PF ou Inscrição Municipal
  const includedEq = upsertCardEquipment({
    terminalNumber: "POS-55900",
    serialNumber: "SN-PAX-55900",
    equipmentModel: "SMART_POS",
    ownershipType: "PROPRIO",
    inscricaoMunicipal: "IM-90112",
    contribuinteCpfCnpj: "123.456.789-00",
    contribuinteNome: "João Batista Silva (Pessoa Física)",
    administradoraNome: "Stone Instituição de Pagamento S.A.",
    administradoraCnpj: "16.501.555/0001-57",
  });
  assert.equal(includedEq.terminalNumber, "POS-55900");

  const editedEq = upsertCardEquipment({
    id: includedEq.id,
    terminalNumber: "POS-55900",
    serialNumber: "SN-PAX-55900-REV2",
    ownershipType: "COMPARTILHADO",
    inscricaoMunicipal: "IM-90112",
    contribuinteCpfCnpj: "123.456.789-00",
    contribuinteNome: "João Batista Silva (Pessoa Física)",
    administradoraNome: "Stone Instituição de Pagamento S.A.",
    administradoraCnpj: "16.501.555/0001-57",
  });
  assert.equal(editedEq.serialNumber, "SN-PAX-55900-REV2");
  assert.equal(editedEq.ownershipType, "COMPARTILHADO");

  // 29.4: Declaração da movimentação da administradora de cartão
  const decl = submitCardAdministratorDeclaration({
    competencia: "11/2026",
    tipoDeclaracao: "NORMAL_ORIGINAL",
    responsavelNome: "Mariana Ferreira",
    responsavelCpf: "412.889.301-44",
    responsavelEmail: "mariana@stone.com.br",
    administradoraNome: "Stone Instituição de Pagamento S.A.",
    administradoraCnpj: "16.501.555/0001-57",
    naturezaOperacao: "CREDITO_A_VISTA",
    descricaoServicos: "Administração de cartões de crédito à vista (Subitem 15.01)",
    terminalNumber: "POS-55900",
    valorTotalOperacoes: 80000.0,
    valorPrestacaoServico: 2000.0,
  });
  assert.equal(decl.competencia, "11/2026");
  assert.equal(decl.valorIssDevido, 100.0);

  // 29.5: Geração do DAM para pagamento referente aos serviços da administradora de cartão
  const dam = generateCardAdministratorDam(decl.id);
  assert.ok(dam.damNumber.startsWith("DAM-CARTAO-"));
  assert.equal(dam.valorTotalDam, 100.0);
  assert.equal(dam.codigoBarras44.length, 44);

  // 29.7: Recepção via Web Service contendo Layout Padrão e todas as operações realizadas e autorizadas
  const wsResult = receiveCardDeclarationViaWebService({
    competencia: "11/2026",
    administradoraNome: "Getnet Adquirência e Serviços para Meios de Pagamento S.A.",
    administradoraCnpj: "10.440.482/0001-54",
    responsavel: {
      nome: "Ricardo Gomes",
      cpf: "551.209.338-91",
      email: "fiscal@getnet.com.br",
    },
    naturezaOperacao: "SIMILARES_VOUCHER",
    descricaoServicos: "Processamento de cartões voucher e similares via Web Service",
    operacoesAutorizadas: [
      {
        authorizationCode: "AUTH-GN-1001",
        nsuHost: "NSU-GN-1001",
        transactionDateTime: "2026-11-04T12:00:00.000Z",
        terminalNumber: "POS-55900",
        estabelecimentoCpfCnpj: "123.456.789-00",
        estabelecimentoInscricaoMunicipal: "IM-90112",
        naturezaOperacao: "SIMILARES_VOUCHER",
        installments: 1,
        grossTransactionAmount: 30000.0,
        serviceFeeAmount: 900.0,
      },
    ],
  });
  assert.equal(wsResult.declaration.origemRecepcao, "WEBSERVICE_PADRAO_29_7");
  assert.equal(wsResult.declaration.valorTotalOperacoes, 30000.0);
  assert.equal(wsResult.declaration.valorPrestacaoServico, 900.0);
  assert.ok(wsResult.dam.damNumber.startsWith("DAM-CARTAO-"));

  // 29.8: Relatório na gestão da fiscalização de toda a movimentação declarada por natureza de operação
  const reportByNatureza = getFiscalReportByNaturezaOperacao();
  assert.equal(reportByNatureza.length, 5);
  const creditoVista = reportByNatureza.find((r) => r.naturezaOperacao === "CREDITO_A_VISTA");
  assert.ok(creditoVista && creditoVista.valorTotalOperacoes > 0);

  // 29.9: Relatório na gestão da fiscalização de todos os equipamentos cadastrados
  const reportEquipments = getFiscalReportAllEquipments();
  const pos55900 = reportEquipments.find((e) => e.terminalNumber === "POS-55900");
  assert.ok(pos55900);
  assert.equal(pos55900.totalMovimentadoNoEquipamento, 110000.0);

  const state = getDecredOverviewState();
  assert.ok(state.equipments.length >= 4);
  assert.ok(state.declarations.length >= 5);
});

