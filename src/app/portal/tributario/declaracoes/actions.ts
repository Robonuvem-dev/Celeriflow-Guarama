"use server";

import { revalidatePath } from "next/cache";
import { sendEmailNotification } from "@/lib/notifications/ses-email-engine";

export interface DeclarationSubmissionInput {
  taxpayerId: string;
  kind: "DMS" | "BANCOS" | "DIVERSOS" | "CARTORIO" | "TOMADOS" | "CARTOES";
  competence: string; // MM/AAAA
  noMovement: boolean;
  declarationType: "Normal" | "Complementar" | "Retificadora" | "Sem Movimento";
  totalMovement: number;
  taxableBase: number;
  issDue: number;
  issPayable: number;
  notes?: string;
  saloonPartnerId?: string;
}

export interface PartialGuideInput {
  taxpayerId: string;
  competence: string;
  invoiceIds: string[];
  totalValue: number;
}

export async function submitDeclarationAction(input: DeclarationSubmissionInput) {
  try {
    if (!input.competence || !/^(0[1-9]|1[0-2])\/\d{4}$/.test(input.competence)) {
      return { error: "Competência inválida. Utilize o formato MM/AAAA." };
    }

    const timestamp = new Date();
    const dateFormatted = timestamp.toLocaleDateString("pt-BR") + " às " + timestamp.toLocaleTimeString("pt-BR");
    const code = "DEC-" + Math.floor(100000 + Math.random() * 900000);
    const protocol = `PROT-${input.kind}-${input.competence.replace("/", "")}-${code}`;
    const hash = Buffer.from(`${protocol}|${input.taxpayerId}|${timestamp.toISOString()}`).toString("hex").slice(0, 32).toUpperCase();

    const declaration = {
      id: "decl-" + Math.random().toString(36).substring(2, 9),
      protocol,
      competence: input.competence,
      kind: input.kind,
      direction: input.kind === "TOMADOS" ? "TOMADOS" : "PRESTADOS",
      declarationType: input.noMovement ? "Sem Movimento" : input.declarationType,
      status: "Entregue / Processada",
      noMovement: input.noMovement,
      receiptNumber: protocol,
      authCode: hash,
      submittedAt: dateFormatted,
      serviceValue: input.noMovement ? 0 : input.totalMovement,
      taxableBase: input.noMovement ? 0 : input.taxableBase,
      issDue: input.noMovement ? 0 : input.issDue,
      issPayable: input.noMovement ? 0 : input.issPayable,
      taxpayerId: input.taxpayerId,
      notes: input.notes ?? "",
    };

    revalidatePath("/portal/tributario/declaracoes");
    return { error: undefined, declaration };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao processar declaração." };
  }
}

export async function generateGuideAction(input: {
  taxpayerId: string;
  competence: string;
  amount: number;
  tributoNome?: string;
  isPartial?: boolean;
  invoiceCount?: number;
}) {
  try {
    if (input.amount <= 0) {
      return { error: "O valor para emissão da guia deve ser maior que zero." };
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);
    const dueDateStr = dueDate.toLocaleDateString("pt-BR");

    const guideNumber = "DAM-" + new Date().getFullYear() + "-" + Math.floor(1000000 + Math.random() * 9000000);
    const barcode = `816${Math.floor(100000000 + Math.random() * 900000000)} ${Math.floor(10000000000 + Math.random() * 90000000000)} ${Math.floor(10000000000 + Math.random() * 90000000000)} ${Math.floor(10000000000 + Math.random() * 90000000000)}`;
    const pixCopyPaste = `00020126580014br.gov.bcb.pix0136guarama-issqn-${guideNumber.toLowerCase()}5204000053039865405${input.amount.toFixed(2)}5802BR5915PREF MUNC GUARAMA6008GUARAMA62070503***6304A1B2`;

    const guide = {
      id: "guide-" + Math.random().toString(36).substring(2, 9),
      guideNumber,
      barcode,
      pixCopyPaste,
      pixQrCode: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><rect width='160' height='160' fill='white'/><rect x='20' y='20' width='40' height='40' fill='black'/><rect x='100' y='20' width='40' height='40' fill='black'/><rect x='20' y='100' width='40' height='40' fill='black'/><rect x='80' y='80' width='20' height='20' fill='black'/><rect x='110' y='110' width='30' height='30' fill='black'/><text x='80' y='155' font-size='9' text-anchor='middle' fill='%23666'>PIX GUARAMA</text></svg>`,
      competence: input.competence,
      amount: input.amount,
      dueDate: dueDateStr,
      status: "Aguardando Pagamento",
      tributo: input.tributoNome || "ISSQN Próprio Mensal",
      isPartial: Boolean(input.isPartial),
      invoiceCount: input.invoiceCount || 1,
    };

    return { error: undefined, guide };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao emitir guia." };
  }
}

export async function cancelSubstituteNfseAction(input: {
  invoiceId: string;
  invoiceNumber: number;
  reason: string;
  cancelType: "SERVICO_NAO_PRESTADO" | "DUPLICIDADE";
  declarationDelivered: boolean;
  hasSubstituteTaker?: boolean;
}) {
  try {
    if (!input.reason || input.reason.length < 10) {
      return { error: "Informe uma justificativa fundamentada com no mínimo 10 caracteres." };
    }

    // Regra 9.37 e 9.106:
    // Se a declaração já foi entregue ou passou da data de vencimento:
    // requer cancelamento protocolado para deferimento/indeferimento do fiscal (e do tomador substituto se aplicável)
    if (input.declarationDelivered) {
      const protocolNumber = `CANC-PROT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      return {
        error: undefined,
        status: "PROCESSANDO_DEFERIMENTO",
        protocol: protocolNumber,
        message: `Como a declaração da competência já foi entregue, o pedido de cancelamento da NFS-e nº ${input.invoiceNumber} foi protocolado sob nº ${protocolNumber} para análise e deferimento do Auditor Fiscal${input.hasSubstituteTaker ? " e anuência do Tomador Substituto" : ""}.`,
      };
    }

    // Se antes da entrega da declaração: cancelamento imediato
    return {
      error: undefined,
      status: "CANCELADA_AUTOMATICA",
      message: `NFS-e nº ${input.invoiceNumber} cancelada com sucesso antes da homologação da declaração mensal. Motivo: ${input.cancelType === "SERVICO_NAO_PRESTADO" ? "Serviço Não Prestado" : "Duplicidade de Nota Fiscal"}.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao processar cancelamento de NFS-e." };
  }
}

export async function deductionConstructionAction(input: {
  danfeKey: string;
  invoiceNumber: string;
  issuerCnpj: string;
  recipientDocument: string;
  constructionAddress: string;
  issueDate: string;
  deductionAmount: number;
  existingKeys?: string[];
}) {
  try {
    const cleanKey = input.danfeKey.replace(/\D/g, "");
    if (cleanKey.length !== 44) {
      return { error: "A chave de acesso da NF-e / DANFE deve conter exatamente 44 dígitos numéricos." };
    }

    if (input.existingKeys && input.existingKeys.includes(cleanKey)) {
      return { error: "Rejeição: Esta nota fiscal / DANFE já foi utilizada em dedução anterior para esta ou outra obra municipal (Duplicidade vedada conforme Dec. 4544/2018)." };
    }

    if (input.deductionAmount <= 0) {
      return { error: "O valor a ser deduzido em materiais deve ser superior a zero." };
    }

    if (!input.constructionAddress || input.constructionAddress.length < 5) {
      return { error: "Endereço da obra é obrigatório para vínculo e fiscalização in loco." };
    }

    const deduction = {
      id: "ded-" + Math.random().toString(36).substring(2, 9),
      danfeKey: cleanKey,
      invoiceNumber: input.invoiceNumber,
      issuerCnpj: input.issuerCnpj,
      recipientDocument: input.recipientDocument,
      constructionAddress: input.constructionAddress,
      issueDate: input.issueDate,
      deductionAmount: input.deductionAmount,
      status: "Validada e Aprovada",
      validatedAt: new Date().toLocaleDateString("pt-BR"),
    };

    return { error: undefined, deduction };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao processar dedução de materiais." };
  }
}

export async function savePartnerSalonAction(input: {
  salonTaxpayerId: string;
  partnerName: string;
  partnerDocument: string; // CNPJ ou CPF
  partnerMunicipalInsc: string;
  serviceCode: "6.01" | "6.02";
  splitPercentage: number;
  contractNumber: string;
}) {
  try {
    if (!input.partnerName || !input.partnerDocument) {
      return { error: "Dados do profissional-parceiro incompletos (Nome e Documento são obrigatórios)." };
    }

    if (input.splitPercentage <= 0 || input.splitPercentage >= 100) {
      return { error: "O percentual de rateio do parceiro deve estar entre 1% e 99%." };
    }

    const partner = {
      id: "part-" + Math.random().toString(36).substring(2, 9),
      partnerName: input.partnerName,
      partnerDocument: input.partnerDocument,
      partnerMunicipalInsc: input.partnerMunicipalInsc || "Isento / Em cadastramento",
      serviceCode: input.serviceCode,
      splitPercentage: input.splitPercentage,
      contractNumber: input.contractNumber || `CONTR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      status: "Ativo e Vinculado",
      registeredAt: new Date().toLocaleDateString("pt-BR"),
    };

    return { error: undefined, partner };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao cadastrar profissional parceiro." };
  }
}

export async function saveEquipmentPosAction(input: {
  serialNumber: string;
  brandAcquirer: string;
  model: string;
  terminalType: "POS_MOVEL" | "TEF_FIXO" | "SMART_POS";
  merchantCnpj: string;
}) {
  try {
    if (!input.serialNumber || !input.brandAcquirer) {
      return { error: "Número de série e credenciadora são obrigatórios para cadastro de equipamento." };
    }

    const equipment = {
      id: "eq-" + Math.random().toString(36).substring(2, 9),
      serialNumber: input.serialNumber,
      brandAcquirer: input.brandAcquirer,
      model: input.model || "Terminal Padrão",
      terminalType: input.terminalType,
      merchantCnpj: input.merchantCnpj,
      status: "Homologado",
      registeredAt: new Date().toLocaleDateString("pt-BR"),
    };

    return { error: undefined, equipment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao credenciar equipamento." };
  }
}

export async function saveExternalTaxpayerAction(input: {
  document: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  address: string;
  zipCode: string;
  attachmentsCount: number;
}) {
  try {
    if (!input.document || !input.name || !input.email) {
      return { error: "Preencha os campos obrigatórios (CPF/CNPJ, Razão Social/Nome e E-mail)." };
    }

    const protocol = `CAD-EXT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    return {
      error: undefined,
      protocol,
      message: `Solicitação de auto-cadastro recebida com sucesso sob protocolo ${protocol}. Aguarde avaliação e deferimento do Auditor Fiscal Municipal.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao solicitar auto-cadastro." };
  }
}

export async function sendMessageAction(input: {
  taxpayerId: string;
  subject: string;
  body: string;
  senderType: "CONTRIBUINTE" | "FISCAL";
}) {
  try {
    if (!input.subject || !input.body) {
      return { error: "Assunto e mensagem são obrigatórios." };
    }

    const message = {
      id: "msg-" + Math.random().toString(36).substring(2, 9),
      subject: input.subject,
      body: input.body,
      senderType: input.senderType,
      senderName: input.senderType === "CONTRIBUINTE" ? "Você (Contribuinte)" : "Auditor Fiscal da Receita Municipal",
      sentAt: new Date().toLocaleDateString("pt-BR") + " às " + new Date().toLocaleTimeString("pt-BR"),
      read: input.senderType === "CONTRIBUINTE",
    };

    return { error: undefined, message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao enviar mensagem." };
  }
}

export async function requestAidfAction(input: {
  taxpayerId: string;
  documentType: "RPS" | "FORMULARIO_SEGURANCA";
  initialNumber: number;
  finalNumber: number;
  graphicCnpj: string;
  justification: string;
}) {
  try {
    if (input.finalNumber <= input.initialNumber) {
      return { error: "O número final deve ser maior que o número inicial." };
    }

    const aidfNumber = `AIDF-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const authCode = Buffer.from(aidfNumber + input.graphicCnpj).toString("hex").slice(0, 16).toUpperCase();

    const aidf = {
      id: "aidf-" + Math.random().toString(36).substring(2, 9),
      aidfNumber,
      authCode,
      documentType: input.documentType,
      initialNumber: input.initialNumber,
      finalNumber: input.finalNumber,
      quantity: input.finalNumber - input.initialNumber + 1,
      graphicCnpj: input.graphicCnpj,
      status: "Deferida e Autorizada",
      issuedAt: new Date().toLocaleDateString("pt-BR"),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR"),
    };

    return { error: undefined, aidf };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao solicitar AIDF." };
  }
}

export async function sendNfseEmailAction(input: {
  invoiceNumber: number;
  recipientEmail: string;
  recipientName: string;
  verificationCode: string;
}) {
  try {
    if (!input.recipientEmail || !input.recipientEmail.includes("@")) {
      return { error: "Informe um endereço de e-mail válido." };
    }

    const subject = `NFS-e Eletrônica nº ${input.invoiceNumber} — Município de Guaramá`;
    const htmlContent = `
      <p>Olá <strong>${input.recipientName}</strong>,</p>
      <p>Sua Nota Fiscal de Serviços Eletrônica (NFS-e) nº <strong>${input.invoiceNumber}</strong> foi emitida com sucesso pelo Município de Guaramá.</p>
      <p>Código de verificação de autenticidade: <code>${input.verificationCode}</code></p>
      <p><a href="https://guarama.celeriflow.com.br/portal/nfse/${input.verificationCode}" style="background-color:#047857;color:#fff;padding:8px 16px;text-decoration:none;border-radius:4px;display:inline-block;margin-top:10px;">Visualizar e Imprimir NFS-e</a></p>
      <p>Secretaria Municipal de Fazenda e Tributação — Guaramá/PR</p>
    `;

    // Dispara via SES engine
    await sendEmailNotification({
      to: input.recipientEmail,
      subject,
      htmlContent,
    });

    return { error: undefined, sent: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao enviar e-mail da nota fiscal." };
  }
}

export async function issueNfaeAction(input: {
  providerName: string;
  providerDocument: string;
  takerName: string;
  takerDocument: string;
  serviceDescription: string;
  serviceValue: number;
  issRate: number;
}) {
  try {
    if (!input.providerName || !input.providerDocument || !input.serviceDescription) {
      return { error: "Preencha todos os dados obrigatórios do prestador e do serviço." };
    }

    if (input.serviceValue <= 0) {
      return { error: "O valor do serviço deve ser superior a R$ 0,00." };
    }

    const issAmount = Number(((input.serviceValue * input.issRate) / 100).toFixed(2));
    const nfaeNumber = Math.floor(1000 + Math.random() * 9000);
    const verificationCode = Buffer.from(`NFAE-${nfaeNumber}-${Date.now()}`).toString("hex").slice(0, 16).toUpperCase();
    const guideNumber = "DAM-NFAE-" + Math.floor(100000 + Math.random() * 900000);

    const nfae = {
      id: "nfae-" + Math.random().toString(36).substring(2, 9),
      number: nfaeNumber,
      verificationCode,
      providerName: input.providerName,
      providerDocument: input.providerDocument,
      takerName: input.takerName || "Consumidor Final",
      takerDocument: input.takerDocument || "—",
      serviceDescription: input.serviceDescription,
      serviceValue: input.serviceValue,
      issRate: input.issRate,
      issAmount,
      guideNumber,
      status: "Aguardando Pagamento da Guia DAM",
      createdAt: new Date().toLocaleDateString("pt-BR"),
    };

    return { error: undefined, nfae };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao emitir Nota Fiscal Avulsa." };
  }
}

export async function requestLetterOfAgreementAction(input: {
  taxpayerId: string;
  debtAssessmentNumber: string;
  notaryCartorio: string;
  paidProofRef: string;
}) {
  try {
    if (!input.debtAssessmentNumber || !input.notaryCartorio) {
      return { error: "Número do lançamento de dívida e cartório de protesto são obrigatórios." };
    }

    const letterNumber = `ANUENCIA-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const letter = {
      id: "let-" + Math.random().toString(36).substring(2, 9),
      letterNumber,
      debtAssessmentNumber: input.debtAssessmentNumber,
      notaryCartorio: input.notaryCartorio,
      paidProofRef: input.paidProofRef,
      status: "Emitida e Válida",
      issuedAt: new Date().toLocaleDateString("pt-BR"),
      hashSignature: Buffer.from(letterNumber + input.debtAssessmentNumber).toString("hex").slice(0, 24).toUpperCase(),
    };

    return { error: undefined, letter };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao emitir Carta de Anuência." };
  }
}

export async function cancelNfaeAction(nfaeId: string, reason: string): Promise<{ error?: string; success?: boolean }> {
  try {
    if (!nfaeId || !reason) {
      return { error: "Identificador da NFA-e e justificativa de cancelamento são obrigatórios." };
    }
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Erro ao cancelar NFA-e." };
  }
}
