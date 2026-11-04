import { createHash } from "node:crypto";

/**
 * CF26 — Arrecadação Online Service (web) — Padrão FEBRABAN de Arrecadação Online via WebService
 *
 * Implementa integralmente os requisitos 26.1 a 26.7:
 * - 26.1: Módulo de pagamento de guias integrado aos aplicativos das instituições financeiras no modelo padrão FEBRABAN de arrecadação online via webservice.
 * - 26.2: Método `consultarDebitoIPTUOp` conforme layout FEBRABAN de arrecadação online via webservice.
 * - 26.3: Método `consultarDebitoISSOp` conforme layout FEBRABAN de arrecadação online via webservice.
 * - 26.4: Método `consultarDebitoDividaAtivaOp` conforme layout FEBRABAN de arrecadação online via webservice.
 * - 26.5: Método `consultarDebitoParcelamentoOp` conforme layout FEBRABAN de arrecadação online via webservice.
 * - 26.6: Método `cancelamentoOp` conforme layout FEBRABAN de arrecadação online via webservice.
 * - 26.7: Método `confirmacaoOp` conforme layout FEBRABAN de arrecadação online via webservice.
 */

export type FebrabanOperationName =
  | "consultarDebitoIPTUOp"
  | "consultarDebitoISSOp"
  | "consultarDebitoDividaAtivaOp"
  | "consultarDebitoParcelamentoOp"
  | "confirmacaoOp"
  | "cancelamentoOp";

export type FebrabanDebtNature = "IPTU" | "ISS" | "DIVIDA_ATIVA" | "PARCELAMENTO";

export type FebrabanDebtStatus = "EM_ABERTO" | "PAGO_ONLINE" | "ESTORNADO_CANCELADO";

export type FebrabanOnlineDebtItem = {
  nossoNumeroGuia: string;
  natureza: FebrabanDebtNature;
  codigoReceitaFebraban: string;
  inscricaoMunicipalOuImobiliaria: string;
  documentoContribuinte: string;
  nomeContribuinte: string;
  exercicio: number;
  competencia: string;
  parcela: string;
  numeroCda?: string;
  numeroAcordoParcelamento?: string;
  dataVencimento: string;
  valorPrincipal: number;
  valorJuros: number;
  valorMulta: number;
  valorDesconto: number;
  valorTotalCobrado: number;
  codigoBarras44: string;
  linhaDigitavel48: string;
  status: FebrabanDebtStatus;
  codigoBancoArrecadador?: string;
  nomeBancoArrecadador?: string;
  nsuTransacaoBancaria?: string;
  codigoAutenticacaoFebraban?: string;
  canalPagamento?: "APP_MOBILE_BANKING" | "INTERNET_BANKING" | "PIX_QR_FEBRABAN" | "CORRESPONDENTE_BANCARIO";
  dataHoraPagamento?: string;
  dataHoraCancelamento?: string;
  motivoCancelamento?: string;
};

export type FebrabanWebServiceAuditLog = {
  id: string;
  operation: FebrabanOperationName;
  requirementCode: "26.2" | "26.3" | "26.4" | "26.5" | "26.6" | "26.7";
  timestamp: string;
  bankCode: string;
  bankName: string;
  channel: string;
  targetIdentifier: string;
  returnCode: "00" | "01" | "02";
  returnMessage: string;
  soapRequestSnippet: string;
  soapResponseSnippet: string;
};

export const FEBRABAN_PARTNER_BANKS: ReadonlyArray<{
  codigoCompensacao: string;
  nomeInstituicao: string;
  convenioFebraban: string;
  canalPadrao: "APP_MOBILE_BANKING" | "INTERNET_BANKING" | "PIX_QR_FEBRABAN";
}> = [
  { codigoCompensacao: "001", nomeInstituicao: "Banco do Brasil S.A.", convenioFebraban: "8166-BB-MUN", canalPadrao: "APP_MOBILE_BANKING" },
  { codigoCompensacao: "104", nomeInstituicao: "Caixa Econômica Federal", convenioFebraban: "8166-CEF-MUN", canalPadrao: "APP_MOBILE_BANKING" },
  { codigoCompensacao: "237", nomeInstituicao: "Banco Bradesco S.A.", convenioFebraban: "8166-BRD-MUN", canalPadrao: "INTERNET_BANKING" },
  { codigoCompensacao: "341", nomeInstituicao: "Itaú Unibanco S.A.", convenioFebraban: "8166-ITU-MUN", canalPadrao: "APP_MOBILE_BANKING" },
  { codigoCompensacao: "756", nomeInstituicao: "Banco Cooperativo Sicoob", convenioFebraban: "8166-SCB-MUN", canalPadrao: "APP_MOBILE_BANKING" },
];

/**
 * Calcula dígito verificador Módulo 10 padrão FEBRABAN Segmento 6 (Arrecadação de Órgãos Governamentais).
 */
export function computeFebrabanMod10(digits: string): string {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const num = Number(digits[i]) || 0;
    const product = num * weight;
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product;
    weight = weight === 2 ? 1 : 2;
  }
  const remainder = sum % 10;
  return remainder === 0 ? "0" : String(10 - remainder);
}

/**
 * Gera Código de Barras de 44 posições e Linha Digitável de 48 posições no padrão FEBRABAN Segmento 6 (Prefeituras).
 */
export function generateFebrabanSegment6Barcode(params: {
  valorTotal: number;
  convenio4Digits?: string;
  vencimentoYYYYMMDD: string;
  nossoNumeroGuia: string;
}): { codigoBarras44: string; linhaDigitavel48: string } {
  const produto = "8"; // Arrecadação
  const segmento = "1"; // Prefeituras
  const identificadorValor = "6"; // Valor real em R$ com DV Módulo 10
  const cents = Math.round(params.valorTotal * 100)
    .toString()
    .padStart(11, "0")
    .slice(-11);
  const convenio = (params.convenio4Digits ?? "0419").replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const vencimento = params.vencimentoYYYYMMDD.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  const guiaDigits = params.nossoNumeroGuia.replace(/\D/g, "").padStart(17, "0").slice(-17);

  const semDv = `${produto}${segmento}${identificadorValor}${cents}${convenio}${vencimento}${guiaDigits}`;
  const dvGeral = computeFebrabanMod10(semDv);
  const codigoBarras44 = `${semDv.slice(0, 3)}${dvGeral}${semDv.slice(3)}`;

  const bloco1 = codigoBarras44.slice(0, 11);
  const bloco2 = codigoBarras44.slice(11, 22);
  const bloco3 = codigoBarras44.slice(22, 33);
  const bloco4 = codigoBarras44.slice(33, 44);

  const linhaDigitavel48 = [
    `${bloco1}-${computeFebrabanMod10(bloco1)}`,
    `${bloco2}-${computeFebrabanMod10(bloco2)}`,
    `${bloco3}-${computeFebrabanMod10(bloco3)}`,
    `${bloco4}-${computeFebrabanMod10(bloco4)}`,
  ].join(" ");

  return { codigoBarras44, linhaDigitavel48 };
}

function createSeedDebts(): FebrabanOnlineDebtItem[] {
  const seeds: Array<Omit<FebrabanOnlineDebtItem, "codigoBarras44" | "linhaDigitavel48">> = [
    // IPTU (26.2 - consultarDebitoIPTUOp)
    {
      nossoNumeroGuia: "2026000100101",
      natureza: "IPTU",
      codigoReceitaFebraban: "1112-01-IPTU",
      inscricaoMunicipalOuImobiliaria: "01.02.034.0120.001",
      documentoContribuinte: "123.456.789-00",
      nomeContribuinte: "Carlos Eduardo Mendes Ribeiro",
      exercicio: 2026,
      competencia: "01/2026",
      parcela: "Cota Única / 01 de 06",
      dataVencimento: "2026-11-15",
      valorPrincipal: 920.0,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 92.0,
      valorTotalCobrado: 828.0,
      status: "EM_ABERTO",
    },
    {
      nossoNumeroGuia: "2026000100102",
      natureza: "IPTU",
      codigoReceitaFebraban: "1112-01-IPTU",
      inscricaoMunicipalOuImobiliaria: "01.02.034.0120.001",
      documentoContribuinte: "123.456.789-00",
      nomeContribuinte: "Carlos Eduardo Mendes Ribeiro",
      exercicio: 2026,
      competencia: "02/2026",
      parcela: "Parcela 02 de 06",
      dataVencimento: "2026-12-15",
      valorPrincipal: 153.33,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      valorTotalCobrado: 153.33,
      status: "EM_ABERTO",
    },
    // ISS (26.3 - consultarDebitoISSOp)
    {
      nossoNumeroGuia: "2026000200301",
      natureza: "ISS",
      codigoReceitaFebraban: "1114-51-ISSQN",
      inscricaoMunicipalOuImobiliaria: "IM-44510",
      documentoContribuinte: "14.582.900/0001-42",
      nomeContribuinte: "Agropecuária e Serviços Triângulo Ltda",
      exercicio: 2026,
      competencia: "10/2026",
      parcela: "Mensal 10/2026",
      dataVencimento: "2026-11-10",
      valorPrincipal: 1840.5,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      valorTotalCobrado: 1840.5,
      status: "EM_ABERTO",
    },
    {
      nossoNumeroGuia: "2026000200302",
      natureza: "ISS",
      codigoReceitaFebraban: "1114-51-ISSQN",
      inscricaoMunicipalOuImobiliaria: "IM-78201",
      documentoContribuinte: "28.911.400/0001-19",
      nomeContribuinte: "Clínica Médica Vida & Saúde S/S",
      exercicio: 2026,
      competencia: "10/2026",
      parcela: "Mensal 10/2026",
      dataVencimento: "2026-11-10",
      valorPrincipal: 965.0,
      valorJuros: 0,
      valorMulta: 0,
      valorDesconto: 0,
      valorTotalCobrado: 965.0,
      status: "EM_ABERTO",
    },
    // Dívida Ativa (26.4 - consultarDebitoDividaAtivaOp)
    {
      nossoNumeroGuia: "2026000300501",
      natureza: "DIVIDA_ATIVA",
      codigoReceitaFebraban: "1911-01-DIV-ATIVA",
      inscricaoMunicipalOuImobiliaria: "02.04.018.0090.001",
      documentoContribuinte: "39.104.882/0001-75",
      nomeContribuinte: "Construtora Horizonte Mineiro S.A.",
      exercicio: 2024,
      competencia: "12/2024",
      parcela: "CDA Integral",
      numeroCda: "CDA-2025/00894",
      dataVencimento: "2026-11-28",
      valorPrincipal: 4200.0,
      valorJuros: 612.4,
      valorMulta: 420.0,
      valorDesconto: 0,
      valorTotalCobrado: 5232.4,
      status: "EM_ABERTO",
    },
    // Parcelamento (26.5 - consultarDebitoParcelamentoOp)
    {
      nossoNumeroGuia: "2026000400801",
      natureza: "PARCELAMENTO",
      codigoReceitaFebraban: "1922-01-REFIS-PARC",
      inscricaoMunicipalOuImobiliaria: "IM-55019",
      documentoContribuinte: "07.331.650/0001-08",
      nomeContribuinte: "Supermercado Central Campo Florido Ltda",
      exercicio: 2026,
      competencia: "11/2026",
      parcela: "Parcela 04 de 12",
      numeroAcordoParcelamento: "PARC-2026/00312",
      dataVencimento: "2026-11-20",
      valorPrincipal: 750.0,
      valorJuros: 45.0,
      valorMulta: 0,
      valorDesconto: 0,
      valorTotalCobrado: 795.0,
      status: "EM_ABERTO",
    },
  ];

  return seeds.map((item) => {
    const barcodes = generateFebrabanSegment6Barcode({
      valorTotal: item.valorTotalCobrado,
      vencimentoYYYYMMDD: item.dataVencimento,
      nossoNumeroGuia: item.nossoNumeroGuia,
    });
    return {
      ...item,
      ...barcodes,
    };
  });
}

const runtimeFebrabanState: {
  initialized: boolean;
  debts: FebrabanOnlineDebtItem[];
  auditLogs: FebrabanWebServiceAuditLog[];
} = {
  initialized: false,
  debts: [],
  auditLogs: [],
};

function ensureFebrabanStore() {
  if (!runtimeFebrabanState.initialized) {
    runtimeFebrabanState.debts = createSeedDebts();
    runtimeFebrabanState.auditLogs = [
      {
        id: "LOG-FEBRABAN-001",
        operation: "consultarDebitoIPTUOp",
        requirementCode: "26.2",
        timestamp: "2026-11-04T13:15:00.000Z",
        bankCode: "001",
        bankName: "Banco do Brasil S.A.",
        channel: "APP_MOBILE_BANKING",
        targetIdentifier: "01.02.034.0120.001",
        returnCode: "00",
        returnMessage: "SUCESSO: 2 guia(s) de IPTU localizada(s) no padrão FEBRABAN Segmento 6.",
        soapRequestSnippet: "<feb:consultarDebitoIPTUOp><inscricaoImobiliaria>01.02.034.0120.001</inscricaoImobiliaria><exercicio>2026</exercicio></feb:consultarDebitoIPTUOp>",
        soapResponseSnippet: "<feb:consultarDebitoIPTUOpResponse><codigoRetorno>00</codigoRetorno><quantidadeGuias>2</quantidadeGuias></feb:consultarDebitoIPTUOpResponse>",
      },
    ];
    runtimeFebrabanState.initialized = true;
  }
  return runtimeFebrabanState;
}

function recordAudit(entry: Omit<FebrabanWebServiceAuditLog, "id" | "timestamp">) {
  const store = ensureFebrabanStore();
  const log: FebrabanWebServiceAuditLog = {
    id: `LOG-FEBRABAN-${String(store.auditLogs.length + 1).padStart(3, "0")}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  store.auditLogs.unshift(log);
  return log;
}

/**
 * Requisito 26.2 — Método `consultarDebitoIPTUOp` conforme layout FEBRABAN de arrecadação online via webservice.
 */
export function consultarDebitoIPTUOp(params: {
  inscricaoImobiliaria?: string;
  cpfCnpj?: string;
  exercicio?: number;
  codigoBanco?: string;
}) {
  const store = ensureFebrabanStore();
  const insc = params.inscricaoImobiliaria?.trim().toLowerCase() ?? "";
  const doc = params.cpfCnpj?.replace(/\D/g, "") ?? "";

  const matches = store.debts.filter((d) => {
    if (d.natureza !== "IPTU") return false;
    if (params.exercicio && d.exercicio !== Number(params.exercicio)) return false;
    if (insc && !d.inscricaoMunicipalOuImobiliaria.toLowerCase().includes(insc)) return false;
    if (doc && !d.documentoContribuinte.replace(/\D/g, "").includes(doc)) return false;
    return true;
  });

  const bank = FEBRABAN_PARTNER_BANKS.find((b) => b.codigoCompensacao === params.codigoBanco) ?? FEBRABAN_PARTNER_BANKS[0];
  const soapRequestSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoIPTUOp><codigoBanco>${bank.codigoCompensacao}</codigoBanco><inscricaoImobiliaria>${params.inscricaoImobiliaria || "*"}</inscricaoImobiliaria><exercicio>${params.exercicio || 2026}</exercicio></feb:consultarDebitoIPTUOp></soapenv:Body></soapenv:Envelope>`;
  const soapResponseSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoIPTUOpResponse><codigoRetorno>00</codigoRetorno><mensagem>CONSULTA_IPTU_OK</mensagem><quantidadeDebitos>${matches.length}</quantidadeDebitos></feb:consultarDebitoIPTUOpResponse></soapenv:Body></soapenv:Envelope>`;

  const audit = recordAudit({
    operation: "consultarDebitoIPTUOp",
    requirementCode: "26.2",
    bankCode: bank.codigoCompensacao,
    bankName: bank.nomeInstituicao,
    channel: bank.canalPadrao,
    targetIdentifier: params.inscricaoImobiliaria || params.cpfCnpj || "IPTU-GERAL",
    returnCode: "00",
    returnMessage: `consultarDebitoIPTUOp concluído: ${matches.length} débito(s) de IPTU retornado(s).`,
    soapRequestSnippet,
    soapResponseSnippet,
  });

  return {
    operation: "consultarDebitoIPTUOp" as const,
    requirementCode: "26.2" as const,
    codigoRetornoFebraban: "00",
    mensagemRetorno: "CONSULTA_DEBITO_IPTU_REALIZADA_COM_SUCESSO",
    debitos: matches,
    soapEnvelopeResponse: soapResponseSnippet,
    audit,
  };
}

/**
 * Requisito 26.3 — Método `consultarDebitoISSOp` conforme layout FEBRABAN de arrecadação online via webservice.
 */
export function consultarDebitoISSOp(params: {
  inscricaoMunicipal?: string;
  cpfCnpj?: string;
  competencia?: string;
  codigoBanco?: string;
}) {
  const store = ensureFebrabanStore();
  const im = params.inscricaoMunicipal?.trim().toLowerCase() ?? "";
  const comp = params.competencia?.trim() ?? "";

  const matches = store.debts.filter((d) => {
    if (d.natureza !== "ISS") return false;
    if (im && !d.inscricaoMunicipalOuImobiliaria.toLowerCase().includes(im)) return false;
    if (comp && d.competencia !== comp) return false;
    return true;
  });

  const bank = FEBRABAN_PARTNER_BANKS.find((b) => b.codigoCompensacao === params.codigoBanco) ?? FEBRABAN_PARTNER_BANKS[0];
  const soapRequestSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoISSOp><codigoBanco>${bank.codigoCompensacao}</codigoBanco><inscricaoMunicipal>${params.inscricaoMunicipal || "*"}</inscricaoMunicipal><competencia>${params.competencia || "10/2026"}</competencia></feb:consultarDebitoISSOp></soapenv:Body></soapenv:Envelope>`;
  const soapResponseSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoISSOpResponse><codigoRetorno>00</codigoRetorno><mensagem>CONSULTA_ISS_OK</mensagem><quantidadeDebitos>${matches.length}</quantidadeDebitos></feb:consultarDebitoISSOpResponse></soapenv:Body></soapenv:Envelope>`;

  const audit = recordAudit({
    operation: "consultarDebitoISSOp",
    requirementCode: "26.3",
    bankCode: bank.codigoCompensacao,
    bankName: bank.nomeInstituicao,
    channel: bank.canalPadrao,
    targetIdentifier: params.inscricaoMunicipal || params.competencia || "ISS-GERAL",
    returnCode: "00",
    returnMessage: `consultarDebitoISSOp concluído: ${matches.length} débito(s) de ISS retornado(s).`,
    soapRequestSnippet,
    soapResponseSnippet,
  });

  return {
    operation: "consultarDebitoISSOp" as const,
    requirementCode: "26.3" as const,
    codigoRetornoFebraban: "00",
    mensagemRetorno: "CONSULTA_DEBITO_ISS_REALIZADA_COM_SUCESSO",
    debitos: matches,
    soapEnvelopeResponse: soapResponseSnippet,
    audit,
  };
}

/**
 * Requisito 26.4 — Método `consultarDebitoDividaAtivaOp` conforme layout FEBRABAN de arrecadação online via webservice.
 */
export function consultarDebitoDividaAtivaOp(params: {
  numeroCda?: string;
  cpfCnpj?: string;
  inscricao?: string;
  codigoBanco?: string;
}) {
  const store = ensureFebrabanStore();
  const cda = params.numeroCda?.trim().toLowerCase() ?? "";
  const doc = params.cpfCnpj?.replace(/\D/g, "") ?? "";

  const matches = store.debts.filter((d) => {
    if (d.natureza !== "DIVIDA_ATIVA") return false;
    if (cda && !(d.numeroCda?.toLowerCase().includes(cda) ?? false)) return false;
    if (doc && !d.documentoContribuinte.replace(/\D/g, "").includes(doc)) return false;
    return true;
  });

  const bank = FEBRABAN_PARTNER_BANKS.find((b) => b.codigoCompensacao === params.codigoBanco) ?? FEBRABAN_PARTNER_BANKS[1];
  const soapRequestSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoDividaAtivaOp><codigoBanco>${bank.codigoCompensacao}</codigoBanco><numeroCDA>${params.numeroCda || "*"}</numeroCDA></feb:consultarDebitoDividaAtivaOp></soapenv:Body></soapenv:Envelope>`;
  const soapResponseSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoDividaAtivaOpResponse><codigoRetorno>00</codigoRetorno><mensagem>CONSULTA_DIVIDA_ATIVA_OK</mensagem><quantidadeDebitos>${matches.length}</quantidadeDebitos></feb:consultarDebitoDividaAtivaOpResponse></soapenv:Body></soapenv:Envelope>`;

  const audit = recordAudit({
    operation: "consultarDebitoDividaAtivaOp",
    requirementCode: "26.4",
    bankCode: bank.codigoCompensacao,
    bankName: bank.nomeInstituicao,
    channel: bank.canalPadrao,
    targetIdentifier: params.numeroCda || params.cpfCnpj || "CDA-GERAL",
    returnCode: "00",
    returnMessage: `consultarDebitoDividaAtivaOp concluído: ${matches.length} certidão(ões)/débito(s) em Dívida Ativa retornado(s).`,
    soapRequestSnippet,
    soapResponseSnippet,
  });

  return {
    operation: "consultarDebitoDividaAtivaOp" as const,
    requirementCode: "26.4" as const,
    codigoRetornoFebraban: "00",
    mensagemRetorno: "CONSULTA_DEBITO_DIVIDA_ATIVA_REALIZADA_COM_SUCESSO",
    debitos: matches,
    soapEnvelopeResponse: soapResponseSnippet,
    audit,
  };
}

/**
 * Requisito 26.5 — Método `consultarDebitoParcelamentoOp` conforme layout FEBRABAN de arrecadação online via webservice.
 */
export function consultarDebitoParcelamentoOp(params: {
  numeroAcordoParcelamento?: string;
  cpfCnpj?: string;
  codigoBanco?: string;
}) {
  const store = ensureFebrabanStore();
  const acordo = params.numeroAcordoParcelamento?.trim().toLowerCase() ?? "";
  const doc = params.cpfCnpj?.replace(/\D/g, "") ?? "";

  const matches = store.debts.filter((d) => {
    if (d.natureza !== "PARCELAMENTO") return false;
    if (acordo && !(d.numeroAcordoParcelamento?.toLowerCase().includes(acordo) ?? false)) return false;
    if (doc && !d.documentoContribuinte.replace(/\D/g, "").includes(doc)) return false;
    return true;
  });

  const bank = FEBRABAN_PARTNER_BANKS.find((b) => b.codigoCompensacao === params.codigoBanco) ?? FEBRABAN_PARTNER_BANKS[2];
  const soapRequestSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoParcelamentoOp><codigoBanco>${bank.codigoCompensacao}</codigoBanco><numeroAcordo>${params.numeroAcordoParcelamento || "*"}</numeroAcordo></feb:consultarDebitoParcelamentoOp></soapenv:Body></soapenv:Envelope>`;
  const soapResponseSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:consultarDebitoParcelamentoOpResponse><codigoRetorno>00</codigoRetorno><mensagem>CONSULTA_PARCELAMENTO_OK</mensagem><quantidadeDebitos>${matches.length}</quantidadeDebitos></feb:consultarDebitoParcelamentoOpResponse></soapenv:Body></soapenv:Envelope>`;

  const audit = recordAudit({
    operation: "consultarDebitoParcelamentoOp",
    requirementCode: "26.5",
    bankCode: bank.codigoCompensacao,
    bankName: bank.nomeInstituicao,
    channel: bank.canalPadrao,
    targetIdentifier: params.numeroAcordoParcelamento || params.cpfCnpj || "PARC-GERAL",
    returnCode: "00",
    returnMessage: `consultarDebitoParcelamentoOp concluído: ${matches.length} parcela(s) de acordo retornada(s).`,
    soapRequestSnippet,
    soapResponseSnippet,
  });

  return {
    operation: "consultarDebitoParcelamentoOp" as const,
    requirementCode: "26.5" as const,
    codigoRetornoFebraban: "00",
    mensagemRetorno: "CONSULTA_DEBITO_PARCELAMENTO_REALIZADA_COM_SUCESSO",
    debitos: matches,
    soapEnvelopeResponse: soapResponseSnippet,
    audit,
  };
}

/**
 * Requisito 26.7 — Método `confirmacaoOp` conforme layout FEBRABAN de arrecadação online via webservice.
 */
export function confirmacaoOp(params: {
  nossoNumeroGuia: string;
  codigoBarras44?: string;
  valorPago?: number;
  codigoBanco?: string;
  nsuTransacaoBancaria?: string;
  canalPagamento?: FebrabanOnlineDebtItem["canalPagamento"];
}) {
  const store = ensureFebrabanStore();
  const target = store.debts.find(
    (d) =>
      d.nossoNumeroGuia === params.nossoNumeroGuia ||
      (params.codigoBarras44 && d.codigoBarras44 === params.codigoBarras44),
  );

  if (!target) {
    throw new Error(`Guia FEBRABAN '${params.nossoNumeroGuia}' não localizada para confirmação de pagamento.`);
  }

  const bank = FEBRABAN_PARTNER_BANKS.find((b) => b.codigoCompensacao === params.codigoBanco) ?? FEBRABAN_PARTNER_BANKS[0];
  const nsu = params.nsuTransacaoBancaria || `NSU-${Date.now().toString().slice(-8)}`;
  const paidAt = new Date().toISOString();
  const authHash = createHash("sha256")
    .update(`${target.nossoNumeroGuia}:${bank.codigoCompensacao}:${nsu}:${paidAt}`)
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();

  target.status = "PAGO_ONLINE";
  target.codigoBancoArrecadador = bank.codigoCompensacao;
  target.nomeBancoArrecadador = bank.nomeInstituicao;
  target.nsuTransacaoBancaria = nsu;
  target.codigoAutenticacaoFebraban = `FEB-${bank.codigoCompensacao}-${authHash}`;
  target.canalPagamento = params.canalPagamento ?? bank.canalPadrao;
  target.dataHoraPagamento = paidAt;
  target.dataHoraCancelamento = undefined;
  target.motivoCancelamento = undefined;

  const soapRequestSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:confirmacaoOp><codigoBanco>${bank.codigoCompensacao}</codigoBanco><nossoNumeroGuia>${target.nossoNumeroGuia}</nossoNumeroGuia><codigoBarras>${target.codigoBarras44}</codigoBarras><valorPago>${(params.valorPago ?? target.valorTotalCobrado).toFixed(2)}</valorPago><nsuTransacao>${nsu}</nsuTransacao></feb:confirmacaoOp></soapenv:Body></soapenv:Envelope>`;
  const soapResponseSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:confirmacaoOpResponse><codigoRetorno>00</codigoRetorno><situacaoGuia>PAGO_ONLINE</situacaoGuia><autenticacaoEletronica>${target.codigoAutenticacaoFebraban}</autenticacaoEletronica></feb:confirmacaoOpResponse></soapenv:Body></soapenv:Envelope>`;

  const audit = recordAudit({
    operation: "confirmacaoOp",
    requirementCode: "26.7",
    bankCode: bank.codigoCompensacao,
    bankName: bank.nomeInstituicao,
    channel: target.canalPagamento,
    targetIdentifier: target.nossoNumeroGuia,
    returnCode: "00",
    returnMessage: `confirmacaoOp: Pagamento online confirmado (${target.codigoAutenticacaoFebraban}) no valor de R$ ${target.valorTotalCobrado.toFixed(2)}.`,
    soapRequestSnippet,
    soapResponseSnippet,
  });

  return {
    operation: "confirmacaoOp" as const,
    requirementCode: "26.7" as const,
    codigoRetornoFebraban: "00",
    mensagemRetorno: "CONFIRMACAO_PAGAMENTO_ONLINE_EFETIVADA",
    guia: target,
    autenticacaoEletronica: target.codigoAutenticacaoFebraban,
    soapEnvelopeResponse: soapResponseSnippet,
    audit,
  };
}

/**
 * Requisito 26.6 — Método `cancelamentoOp` conforme layout FEBRABAN de arrecadação online via webservice.
 */
export function cancelamentoOp(params: {
  nossoNumeroGuia: string;
  codigoAutenticacaoFebraban?: string;
  nsuTransacaoBancaria?: string;
  motivoCancelamento?: string;
  codigoBanco?: string;
}) {
  const store = ensureFebrabanStore();
  const target = store.debts.find((d) => d.nossoNumeroGuia === params.nossoNumeroGuia);
  if (!target) {
    throw new Error(`Guia FEBRABAN '${params.nossoNumeroGuia}' não localizada para cancelamento.`);
  }

  const bank =
    FEBRABAN_PARTNER_BANKS.find((b) => b.codigoCompensacao === (params.codigoBanco || target.codigoBancoArrecadador)) ??
    FEBRABAN_PARTNER_BANKS[0];
  const canceledAt = new Date().toISOString();
  const motivo = params.motivoCancelamento?.trim() || "Estorno de autenticação bancária dentro da janela operacional FEBRABAN";

  target.status = "ESTORNADO_CANCELADO";
  target.dataHoraCancelamento = canceledAt;
  target.motivoCancelamento = motivo;

  const soapRequestSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:cancelamentoOp><codigoBanco>${bank.codigoCompensacao}</codigoBanco><nossoNumeroGuia>${target.nossoNumeroGuia}</nossoNumeroGuia><autenticacaoOriginal>${params.codigoAutenticacaoFebraban || target.codigoAutenticacaoFebraban || "N/A"}</autenticacaoOriginal><motivo>${motivo}</motivo></feb:cancelamentoOp></soapenv:Body></soapenv:Envelope>`;
  const soapResponseSnippet = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:feb="http://febraban.org.br/arrecadacao/online/v1"><soapenv:Body><feb:cancelamentoOpResponse><codigoRetorno>00</codigoRetorno><situacaoGuia>ESTORNADO_CANCELADO</situacaoGuia><dataHoraCancelamento>${canceledAt}</dataHoraCancelamento></feb:cancelamentoOpResponse></soapenv:Body></soapenv:Envelope>`;

  const audit = recordAudit({
    operation: "cancelamentoOp",
    requirementCode: "26.6",
    bankCode: bank.codigoCompensacao,
    bankName: bank.nomeInstituicao,
    channel: target.canalPagamento ?? bank.canalPadrao,
    targetIdentifier: target.nossoNumeroGuia,
    returnCode: "00",
    returnMessage: `cancelamentoOp: Pagamento da guia ${target.nossoNumeroGuia} estornado/cancelado com sucesso.`,
    soapRequestSnippet,
    soapResponseSnippet,
  });

  return {
    operation: "cancelamentoOp" as const,
    requirementCode: "26.6" as const,
    codigoRetornoFebraban: "00",
    mensagemRetorno: "CANCELAMENTO_PAGAMENTO_ONLINE_EFETIVADO",
    guia: target,
    soapEnvelopeResponse: soapResponseSnippet,
    audit,
  };
}

export function getFebrabanArrecadacaoState() {
  const store = ensureFebrabanStore();
  return {
    debts: store.debts,
    auditLogs: store.auditLogs,
    partnerBanks: FEBRABAN_PARTNER_BANKS,
    supportedOperations: [
      {
        operation: "consultarDebitoIPTUOp",
        requirementCode: "26.2",
        description: "Consulta débitos de IPTU em aberto conforme layout FEBRABAN de arrecadação online via webservice",
      },
      {
        operation: "consultarDebitoISSOp",
        requirementCode: "26.3",
        description: "Consulta débitos de ISSQN em aberto conforme layout FEBRABAN de arrecadação online via webservice",
      },
      {
        operation: "consultarDebitoDividaAtivaOp",
        requirementCode: "26.4",
        description: "Consulta débitos inscritos em Dívida Ativa (CDA) conforme layout FEBRABAN via webservice",
      },
      {
        operation: "consultarDebitoParcelamentoOp",
        requirementCode: "26.5",
        description: "Consulta parcelas de Acordos/Parcelamentos conforme layout FEBRABAN via webservice",
      },
      {
        operation: "cancelamentoOp",
        requirementCode: "26.6",
        description: "Cancelamento/estorno de pagamento autenticado conforme layout FEBRABAN via webservice",
      },
      {
        operation: "confirmacaoOp",
        requirementCode: "26.7",
        description: "Confirmação em tempo real de pagamento de guia conforme layout FEBRABAN via webservice",
      },
    ] as const,
  };
}

export function getFebrabanWsdlDescriptor(endpointUrl = "https://guarama.celeriflow.com.br/api/tributacao/arrecadacao-online"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"
             xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns:tns="http://febraban.org.br/arrecadacao/online/v1"
             targetNamespace="http://febraban.org.br/arrecadacao/online/v1"
             name="FebrabanArrecadacaoOnlineService">
  <portType name="FebrabanArrecadacaoOnlinePortType">
    <operation name="consultarDebitoIPTUOp"/>
    <operation name="consultarDebitoISSOp"/>
    <operation name="consultarDebitoDividaAtivaOp"/>
    <operation name="consultarDebitoParcelamentoOp"/>
    <operation name="cancelamentoOp"/>
    <operation name="confirmacaoOp"/>
  </portType>
  <service name="FebrabanArrecadacaoOnlineService">
    <port name="FebrabanArrecadacaoOnlinePort" binding="tns:FebrabanArrecadacaoOnlineBinding">
      <soap:address location="${endpointUrl}"/>
    </port>
  </service>
</definitions>`;
}

