import { generateFebrabanSegment6Barcode } from "./febraban-arrecadacao-service";

/**
 * CF29 — Declaração das Informações das Administradoras de Cartões (DECRED / DIMP Municipal)
 *
 * Implementa os requisitos atribuídos a Mateus (preservando integralmente 29.2 e 29.6):
 * - 29.1: Inclusão, Consulta e Edição de equipamentos utilizados (POS/TEF/SmartPOS/Ecommerce) por PF ou Inscrição Municipal.
 * - 29.3: Exigência de aceite do Termo de Responsabilidade pelo usuário credenciado.
 * - 29.4: Declaração da movimentação da administradora de cartão (competência, tipo da declaração, dados do responsável,
 *         natureza da operação, descrição, valor total das operações e valor da prestação do serviço).
 * - 29.5: Geração do DAM (Documento de Arrecadação Municipal) para pagamento referente aos serviços da administradora de cartão.
 * - 29.7: Módulo de recepção das declarações da administradora de cartões via Web Service com Layout Padrão e critérios técnicos,
 *         contendo detalhadamente todas as operações realizadas e autorizadas pela administradora.
 * - 29.8: Relatório na gestão da fiscalização de toda a movimentação declarada pelas administradoras por natureza de operação.
 * - 29.9: Relatório na gestão da fiscalização de todos os equipamentos cadastrados e vinculados às operações.
 */

export type CardOperationNature =
  | "CREDITO_A_VISTA"
  | "CREDITO_PARCELADO"
  | "DEBITO"
  | "SIMILARES_VOUCHER"
  | "OUTROS_MEIOS_ELETRONICOS";

export const CARD_OPERATION_NATURE_LABELS: Record<CardOperationNature, string> = {
  CREDITO_A_VISTA: "Cartão de Crédito à Vista",
  CREDITO_PARCELADO: "Cartão de Crédito Parcelado",
  DEBITO: "Cartão de Débito",
  SIMILARES_VOUCHER: "Similares / Voucher / Benefícios",
  OUTROS_MEIOS_ELETRONICOS: "Outros Meios de Pagamento Eletrônico",
};

export type CardDeclarationType = "NORMAL_ORIGINAL" | "RETIFICADORA" | "SEM_MOVIMENTO";

export type CardEquipmentRecord = {
  id: string;
  terminalNumber: string; // Número identificador do equipamento (29.1 / 29.9)
  serialNumber: string;
  equipmentModel: "POS_SEMPRE_ATIVO" | "TEF_INTEGRADO" | "SMART_POS" | "GATEWAY_ECOMMERCE";
  ownershipType: "PROPRIO" | "COMPARTILHADO" | "LOCADO_CREDENCIADORA";
  inscricaoMunicipal: string;
  contribuinteCpfCnpj: string;
  contribuinteNome: string;
  administradoraNome: string;
  administradoraCnpj: string;
  supportedNatures: CardOperationNature[];
  status: "ATIVO" | "SUSPENSO" | "BAIXADO";
  updatedAt: string;
};

export type ResponsibilityTermAcceptance = {
  id: string;
  credenciadoLogin: string;
  credenciadoNome: string;
  credenciadoCpfCnpj: string;
  inscricaoMunicipal: string;
  termVersion: string;
  accepted: boolean;
  acceptedAt: string;
  ipOrigin: string;
  termStatement: string;
};

export type AuthorizedOperationDetail = {
  authorizationCode: string;
  nsuHost: string;
  transactionDateTime: string;
  terminalNumber: string;
  estabelecimentoCpfCnpj: string;
  estabelecimentoInscricaoMunicipal: string;
  naturezaOperacao: CardOperationNature;
  installments: number;
  grossTransactionAmount: number;
  serviceFeeAmount: number;
};

export type CardAdministratorDeclaration = {
  id: string;
  competencia: string; // MM/AAAA
  tipoDeclaracao: CardDeclarationType;
  responsavelNome: string;
  responsavelCpf: string;
  responsavelCargo: string;
  responsavelEmail: string;
  administradoraNome: string;
  administradoraCnpj: string;
  naturezaOperacao: CardOperationNature;
  naturezaOperacaoLabel: string;
  descricaoServicos: string;
  terminalNumber: string;
  quantidadeOperacoesAutorizadas: number;
  valorTotalOperacoes: number;
  valorPrestacaoServico: number; // Base de cálculo do ISS da administradora (subitem 15.01)
  aliquotaIssPercent: number;
  valorIssDevido: number;
  origemRecepcao: "PORTAL_WEB" | "WEBSERVICE_PADRAO_29_7";
  protocoloRecepcao: string;
  createdAt: string;
  damGerado?: CardAdministratorDam;
  operacoesAutorizadasDetalhe: AuthorizedOperationDetail[];
};

export type CardAdministratorDam = {
  damNumber: string;
  declarationId: string;
  competencia: string;
  administradoraNome: string;
  administradoraCnpj: string;
  codigoReceitaMunicipal: "1114-51-ISS-CARTAO-1501";
  dataEmissao: string;
  dataVencimento: string;
  valorBaseServico: number;
  aliquotaPercent: number;
  valorPrincipalIss: number;
  valorTotalDam: number;
  codigoBarras44: string;
  linhaDigitavel48: string;
  status: "EMITIDO_ABERTO" | "PAGO";
};

export type FiscalNaturezaReportRow = {
  naturezaOperacao: CardOperationNature;
  naturezaLabel: string;
  quantidadeDeclaracoes: number;
  quantidadeTransacoesAutorizadas: number;
  valorTotalOperacoes: number;
  valorTotalPrestacaoServico: number;
  valorTotalIssApurado: number;
};

export const DECRED_RESPONSIBILITY_TERM_TEXT =
  "TERMO DE RESPONSABILIDADE DO USUÁRIO CREDENCIADO (Requisito 29.3): Declaro, sob as penas da Lei Complementar Federal nº 116/2003 (item 15.01) e do Código Tributário Municipal, que sou responsável pela veracidade, integridade e tempestividade das informações cadastradas referentes aos equipamentos (POS/TEF/similares) e às declarações de movimentação de cartões de crédito, débito e congêneres realizadas por este usuário credenciado.";

export const DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC = {
  version: "DECRED-WS-LAYOUT-2.0",
  requirementCode: "29.7",
  endpoint: "https://guarama.celeriflow.com.br/api/tributacao/declaracao-cartoes/webservice",
  protocol: "HTTPS TLS 1.3 (JSON / XML Schema Validated)",
  authentication: "Certificado Digital ICP-Brasil (mTLS) ou Chave de Credenciamento Municipal (X-Decred-Token)",
  technicalCriteria: [
    "Envio obrigatório até o dia 10 do mês subsequente à competência declarada.",
    "Identificação obrigatória do CNPJ da Administradora/Credenciadora e dados do responsável técnico/legal.",
    "Detalhamento individualizado de todas as operações realizadas e autorizadas pela administradora (NSU, Código de Autorização, Data/Hora, Número do Equipamento POS/TEF, CPF/CNPJ ou Inscrição Municipal do estabelecimento, Natureza da Operação, Valor Bruto da Transação e Valor da Taxa/Prestação do Serviço).",
    "Validação de soma (Hash/Totalizador): a soma dos valores brutos e das taxas das operações autorizadas deve coincidir com o cabeçalho da declaração.",
  ],
  requiredFields: [
    "competencia (MM/AAAA)",
    "tipoDeclaracao (NORMAL_ORIGINAL | RETIFICADORA | SEM_MOVIMENTO)",
    "administradoraNome / administradoraCnpj",
    "responsavel.nome / responsavel.cpf / responsavel.email",
    "naturezaOperacao (CREDITO_A_VISTA | CREDITO_PARCELADO | DEBITO | SIMILARES_VOUCHER | OUTROS_MEIOS_ELETRONICOS)",
    "descricaoServicos",
    "valorTotalOperacoes",
    "valorPrestacaoServico",
    "operacoesAutorizadas[] (authorizationCode, nsuHost, transactionDateTime, terminalNumber, estabelecimentoCpfCnpj, grossTransactionAmount, serviceFeeAmount)",
  ],
} as const;

const runtimeDecredStore: {
  initialized: boolean;
  equipments: CardEquipmentRecord[];
  terms: ResponsibilityTermAcceptance[];
  declarations: CardAdministratorDeclaration[];
  dams: CardAdministratorDam[];
} = {
  initialized: false,
  equipments: [],
  terms: [],
  declarations: [],
  dams: [],
};

function ensureDecredStore() {
  if (!runtimeDecredStore.initialized) {
    runtimeDecredStore.equipments = [
      {
        id: "EQP-001",
        terminalNumber: "POS-98442",
        serialNumber: "SN-INGENICO-98442-BR",
        equipmentModel: "SMART_POS",
        ownershipType: "LOCADO_CREDENCIADORA",
        inscricaoMunicipal: "IM-44510",
        contribuinteCpfCnpj: "14.582.900/0001-42",
        contribuinteNome: "Agropecuária e Serviços Triângulo Ltda",
        administradoraNome: "Cielo S.A.",
        administradoraCnpj: "01.027.058/0001-91",
        supportedNatures: ["CREDITO_A_VISTA", "CREDITO_PARCELADO", "DEBITO"],
        status: "ATIVO",
        updatedAt: "2026-11-01T10:00:00.000Z",
      },
      {
        id: "EQP-002",
        terminalNumber: "POS-77120",
        serialNumber: "SN-VERIFONE-77120-BR",
        equipmentModel: "TEF_INTEGRADO",
        ownershipType: "PROPRIO",
        inscricaoMunicipal: "IM-55019",
        contribuinteCpfCnpj: "07.331.650/0001-08",
        contribuinteNome: "Supermercado Central Campo Florido Ltda",
        administradoraNome: "Redecard Instituição de Pagamento S.A.",
        administradoraCnpj: "01.425.787/0001-04",
        supportedNatures: ["CREDITO_A_VISTA", "DEBITO", "SIMILARES_VOUCHER"],
        status: "ATIVO",
        updatedAt: "2026-11-02T11:30:00.000Z",
      },
      {
        id: "EQP-003",
        terminalNumber: "MP-33190",
        serialNumber: "SN-PAX-33190-BR",
        equipmentModel: "POS_SEMPRE_ATIVO",
        ownershipType: "COMPARTILHADO",
        inscricaoMunicipal: "IM-78201",
        contribuinteCpfCnpj: "123.456.789-00",
        contribuinteNome: "Dr. Marcos Vinícius Andrade (Pessoa Física)",
        administradoraNome: "PagSeguro Internet Instituição de Pagamento S.A.",
        administradoraCnpj: "08.561.701/0001-01",
        supportedNatures: ["CREDITO_A_VISTA", "CREDITO_PARCELADO", "DEBITO", "OUTROS_MEIOS_ELETRONICOS"],
        status: "ATIVO",
        updatedAt: "2026-11-03T09:15:00.000Z",
      },
    ];

    runtimeDecredStore.terms = [
      {
        id: "TERM-001",
        credenciadoLogin: "credenciado.cielo@operadora.com.br",
        credenciadoNome: "Roberto Almeida — Representante Credenciado Cielo S.A.",
        credenciadoCpfCnpj: "01.027.058/0001-91",
        inscricaoMunicipal: "IM-44510",
        termVersion: "2026.1",
        accepted: true,
        acceptedAt: "2026-11-01T09:00:00.000Z",
        ipOrigin: "189.44.112.10",
        termStatement: DECRED_RESPONSIBILITY_TERM_TEXT,
      },
    ];

    const seedDeclarations: Omit<CardAdministratorDeclaration, "damGerado">[] = [
      {
        id: "DEC-2026-001",
        competencia: "10/2026",
        tipoDeclaracao: "NORMAL_ORIGINAL",
        responsavelNome: "Roberto Almeida",
        responsavelCpf: "284.910.448-12",
        responsavelCargo: "Gerente de Compliance Fiscal",
        responsavelEmail: "fiscal@cielo.com.br",
        administradoraNome: "Cielo S.A.",
        administradoraCnpj: "01.027.058/0001-91",
        naturezaOperacao: "CREDITO_A_VISTA",
        naturezaOperacaoLabel: CARD_OPERATION_NATURE_LABELS.CREDITO_A_VISTA,
        descricaoServicos: "Administração, captura e liquidação de transações de cartão de crédito à vista (Subitem 15.01 LC 116/03)",
        terminalNumber: "POS-98442",
        quantidadeOperacoesAutorizadas: 420,
        valorTotalOperacoes: 185000.0,
        valorPrestacaoServico: 4625.0,
        aliquotaIssPercent: 5,
        valorIssDevido: 231.25,
        origemRecepcao: "PORTAL_WEB",
        protocoloRecepcao: "DECRED-202610-0001",
        createdAt: "2026-11-03T14:20:00.000Z",
        operacoesAutorizadasDetalhe: [
          {
            authorizationCode: "AUTH-991021",
            nsuHost: "NSU-880011",
            transactionDateTime: "2026-10-15T14:22:10.000Z",
            terminalNumber: "POS-98442",
            estabelecimentoCpfCnpj: "14.582.900/0001-42",
            estabelecimentoInscricaoMunicipal: "IM-44510",
            naturezaOperacao: "CREDITO_A_VISTA",
            installments: 1,
            grossTransactionAmount: 92500.0,
            serviceFeeAmount: 2312.5,
          },
          {
            authorizationCode: "AUTH-991022",
            nsuHost: "NSU-880012",
            transactionDateTime: "2026-10-24T17:05:44.000Z",
            terminalNumber: "POS-98442",
            estabelecimentoCpfCnpj: "14.582.900/0001-42",
            estabelecimentoInscricaoMunicipal: "IM-44510",
            naturezaOperacao: "CREDITO_A_VISTA",
            installments: 1,
            grossTransactionAmount: 92500.0,
            serviceFeeAmount: 2312.5,
          },
        ],
      },
      {
        id: "DEC-2026-002",
        competencia: "10/2026",
        tipoDeclaracao: "NORMAL_ORIGINAL",
        responsavelNome: "Fernanda Costa",
        responsavelCpf: "319.442.871-05",
        responsavelCargo: "Coordenadora Tributária",
        responsavelEmail: "tributario@userede.com.br",
        administradoraNome: "Redecard Instituição de Pagamento S.A.",
        administradoraCnpj: "01.425.787/0001-04",
        naturezaOperacao: "DEBITO",
        naturezaOperacaoLabel: CARD_OPERATION_NATURE_LABELS.DEBITO,
        descricaoServicos: "Processamento e liquidação de operações com cartão de débito em terminais TEF (Subitem 15.01)",
        terminalNumber: "POS-77120",
        quantidadeOperacoesAutorizadas: 890,
        valorTotalOperacoes: 240000.0,
        valorPrestacaoServico: 3600.0,
        aliquotaIssPercent: 5,
        valorIssDevido: 180.0,
        origemRecepcao: "WEBSERVICE_PADRAO_29_7",
        protocoloRecepcao: "DECRED-WS-202610-0002",
        createdAt: "2026-11-03T16:10:00.000Z",
        operacoesAutorizadasDetalhe: [
          {
            authorizationCode: "AUTH-774100",
            nsuHost: "NSU-551900",
            transactionDateTime: "2026-10-18T11:12:00.000Z",
            terminalNumber: "POS-77120",
            estabelecimentoCpfCnpj: "07.331.650/0001-08",
            estabelecimentoInscricaoMunicipal: "IM-55019",
            naturezaOperacao: "DEBITO",
            installments: 1,
            grossTransactionAmount: 240000.0,
            serviceFeeAmount: 3600.0,
          },
        ],
      },
      {
        id: "DEC-2026-003",
        competencia: "10/2026",
        tipoDeclaracao: "NORMAL_ORIGINAL",
        responsavelNome: "Lucas Martins",
        responsavelCpf: "109.883.210-64",
        responsavelCargo: "Analista Fiscal Sênior",
        responsavelEmail: "decred@pagseguro.com.br",
        administradoraNome: "PagSeguro Internet Instituição de Pagamento S.A.",
        administradoraCnpj: "08.561.701/0001-01",
        naturezaOperacao: "CREDITO_PARCELADO",
        naturezaOperacaoLabel: CARD_OPERATION_NATURE_LABELS.CREDITO_PARCELADO,
        descricaoServicos: "Administração de transações de crédito parcelado em 2x a 12x (Subitem 15.01)",
        terminalNumber: "MP-33190",
        quantidadeOperacoesAutorizadas: 195,
        valorTotalOperacoes: 98000.0,
        valorPrestacaoServico: 3430.0,
        aliquotaIssPercent: 5,
        valorIssDevido: 171.5,
        origemRecepcao: "WEBSERVICE_PADRAO_29_7",
        protocoloRecepcao: "DECRED-WS-202610-0003",
        createdAt: "2026-11-04T08:45:00.000Z",
        operacoesAutorizadasDetalhe: [
          {
            authorizationCode: "AUTH-331009",
            nsuHost: "NSU-219001",
            transactionDateTime: "2026-10-21T16:30:00.000Z",
            terminalNumber: "MP-33190",
            estabelecimentoCpfCnpj: "123.456.789-00",
            estabelecimentoInscricaoMunicipal: "IM-78201",
            naturezaOperacao: "CREDITO_PARCELADO",
            installments: 6,
            grossTransactionAmount: 98000.0,
            serviceFeeAmount: 3430.0,
          },
        ],
      },
    ];

    runtimeDecredStore.declarations = seedDeclarations.map((decl, idx) => {
      const damNumber = `DAM-CARTAO-202610-${String(idx + 1).padStart(4, "0")}`;
      const barcodes = generateFebrabanSegment6Barcode({
        valorTotal: decl.valorIssDevido,
        vencimentoYYYYMMDD: "2026-11-15",
        nossoNumeroGuia: `29202610${String(idx + 1).padStart(5, "0")}`,
      });
      const dam: CardAdministratorDam = {
        damNumber,
        declarationId: decl.id,
        competencia: decl.competencia,
        administradoraNome: decl.administradoraNome,
        administradoraCnpj: decl.administradoraCnpj,
        codigoReceitaMunicipal: "1114-51-ISS-CARTAO-1501",
        dataEmissao: decl.createdAt.slice(0, 10),
        dataVencimento: "2026-11-15",
        valorBaseServico: decl.valorPrestacaoServico,
        aliquotaPercent: decl.aliquotaIssPercent,
        valorPrincipalIss: decl.valorIssDevido,
        valorTotalDam: decl.valorIssDevido,
        ...barcodes,
        status: "EMITIDO_ABERTO",
      };
      runtimeDecredStore.dams.push(dam);
      return {
        ...decl,
        damGerado: dam,
      };
    });

    runtimeDecredStore.initialized = true;
  }
  return runtimeDecredStore;
}

export function hydrateDecredStore(data: {
  equipments?: CardEquipmentRecord[];
  terms?: ResponsibilityTermAcceptance[];
  declarations?: CardAdministratorDeclaration[];
  dams?: CardAdministratorDam[];
}) {
  const store = ensureDecredStore();
  if (data.equipments && data.equipments.length > 0) {
    store.equipments = [...data.equipments];
  }
  if (data.terms && data.terms.length > 0) {
    store.terms = [...data.terms];
  }
  if (data.declarations && data.declarations.length > 0) {
    store.declarations = [...data.declarations];
  }
  if (data.dams && data.dams.length > 0) {
    store.dams = [...data.dams];
  }
}

/**
 * Requisito 29.3 — Registra o aceite obrigatório do Termo de Responsabilidade pelo usuário credenciado.
 */
export function acceptCredenciadoResponsibilityTerm(input: {
  credenciadoLogin: string;
  credenciadoNome: string;
  credenciadoCpfCnpj: string;
  inscricaoMunicipal: string;
  accepted: boolean;
  ipOrigin?: string;
}): ResponsibilityTermAcceptance {
  if (!input.accepted) {
    throw new Error("É obrigatório aceitar o Termo de Responsabilidade para utilizar os serviços credenciados (Requisito 29.3).");
  }
  const store = ensureDecredStore();
  const record: ResponsibilityTermAcceptance = {
    id: `TERM-${String(store.terms.length + 1).padStart(3, "0")}`,
    credenciadoLogin: input.credenciadoLogin.trim(),
    credenciadoNome: input.credenciadoNome.trim(),
    credenciadoCpfCnpj: input.credenciadoCpfCnpj.trim(),
    inscricaoMunicipal: input.inscricaoMunicipal.trim(),
    termVersion: "2026.1",
    accepted: true,
    acceptedAt: new Date().toISOString(),
    ipOrigin: input.ipOrigin ?? "127.0.0.1",
    termStatement: DECRED_RESPONSIBILITY_TERM_TEXT,
  };
  store.terms.unshift(record);
  return record;
}

/**
 * Requisito 29.1 — Permite a inclusão, consulta e edição de equipamentos utilizados nas transações de cartões
 * pelas pessoas físicas ou inscrições municipais cadastradas.
 */
export function upsertCardEquipment(input: {
  id?: string;
  terminalNumber: string;
  serialNumber: string;
  equipmentModel?: CardEquipmentRecord["equipmentModel"];
  ownershipType?: CardEquipmentRecord["ownershipType"];
  inscricaoMunicipal: string;
  contribuinteCpfCnpj: string;
  contribuinteNome: string;
  administradoraNome: string;
  administradoraCnpj: string;
  supportedNatures?: CardOperationNature[];
  status?: CardEquipmentRecord["status"];
  requireAcceptedTerm?: boolean;
}): CardEquipmentRecord {
  const store = ensureDecredStore();
  if (input.requireAcceptedTerm && store.terms.length === 0) {
    throw new Error("O usuário credenciado deve aceitar o Termo de Responsabilidade antes de cadastrar ou editar equipamentos (29.3).");
  }
  if (!input.terminalNumber?.trim() || !input.inscricaoMunicipal?.trim() || !input.contribuinteCpfCnpj?.trim()) {
    throw new Error("Informe o número do terminal, a Inscrição Municipal e o CPF/CNPJ da pessoa física ou jurídica (29.1).");
  }

  const existing = store.equipments.find(
    (e) => (input.id && e.id === input.id) || e.terminalNumber.toUpperCase() === input.terminalNumber.trim().toUpperCase(),
  );

  if (existing) {
    existing.terminalNumber = input.terminalNumber.trim().toUpperCase();
    existing.serialNumber = input.serialNumber.trim();
    existing.equipmentModel = input.equipmentModel ?? existing.equipmentModel;
    existing.ownershipType = input.ownershipType ?? existing.ownershipType;
    existing.inscricaoMunicipal = input.inscricaoMunicipal.trim();
    existing.contribuinteCpfCnpj = input.contribuinteCpfCnpj.trim();
    existing.contribuinteNome = input.contribuinteNome.trim();
    existing.administradoraNome = input.administradoraNome.trim();
    existing.administradoraCnpj = input.administradoraCnpj.trim();
    existing.supportedNatures = input.supportedNatures ?? existing.supportedNatures;
    existing.status = input.status ?? existing.status;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const created: CardEquipmentRecord = {
    id: `EQP-${String(store.equipments.length + 1).padStart(3, "0")}`,
    terminalNumber: input.terminalNumber.trim().toUpperCase(),
    serialNumber: input.serialNumber.trim() || `SN-${input.terminalNumber.trim().toUpperCase()}`,
    equipmentModel: input.equipmentModel ?? "SMART_POS",
    ownershipType: input.ownershipType ?? "LOCADO_CREDENCIADORA",
    inscricaoMunicipal: input.inscricaoMunicipal.trim(),
    contribuinteCpfCnpj: input.contribuinteCpfCnpj.trim(),
    contribuinteNome: input.contribuinteNome.trim(),
    administradoraNome: input.administradoraNome.trim(),
    administradoraCnpj: input.administradoraCnpj.trim(),
    supportedNatures: input.supportedNatures ?? ["CREDITO_A_VISTA", "CREDITO_PARCELADO", "DEBITO"],
    status: input.status ?? "ATIVO",
    updatedAt: new Date().toISOString(),
  };
  store.equipments.unshift(created);
  return created;
}

/**
 * Requisito 29.4 — Registra a declaração da movimentação da administradora de cartão contendo:
 * competência, tipo da declaração, dados do responsável, natureza da operação, descrição,
 * valor total das operações e valor da prestação do serviço.
 */
export function submitCardAdministratorDeclaration(input: {
  competencia: string;
  tipoDeclaracao: CardDeclarationType;
  responsavelNome: string;
  responsavelCpf: string;
  responsavelCargo?: string;
  responsavelEmail: string;
  administradoraNome: string;
  administradoraCnpj: string;
  naturezaOperacao: CardOperationNature;
  descricaoServicos: string;
  terminalNumber: string;
  valorTotalOperacoes: number;
  valorPrestacaoServico: number;
  aliquotaIssPercent?: number;
  origemRecepcao?: "PORTAL_WEB" | "WEBSERVICE_PADRAO_29_7";
  operacoesAutorizadasDetalhe?: AuthorizedOperationDetail[];
}): CardAdministratorDeclaration {
  const store = ensureDecredStore();
  if (store.terms.length === 0) {
    throw new Error("Aceite do Termo de Responsabilidade obrigatório antes do envio da declaração (Requisito 29.3).");
  }

  const aliquota = input.aliquotaIssPercent ?? 5;
  const valorIssDevido = Number(((input.valorPrestacaoServico * aliquota) / 100).toFixed(2));
  const id = `DEC-2026-${String(store.declarations.length + 1).padStart(3, "0")}`;
  const nowIso = new Date().toISOString();

  const details: AuthorizedOperationDetail[] =
    input.operacoesAutorizadasDetalhe && input.operacoesAutorizadasDetalhe.length > 0
      ? input.operacoesAutorizadasDetalhe
      : [
          {
            authorizationCode: `AUTH-${Date.now().toString().slice(-6)}`,
            nsuHost: `NSU-${Date.now().toString().slice(-6)}`,
            transactionDateTime: nowIso,
            terminalNumber: input.terminalNumber,
            estabelecimentoCpfCnpj: "14.582.900/0001-42",
            estabelecimentoInscricaoMunicipal: "IM-44510",
            naturezaOperacao: input.naturezaOperacao,
            installments: input.naturezaOperacao === "CREDITO_PARCELADO" ? 6 : 1,
            grossTransactionAmount: input.valorTotalOperacoes,
            serviceFeeAmount: input.valorPrestacaoServico,
          },
        ];

  const declaration: CardAdministratorDeclaration = {
    id,
    competencia: input.competencia,
    tipoDeclaracao: input.tipoDeclaracao,
    responsavelNome: input.responsavelNome.trim(),
    responsavelCpf: input.responsavelCpf.trim(),
    responsavelCargo: input.responsavelCargo?.trim() || "Responsável Tributário Credenciado",
    responsavelEmail: input.responsavelEmail.trim(),
    administradoraNome: input.administradoraNome.trim(),
    administradoraCnpj: input.administradoraCnpj.trim(),
    naturezaOperacao: input.naturezaOperacao,
    naturezaOperacaoLabel: CARD_OPERATION_NATURE_LABELS[input.naturezaOperacao],
    descricaoServicos: input.descricaoServicos.trim(),
    terminalNumber: input.terminalNumber.trim().toUpperCase(),
    quantidadeOperacoesAutorizadas: details.length,
    valorTotalOperacoes: Number(input.valorTotalOperacoes),
    valorPrestacaoServico: Number(input.valorPrestacaoServico),
    aliquotaIssPercent: aliquota,
    valorIssDevido,
    origemRecepcao: input.origemRecepcao ?? "PORTAL_WEB",
    protocoloRecepcao: `DECRED-${input.competencia.replace("/", "")}-${String(store.declarations.length + 1).padStart(4, "0")}`,
    createdAt: nowIso,
    operacoesAutorizadasDetalhe: details,
  };

  store.declarations.unshift(declaration);
  return declaration;
}

/**
 * Requisito 29.5 — Permite a geração do DAM para pagamento referente aos serviços da administradora de cartão.
 */
export function generateCardAdministratorDam(declarationId: string): CardAdministratorDam {
  const store = ensureDecredStore();
  const decl = store.declarations.find((d) => d.id === declarationId);
  if (!decl) {
    throw new Error(`Declaração '${declarationId}' não encontrada para geração do DAM.`);
  }

  if (decl.damGerado) {
    return decl.damGerado;
  }

  const seq = store.dams.length + 1;
  const damNumber = `DAM-CARTAO-${decl.competencia.replace("/", "")}-${String(seq).padStart(4, "0")}`;
  const barcodes = generateFebrabanSegment6Barcode({
    valorTotal: decl.valorIssDevido,
    vencimentoYYYYMMDD: "2026-11-20",
    nossoNumeroGuia: `292026${String(seq).padStart(7, "0")}`,
  });

  const dam: CardAdministratorDam = {
    damNumber,
    declarationId: decl.id,
    competencia: decl.competencia,
    administradoraNome: decl.administradoraNome,
    administradoraCnpj: decl.administradoraCnpj,
    codigoReceitaMunicipal: "1114-51-ISS-CARTAO-1501",
    dataEmissao: new Date().toISOString().slice(0, 10),
    dataVencimento: "2026-11-20",
    valorBaseServico: decl.valorPrestacaoServico,
    aliquotaPercent: decl.aliquotaIssPercent,
    valorPrincipalIss: decl.valorIssDevido,
    valorTotalDam: decl.valorIssDevido,
    ...barcodes,
    status: "EMITIDO_ABERTO",
  };

  decl.damGerado = dam;
  store.dams.unshift(dam);
  return dam;
}

/**
 * Requisito 29.7 — Recepção das declarações da administradora de cartões via Web Service com Layout Padrão
 * contendo detalhadamente todas as operações realizadas e autorizadas pela administradora.
 */
export function receiveCardDeclarationViaWebService(payload: {
  competencia: string;
  tipoDeclaracao?: CardDeclarationType;
  administradoraNome: string;
  administradoraCnpj: string;
  responsavel: {
    nome: string;
    cpf: string;
    cargo?: string;
    email: string;
  };
  naturezaOperacao: CardOperationNature;
  descricaoServicos: string;
  operacoesAutorizadas: AuthorizedOperationDetail[];
}) {
  if (!Array.isArray(payload.operacoesAutorizadas) || payload.operacoesAutorizadas.length === 0) {
    throw new Error("O lote do Web Service DECRED (29.7) deve conter detalhadamente todas as operações realizadas e autorizadas.");
  }

  const valorTotalOperacoes = Number(
    payload.operacoesAutorizadas.reduce((sum, op) => sum + Number(op.grossTransactionAmount || 0), 0).toFixed(2),
  );
  const valorPrestacaoServico = Number(
    payload.operacoesAutorizadas.reduce((sum, op) => sum + Number(op.serviceFeeAmount || 0), 0).toFixed(2),
  );
  const primaryTerminal = payload.operacoesAutorizadas[0].terminalNumber || "POS-WS-001";

  const declaration = submitCardAdministratorDeclaration({
    competencia: payload.competencia,
    tipoDeclaracao: payload.tipoDeclaracao ?? "NORMAL_ORIGINAL",
    responsavelNome: payload.responsavel.nome,
    responsavelCpf: payload.responsavel.cpf,
    responsavelCargo: payload.responsavel.cargo,
    responsavelEmail: payload.responsavel.email,
    administradoraNome: payload.administradoraNome,
    administradoraCnpj: payload.administradoraCnpj,
    naturezaOperacao: payload.naturezaOperacao,
    descricaoServicos: payload.descricaoServicos,
    terminalNumber: primaryTerminal,
    valorTotalOperacoes,
    valorPrestacaoServico,
    origemRecepcao: "WEBSERVICE_PADRAO_29_7",
    operacoesAutorizadasDetalhe: payload.operacoesAutorizadas,
  });

  const dam = generateCardAdministratorDam(declaration.id);

  return {
    layoutVersion: DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC.version,
    protocoloRecepcao: declaration.protocoloRecepcao,
    declaration,
    dam,
  };
}

/**
 * Requisito 29.8 — Relatório no sistema de gestão da fiscalização de toda a movimentação declarada
 * pelas administradoras por natureza de operação.
 */
export function getFiscalReportByNaturezaOperacao(): FiscalNaturezaReportRow[] {
  const store = ensureDecredStore();
  const natures: CardOperationNature[] = [
    "CREDITO_A_VISTA",
    "CREDITO_PARCELADO",
    "DEBITO",
    "SIMILARES_VOUCHER",
    "OUTROS_MEIOS_ELETRONICOS",
  ];

  return natures.map((nat) => {
    const items = store.declarations.filter((d) => d.naturezaOperacao === nat);
    return {
      naturezaOperacao: nat,
      naturezaLabel: CARD_OPERATION_NATURE_LABELS[nat],
      quantidadeDeclaracoes: items.length,
      quantidadeTransacoesAutorizadas: items.reduce((s, i) => s + i.quantidadeOperacoesAutorizadas, 0),
      valorTotalOperacoes: Number(items.reduce((s, i) => s + i.valorTotalOperacoes, 0).toFixed(2)),
      valorTotalPrestacaoServico: Number(items.reduce((s, i) => s + i.valorPrestacaoServico, 0).toFixed(2)),
      valorTotalIssApurado: Number(items.reduce((s, i) => s + i.valorIssDevido, 0).toFixed(2)),
    };
  });
}

/**
 * Requisito 29.9 — Relatório no sistema de gestão da fiscalização de todos os equipamentos cadastrados.
 */
export function getFiscalReportAllEquipments() {
  const store = ensureDecredStore();
  return store.equipments.map((eq) => {
    const linkedDeclarations = store.declarations.filter((d) => d.terminalNumber === eq.terminalNumber);
    const totalMovimentado = linkedDeclarations.reduce((s, d) => s + d.valorTotalOperacoes, 0);
    const totalTaxaServico = linkedDeclarations.reduce((s, d) => s + d.valorPrestacaoServico, 0);
    return {
      ...eq,
      quantidadeDeclaracoesVinculadas: linkedDeclarations.length,
      totalMovimentadoNoEquipamento: Number(totalMovimentado.toFixed(2)),
      totalTaxaServicoNoEquipamento: Number(totalTaxaServico.toFixed(2)),
    };
  });
}

export function getDecredOverviewState() {
  const store = ensureDecredStore();
  return {
    equipments: store.equipments,
    terms: store.terms,
    declarations: store.declarations,
    dams: store.dams,
    reportByNatureza: getFiscalReportByNaturezaOperacao(),
    reportEquipments: getFiscalReportAllEquipments(),
    webServiceSpec: DECRED_WEBSERVICE_STANDARD_LAYOUT_SPEC,
    responsibilityTermText: DECRED_RESPONSIBILITY_TERM_TEXT,
  };
}

