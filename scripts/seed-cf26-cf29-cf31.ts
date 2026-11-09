import { config } from "dotenv";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { systemInstances, instanceParameters } from "../src/db/schema/instance-configuration";
import { users } from "../src/db/schema/identity";
import {
  generateFebrabanSegment6Barcode,
  type FebrabanOnlineDebtItem,
  type FebrabanWebServiceAuditLog,
} from "../src/lib/tributacao/febraban-arrecadacao-service";
import {
  type CardEquipmentRecord,
  type ResponsibilityTermAcceptance,
  type CardAdministratorDeclaration,
  type CardAdministratorDam,
} from "../src/lib/tributacao/card-administrators-decred-service";
import {
  buildInitialBackupCatalog,
  type BackupSnapshotRecord,
} from "../src/lib/platform/backup-service";

config({ path: ".env.production.local", quiet: true });
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export const DATASET_ID = "poc-guarama-cf26-cf29-cf31-v1";

// ============================================================================
// CF26 — ARRECADAÇÃO ONLINE SERVICE (PADRÃO FEBRABAN)
// ============================================================================
export const cf26Convenios = [
  { codigoBanco: "001", bancoNome: "Banco do Brasil S.A.", convenioFebraban: "8166-BB-MUN", agência: "1234-5", contaCorrente: "54321-0", status: "ATIVO_HOMOLOGADO" },
  { codigoBanco: "104", bancoNome: "Caixa Econômica Federal", convenioFebraban: "8166-CEF-MUN", agência: "0419", contaCorrente: "000789-1", status: "ATIVO_HOMOLOGADO" },
  { codigoBanco: "756", bancoNome: "Banco Cooperativo Sicoob", convenioFebraban: "8166-SCB-MUN", agência: "3120", contaCorrente: "12845-6", status: "ATIVO_HOMOLOGADO" },
];

export const cf26DebtsRaw = [
  {
    nossoNumeroGuia: "2026000100101",
    natureza: "IPTU" as const,
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
    status: "EM_ABERTO" as const,
  },
  {
    nossoNumeroGuia: "2026000100102",
    natureza: "IPTU" as const,
    codigoReceitaFebraban: "1112-01-IPTU",
    inscricaoMunicipalOuImobiliaria: "01.02.055.0210.002",
    documentoContribuinte: "234.567.890-11",
    nomeContribuinte: "Mariana Costa Silva",
    exercicio: 2026,
    competencia: "02/2026",
    parcela: "Parcela 02 de 06",
    dataVencimento: "2026-10-15",
    valorPrincipal: 185.0,
    valorJuros: 0,
    valorMulta: 0,
    valorDesconto: 0,
    valorTotalCobrado: 185.0,
    status: "PAGO_ONLINE" as const,
    codigoBancoArrecadador: "001",
    nomeBancoArrecadador: "Banco do Brasil S.A.",
    nsuTransacaoBancaria: "BB-20261015-884120",
    codigoAutenticacaoFebraban: "FEBRABAN-AUTH-BB-992104-2026",
    canalPagamento: "APP_MOBILE_BANKING" as const,
    dataHoraPagamento: "2026-10-15T10:32:14Z",
  },
  {
    nossoNumeroGuia: "2026000200201",
    natureza: "ISS" as const,
    codigoReceitaFebraban: "1113-05-ISSQN",
    inscricaoMunicipalOuImobiliaria: "IM-98210-0",
    documentoContribuinte: "14.892.301/0001-85",
    nomeContribuinte: "Veredas Engenharia e Consultoria Ltda.",
    exercicio: 2026,
    competencia: "09/2026",
    parcela: "Mensal / 09",
    dataVencimento: "2026-10-20",
    valorPrincipal: 1450.0,
    valorJuros: 0,
    valorMulta: 0,
    valorDesconto: 0,
    valorTotalCobrado: 1450.0,
    status: "PAGO_ONLINE" as const,
    codigoBancoArrecadador: "104",
    nomeBancoArrecadador: "Caixa Econômica Federal",
    nsuTransacaoBancaria: "CEF-20261020-410921",
    codigoAutenticacaoFebraban: "FEBRABAN-AUTH-CEF-781203-2026",
    canalPagamento: "INTERNET_BANKING" as const,
    dataHoraPagamento: "2026-10-20T15:45:00Z",
  },
  {
    nossoNumeroGuia: "2026000300301",
    natureza: "DIVIDA_ATIVA" as const,
    codigoReceitaFebraban: "1931-11-DIV-ATIVA",
    inscricaoMunicipalOuImobiliaria: "01.05.088.0310.003",
    documentoContribuinte: "345.678.901-22",
    nomeContribuinte: "Roberto Duarte Guimarães",
    exercicio: 2024,
    competencia: "2024-EXERC",
    parcela: "Integral CDA",
    numeroCda: "CDA-2026/00142",
    dataVencimento: "2026-11-30",
    valorPrincipal: 2400.0,
    valorJuros: 312.0,
    valorMulta: 240.0,
    valorDesconto: 0,
    valorTotalCobrado: 2952.0,
    status: "EM_ABERTO" as const,
  },
  {
    nossoNumeroGuia: "2026000400401",
    natureza: "PARCELAMENTO" as const,
    codigoReceitaFebraban: "1932-02-PARC-REFIS",
    inscricaoMunicipalOuImobiliaria: "IM-77401-2",
    documentoContribuinte: "03.112.987/0001-12",
    nomeContribuinte: "Auto Posto Veredas do Sol Ltda.",
    exercicio: 2025,
    competencia: "REFIS-2025",
    parcela: "Parcela 08 de 24",
    numeroAcordoParcelamento: "REFIS-2025/088",
    dataVencimento: "2026-11-10",
    valorPrincipal: 1250.0,
    valorJuros: 25.0,
    valorMulta: 0,
    valorDesconto: 0,
    valorTotalCobrado: 1275.0,
    status: "EM_ABERTO" as const,
  },
];

export const cf26Debts: FebrabanOnlineDebtItem[] = cf26DebtsRaw.map((debt) => {
  const barcode = generateFebrabanSegment6Barcode({
    valorTotal: debt.valorTotalCobrado,
    vencimentoYYYYMMDD: debt.dataVencimento,
    nossoNumeroGuia: debt.nossoNumeroGuia,
  });
  return { ...debt, ...barcode };
});

export const cf26AuditLogs: FebrabanWebServiceAuditLog[] = [
  {
    id: "febraban-audit-001",
    operation: "consultarDebitoIPTUOp",
    requirementCode: "26.2",
    timestamp: "2026-10-15T10:30:00Z",
    bankCode: "001",
    bankName: "Banco do Brasil S.A.",
    channel: "APP_MOBILE_BANKING",
    targetIdentifier: "01.02.055.0210.002",
    returnCode: "00",
    returnMessage: "Consulta de IPTU realizada com sucesso. Guia 2026000100102 retornada para pagamento.",
    soapRequestSnippet: "<soapenv:Envelope><soapenv:Body><consultarDebitoIPTUOp><inscricaoImobiliaria>01.02.055.0210.002</inscricaoImobiliaria></consultarDebitoIPTUOp></soapenv:Body></soapenv:Envelope>",
    soapResponseSnippet: "<soapenv:Envelope><soapenv:Body><consultarDebitoIPTUResponse><codigoRetorno>00</codigoRetorno><valorTotal>185.00</valorTotal></consultarDebitoIPTUResponse></soapenv:Body></soapenv:Envelope>",
  },
  {
    id: "febraban-audit-002",
    operation: "confirmacaoOp",
    requirementCode: "26.7",
    timestamp: "2026-10-15T10:32:14Z",
    bankCode: "001",
    bankName: "Banco do Brasil S.A.",
    channel: "APP_MOBILE_BANKING",
    targetIdentifier: "2026000100102",
    returnCode: "00",
    returnMessage: "Baixa online confirmada. NSU BB-20261015-884120 conciliado.",
    soapRequestSnippet: "<soapenv:Envelope><soapenv:Body><confirmacaoOp><nossoNumero>2026000100102</nossoNumero><nsu>BB-20261015-884120</nsu></confirmacaoOp></soapenv:Body></soapenv:Envelope>",
    soapResponseSnippet: "<soapenv:Envelope><soapenv:Body><confirmacaoResponse><codigoRetorno>00</codigoRetorno><status>CONCILIADO</status></confirmacaoResponse></soapenv:Body></soapenv:Envelope>",
  },
  {
    id: "febraban-audit-003",
    operation: "consultarDebitoISSOp",
    requirementCode: "26.3",
    timestamp: "2026-10-20T15:40:00Z",
    bankCode: "104",
    bankName: "Caixa Econômica Federal",
    channel: "INTERNET_BANKING",
    targetIdentifier: "IM-98210-0",
    returnCode: "00",
    returnMessage: "Consulta de ISS retida com sucesso. Guia 2026000200201 pronta para quitação.",
    soapRequestSnippet: "<soapenv:Envelope><soapenv:Body><consultarDebitoISSOp><inscricaoMunicipal>IM-98210-0</inscricaoMunicipal></consultarDebitoISSOp></soapenv:Body></soapenv:Envelope>",
    soapResponseSnippet: "<soapenv:Envelope><soapenv:Body><consultarDebitoISSResponse><codigoRetorno>00</codigoRetorno><valorTotal>1450.00</valorTotal></consultarDebitoISSResponse></soapenv:Body></soapenv:Envelope>",
  },
  {
    id: "febraban-audit-004",
    operation: "confirmacaoOp",
    requirementCode: "26.7",
    timestamp: "2026-10-20T15:45:00Z",
    bankCode: "104",
    bankName: "Caixa Econômica Federal",
    channel: "INTERNET_BANKING",
    targetIdentifier: "2026000200201",
    returnCode: "00",
    returnMessage: "Baixa online confirmada. NSU CEF-20261020-410921.",
    soapRequestSnippet: "<soapenv:Envelope><soapenv:Body><confirmacaoOp><nossoNumero>2026000200201</nossoNumero><nsu>CEF-20261020-410921</nsu></confirmacaoOp></soapenv:Body></soapenv:Envelope>",
    soapResponseSnippet: "<soapenv:Envelope><soapenv:Body><confirmacaoResponse><codigoRetorno>00</codigoRetorno><status>CONCILIADO</status></confirmacaoResponse></soapenv:Body></soapenv:Envelope>",
  },
];

// ============================================================================
// CF29 — DECLARAÇÃO DAS ADMINISTRADORAS DE CARTÕES (DECRED / POS / TEF / DAM)
// ============================================================================
export const cf29Equipments: CardEquipmentRecord[] = [
  {
    id: "cf29-eq-001",
    terminalNumber: "TERM-POS-00142",
    serialNumber: "SN-CIELO-8841029",
    equipmentModel: "POS_SEMPRE_ATIVO",
    ownershipType: "LOCADO_CREDENCIADORA",
    inscricaoMunicipal: "IM-10294-1",
    contribuinteCpfCnpj: "18.452.901/0001-33",
    contribuinteNome: "Supermercado das Veredas Ltda.",
    administradoraNome: "Cielo S.A.",
    administradoraCnpj: "01.027.058/0001-91",
    supportedNatures: ["CREDITO_A_VISTA", "CREDITO_PARCELADO", "DEBITO", "SIMILARES_VOUCHER"],
    status: "ATIVO",
    updatedAt: "2026-09-01T08:00:00Z",
  },
  {
    id: "cf29-eq-002",
    terminalNumber: "TERM-TEF-00388",
    serialNumber: "SN-PINPAD-GERTEC-41902",
    equipmentModel: "TEF_INTEGRADO",
    ownershipType: "PROPRIO",
    inscricaoMunicipal: "IM-10294-1",
    contribuinteCpfCnpj: "18.452.901/0001-33",
    contribuinteNome: "Supermercado das Veredas Ltda.",
    administradoraNome: "Redecard Instituição de Pagamento S.A.",
    administradoraCnpj: "01.425.787/0001-04",
    supportedNatures: ["CREDITO_A_VISTA", "CREDITO_PARCELADO", "DEBITO"],
    status: "ATIVO",
    updatedAt: "2026-09-01T08:00:00Z",
  },
  {
    id: "cf29-eq-003",
    terminalNumber: "TERM-SMART-00812",
    serialNumber: "SN-STONE-PAX-77120",
    equipmentModel: "SMART_POS",
    ownershipType: "LOCADO_CREDENCIADORA",
    inscricaoMunicipal: "IM-20411-8",
    contribuinteCpfCnpj: "24.910.450/0001-77",
    contribuinteNome: "Drogaria e Farmácia Central Veredas Ltda.",
    administradoraNome: "Stone Pagamentos S.A.",
    administradoraCnpj: "16.501.555/0001-57",
    supportedNatures: ["CREDITO_A_VISTA", "CREDITO_PARCELADO", "DEBITO", "SIMILARES_VOUCHER"],
    status: "ATIVO",
    updatedAt: "2026-09-10T09:30:00Z",
  },
  {
    id: "cf29-eq-004",
    terminalNumber: "TERM-POS-00945",
    serialNumber: "SN-PAGBANK-PRO-91823",
    equipmentModel: "POS_SEMPRE_ATIVO",
    ownershipType: "LOCADO_CREDENCIADORA",
    inscricaoMunicipal: "IM-31089-4",
    contribuinteCpfCnpj: "31.204.890/0001-20",
    contribuinteNome: "Restaurante e Churrascaria Sabor de Minas",
    administradoraNome: "PagSeguro Internet S.A. (PagBank)",
    administradoraCnpj: "08.561.701/0001-01",
    supportedNatures: ["CREDITO_A_VISTA", "CREDITO_PARCELADO", "DEBITO", "SIMILARES_VOUCHER"],
    status: "ATIVO",
    updatedAt: "2026-09-15T11:00:00Z",
  },
];

export const cf29Terms: ResponsibilityTermAcceptance[] = [
  {
    id: "cf29-term-001",
    credenciadoLogin: "financeiro@supermercadoveredas.com.br",
    credenciadoNome: "Marcos Vinicius Rezende",
    credenciadoCpfCnpj: "18.452.901/0001-33",
    inscricaoMunicipal: "IM-10294-1",
    termVersion: "2026.1",
    accepted: true,
    acceptedAt: "2026-08-20T14:22:10Z",
    ipOrigin: "187.54.210.45",
    termStatement: "Declaro sob as penas da lei que todos os equipamentos de TEF/POS cadastrados operam com vínculo exclusivo a esta Inscrição Municipal.",
  },
  {
    id: "cf29-term-002",
    credenciadoLogin: "fiscal@farmaciacentralveredas.com.br",
    credenciadoNome: "Juliana Mendes Paiva",
    credenciadoCpfCnpj: "24.910.450/0001-77",
    inscricaoMunicipal: "IM-20411-8",
    termVersion: "2026.1",
    accepted: true,
    acceptedAt: "2026-08-25T09:15:33Z",
    ipOrigin: "177.102.88.19",
    termStatement: "Aceite formal das obrigações acessórias de escrituração de meios de pagamento eletrônico perante o Fisco Municipal.",
  },
];

export const cf29Dams: CardAdministratorDam[] = [
  {
    damNumber: "DAM-CARTAO-202609-0001",
    declarationId: "cf29-decl-cielo-092026",
    competencia: "09/2026",
    administradoraNome: "Cielo S.A.",
    administradoraCnpj: "01.027.058/0001-91",
    codigoReceitaMunicipal: "1114-51-ISS-CARTAO-1501",
    dataEmissao: "2026-10-08",
    dataVencimento: "2026-10-25",
    valorBaseServico: 12130.0,
    aliquotaPercent: 5.0,
    valorPrincipalIss: 606.5,
    valorTotalDam: 606.5,
    codigoBarras44: "816600000060650041920261025002026002900010",
    linhaDigitavel48: "81660000006-0 06500419202-6 61025002026-0 002900010-0",
    status: "PAGO",
  },
  {
    damNumber: "DAM-CARTAO-202609-0002",
    declarationId: "cf29-decl-rede-092026",
    competencia: "09/2026",
    administradoraNome: "Redecard Instituição de Pagamento S.A.",
    administradoraCnpj: "01.425.787/0001-04",
    codigoReceitaMunicipal: "1114-51-ISS-CARTAO-1501",
    dataEmissao: "2026-10-09",
    dataVencimento: "2026-10-25",
    valorBaseServico: 5100.0,
    aliquotaPercent: 5.0,
    valorPrincipalIss: 255.0,
    valorTotalDam: 255.0,
    codigoBarras44: "816600000025500041920261025002026002900028",
    linhaDigitavel48: "81660000002-5 55000419202-6 61025002026-0 002900028-0",
    status: "PAGO",
  },
];

export const cf29Declarations: CardAdministratorDeclaration[] = [
  {
    id: "cf29-decl-cielo-092026",
    competencia: "09/2026",
    tipoDeclaracao: "NORMAL_ORIGINAL",
    responsavelNome: "Eduardo Henrique Fagundes",
    responsavelCpf: "098.765.432-10",
    responsavelCargo: "Diretor de Relações Tributárias e Regulatórias",
    responsavelEmail: "decred.municipal@cielo.com.br",
    administradoraNome: "Cielo S.A.",
    administradoraCnpj: "01.027.058/0001-91",
    naturezaOperacao: "CREDITO_A_VISTA",
    naturezaOperacaoLabel: "Operações com Cartão de Crédito à Vista",
    descricaoServicos: "Intermediação de pagamentos com cartão de crédito à vista no comércio do Município.",
    terminalNumber: "TERM-POS-00142",
    quantidadeOperacoesAutorizadas: 1,
    valorTotalOperacoes: 485200.0,
    valorPrestacaoServico: 12130.0,
    aliquotaIssPercent: 5.0,
    valorIssDevido: 606.5,
    origemRecepcao: "PORTAL_WEB",
    protocoloRecepcao: "DECRED-2026-09-CIELO-008129",
    createdAt: "2026-10-08T16:00:00Z",
    damGerado: cf29Dams[0],
    operacoesAutorizadasDetalhe: [
      {
        authorizationCode: "AUTH-889102",
        nsuHost: "NSU-CIELO-41029",
        transactionDateTime: "2026-09-15T14:32:00Z",
        terminalNumber: "TERM-POS-00142",
        estabelecimentoCpfCnpj: "18.452.901/0001-33",
        estabelecimentoInscricaoMunicipal: "IM-10294-1",
        naturezaOperacao: "CREDITO_A_VISTA",
        installments: 1,
        grossTransactionAmount: 485200.0,
        serviceFeeAmount: 12130.0,
      },
    ],
  },
  {
    id: "cf29-decl-rede-092026",
    competencia: "09/2026",
    tipoDeclaracao: "NORMAL_ORIGINAL",
    responsavelNome: "Patrícia Albuquerque Ramos",
    responsavelCpf: "876.543.210-99",
    responsavelCargo: "Gerente de Compliance Fiscal",
    responsavelEmail: "decred@rede.com.br",
    administradoraNome: "Redecard Instituição de Pagamento S.A.",
    administradoraCnpj: "01.425.787/0001-04",
    naturezaOperacao: "DEBITO",
    naturezaOperacaoLabel: "Operações com Cartão de Débito",
    descricaoServicos: "Operações de débito eletrônico com captura via TEF multiponto.",
    terminalNumber: "TERM-TEF-00388",
    quantidadeOperacoesAutorizadas: 1,
    valorTotalOperacoes: 340000.0,
    valorPrestacaoServico: 5100.0,
    aliquotaIssPercent: 5.0,
    valorIssDevido: 255.0,
    origemRecepcao: "WEBSERVICE_PADRAO_29_7",
    protocoloRecepcao: "DECRED-2026-09-REDE-004192",
    createdAt: "2026-10-09T11:20:00Z",
    damGerado: cf29Dams[1],
    operacoesAutorizadasDetalhe: [
      {
        authorizationCode: "AUTH-771922",
        nsuHost: "NSU-REDE-88192",
        transactionDateTime: "2026-09-20T11:20:00Z",
        terminalNumber: "TERM-TEF-00388",
        estabelecimentoCpfCnpj: "18.452.901/0001-33",
        estabelecimentoInscricaoMunicipal: "IM-10294-1",
        naturezaOperacao: "DEBITO",
        installments: 1,
        grossTransactionAmount: 340000.0,
        serviceFeeAmount: 5100.0,
      },
    ],
  },
];

// ============================================================================
// CF31 — LOGS DE ROTINA DE BACKUP EM NUVEM E RETENÇÃO
// ============================================================================
export const cf31BackupLogs: BackupSnapshotRecord[] = buildInitialBackupCatalog();

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log(`\n================================================================`);
  console.log(`  CARGA DE DADOS SEMISINTÉTICOS (CF26, CF29, CF31)              `);
  console.log(`  Modo: ${isApply ? "APPLY (Gravação real no banco)" : "PREVIEW (Simulação / Dry-Run)"}`);
  console.log(`================================================================\n`);

  const previewStats = {
    dataset: DATASET_ID,
    cf26_arrecadacao_febraban: {
      convenios_bancarios: cf26Convenios.length,
      debitos_guias_febraban: cf26Debts.length,
      logs_auditoria_webservice: cf26AuditLogs.length,
    },
    cf29_decred_administradoras_cartoes: {
      equipamentos_pos_tef_smart: cf29Equipments.length,
      termos_responsabilidade_aceitos: cf29Terms.length,
      declaracoes_decred_mensais: cf29Declarations.length,
      guias_dam_avulso_emitidas: cf29Dams.length,
    },
    cf31_backup_nuvem_retencao: {
      registros_rotina_backup: cf31BackupLogs.length,
      politicas_atendidas: ["FULL diário (7 dias)", "FULL mensal (12 meses)", "Diferencial horário (24h)"],
      cota_monitorada_bytes: "3 TB (3.298.534.883.328 bytes)",
    },
    seguranca: {
      modo: "100% ADITIVO (ON CONFLICT DO NOTHING / UPDATE)",
      altera_outros_modulos: false,
      altera_usuarios_ou_credenciais: false,
      transacao_atomica: true,
    },
  };

  console.log("Plano da Carga:");
  console.log(JSON.stringify(previewStats, null, 2));

  if (!isApply) {
    console.log(`\n[AVISO] Para aplicar a carga no banco de dados, execute:`);
    console.log(`  npm run seed:tributacao-infra -- --apply\n`);
    return;
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Variável DATABASE_URL ou DATABASE_URL_UNPOOLED não configurada no ambiente.");
  }

  const connection = createDatabaseConnection(connectionString);
  const { db } = connection;

  try {
    const [instance] = await db.select().from(systemInstances).limit(1);
    const instanceId = instance?.id || "one";

    const [adminUser] = await db.select({ id: users.id }).from(users).where(eq(users.ativo, true)).limit(1);
    const actorId = adminUser?.id || "admin";

    console.log(`Executando transação atômica (Instância: ${instanceId}, Autor: ${actorId})...`);

    const result = await withDatabaseTransaction(connection, async (tx) => {
      let savedParameters = 0;

      // 1. CF26 - Salvar convênios, débitos e logs de auditoria FEBRABAN
      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF26:CONVENIOS_BANCARIOS",
        valor: cf26Convenios,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf26Convenios, updatedAt: new Date() },
      });
      savedParameters++;

      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF26:ONLINE_DEBTS",
        valor: cf26Debts,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf26Debts, updatedAt: new Date() },
      });
      savedParameters++;

      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF26:AUDIT_LOGS",
        valor: cf26AuditLogs,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf26AuditLogs, updatedAt: new Date() },
      });
      savedParameters++;

      // 2. CF29 - Salvar equipamentos POS/TEF, termos aceitos, declarações DECRED e DAMs
      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF29:EQUIPMENTS",
        valor: cf29Equipments,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf29Equipments, updatedAt: new Date() },
      });
      savedParameters++;

      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF29:TERMS",
        valor: cf29Terms,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf29Terms, updatedAt: new Date() },
      });
      savedParameters++;

      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF29:DECLARATIONS",
        valor: cf29Declarations,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf29Declarations, updatedAt: new Date() },
      });
      savedParameters++;

      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF29:DAMS",
        valor: cf29Dams,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf29Dams, updatedAt: new Date() },
      });
      savedParameters++;

      // 3. CF31 - Salvar histórico de backups em nuvem
      await tx.insert(instanceParameters).values({
        configuracaoInstanciaId: instanceId,
        chave: "CF31:BACKUP_LOGS",
        valor: cf31BackupLogs,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
        set: { valor: cf31BackupLogs, updatedAt: new Date() },
      });
      savedParameters++;

      return {
        status: "GRAVADO_COM_SUCESSO",
        savedParameters,
        cf26_convenios: cf26Convenios.length,
        cf26_debitos: cf26Debts.length,
        cf29_equipamentos: cf29Equipments.length,
        cf29_declaracoes: cf29Declarations.length,
        cf29_dams: cf29Dams.length,
        cf31_logs_backup: cf31BackupLogs.length,
      };
    });

    console.log(`\n================================================================`);
    console.log(`  CARGA CF26, CF29 E CF31 EXECUTADA COM SUCESSO!                `);
    console.log(`================================================================`);
    console.log(JSON.stringify(result, null, 2));

  } finally {
    await connection.pool.end();
  }
}

main().catch((error) => {
  console.error("\n[ERRO NA CARGA]:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
