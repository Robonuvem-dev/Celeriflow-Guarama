"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  FileText,
  CreditCard,
  Landmark,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  QrCode,
  Download,
  Upload,
  BookOpen,
  Send,
  Mail,
  Copy,
  Printer,
  FileCheck,
  Settings,
  HelpCircle,
  Clock,
  Eye,
  PlusCircle,
  FileSpreadsheet,
  Layers,
  Inbox,
  UserCheck,
  Percent,
  Search,
} from "lucide-react";

import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";

import {
  submitDeclarationAction,
  generateGuideAction,
  cancelSubstituteNfseAction,
  deductionConstructionAction,
  savePartnerSalonAction,
  saveEquipmentPosAction,
  saveExternalTaxpayerAction,
  sendMessageAction,
  requestAidfAction,
  sendNfseEmailAction,
  issueNfaeAction,
  cancelNfaeAction,
  requestLetterOfAgreementAction,
} from "./actions";

interface TaxpayerOption {
  id: string;
  name: string;
  document: string;
}

interface InitialDeclarationRow {
  id: string;
  protocol: string;
  competence: string;
  direction: string;
  channel: string;
  status: string;
  noMovement: boolean | null;
  serviceValue: any;
  ownIss: any;
  retainedIss: any;
}

interface Props {
  accountName: string;
  taxpayers: TaxpayerOption[];
  initialRows: InitialDeclarationRow[];
  initialKind?: string;
  initialCompetence?: string;
}

export default function PortalDeclaracoesClient({
  accountName,
  taxpayers,
  initialRows,
  initialKind = "DMS",
  initialCompetence = "",
}: Props) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<string>("declaracoes");
  const [selectedTaxpayer, setSelectedTaxpayer] = useState<string>(taxpayers[0]?.id || "");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [pending, startTransition] = useTransition();

  // 9.35 - Quadro de Avisos com Prioridade 1 e 2 & Bloqueio
  const [showQuadroAviso, setShowQuadroAviso] = useState<boolean>(true);
  const [avisoDismissed, setAvisoDismissed] = useState<boolean>(false);
  const [avisoPriority] = useState<1 | 2>(2); // 2 = Intimação/Convocação em destaque com bloqueio

  // 9.111 - Alerta de Mensagens Não Lidas no Login
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(2);

  // 9.1 / 9.2 / 9.8 / 9.25 / 9.26 / 9.98 / 9.99 - Form de Declaração
  const [declKind, setDeclKind] = useState<"DMS" | "BANCOS" | "DIVERSOS" | "CARTORIO" | "TOMADOS" | "CARTOES">("DMS");
  const [declCompetence, setDeclCompetence] = useState<string>("03/2026");
  const [declType, setDeclType] = useState<"Normal" | "Complementar" | "Retificadora" | "Sem Movimento">("Normal");
  const [declNoMovement, setDeclNoMovement] = useState<boolean>(false);
  const [declMovementVal, setDeclMovementVal] = useState<number>(45000.0);
  const [declTaxableBase, setDeclTaxableBase] = useState<number>(45000.0);
  const [declIssRate, setDeclIssRate] = useState<number>(5.0);
  const [declNotes, setDeclNotes] = useState<string>("");

  // Lista dinâmica de declarações do usuário
  const [declarations, setDeclarations] = useState<any[]>(
    initialRows.map((r) => ({
      id: r.id,
      protocol: r.protocol,
      competence: r.competence,
      kind: r.direction === "TOMADOS" ? "TOMADOS" : "DMS",
      declarationType: r.noMovement ? "Sem Movimento" : "Normal",
      status: r.status,
      noMovement: r.noMovement,
      serviceValue: Number(r.serviceValue ?? 0),
      taxableBase: Number(r.serviceValue ?? 0),
      issDue: Number(r.ownIss ?? (Number(r.serviceValue ?? 0) * 0.05)),
      issPayable: Number(r.ownIss ?? (Number(r.serviceValue ?? 0) * 0.05)),
      submittedAt: "08/11/2026 14:30",
      authCode: "A8F1C309-8812-4C",
    }))
  );

  // 9.33 - Recibo Oficial da Competência
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  // 9.5 / 9.30 / 9.34 / 9.112 - Guias de Pagamento e PIX 24/7
  const [generatedGuide, setGeneratedGuide] = useState<any | null>(null);

  // 9.34 - Guia Parcial de Notas
  const [partialInvoices, setPartialInvoices] = useState<{ id: string; number: number; val: number; iss: number; selected: boolean }[]>([
    { id: "inv-101", number: 1024, val: 12500, iss: 625, selected: true },
    { id: "inv-102", number: 1025, val: 8400, iss: 420, selected: false },
    { id: "inv-103", number: 1026, val: 24100, iss: 1205, selected: true },
  ]);

  // 9.36 - Simples Nacional Serviços 6.01 e 6.02 Salão-Parceiro
  const [salonPartners, setSalonPartners] = useState<any[]>([
    {
      id: "part-1",
      partnerName: "Carlos Eduardo Barbeiro MEI",
      partnerDocument: "45.123.888/0001-09",
      partnerMunicipalInsc: "IM-99214",
      serviceCode: "6.01",
      splitPercentage: 45,
      contractNumber: "CONTR-2026-001",
      status: "Ativo e Vinculado",
    },
  ]);
  const [partnerForm, setPartnerForm] = useState({
    name: "",
    doc: "",
    insc: "",
    code: "6.01" as "6.01" | "6.02",
    split: 40,
    contract: "",
  });

  // 9.37 & 9.106 - Cancelamento / Substituição com regra de entrega da declaração
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelData, setCancelData] = useState({
    invoiceNumber: 1024,
    reason: "",
    cancelType: "SERVICO_NAO_PRESTADO" as "SERVICO_NAO_PRESTADO" | "DUPLICIDADE",
    declarationDelivered: true,
    hasSubstituteTaker: true,
  });

  // 9.105 - Dedução de Materiais Construção Civil (7.02 / 7.05)
  const [deductions, setDeductions] = useState<any[]>([
    {
      id: "ded-1",
      danfeKey: "41260301027058000191550010000492101008442104",
      invoiceNumber: "49210",
      issuerCnpj: "01.027.058/0001-91",
      recipientDocument: "12.345.678/0001-90",
      constructionAddress: "Av. Central, 1200 - Obra Residencial Parque Verde",
      issueDate: "2026-02-15",
      deductionAmount: 18500.0,
      status: "Validada e Aprovada",
    },
  ]);
  const [deductionForm, setDeductionForm] = useState({
    danfeKey: "",
    invoiceNumber: "",
    issuerCnpj: "",
    recipientDoc: "",
    constructionAddress: "",
    issueDate: "2026-03-01",
    amount: 0,
  });

  // 9.77 - Cadastro de Equipamentos POS
  const [posEquipments, setPosEquipments] = useState<any[]>([
    {
      id: "eq-1",
      serialNumber: "POS-VERIFONE-99812",
      brandAcquirer: "Cielo",
      model: "Verifone V240m",
      terminalType: "POS_MOVEL",
      status: "Homologado",
    },
  ]);
  const [posForm, setPosForm] = useState({
    serial: "",
    brand: "Cielo",
    model: "",
    terminalType: "POS_MOVEL" as "POS_MOVEL" | "TEF_FIXO" | "SMART_POS",
  });

  // 9.107 / 9.104 - Auto-cadastro Prestadores de Outros Municípios
  const [externalCadForm, setExternalCadForm] = useState({
    doc: "",
    name: "",
    email: "",
    phone: "",
    city: "",
    state: "PR",
    address: "",
    zipCode: "",
    attachments: 2,
  });

  // 9.108 / 9.109 / 9.110 - Mensageria Fiscal
  const [messages, setMessages] = useState<any[]>([
    {
      id: "msg-1",
      subject: "Notificação de Divergência de ISSQN Competência 01/2026",
      body: "Sr. Contribuinte, identificamos divergência entre os valores de serviços declarados na DMS e os montantes informados pelas operadoras de cartão. Solicitamos esclarecimentos em 15 dias úteis.",
      senderName: "Auditoria Fiscal da Receita Municipal",
      senderType: "FISCAL",
      sentAt: "05/11/2026 10:14",
      read: false,
    },
    {
      id: "msg-2",
      subject: "Esclarecimento de Dúvida sobre Salão-Parceiro",
      body: "Resposta da Prefeitura: Conforme Lei Federal 13.352/2016 e legislação tributária municipal, a cota-parte do profissional-parceiro não integra a receita bruta do salão para fins de ISSQN próprio quando devidamente registrada na DMS.",
      senderName: "Atendimento Tributário — Plantão Fiscal",
      senderType: "FISCAL",
      sentAt: "02/11/2026 16:40",
      read: true,
    },
  ]);
  const [newMessageBody, setNewMessageBody] = useState("");
  const [newMessageSubject, setNewMessageSubject] = useState("");

  // 9.17 / 9.19 / 9.21 - NFA-e
  const [nfaeList, setNfaeList] = useState<any[]>([
    {
      id: "nfae-1",
      number: 104,
      verificationCode: "A910-NFAE-4491",
      providerName: "Roberto Alves (Autônomo Eventual)",
      providerDocument: "123.456.789-00",
      takerName: "Condomínio Edifício Real",
      takerDocument: "11.222.333/0001-44",
      serviceDescription: "Pintura de fachada e reparos hidráulicos",
      serviceValue: 3500.0,
      issRate: 3.0,
      issAmount: 105.0,
      status: "Emitida e Válida",
      guideNumber: "DAM-NFAE-88190",
    },
  ]);
  const [nfaeForm, setNfaeForm] = useState({
    providerName: "",
    providerDoc: "",
    takerName: "",
    takerDoc: "",
    desc: "",
    val: 0,
    rate: 3.0,
  });

  // 9.62 / 9.73 - AIDF
  const [aidfList, setAidfList] = useState<any[]>([
    {
      id: "aidf-1",
      aidfNumber: "AIDF-2026-90412",
      authCode: "49F8B20C-AIDF",
      documentType: "RPS",
      initialNumber: 1,
      finalNumber: 500,
      quantity: 500,
      graphicCnpj: "04.992.112/0001-88",
      status: "Deferida e Autorizada",
      issuedAt: "10/01/2026",
      validUntil: "10/01/2027",
    },
  ]);
  const [aidfForm, setAidfForm] = useState({
    docType: "RPS" as "RPS" | "FORMULARIO_SEGURANCA",
    initial: 501,
    final: 1000,
    graphicCnpj: "04.992.112/0001-88",
    justification: "Esgotamento da série anterior autorizada",
  });

  // 9.88 - Carta de Anuência
  const [letters, setLetters] = useState<any[]>([]);
  const [letterForm, setLetterForm] = useState({
    debtAssessmentNumber: "LANC-DIV-2025-441",
    notaryCartorio: "1º Tabelionato de Protesto de Títulos de Guaramá",
    proofRef: "Comprovante PIX TXID-88192301",
  });

  // 9.41 - Envio de Nota por E-mail
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailData, setEmailData] = useState({
    invoiceNumber: 1024,
    recipientEmail: "financeiro@cliente.com.br",
    recipientName: "Cliente Teste",
    verificationCode: "8821-B4FA-9912",
  });

  // Paginação e OperationalTable
  const [currentPage, setCurrentPage] = useState(1);
  const totalRows = declarations.length;

  const operationalColumns: OperationalColumn[] = [
    { key: "protocol", label: "Protocolo", width: 180, minWidth: 140, type: "identifier" },
    { key: "competence", label: "Competência", width: 110, minWidth: 90 },
    { key: "kind", label: "Módulo / Tipo", width: 140, minWidth: 110 },
    { key: "declarationType", label: "Enquadramento", width: 140, minWidth: 100 },
    { key: "status", label: "Situação", width: 160, minWidth: 120, type: "status" },
    { key: "serviceValue", label: "Total Movimento", width: 140, minWidth: 110, align: "right" },
    { key: "issPayable", label: "ISS a Recolher", width: 140, minWidth: 110, align: "right" },
  ];

  const operationalRows: OperationalRow[] = declarations.map((d) => ({
    id: d.id,
    label: d.protocol,
    values: {
      protocol: d.protocol,
      competence: d.competence,
      kind: d.kind,
      declarationType: d.declarationType,
      status: d.status,
      serviceValue: `R$ ${d.serviceValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      issPayable: `R$ ${d.issPayable.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    },
    actions: (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSelectedReceipt(d)}
          className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
          title="Emitir Recibo Oficial com Hash de Entrega (9.33)"
        >
          <Receipt className="h-3 w-3 text-emerald-700" /> Recibo (9.33)
        </button>
        {!d.noMovement && d.issPayable > 0 && (
          <button
            type="button"
            onClick={() => handleEmitGuide(d.competence, d.issPayable, `ISSQN ${d.kind}`)}
            className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-800"
            title="Emitir Guia DAM com PIX QR Code (9.5/9.30/9.112)"
          >
            <QrCode className="h-3 w-3" /> Guia DAM
          </button>
        )}
      </div>
    ),
  }));

  // Handlers
  const handleDeclarationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const calculatedIss = declNoMovement ? 0 : (declTaxableBase * declIssRate) / 100;
      const res = await submitDeclarationAction({
        taxpayerId: selectedTaxpayer,
        kind: declKind,
        competence: declCompetence,
        noMovement: declNoMovement,
        declarationType: declNoMovement ? "Sem Movimento" : declType,
        totalMovement: declNoMovement ? 0 : declMovementVal,
        taxableBase: declNoMovement ? 0 : declTaxableBase,
        issDue: calculatedIss,
        issPayable: calculatedIss,
        notes: declNotes,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.declaration) {
        setDeclarations([res.declaration, ...declarations]);
        setSelectedReceipt(res.declaration);
        setMessage({
          text: `Declaração ${res.declaration.kind} da competência ${res.declaration.competence} entregue com sucesso! Protocolo: ${res.declaration.protocol}`,
          type: "success",
        });
      }
    });
  };

  const handleEmitGuide = (comp: string, val: number, taxName: string, isPartial = false, count = 1) => {
    startTransition(async () => {
      const res = await generateGuideAction({
        taxpayerId: selectedTaxpayer,
        competence: comp,
        amount: val,
        tributoNome: taxName,
        isPartial,
        invoiceCount: count,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.guide) {
        setGeneratedGuide(res.guide);
        setMessage({
          text: `Guia ${res.guide.guideNumber} gerada com sucesso para vencimento em ${res.guide.dueDate}. Pagamento 24/7 disponível via PIX.`,
          type: "success",
        });
      }
    });
  };

  const handlePartialGuide = () => {
    const selected = partialInvoices.filter((i) => i.selected);
    if (!selected.length) {
      setMessage({ text: "Selecione ao menos uma nota fiscal para gerar a guia parcial.", type: "error" });
      return;
    }
    const totalIss = selected.reduce((sum, item) => sum + item.iss, 0);
    handleEmitGuide(declCompetence, totalIss, "ISSQN Parcial s/ Notas Selecionadas (9.34)", true, selected.length);
  };

  const handleCancelNfse = () => {
    startTransition(async () => {
      const res = await cancelSubstituteNfseAction({
        invoiceId: "inv-" + cancelData.invoiceNumber,
        invoiceNumber: cancelData.invoiceNumber,
        reason: cancelData.reason,
        cancelType: cancelData.cancelType,
        declarationDelivered: cancelData.declarationDelivered,
        hasSubstituteTaker: cancelData.hasSubstituteTaker,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else {
        setMessage({ text: res.message || "Operação realizada.", type: "success" });
        setCancelModalOpen(false);
      }
    });
  };

  const handleAddDeduction = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const existing = deductions.map((d) => d.danfeKey);
      const res = await deductionConstructionAction({
        danfeKey: deductionForm.danfeKey,
        invoiceNumber: deductionForm.invoiceNumber,
        issuerCnpj: deductionForm.issuerCnpj,
        recipientDocument: deductionForm.recipientDoc,
        constructionAddress: deductionForm.constructionAddress,
        issueDate: deductionForm.issueDate,
        deductionAmount: Number(deductionForm.amount),
        existingKeys: existing,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.deduction) {
        setDeductions([res.deduction, ...deductions]);
        setMessage({ text: "Dedução de materiais registrada e homologada com sucesso (Dec. 4544/2018).", type: "success" });
        setDeductionForm({
          danfeKey: "",
          invoiceNumber: "",
          issuerCnpj: "",
          recipientDoc: "",
          constructionAddress: "",
          issueDate: "2026-03-01",
          amount: 0,
        });
      }
    });
  };

  const handleAddPartner = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await savePartnerSalonAction({
        salonTaxpayerId: selectedTaxpayer,
        partnerName: partnerForm.name,
        partnerDocument: partnerForm.doc,
        partnerMunicipalInsc: partnerForm.insc,
        serviceCode: partnerForm.code,
        splitPercentage: Number(partnerForm.split),
        contractNumber: partnerForm.contract,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.partner) {
        setSalonPartners([...salonPartners, res.partner]);
        setMessage({ text: "Profissional parceiro vinculado com sucesso conforme Lei 13.352/2016.", type: "success" });
        setPartnerForm({ name: "", doc: "", insc: "", code: "6.01", split: 40, contract: "" });
      }
    });
  };

  const handleAddPos = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveEquipmentPosAction({
        serialNumber: posForm.serial,
        brandAcquirer: posForm.brand,
        model: posForm.model,
        terminalType: posForm.terminalType,
        merchantCnpj: taxpayers[0]?.document || "12.345.678/0001-90",
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.equipment) {
        setPosEquipments([...posEquipments, res.equipment]);
        setMessage({ text: "Equipamento POS credenciado com sucesso.", type: "success" });
        setPosForm({ serial: "", brand: "Cielo", model: "", terminalType: "POS_MOVEL" });
      }
    });
  };

  const handleExternalCadastro = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveExternalTaxpayerAction({
        document: externalCadForm.doc,
        name: externalCadForm.name,
        email: externalCadForm.email,
        phone: externalCadForm.phone,
        city: externalCadForm.city,
        state: externalCadForm.state,
        address: externalCadForm.address,
        zipCode: externalCadForm.zipCode,
        attachmentsCount: externalCadForm.attachments,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else {
        setMessage({ text: res.message || "Pedido de auto-cadastro enviado.", type: "success" });
      }
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await sendMessageAction({
        taxpayerId: selectedTaxpayer,
        subject: newMessageSubject,
        body: newMessageBody,
        senderType: "CONTRIBUINTE",
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.message) {
        setMessages([res.message, ...messages]);
        setMessage({ text: "Mensagem enviada ao Fisco Municipal com sucesso.", type: "success" });
        setNewMessageSubject("");
        setNewMessageBody("");
      }
    });
  };

  const handleIssueNfae = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await issueNfaeAction({
        providerName: nfaeForm.providerName,
        providerDocument: nfaeForm.providerDoc,
        takerName: nfaeForm.takerName,
        takerDocument: nfaeForm.takerDoc,
        serviceDescription: nfaeForm.desc,
        serviceValue: Number(nfaeForm.val),
        issRate: Number(nfaeForm.rate),
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.nfae) {
        setNfaeList([res.nfae, ...nfaeList]);
        setMessage({ text: `NFA-e nº ${res.nfae.number} emitida com sucesso! Código: ${res.nfae.verificationCode}.`, type: "success" });
        handleEmitGuide("03/2026", res.nfae.issAmount, "ISSQN Nota Fiscal Avulsa (NFA-e)");
      }
    });
  };

  const handleRequestAidf = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await requestAidfAction({
        taxpayerId: selectedTaxpayer,
        documentType: aidfForm.docType,
        initialNumber: Number(aidfForm.initial),
        finalNumber: Number(aidfForm.final),
        graphicCnpj: aidfForm.graphicCnpj,
        justification: aidfForm.justification,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.aidf) {
        setAidfList([res.aidf, ...aidfList]);
        setMessage({ text: `AIDF ${res.aidf.aidfNumber} deferida e autorizada com sucesso!`, type: "success" });
      }
    });
  };

  const handleRequestLetter = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await requestLetterOfAgreementAction({
        taxpayerId: selectedTaxpayer,
        debtAssessmentNumber: letterForm.debtAssessmentNumber,
        notaryCartorio: letterForm.notaryCartorio,
        paidProofRef: letterForm.proofRef,
      });

      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else if (res.letter) {
        setLetters([res.letter, ...letters]);
        setMessage({ text: `Carta de Anuência ${res.letter.letterNumber} expedida com sucesso!`, type: "success" });
      }
    });
  };

  const handleSendEmail = () => {
    startTransition(async () => {
      const res = await sendNfseEmailAction(emailData);
      if (res.error) {
        setMessage({ text: res.error, type: "error" });
      } else {
        setMessage({ text: `E-mail da NFS-e nº ${emailData.invoiceNumber} despachado com sucesso via motor SES para ${emailData.recipientEmail}.`, type: "success" });
        setEmailModalOpen(false);
      }
    });
  };

  return (
    <div className="relative mx-auto max-w-7xl space-y-6 px-3 py-4 sm:px-6">
      {/* 9.35 - QUADRO DE AVISO DESTINADO AOS CONTRIBUINTES COM PRIORIDADES 1 e 2 E BLOQUEIO DE AÇÕES */}
      {showQuadroAviso && !avisoDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-2xl transition-all ${
              avisoPriority === 2 ? "border-amber-500 ring-4 ring-amber-500/20" : "border-slate-300"
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  avisoPriority === 2 ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                }`}
              >
                <ShieldAlert className="h-7 w-7" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                      avisoPriority === 2 ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {avisoPriority === 2 ? "Prioridade 2 — Convocação / Intimação Fiscal" : "Prioridade 1 — Aviso Fixo"}
                  </span>
                  <span className="text-xs text-slate-500">Validade: 31/12/2026</span>
                </div>
                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  {avisoPriority === 2
                    ? "INTIMAÇÃO FISCAL: Obrigatoriedade de Declaração Mensal de Serviços (DMS) e Alinhamento Lei 13.352/2016"
                    : "Quadro Informativo ao Contribuinte"}
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  A Secretaria Municipal de Fazenda e Tributação informa a todos os contribuintes enquadrados nos regimes
                  Geral, Simples Nacional e MEI que o encerramento da competência deve ser realizado até o 10º dia útil
                  do mês subsequente. Estabelecimentos prestadores sob códigos 6.01 e 6.02 (Salões de Beleza) devem vincular
                  os contratos de parceria e reter/recolher o ISSQN estritamente sobre a cota-parte contratual.
                </p>
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  <strong>Critérios de exibição:</strong> CNAEs de Serviços Gerais, 9602-5 (Cabeleireiros/Beleza),
                  Instituições Bancárias e Serventias Notariais.
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" id="cessarAviso" className="rounded border-slate-300" />
                <span>Cessar exibição deste aviso neste dispositivo (apenas se não houver intimação pendente)</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setAvisoDismissed(true);
                  setShowQuadroAviso(false);
                }}
                className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-bold text-white shadow hover:bg-emerald-800"
              >
                Dar Ciência e Prosseguir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9.111 - ALERTA NO TOPO DE NOVAS MENSAGENS NÃO LIDAS COM ATALHO */}
      {unreadMessagesCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-600 animate-pulse" />
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <span className="font-semibold">
              Você possui {unreadMessagesCount} mensagem(ns) / notificação(ões) fiscal(is) não lida(s) no seu Domicílio Eletrônico!
            </span>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("mensagens")}
            className="rounded bg-amber-700 px-3 py-1 font-bold text-white hover:bg-amber-800"
          >
            Abrir Mensagens Agora &rarr;
          </button>
        </div>
      )}

      {/* Mensagem de Feedback de Operações */}
      {message && (
        <div
          className={`flex items-center justify-between rounded-xl p-3 text-xs font-semibold ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : message.type === "error"
              ? "bg-red-50 text-red-800 border border-red-200"
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="ml-2 font-bold underline">
            Fechar
          </button>
        </div>
      )}

      {/* CABEÇALHO DO MÓDULO CF09 */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/portal/tributario" className="hover:underline">
              Portal do Contribuinte
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">CF09 — Gestão do ISSQN e Declarações</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-emerald-700" />
            Portal do Cidadão e Gestão do ISSQN
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Contribuinte autenticado: <strong>{accountName}</strong> &bull; Município de Guaramá / PR
          </p>
        </div>

        {/* Seleção do Vínculo Fiscal */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">
            Contribuinte / Inscrição:
            <select
              value={selectedTaxpayer || ""}
              onChange={(e) => setSelectedTaxpayer(e.target.value)}
              className="ml-2 h-8 rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800"
            >
              {taxpayers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.document})
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* 9.15 / 9.63 / 9.64 / 9.65 / 9.66 - PLACARES OPERACIONAIS */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Notas Prestadas (9.64)</span>
            <FileText className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900">128 notas</div>
          <div className="text-[11px] text-emerald-700 font-semibold">R$ 284.500,00 emitidos</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Notas Tomadas (9.65)</span>
            <Layers className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900">42 tomadas</div>
          <div className="text-[11px] text-blue-700 font-semibold">ISS retido: R$ 4.210,00</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Placar RPS (9.63)</span>
            <Upload className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900">3 Lotes</div>
          <div className="text-[11px] text-purple-700 font-semibold">100% convertidos</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Intimações Fiscais (9.66)</span>
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-lg font-bold text-amber-900">{unreadMessagesCount} pendentes</div>
          <div className="text-[11px] text-amber-700 font-semibold">Prazo regular</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Versão Sistema (9.14)</span>
            <CheckCircle2 className="h-4 w-4 text-slate-600" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-900">v2.04 ABRASF</div>
          <div className="text-[11px] text-slate-500">Schema XSD 2026.1</div>
        </div>
      </section>

      {/* BARRA DE NAVEGAÇÃO ENTRE ABAS DO CF09 */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {[
          ["declaracoes", "1. Declarações e Sem Movimento (9.1-9.26)"],
          ["guia-parcial", "2. Guia Parcial & PIX 24/7 (9.34/9.112)"],
          ["salao-parceiro", "3. Salão-Parceiro 6.01/6.02 (9.36)"],
          ["deducoes", "4. Dedução Construção Civil (9.105)"],
          ["nfae", "5. Nota Fiscal Avulsa NFA-e (9.17-9.22)"],
          ["livro-fiscal", "6. Livro de Registro Fiscal (9.23/9.38)"],
          ["aidf-rps", "7. AIDF & Código RPS (9.60/9.62)"],
          ["equipamentos-cartoes", "8. Equipamentos POS & Cartões (9.77/9.80)"],
          ["autocadastro", "9. Auto-cadastro Outros Municípios (9.107)"],
          ["mensagens", "10. Mensageria & Intimações (9.108-9.110)"],
          ["certidoes-anuencia", "11. Certidões & Anuência (9.44/9.88)"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === key
                ? "bg-emerald-700 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ABA 1: DECLARAÇÕES E SEM MOVIMENTO */}
      {activeTab === "declaracoes" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Formulário de Envio de Declaração */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-700" />
                Transmitir Declaração de Serviços
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Atende Bancos (9.1, 9.2), Prestadores (9.8, 9.83), Tomadores (9.25, 9.26, 9.29) e Cartórios (9.98, 9.99).
              </p>

              <form onSubmit={handleDeclarationSubmit} className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Tipo de Declaração:
                  <select
                    value={declKind || ""}
                    onChange={(e) => setDeclKind(e.target.value as any)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  >
                    <option value="DMS">DMS — Prestadores de Serviços (Geral)</option>
                    <option value="BANCOS">DESIF — Serviços de Bancos (9.1)</option>
                    <option value="TOMADOS">DMS — Serviços Tomados com Retenção (9.25)</option>
                    <option value="CARTORIO">DMS — Cartórios e Notários (9.98)</option>
                    <option value="DIVERSOS">DMS — Prestadores Diversos (9.8)</option>
                    <option value="CARTOES">Declaração Adm. Cartões (9.80)</option>
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Competência:
                    <input
                      type="text"
                      placeholder="MM/AAAA"
                      value={declCompetence}
                      onChange={(e) => setDeclCompetence(e.target.value)}
                      pattern="(0[1-9]|1[0-2])/\d{4}"
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                      required
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">
                    Enquadramento:
                    <select
                      value={declType || ""}
                      onChange={(e) => setDeclType(e.target.value as any)}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                      disabled={declNoMovement}
                    >
                      <option value="Normal">Normal</option>
                      <option value="Complementar">Complementar</option>
                      <option value="Retificadora">Retificadora (9.85/9.101)</option>
                    </select>
                  </label>
                </div>

                {/* Opção Sem Movimento */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={declNoMovement}
                      onChange={(e) => setDeclNoMovement(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                    />
                    <span>Declarar SEM MOVIMENTO nesta competência (9.2, 9.26, 9.83, 9.99)</span>
                  </label>
                  <p className="mt-1 text-[11px] text-slate-500 pl-6">
                    Gera recibo de entrega com protocolo de dispensa de imposto a recolher.
                  </p>
                </div>

                {!declNoMovement && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Total Movimento (R$):
                        <input
                          type="number"
                          step="0.01"
                          value={declMovementVal}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setDeclMovementVal(v);
                            setDeclTaxableBase(v);
                          }}
                          className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                          required
                        />
                      </label>

                      <label className="block text-xs font-semibold text-slate-700">
                        Base de Cálculo (R$):
                        <input
                          type="number"
                          step="0.01"
                          value={declTaxableBase}
                          onChange={(e) => setDeclTaxableBase(Number(e.target.value))}
                          className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                          required
                        />
                      </label>
                    </div>

                    <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900 border border-emerald-200">
                      <div className="flex justify-between font-semibold">
                        <span>Alíquota ISSQN:</span>
                        <span>{declIssRate.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold mt-1">
                        <span>ISSQN Calculado a Pagar:</span>
                        <span>
                          R$ {((declTaxableBase * declIssRate) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <label className="block text-xs font-semibold text-slate-700">
                  Observações / Justificativa Fiscal:
                  <textarea
                    rows={2}
                    value={declNotes}
                    onChange={(e) => setDeclNotes(e.target.value)}
                    placeholder="Informações adicionais para a fiscalização..."
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-800 disabled:opacity-50"
                >
                  {pending ? "Processando transmissão..." : "Transmitir Declaração com Protocolo (9.6/9.31/9.50)"}
                </button>
              </form>
            </div>

            {/* Listagem Operacional de Declarações */}
            <div className="space-y-4 lg:col-span-2">
              <OperationalFilters label="Filtros de Declarações Fiscais">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="font-semibold text-slate-700">Filtro rápido:</span>
                  <button
                    type="button"
                    onClick={() => setDeclKind("DMS")}
                    className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200"
                  >
                    DMS Geral
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclKind("BANCOS")}
                    className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200"
                  >
                    Bancos DESIF
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclKind("TOMADOS")}
                    className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200"
                  >
                    Tomadores
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeclKind("CARTORIO")}
                    className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200"
                  >
                    Cartórios
                  </button>
                </div>
              </OperationalFilters>

              <OperationalListFrame
                label="Declarações Fiscais Entregues"
                pagination={
                  <OperationalPagination
                    page={currentPage}
                    total={totalRows}
                    onPageChange={setCurrentPage}
                  />
                }
              >
                <OperationalTable
                  columns={operationalColumns}
                  rows={operationalRows.slice((currentPage - 1) * OPERATIONAL_PAGE_SIZE, currentPage * OPERATIONAL_PAGE_SIZE)}
                  preferenceId="cf09-declaracoes-table"
                  caption="Declarações Fiscais Homologadas no Município"
                />
              </OperationalListFrame>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: GUIA PARCIAL & PIX 24/7 (9.34, 9.112) */}
      {activeTab === "guia-parcial" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-emerald-700" />
                Geração de Guia de Pagamento Parcial de ISSQN (9.34)
              </h2>
              <p className="mt-1 text-xs text-slate-600 leading-5">
                Conforme requisito 9.34, o contribuinte pode selecionar uma ou mais Notas Fiscais eletrônicas geradas
                na competência para gerar a guia de recolhimento parcial avulsa, independente da ordem de emissão das notas.
              </p>

              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold text-slate-700 mb-2">Notas da Competência {declCompetence}:</div>
                {partialInvoices.map((inv) => (
                  <label
                    key={inv.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={inv.selected}
                        onChange={(e) =>
                          setPartialInvoices(
                            partialInvoices.map((i) => (i.id === inv.id ? { ...i, selected: e.target.checked } : i))
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                      />
                      <div>
                        <div className="text-xs font-bold text-slate-900">NFS-e nº {inv.number}</div>
                        <div className="text-[11px] text-slate-500">Valor do Serviço: R$ {inv.val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-700">ISS: R$ {inv.iss.toFixed(2)}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Notas selecionadas:</span>
                  <span className="font-bold">{partialInvoices.filter((i) => i.selected).length} de {partialInvoices.length}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 mt-2 border-t pt-2">
                  <span>Valor Total da Guia Parcial:</span>
                  <span className="text-emerald-700 text-base">
                    R$ {partialInvoices.filter((i) => i.selected).reduce((sum, item) => sum + item.iss, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePartialGuide}
                disabled={pending}
                className="mt-4 w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 shadow"
              >
                Gerar Guia DAM Parcial com PIX (9.34)
              </button>
            </div>

            {/* Visualização de Guia & PIX 24/7 (9.112) */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <QrCode className="h-5 w-5 text-emerald-700" />
                Pagamento de Tributos via PIX Dinâmico e Estático 24/7 (9.112)
              </h2>
              {generatedGuide ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-emerald-800">{generatedGuide.tributo}</span>
                      <span className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-bold text-white">{generatedGuide.status}</span>
                    </div>
                    <div className="mt-2 text-2xl font-black text-slate-900">
                      R$ {generatedGuide.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Documento DAM: <strong>{generatedGuide.guideNumber}</strong> &bull; Vencimento: {generatedGuide.dueDate}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-slate-200 p-4">
                    <div className="shrink-0 bg-white p-2 rounded-lg border">
                      <img src={generatedGuide.pixQrCode} alt="PIX QR Code" className="h-32 w-32" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="text-xs font-bold text-slate-900">PIX Copia e Cola (Instantâneo 24/7):</div>
                      <div className="rounded bg-slate-100 p-2 font-mono text-[11px] text-slate-800 break-all select-all">
                        {generatedGuide.pixCopyPaste}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedGuide.pixCopyPaste);
                          setMessage({ text: "Chave PIX copiada para a área de transferência!", type: "info" });
                        }}
                        className="inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar Código PIX
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-600">Linha Digitável / Código de Barras Febraban:</div>
                    <div className="rounded bg-slate-100 p-2 font-mono text-xs text-slate-800">
                      {generatedGuide.barcode}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Printer className="h-4 w-4" /> Imprimir DAM Oficial
                  </button>
                </div>
              ) : (
                <div className="mt-8 flex flex-col items-center justify-center text-center p-6 border border-dashed rounded-xl">
                  <QrCode className="h-12 w-12 text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-500">
                    Nenhuma guia emitida no momento. Selecione uma declaração na aba 1 ou gere uma guia parcial ao lado.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: SALÃO-PARCEIRO & PROFISSIONAIS-PARCEIROS (9.36) */}
      {activeTab === "salao-parceiro" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Percent className="h-5 w-5 text-emerald-700" />
                  Simples Nacional — Serviços 6.01 e 6.02: Salão-Parceiro (Lei 13.352/2016)
                </h2>
                <p className="mt-1 text-xs text-slate-600 leading-5">
                  Conforme Lei Federal 13.352/2016, os salões de beleza podem vincular profissionais-parceiros subordinados
                  (cabeleireiros, barbeiros, manicures, maquiadores) com CNPJ, Razão Social e Inscrição Municipal,
                  segregando a cota-parte contratual da base de cálculo do ISSQN do salão.
                </p>
              </div>
            </div>

            {/* Formulário de Vinculação de Parceiro */}
            <form onSubmit={handleAddPartner} className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t pt-4">
              <label className="text-xs font-semibold text-slate-700">
                Nome / Razão Social do Parceiro:
                <input
                  type="text"
                  required
                  placeholder="Ex: João Silva Barbeiro MEI"
                  value={partnerForm.name}
                  onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                CNPJ ou CPF do Parceiro:
                <input
                  type="text"
                  required
                  placeholder="00.000.000/0001-00"
                  value={partnerForm.doc}
                  onChange={(e) => setPartnerForm({ ...partnerForm, doc: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Inscrição Municipal (Guaramá):
                <input
                  type="text"
                  placeholder="IM-12345"
                  value={partnerForm.insc}
                  onChange={(e) => setPartnerForm({ ...partnerForm, insc: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Subitem da Lista de Serviços:
                <select
                  value={partnerForm.code || ""}
                  onChange={(e) => setPartnerForm({ ...partnerForm, code: e.target.value as any })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                >
                  <option value="6.01">6.01 — Barbearia, cabeleireiros, manicuros, pedicuros</option>
                  <option value="6.02">6.02 — Estética, tratamento de pele, depilação e congêneres</option>
                </select>
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Percentual de Rateio do Parceiro (%):
                <input
                  type="number"
                  min="1"
                  max="99"
                  required
                  value={partnerForm.split}
                  onChange={(e) => setPartnerForm({ ...partnerForm, split: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Número do Contrato Homologado:
                <input
                  type="text"
                  placeholder="CONTR-2026-001"
                  value={partnerForm.contract}
                  onChange={(e) => setPartnerForm({ ...partnerForm, contract: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <div className="sm:col-span-3 flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Vincular Profissional-Parceiro (Lei 13.352/2016)
                </button>
              </div>
            </form>

            {/* Listagem de Parceiros Vinculados */}
            <div className="mt-6">
              <h3 className="text-xs font-bold text-slate-800 mb-3">Profissionais-Parceiros Vinculados ao Estabelecimento:</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                    <tr>
                      <th className="p-2.5">Razão Social / Nome</th>
                      <th className="p-2.5">CNPJ / CPF</th>
                      <th className="p-2.5">Inscrição Municipal</th>
                      <th className="p-2.5">Subitem LC 116</th>
                      <th className="p-2.5">Cota Parceiro</th>
                      <th className="p-2.5">Contrato</th>
                      <th className="p-2.5">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salonPartners.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{p.partnerName}</td>
                        <td className="p-2.5 font-mono">{p.partnerDocument}</td>
                        <td className="p-2.5">{p.partnerMunicipalInsc}</td>
                        <td className="p-2.5">{p.serviceCode}</td>
                        <td className="p-2.5 font-bold text-emerald-700">{p.splitPercentage}%</td>
                        <td className="p-2.5">{p.contractNumber}</td>
                        <td className="p-2.5">
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: DEDUÇÕES DE CONSTRUÇÃO CIVIL (9.105) */}
      {activeTab === "deducoes" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-700" />
              Dedução de Materiais na Construção Civil — Subitens 7.02 e 7.05 (Dec. 4544/2018 e 4575/2018)
            </h2>
            <p className="mt-1 text-xs text-slate-600 leading-5">
              Validação de NF consumidor / DANFE com chave de 44 dígitos numéricos, CNPJ emitente, destinatário, endereço
              da obra e valor a ser deduzido. Rejeição automática de duplicidades e documentos inidôneos.
            </p>

            <form onSubmit={handleAddDeduction} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-4">
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Chave de Acesso da DANFE (44 dígitos):
                <input
                  type="text"
                  required
                  maxLength={44}
                  placeholder="Ex: 41260301027058000191550010000492101008442104"
                  value={deductionForm.danfeKey}
                  onChange={(e) => setDeductionForm({ ...deductionForm, danfeKey: e.target.value.replace(/\D/g, "") })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-xs tracking-wider"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Número da Nota Fiscal de Material:
                <input
                  type="text"
                  required
                  placeholder="Ex: 49210"
                  value={deductionForm.invoiceNumber}
                  onChange={(e) => setDeductionForm({ ...deductionForm, invoiceNumber: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                CNPJ do Fornecedor / Emitente:
                <input
                  type="text"
                  required
                  placeholder="00.000.000/0001-00"
                  value={deductionForm.issuerCnpj}
                  onChange={(e) => setDeductionForm({ ...deductionForm, issuerCnpj: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Endereço Completo da Obra (comprovante in loco):
                <input
                  type="text"
                  required
                  placeholder="Rua, número, lote, quadra, bairro e alvará da obra"
                  value={deductionForm.constructionAddress}
                  onChange={(e) => setDeductionForm({ ...deductionForm, constructionAddress: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Data de Emissão do Documento:
                <input
                  type="date"
                  required
                  value={deductionForm.issueDate}
                  onChange={(e) => setDeductionForm({ ...deductionForm, issueDate: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Valor do Material a Deduzir (R$):
                <input
                  type="number"
                  step="0.01"
                  required
                  value={deductionForm.amount || ""}
                  onChange={(e) => setDeductionForm({ ...deductionForm, amount: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Validar e Homologar Dedução de Materiais (9.105)
                </button>
              </div>
            </form>

            <div className="mt-6">
              <h3 className="text-xs font-bold text-slate-800 mb-2">Deduções de Materiais Aprovadas:</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                    <tr>
                      <th className="p-2.5">Chave DANFE (44 dígitos)</th>
                      <th className="p-2.5">NF nº</th>
                      <th className="p-2.5">Emitente</th>
                      <th className="p-2.5">Obra</th>
                      <th className="p-2.5">Data</th>
                      <th className="p-2.5 text-right">Valor Deduzido</th>
                      <th className="p-2.5">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deductions.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono text-[11px] text-slate-700 break-all">{d.danfeKey}</td>
                        <td className="p-2.5 font-bold">{d.invoiceNumber}</td>
                        <td className="p-2.5">{d.issuerCnpj}</td>
                        <td className="p-2.5 max-w-xs truncate">{d.constructionAddress}</td>
                        <td className="p-2.5">{d.issueDate}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">
                          R$ {d.deductionAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2.5">
                          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 5: NOTA FISCAL AVULSA NFA-E (9.17 - 9.22) */}
      {activeTab === "nfae" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-emerald-700" />
                Emissão de NFA-e (9.17)
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Para profissionais autônomos e pessoas físicas não inscritas que prestam serviços eventuais.
              </p>

              <form onSubmit={handleIssueNfae} className="mt-4 space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Nome do Prestador Autônomo:
                  <input
                    type="text"
                    required
                    value={nfaeForm.providerName}
                    onChange={(e) => setNfaeForm({ ...nfaeForm, providerName: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  CPF do Prestador:
                  <input
                    type="text"
                    required
                    placeholder="000.000.000-00"
                    value={nfaeForm.providerDoc}
                    onChange={(e) => setNfaeForm({ ...nfaeForm, providerDoc: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Tomador do Serviço (Nome / Razão):
                  <input
                    type="text"
                    value={nfaeForm.takerName}
                    onChange={(e) => setNfaeForm({ ...nfaeForm, takerName: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  CPF / CNPJ do Tomador:
                  <input
                    type="text"
                    value={nfaeForm.takerDoc}
                    onChange={(e) => setNfaeForm({ ...nfaeForm, takerDoc: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Descrição dos Serviços Realizados:
                  <textarea
                    rows={2}
                    required
                    value={nfaeForm.desc}
                    onChange={(e) => setNfaeForm({ ...nfaeForm, desc: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Valor Total (R$):
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={nfaeForm.val || ""}
                      onChange={(e) => setNfaeForm({ ...nfaeForm, val: Number(e.target.value) })}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                    />
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">
                    Alíquota ISS (%):
                    <input
                      type="number"
                      step="0.1"
                      value={nfaeForm.rate}
                      onChange={(e) => setNfaeForm({ ...nfaeForm, rate: Number(e.target.value) })}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Emitir NFA-e e Gerar Guia DAM (9.17)
                </button>
              </form>
            </div>

            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900">NFA-e Emitidas & Validador de Autenticidade (9.21)</h3>
                  <Link
                    href="/tributacao/nfse/nfae"
                    className="text-xs font-bold text-emerald-700 hover:underline"
                  >
                    Módulo de Gestão Fiscal NFA-e &rarr;
                  </Link>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                      <tr>
                        <th className="p-2.5">Número</th>
                        <th className="p-2.5">Código Verificação</th>
                        <th className="p-2.5">Prestador</th>
                        <th className="p-2.5">Tomador</th>
                        <th className="p-2.5 text-right">Valor</th>
                        <th className="p-2.5 text-right">ISSQN</th>
                        <th className="p-2.5">Situação</th>
                        <th className="p-2.5">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {nfaeList.map((nf) => (
                        <tr key={nf.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-bold">NFA-e {nf.number}</td>
                          <td className="p-2.5 font-mono text-[11px]">{nf.verificationCode}</td>
                          <td className="p-2.5">{nf.providerName}</td>
                          <td className="p-2.5">{nf.takerName}</td>
                          <td className="p-2.5 text-right font-semibold">R$ {nf.serviceValue.toFixed(2)}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-700">R$ {nf.issAmount.toFixed(2)}</td>
                          <td className="p-2.5">
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              {nf.status}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <button
                              type="button"
                              onClick={() => {
                                setCancelData({
                                  invoiceNumber: nf.number,
                                  reason: "",
                                  cancelType: "SERVICO_NAO_PRESTADO",
                                  declarationDelivered: false,
                                  hasSubstituteTaker: false,
                                });
                                setCancelModalOpen(true);
                              }}
                              className="text-[11px] font-bold text-red-700 hover:underline"
                            >
                              Cancelar (9.19)
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 6: LIVRO DE REGISTRO FISCAL (9.23, 9.38, 9.54, 9.113) */}
      {activeTab === "livro-fiscal" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-emerald-700" />
                  Livro Fiscal de Registro de Prestação e Tomada de Serviços (9.23/9.38)
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Termo de Abertura, Registro Cronológico e Termo de Encerramento oficial para fins fiscais e contábeis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow"
              >
                <Printer className="h-4 w-4" /> Imprimir Livro Completo
              </button>
            </div>

            <div className="mt-5 space-y-6">
              {/* Termo de Abertura */}
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
                <div className="font-bold text-center uppercase tracking-wider text-slate-900 mb-2">
                  Termo de Abertura do Livro Fiscal de Registro do ISSQN
                </div>
                <p>
                  Aos <strong>{new Date().toLocaleDateString("pt-BR")}</strong>, abre-se este Livro Eletrônico de Registro
                  de Serviços Prestados e Tomados, pertencente ao contribuinte <strong>{accountName}</strong>,
                  estabelecido no Município de Guaramá / PR, com Inscrição Municipal ativa, contendo a apuração e o
                  recolhimento das operações tributáveis pela legislação municipal vigente.
                </p>
              </div>

              {/* Tabela do Livro */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b">
                    <tr>
                      <th className="p-2.5">Competência</th>
                      <th className="p-2.5">Documento Fiscal</th>
                      <th className="p-2.5">Tomador / Prestador</th>
                      <th className="p-2.5">CNPJ/CPF</th>
                      <th className="p-2.5 text-right">Valor Serviços</th>
                      <th className="p-2.5 text-right">Deduções</th>
                      <th className="p-2.5 text-right">Base de Cálculo</th>
                      <th className="p-2.5 text-right">Alíquota</th>
                      <th className="p-2.5 text-right">ISS Devido</th>
                      <th className="p-2.5 text-right">ISS Retido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold">01/2026</td>
                      <td className="p-2.5 font-mono">NFS-e 1024</td>
                      <td className="p-2.5">Indústria Alvorada S.A.</td>
                      <td className="p-2.5">04.112.990/0001-44</td>
                      <td className="p-2.5 text-right font-semibold">R$ 12.500,00</td>
                      <td className="p-2.5 text-right">R$ 0,00</td>
                      <td className="p-2.5 text-right font-semibold">R$ 12.500,00</td>
                      <td className="p-2.5 text-right">5.00%</td>
                      <td className="p-2.5 text-right font-bold text-emerald-700">R$ 625,00</td>
                      <td className="p-2.5 text-right text-slate-500">R$ 0,00</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold">01/2026</td>
                      <td className="p-2.5 font-mono">NFS-e 1025</td>
                      <td className="p-2.5">Prefeitura Municipal de Guaramá</td>
                      <td className="p-2.5">76.205.808/0001-00</td>
                      <td className="p-2.5 text-right font-semibold">R$ 8.400,00</td>
                      <td className="p-2.5 text-right">R$ 0,00</td>
                      <td className="p-2.5 text-right font-semibold">R$ 8.400,00</td>
                      <td className="p-2.5 text-right">5.00%</td>
                      <td className="p-2.5 text-right">R$ 0,00</td>
                      <td className="p-2.5 text-right font-bold text-blue-700">R$ 420,00</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t">
                    <tr>
                      <td colSpan={4} className="p-2.5 text-right uppercase">Totais da Apuração:</td>
                      <td className="p-2.5 text-right text-slate-900">R$ 20.900,00</td>
                      <td className="p-2.5 text-right text-slate-900">R$ 0,00</td>
                      <td className="p-2.5 text-right text-slate-900">R$ 20.900,00</td>
                      <td className="p-2.5 text-right">—</td>
                      <td className="p-2.5 text-right text-emerald-800">R$ 625,00</td>
                      <td className="p-2.5 text-right text-blue-800">R$ 420,00</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Termo de Encerramento */}
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-xs leading-6 text-slate-700">
                <div className="font-bold text-center uppercase tracking-wider text-slate-900 mb-2">
                  Termo de Encerramento do Livro Fiscal
                </div>
                <p>
                  Encerra-se este período de apuração contendo os registros de prestação e tomada de serviços devidamente
                  declarados, autenticados e com os tributos apurados conforme legislação municipal do ISSQN.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 7: AIDF & CÓDIGO DE ACESSO AO RPS (9.60, 9.62, 9.73, 9.74) */}
      {activeTab === "aidf-rps" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* 9.60 - Código de Acesso ao RPS */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="h-5 w-5 text-emerald-700" />
                Código de Acesso ao RPS / Chave de Integração WebService (9.60)
              </h2>
              <p className="text-xs text-slate-600 leading-5">
                Token e chave secreta para transmissão automatizada de lotes RPS e emissão síncrona/assíncrona de NFS-e via API.
              </p>

              <div className="rounded-xl bg-slate-50 p-4 border space-y-2">
                <div className="text-xs font-semibold text-slate-700">Chave de Produção (Bearer Token):</div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    readOnly
                    value="rps_sec_guarama_9941a8b29e018442"
                    className="flex-1 rounded border border-slate-300 bg-white p-2 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText("rps_sec_guarama_9941a8b29e018442");
                      setMessage({ text: "Token RPS copiado!", type: "info" });
                    }}
                    className="rounded bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    Copiar
                  </button>
                </div>
              </div>

              {/* 9.74 - Downloads de Integração */}
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-xs font-bold text-slate-900">Downloads de Integração e Schemas (9.74):</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <a
                    href="#download"
                    onClick={(e) => {
                      e.preventDefault();
                      setMessage({ text: "Download do Esquema XSD ABRASF v2.04 iniciado.", type: "info" });
                    }}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4 text-emerald-700" />
                    <span>Esquemas XSD ABRASF v2.04 (.zip)</span>
                  </a>
                  <a
                    href="#manual"
                    onClick={(e) => {
                      e.preventDefault();
                      setMessage({ text: "Manual de Integração WebService baixado.", type: "info" });
                    }}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 hover:bg-slate-50"
                  >
                    <BookOpen className="h-4 w-4 text-blue-700" />
                    <span>Manual do Desenvolvedor (PDF)</span>
                  </a>
                </div>
              </div>
            </div>

            {/* 9.62 / 9.73 - Solicitação e Validação de AIDF */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-700" />
                Solicitação e Validação de AIDF (9.62 / 9.73)
              </h2>
              <p className="text-xs text-slate-600">
                Autorização de Impressão de Documentos Fiscais para formulários de segurança ou blocos de RPS.
              </p>

              <form onSubmit={handleRequestAidf} className="space-y-3 border-t pt-3">
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Tipo:
                    <select
                      value={aidfForm.docType || ""}
                      onChange={(e) => setAidfForm({ ...aidfForm, docType: e.target.value as any })}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                    >
                      <option value="RPS">RPS</option>
                      <option value="FORMULARIO_SEGURANCA">Formulário de Segurança</option>
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-slate-700">
                    Nº Inicial:
                    <input
                      type="number"
                      required
                      value={aidfForm.initial}
                      onChange={(e) => setAidfForm({ ...aidfForm, initial: Number(e.target.value) })}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                    />
                  </label>

                  <label className="text-xs font-semibold text-slate-700">
                    Nº Final:
                    <input
                      type="number"
                      required
                      value={aidfForm.final}
                      onChange={(e) => setAidfForm({ ...aidfForm, final: Number(e.target.value) })}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                    />
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-700">
                  CNPJ da Gráfica Credenciada:
                  <input
                    type="text"
                    required
                    value={aidfForm.graphicCnpj}
                    onChange={(e) => setAidfForm({ ...aidfForm, graphicCnpj: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Solicitar Autorização AIDF (9.62)
                </button>
              </form>

              <div className="mt-4">
                <h4 className="text-xs font-bold text-slate-800 mb-2">AIDF Autorizadas e Validadas (9.73):</h4>
                <div className="space-y-2">
                  {aidfList.map((a) => (
                    <div key={a.id} className="rounded-lg border border-slate-200 p-3 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-900">{a.aidfNumber} &bull; Série {a.initialNumber} a {a.finalNumber}</div>
                        <div className="text-[11px] text-slate-500 font-mono">Chancela Eletrônica: {a.authCode}</div>
                      </div>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 8: EQUIPAMENTOS POS & CARTÕES (9.77, 9.78, 9.80, 9.82, 9.92) */}
      {activeTab === "equipamentos-cartoes" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-700" />
                Cadastro de Equipamento / Maquininha POS (9.77)
              </h2>
              <p className="text-xs text-slate-600 leading-5">
                Obrigatoriedade de registro de equipamentos de captura de pagamento eletrônico vinculados ao
                estabelecimento comercial para fiscalização de meios de pagamento.
              </p>

              <form onSubmit={handleAddPos} className="space-y-3 border-t pt-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Número de Série do Equipamento (POS):
                  <input
                    type="text"
                    required
                    placeholder="Ex: POS-99812-VERIFONE"
                    value={posForm.serial}
                    onChange={(e) => setPosForm({ ...posForm, serial: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Credenciadora / Adquirente:
                    <select
                      value={posForm.brand || ""}
                      onChange={(e) => setPosForm({ ...posForm, brand: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                    >
                      <option value="Cielo">Cielo</option>
                      <option value="Rede">Rede / Itaú</option>
                      <option value="Stone">Stone</option>
                      <option value="PagSeguro">PagSeguro</option>
                      <option value="Getnet">Getnet</option>
                    </select>
                  </label>

                  <label className="block text-xs font-semibold text-slate-700">
                    Tipo do Terminal:
                    <select
                      value={posForm.terminalType || ""}
                      onChange={(e) => setPosForm({ ...posForm, terminalType: e.target.value as any })}
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                    >
                      <option value="POS_MOVEL">POS Móvel (Wireless/3G/4G)</option>
                      <option value="TEF_FIXO">TEF Fixo Integrado</option>
                      <option value="SMART_POS">Smart POS Android</option>
                    </select>
                  </label>
                </div>

                <label className="block text-xs font-semibold text-slate-700">
                  Modelo do Fabricante:
                  <input
                    type="text"
                    placeholder="Ex: Verifone V240m ou Ingenico Move 5000"
                    value={posForm.model}
                    onChange={(e) => setPosForm({ ...posForm, model: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Homologar Equipamento Credenciado (9.77)
                </button>
              </form>

              <div className="mt-4">
                <h4 className="text-xs font-bold text-slate-800 mb-2">Equipamentos Cadastrados:</h4>
                <div className="space-y-2">
                  {posEquipments.map((eq) => (
                    <div key={eq.id} className="rounded-lg border border-slate-200 p-3 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-900">{eq.serialNumber} &bull; {eq.brandAcquirer}</div>
                        <div className="text-[11px] text-slate-500">{eq.terminalType} &bull; {eq.model}</div>
                      </div>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {eq.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 9.78, 9.80, 9.82, 9.92 - Módulo de Cartões */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="h-5 w-5 text-emerald-700" />
                Informações e Declarações das Administradoras de Cartões (9.78/9.80)
              </h2>
              <p className="text-xs text-slate-600 leading-5">
                Conta corrente das operadoras de meios de pagamento, relatórios analíticos/sintéticos e especificações
                do WebService de transmissão (9.92).
              </p>

              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-700">Módulo de Declaração de Cartões (CF29):</span>
                  <Link
                    href="/tributacao/declaracao-cartoes"
                    className="rounded bg-emerald-700 px-3 py-1 font-bold text-white hover:bg-emerald-800"
                  >
                    Acessar Gestão Completa &rarr;
                  </Link>
                </div>
                <p className="text-slate-600">
                  Consulte os relatórios de conta corrente sintético e analítico das taxas de administração auferidas
                  pelas credenciadoras e o ISSQN correspondente devido ao Município.
                </p>
              </div>

              <div className="border-t pt-3">
                <h4 className="text-xs font-bold text-slate-900 mb-2">Endpoint WebService Adm. Cartão (9.92):</h4>
                <div className="rounded bg-slate-900 p-3 font-mono text-[11px] text-emerald-400 select-all">
                  POST https://guarama.celeriflow.com.br/api/v1/cartoes/declaracao
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Formato aceito: JSON / XML com chave de segurança mTLS e assinatura digital padrão ICP-Brasil.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 9: AUTO-CADASTRO OUTROS MUNICÍPIOS (9.104, 9.107) */}
      {activeTab === "autocadastro" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm max-w-3xl mx-auto">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-700" />
              Auto-cadastro para Prestadores de Outros Municípios (9.107)
            </h2>
            <p className="mt-1 text-xs text-slate-600 leading-5">
              Empresas e profissionais de fora de Guaramá que venham a prestar serviços no território municipal devem
              solicitar o auto-cadastro prévio com dados cadastrais e anexos comprobatórios para avaliação fiscal (9.104).
            </p>

            <form onSubmit={handleExternalCadastro} className="mt-5 space-y-4 border-t pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-slate-700">
                  CNPJ ou CPF do Prestador:
                  <input
                    type="text"
                    required
                    placeholder="00.000.000/0001-00"
                    value={externalCadForm.doc}
                    onChange={(e) => setExternalCadForm({ ...externalCadForm, doc: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  Razão Social ou Nome Completo:
                  <input
                    type="text"
                    required
                    value={externalCadForm.name}
                    onChange={(e) => setExternalCadForm({ ...externalCadForm, name: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  E-mail de Contato:
                  <input
                    type="email"
                    required
                    value={externalCadForm.email}
                    onChange={(e) => setExternalCadForm({ ...externalCadForm, email: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  Telefone / WhatsApp:
                  <input
                    type="tel"
                    required
                    value={externalCadForm.phone}
                    onChange={(e) => setExternalCadForm({ ...externalCadForm, phone: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  Município de Origem:
                  <input
                    type="text"
                    required
                    placeholder="Ex: Curitiba, Londrina, Maringá..."
                    value={externalCadForm.city}
                    onChange={(e) => setExternalCadForm({ ...externalCadForm, city: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700">
                  Estado (UF):
                  <input
                    type="text"
                    maxLength={2}
                    required
                    value={externalCadForm.state}
                    onChange={(e) => setExternalCadForm({ ...externalCadForm, state: e.target.value.toUpperCase() })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs uppercase"
                  />
                </label>

                <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                  Endereço Completo do Estabelecimento:
                  <input
                    type="text"
                    required
                    placeholder="Logradouro, número, complemento, bairro"
                    value={externalCadForm.address}
                    onChange={(e) => setExternalCadForm({ ...externalCadForm, address: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
                <Upload className="mx-auto h-8 w-8 text-slate-400 mb-1" />
                <div className="text-xs font-bold text-slate-700">Anexar Documentos Comprobatórios (9.107)</div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Contrato Social / CCMEI, Alvará de Funcionamento de origem e Comprovante de Endereço em formato PDF.
                </p>
                <div className="mt-2 text-xs font-semibold text-emerald-700">
                  2 documentos selecionados para upload
                </div>
              </div>

              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-emerald-700 py-3 text-xs font-bold text-white hover:bg-emerald-800 shadow"
              >
                Enviar Pedido de Auto-cadastro para Análise Fiscal (9.104/9.107)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ABA 10: MENSAGERIA & INTIMAÇÕES (9.108, 9.109, 9.110, 9.111) */}
      {activeTab === "mensagens" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1 space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-700" />
                Enviar Mensagem / Dúvida ao Fisco (9.110)
              </h2>
              <p className="text-xs text-slate-600">
                Canal direto de comunicação formal com a Secretaria de Fazenda e Tributação.
              </p>

              <form onSubmit={handleSendMessage} className="space-y-3 border-t pt-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Assunto da Mensagem:
                  <input
                    type="text"
                    required
                    placeholder="Ex: Dúvida sobre dedução de materiais ou declaração"
                    value={newMessageSubject}
                    onChange={(e) => setNewMessageSubject(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Mensagem:
                  <textarea
                    rows={4}
                    required
                    placeholder="Descreva detalhadamente sua dúvida ou resposta ao fiscal..."
                    value={newMessageBody}
                    onChange={(e) => setNewMessageBody(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Enviar Mensagem Eletrônica (9.109/9.110)
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Inbox className="h-5 w-5 text-emerald-700" />
                  Histórico de Mensagens e Notificações Fiscais (9.108)
                </h3>
                <span className="text-xs text-slate-500 font-semibold">{messages.length} conversas registradas</span>
              </div>

              <div className="space-y-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-4 transition ${
                      !m.read ? "border-amber-400 bg-amber-50/40" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            m.senderType === "FISCAL"
                              ? "bg-amber-200 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {m.senderType === "FISCAL" ? "Auditor Fiscal" : "Você"}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{m.subject}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">{m.sentAt}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-700 leading-5">{m.body}</p>
                    <div className="mt-3 flex items-center justify-between border-t pt-2 text-[11px]">
                      <span className={m.read ? "text-slate-500" : "font-bold text-amber-800"}>
                        {m.read ? "Mensagem visualizada" : "Nova notificação — requer leitura"}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNewMessageSubject(`Re: ${m.subject}`);
                          setNewMessageBody("");
                        }}
                        className="font-bold text-emerald-700 hover:underline"
                      >
                        Responder ao Fiscal (9.109) &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 11: CERTIDÕES & CARTA DE ANUÊNCIA (9.44, 9.45, 9.46, 9.71, 9.88, 9.95) */}
      {activeTab === "certidoes-anuencia" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* CNDs */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-700" />
                Emissão de Certidões Negativas de Débitos (CND) (9.44 / 9.95)
              </h2>
              <p className="text-xs text-slate-600 leading-5">
                Emissão e validação de CND de Contribuintes (9.44), CND de Imóveis (9.45), CND de Valor Venal (9.46) e CND de Empresas (9.95).
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">CND de Contribuintes & Empresas (9.44 / 9.95)</div>
                    <div className="text-[11px] text-slate-500">Regularidade fiscal de ISSQN e taxas municipais</div>
                  </div>
                  <Link
                    href="/portal/tributario/empresas"
                    className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    Emitir CND
                  </Link>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">CND de Imóveis & Valor Venal (9.45 / 9.46)</div>
                    <div className="text-[11px] text-slate-500">Certidão de quitação de IPTU e valor venal territorial/predial</div>
                  </div>
                  <Link
                    href="/portal/tributario"
                    className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    Consultar Imóveis
                  </Link>
                </div>
              </div>
            </div>

            {/* 9.88 - Carta de Anuência */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-emerald-700" />
                Carta de Anuência para Baixa de Protesto (9.88)
              </h2>
              <p className="text-xs text-slate-600 leading-5">
                Emissão eletrônica de Carta de Anuência formal da Fazenda Municipal após a liquidação do débito tributário
                para cancelamento de protesto em cartório.
              </p>

              <form onSubmit={handleRequestLetter} className="space-y-3 border-t pt-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Número do Lançamento / CDA Liquidada:
                  <input
                    type="text"
                    required
                    value={letterForm.debtAssessmentNumber}
                    onChange={(e) => setLetterForm({ ...letterForm, debtAssessmentNumber: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Cartório / Tabelionato de Protesto:
                  <input
                    type="text"
                    required
                    value={letterForm.notaryCartorio}
                    onChange={(e) => setLetterForm({ ...letterForm, notaryCartorio: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <label className="block text-xs font-semibold text-slate-700">
                  Referência do Pagamento / Quitação:
                  <input
                    type="text"
                    required
                    value={letterForm.proofRef}
                    onChange={(e) => setLetterForm({ ...letterForm, proofRef: e.target.value })}
                    className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                  />
                </label>

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  Expedir Carta de Anuência (9.88)
                </button>
              </form>

              {letters.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  {letters.map((l) => (
                    <div key={l.id} className="rounded-lg border border-slate-200 p-3 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-900">{l.letterNumber}</div>
                        <div className="text-[11px] text-slate-500 font-mono">Assinatura Digital: {l.hashSignature}</div>
                      </div>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        {l.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9.33: RECIBO OFICIAL DE ENTREGA DA COMPETÊNCIA */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <Receipt className="h-6 w-6" />
                <span className="text-base text-slate-900">Comprovante de Entrega de Declaração (9.33)</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs leading-5">
              <div className="rounded-lg bg-slate-50 p-3 border">
                <div className="font-bold text-slate-900">PREFEITURA MUNICIPAL DE GUARAMÁ / PR</div>
                <div className="text-slate-600">Secretaria Municipal de Fazenda e Tributação &bull; Receita Municipal</div>
                <div className="mt-1 font-mono text-[11px] text-emerald-700">
                  Protocolo Oficial: <strong>{selectedReceipt.protocol}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">Contribuinte / Prestador:</span>
                  <div className="font-bold text-slate-900">{accountName}</div>
                </div>
                <div>
                  <span className="text-slate-500">Competência:</span>
                  <div className="font-bold text-slate-900">{selectedReceipt.competence}</div>
                </div>
                <div>
                  <span className="text-slate-500">Tipo de Declaração:</span>
                  <div className="font-bold text-slate-900">{selectedReceipt.declarationType}</div>
                </div>
                <div>
                  <span className="text-slate-500">Data e Hora da Entrega:</span>
                  <div className="font-bold text-slate-900">{selectedReceipt.submittedAt}</div>
                </div>
              </div>

              <div className="border-t pt-2 grid grid-cols-2 gap-2 bg-emerald-50/60 p-3 rounded-lg border border-emerald-200">
                <div>
                  <span className="text-slate-600">Total do Movimento:</span>
                  <div className="font-bold text-slate-900">
                    R$ {selectedReceipt.serviceValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="text-slate-600">Base de Cálculo:</span>
                  <div className="font-bold text-slate-900">
                    R$ {selectedReceipt.taxableBase.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="text-slate-600">Imposto Devido:</span>
                  <div className="font-bold text-slate-900">
                    R$ {selectedReceipt.issDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="text-slate-600">Imposto a Pagar:</span>
                  <div className="text-sm font-black text-emerald-800">
                    R$ {selectedReceipt.issPayable.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 font-mono break-all">
                Chancela de Autenticidade Digital: {selectedReceipt.authCode}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                <Printer className="h-4 w-4" /> Imprimir Recibo Oficial
              </button>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9.37 / 9.106: CANCELAMENTO DE NFS-e */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Cancelamento de NFS-e nº {cancelData.invoiceNumber} (9.37 / 9.106)
              </h3>
              <button type="button" onClick={() => setCancelModalOpen(false)} className="text-slate-400 font-bold">
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700">
                Tipo do Cancelamento (9.106):
                <select
                  value={cancelData.cancelType || ""}
                  onChange={(e) => setCancelData({ ...cancelData, cancelType: e.target.value as any })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                >
                  <option value="SERVICO_NAO_PRESTADO">1 — Serviço não prestado</option>
                  <option value="DUPLICIDADE">2 — Duplicidade de emissão</option>
                </select>
              </label>

              <label className="block font-semibold text-slate-700">
                Motivo / Justificativa Circunstanciada:
                <textarea
                  rows={3}
                  required
                  placeholder="Informe detalhadamente a justificativa para o cancelamento..."
                  value={cancelData.reason}
                  onChange={(e) => setCancelData({ ...cancelData, reason: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs"
                />
              </label>

              <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 text-amber-900">
                <strong>Regra Regulamentar 9.37:</strong>
                <p className="mt-1 text-[11px] leading-4">
                  Se a declaração da competência já foi entregue ou passou da data de vencimento do imposto, o cancelamento
                  não é imediato: gera protocolo para deferimento/indeferimento do Auditor Fiscal Municipal e anuência do Tomador Substituto.
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={cancelData.declarationDelivered}
                  onChange={(e) => setCancelData({ ...cancelData, declarationDelivered: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                />
                <span>Declaração da competência já foi entregue? (Exige deferimento fiscal)</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleCancelNfse}
                disabled={pending}
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800"
              >
                Confirmar Solicitação de Cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
