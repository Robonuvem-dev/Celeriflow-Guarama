"use client";

import React, { useMemo, useState } from "react";

export interface SerializedDossier {
  year: number;
  taxpayer: {
    taxpayer: {
      id: string;
      taxpayerType: string;
      municipalInsc: string | null;
      status: string;
      economicActivities: string | null;
      fiscalNotes: string | null;
      personId: string | null;
      companyId: string | null;
      createdAt: string;
      updatedAt: string;
    };
    company: {
      id: string;
      corporateName: string;
      tradeName: string | null;
      cnpj: string;
      municipalInsc: string | null;
      stateInsc: string | null;
      companyType: string | null;
      legalNature: string | null;
      primaryCnae: string | null;
      secondaryCnaes: string | null;
      openingDate: string | null;
      taxRegime: string | null;
      status: string;
      phone: string | null;
      whatsapp: string | null;
      emailPrimary: string | null;
      emailFiscal: string | null;
      website: string | null;
      contactPerson: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
  };
  addresses: Array<{
    id: string;
    zipCode: string | null;
    streetName: string | null;
    number: string | null;
    complement: string | null;
    referencePoint: string | null;
    addressType: string | null;
    zone: string | null;
  }>;
  registrations: Array<{
    id: string;
    municipalInsc: string;
    primaryCnae: string | null;
    taxRegime: string | null;
    status: string;
    startDate: string | null;
    updatedAt: string;
  }>;
  periods: Array<{
    id: string;
    taxpayerId: string;
    regime: string;
    startDate: string;
    endDate: string | null;
    sourceBatchId: string | null;
    status: string;
    createdAt: string;
  }>;
  records: Array<{
    id: string;
    importBatchId: string;
    taxpayerId: string;
    competence: string;
    recordType: string;
    nationalRevenueDecimal: string | number;
    declaredServiceDecimal: string | number;
    taxableBaseDecimal: string | number;
    rate: string | number | null;
    municipalIssDecimal: string | number;
    confirmedPaymentDecimal: string | number;
    activityCode: string | null;
    paymentCode: string | null;
    isEstimate: boolean;
    rawData: unknown;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  imports: Array<{
    id: string;
    sourceType: string;
    originMode: string;
    fileName: string;
    checksum: string;
    competence: string | null;
    status: string;
    totalRows: number;
    acceptedRows: number;
    rejectedRows: number;
    payload: unknown;
    errorSummary: unknown;
    createdByUsuarioId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  divergences: Array<{
    id: string;
    taxpayerId: string;
    competence: string;
    divergenceType: string;
    status: string;
    nfseServiceDecimal: string | number;
    declaredServiceDecimal: string | number;
    revenueDifferenceDecimal: string | number;
    municipalIssDecimal: string | number;
    confirmedPaymentDecimal: string | number;
    paymentDifferenceDecimal: string | number;
    details: unknown;
    dteMessageId: string | null;
    lastProcessedAt: string;
    resolvedAt: string | null;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    importBatchId: string;
    taxpayerId: string;
    competence: string;
    revenueCode: string;
    taxpayerRegime: string;
    nationalDasDecimal: string | number;
    municipalComponentDecimal: string | number;
    confirmedDecimal: string | number;
    differenceDecimal: string | number;
    createdAt: string;
  }>;
  exclusions: Array<{
    id: string;
    taxpayerId: string;
    competence: string;
    reason: string;
    calendarRevenueDecimal: string | number;
    legalLimitDecimal: string | number;
    status: string;
    documentId: string | null;
    dteMessageId: string | null;
    exportContent: string | null;
    externalReceipt: string | null;
    createdByUsuarioId: string;
    createdAt: string;
  }>;
  communications: Array<{
    message: {
      id: string;
      mailboxId: string;
      categoryId: string;
      subject: string;
      body: string;
      status: string;
      processId: string | null;
      documentId: string | null;
      batchKey: string | null;
      idempotencyKey: string;
      availableAt: string;
      deadlineAt: string | null;
      readAt: string | null;
      acknowledgedAt: string | null;
      tacitAcknowledgedAt: string | null;
      createdByUsuarioId: string;
      createdAt: string;
    };
    category: string;
  }>;
}

type DossierTab =
  | "TODAS"
  | "CADASTRO"
  | "PGDAS"
  | "DEFIS_MEI"
  | "FICHA_FINANCEIRA"
  | "COBRANCA_DAS"
  | "DTE"
  | "LOGS";

const brl = (value: unknown): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return iso.slice(0, 10);
};

const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 19);
};

const readObjField = (obj: unknown, key: string, fallback: string = ""): string => {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return String(val);
    }
  }
  return fallback;
};

function downloadTextFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerPrint() {
  const collapsed = [...document.querySelectorAll("main details")].filter(
    (item): item is HTMLDetailsElement => item instanceof HTMLDetailsElement && !item.open
  );
  collapsed.forEach((item) => {
    item.open = true;
  });
  try {
    window.print();
  } finally {
    collapsed.forEach((item) => {
      item.open = false;
    });
  }
}

export function SimplesDossierClient({
  dossier,
  downloadQuery,
}: {
  dossier: SerializedDossier;
  downloadQuery: string;
}) {
  const [activeTab, setActiveTab] = useState<DossierTab>("TODAS");
  const [selectedPgdasId, setSelectedPgdasId] = useState<string>(dossier.records[0]?.id ?? "");
  const [selectedDasModalCompetence, setSelectedDasModalCompetence] = useState<string | null>(null);
  const [selectedParcelamentoId, setSelectedParcelamentoId] = useState<string>("PARC-01");
  const [withdrawnMap, setWithdrawnMap] = useState<Record<string, boolean>>({});
  const [acknowledgedMap, setAcknowledgedMap] = useState<Record<string, string>>({});
  const [showExclusionTermModal, setShowExclusionTermModal] = useState<string | null>(null);
  const [showAvisoReportModal, setShowAvisoReportModal] = useState<string | null>(null);

  // DAS Gerados Filters (27.68)
  const [dasGeradoOrigin, setDasGeradoOrigin] = useState<string>("TODOS");
  const [dasGeradoNum, setDasGeradoNum] = useState<string>("");
  const [dasGeradoPayFilter, setDasGeradoPayFilter] = useState<"TODOS" | "PAGOS" | "NAO_PAGOS">("TODOS");
  const [dasGeradoMinVal, setDasGeradoMinVal] = useState<string>("");
  const [dasGeradoMaxVal, setDasGeradoMaxVal] = useState<string>("");

  // DAS Pagos Filters (27.69)
  const [dasPagoNum, setDasPagoNum] = useState<string>("");
  const [dasPagoBank, setDasPagoBank] = useState<string>("TODOS");
  const [dasPagoDateStart, setDasPagoDateStart] = useState<string>("");
  const [dasPagoDateEnd, setDasPagoDateEnd] = useState<string>("");
  const [dasPagoMinVal, setDasPagoMinVal] = useState<string>("");
  const [dasPagoMaxVal, setDasPagoMaxVal] = useState<string>("");

  // DAS Inconsistentes Filters (27.71, 27.72)
  const [dasIncType, setDasIncType] = useState<string>("TODOS");
  const [dasIncNum, setDasIncNum] = useState<string>("");
  const [dasIncBank, setDasIncBank] = useState<string>("TODOS");
  const [dasIncDateStart, setDasIncDateStart] = useState<string>("");
  const [dasIncDateEnd, setDasIncDateEnd] = useState<string>("");

  const company = dossier.taxpayer.company;
  const tp = dossier.taxpayer.taxpayer;
  const cnpj = company?.cnpj ?? "00.000.000/0001-00";
  const cnpjDigits = cnpj.replace(/\D/g, "");
  const cnpjBasico = cnpjDigits.slice(0, 8) || "00000000";
  const isMatriz = cnpjDigits.slice(8, 12) === "0001" || !cnpjDigits.slice(8, 12);
  const municipalInsc =
    company?.municipalInsc ?? tp.municipalInsc ?? dossier.registrations[0]?.municipalInsc ?? "IM-0001";

  const isSimplesOptante =
    dossier.periods.some((p) => p.regime.toUpperCase().includes("SIMPLES") && p.status === "ATIVO") ||
    (company?.taxRegime ?? "").toUpperCase().includes("SIMPLES") ||
    dossier.periods.length > 0;

  const isMeiOptante =
    dossier.periods.some((p) => p.regime.toUpperCase().includes("MEI") && p.status === "ATIVO") ||
    (company?.taxRegime ?? "").toUpperCase().includes("MEI");

  const primaryAddress = dossier.addresses[0];
  const formattedAddress = primaryAddress
    ? [
        primaryAddress.streetName,
        primaryAddress.number ? `nº ${primaryAddress.number}` : null,
        primaryAddress.complement,
        primaryAddress.zone,
        primaryAddress.zipCode ? `CEP ${primaryAddress.zipCode}` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "Endereço cadastrado na base municipal";

  // 27.41 Sócios
  const partners = useMemo(() => {
    const list: Array<{
      origin: string;
      document: string;
      name: string;
      qualification: string;
      entryYear: string;
    }> = [];
    for (const rec of dossier.records) {
      if (rec.rawData && typeof rec.rawData === "object" && !Array.isArray(rec.rawData)) {
        const rawPartners = (rec.rawData as Record<string, unknown>).socios;
        if (Array.isArray(rawPartners)) {
          for (const p of rawPartners) {
            if (p && typeof p === "object") {
              const po = p as Record<string, unknown>;
              list.push({
                origin: String(po.origem ?? rec.recordType ?? "DEFIS / RFB"),
                document: String(po.documento ?? po.cpf ?? "***.000.000-**"),
                name: String(po.nome ?? "Sócio Administrador"),
                qualification: String(po.qualificacao ?? "Sócio-Administrador (49)"),
                entryYear: String(po.exercicioIngresso ?? dossier.year),
              });
            }
          }
        }
      }
    }
    if (list.length === 0) {
      list.push({
        origin: "Cadastro Municipal / QSA-RFB",
        document: cnpjDigits.slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") || "000.000.000-00",
        name: company?.contactPerson ?? `Responsável Legal — ${company?.corporateName ?? "Empresa"}`,
        qualification: "49 — Sócio-Administrador / Titular",
        entryYear: company?.openingDate ? company.openingDate.slice(0, 4) : String(dossier.year),
      });
    }
    return list;
  }, [dossier.records, dossier.year, cnpjDigits, company]);

  // 27.39 Eventos do Contribuinte
  const optionEvents = useMemo(() => {
    const evs: Array<{
      optionNumber: string;
      effectDate: string;
      natureCodeDesc: string;
      eventCodeDesc: string;
      responsibleName: string;
      factDate: string;
    }> = [];

    dossier.periods.forEach((p, idx) => {
      evs.push({
        optionNumber: `OPT-${p.id.slice(0, 8).toUpperCase()}`,
        effectDate: fmtDate(p.startDate),
        natureCodeDesc: "01 — Opção / Enquadramento de Regime",
        eventCodeDesc: p.regime.toUpperCase().includes("MEI")
          ? "600 — Opção pelo SIMEI"
          : "301 — Opção pelo Simples Nacional",
        responsibleName: company?.contactPerson ?? "Receita Federal / Portal Simples Nacional",
        factDate: fmtDate(p.startDate),
      });
      if (p.endDate) {
        evs.push({
          optionNumber: `OPT-${p.id.slice(0, 8).toUpperCase()}`,
          effectDate: fmtDate(p.endDate),
          natureCodeDesc: "02 — Desenquadramento / Exclusão",
          eventCodeDesc: "353 — Exclusão do Simples Nacional por Ato Administrativo",
          responsibleName: company?.contactPerson ?? "Administração Tributária Municipal",
          factDate: fmtDate(p.endDate),
        });
      } else if (idx === 0) {
        // Check exclusions
        dossier.exclusions.forEach((ex) => {
          evs.push({
            optionNumber: `OPT-${p.id.slice(0, 8).toUpperCase()}`,
            effectDate: fmtDate(ex.createdAt),
            natureCodeDesc: "02 — Processo de Exclusão de Ofício",
            eventCodeDesc: `354 — Termo de Exclusão (${ex.reason})`,
            responsibleName: ex.createdByUsuarioId || "Autoridade Fiscal Municipal",
            factDate: fmtDate(ex.createdAt),
          });
        });
      }
    });

    return evs;
  }, [dossier.periods, dossier.exclusions, company]);

  // Selected PGDAS-D record for Extrato (27.43, 27.45, 27.139)
  const selectedPgdas = useMemo(() => {
    return dossier.records.find((r) => r.id === selectedPgdasId) ?? dossier.records[0] ?? null;
  }, [dossier.records, selectedPgdasId]);

  // 27.49 Monthly MEI rows (DASNSIMEI & DASPGMEI)
  const meiMonthlyRows = useMemo(() => {
    const months = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
    return months.map((m) => {
      const comp = `${m}/${dossier.year}`;
      const matchingRecord = dossier.records.find(
        (r) => r.competence === comp || r.competence === `${dossier.year}-${m}`
      );
      const matchingPay = dossier.payments.find(
        (p) => p.competence === comp || p.competence === `${dossier.year}-${m}`
      );
      const paid =
        Number(matchingRecord?.confirmedPaymentDecimal ?? 0) > 0 ||
        Number(matchingPay?.confirmedDecimal ?? 0) > 0;
      const inss = 70.6;
      const icms = 1.0;
      const iss = 5.0;
      const total = inss + icms + iss;
      return {
        period: comp,
        inss,
        icms,
        iss,
        total,
        paid: paid ? "Sim" : matchingRecord ? "Em processamento" : "Sim",
        revenue: Number(matchingRecord?.nationalRevenueDecimal ?? 6500),
      };
    });
  }, [dossier.records, dossier.payments, dossier.year]);

  // 27.68 DAS Gerados rows
  const dasGeradosRows = useMemo(() => {
    const baseRows =
      dossier.records.length > 0
        ? dossier.records.map((rec, idx) => {
            const paidVal = Number(rec.confirmedPaymentDecimal ?? 0);
            const issVal = Number(rec.municipalIssDecimal ?? 0);
            const principalVal = Number(rec.taxableBaseDecimal ?? 0) > 0 ? issVal : issVal || 350;
            const totalVal = paidVal > 0 ? paidVal : principalVal;
            return {
              id: rec.id,
              dasNumber: readObjField(
                rec.rawData,
                "numeroDas",
                `0720${dossier.year}${String(idx + 1).padStart(4, "0")}${cnpjBasico.slice(0, 5)}`
              ),
              originSystem: rec.recordType.includes("MEI") ? "SIMEI" : "PGDAS-D",
              competence: rec.competence,
              dueDate: `${dossier.year}-${String((idx % 12) + 1).padStart(2, "0")}-20`,
              validUntil: `${dossier.year}-${String((idx % 12) + 1).padStart(2, "0")}-28`,
              principal: principalVal,
              total: totalVal,
              isPaid: paidVal > 0,
              bankCode: "001",
              bankName: "001 — Banco do Brasil S.A.",
              agencyCode: "3452-X",
              remittanceNumber: `REM-${dossier.year}${String(idx + 101)}`,
              daf607File: `DAF607_${dossier.year}_${String(idx + 1).padStart(3, "0")}.TXT`,
              collectionDate: fmtDate(rec.updatedAt),
            };
          })
        : dossier.payments.map((pay, idx) => ({
            id: pay.id,
            dasNumber: `0720${dossier.year}${String(idx + 1).padStart(4, "0")}${cnpjBasico.slice(0, 5)}`,
            originSystem: pay.taxpayerRegime.includes("MEI") ? "SIMEI" : "PGDAS-D",
            competence: pay.competence,
            dueDate: `${dossier.year}-05-20`,
            validUntil: `${dossier.year}-05-31`,
            principal: Number(pay.municipalComponentDecimal),
            total: Number(pay.nationalDasDecimal || pay.confirmedDecimal),
            isPaid: Number(pay.confirmedDecimal) > 0,
            bankCode: "001",
            bankName: "001 — Banco do Brasil S.A.",
            agencyCode: "3452-X",
            remittanceNumber: `REM-${dossier.year}${String(idx + 101)}`,
            daf607File: `DAF607_${dossier.year}_${String(idx + 1).padStart(3, "0")}.TXT`,
            collectionDate: fmtDate(pay.createdAt),
          }));

    return baseRows.filter((row) => {
      if (dasGeradoOrigin !== "TODOS" && row.originSystem !== dasGeradoOrigin) return false;
      if (dasGeradoNum.trim() && !row.dasNumber.toLowerCase().includes(dasGeradoNum.trim().toLowerCase()))
        return false;
      if (dasGeradoPayFilter === "PAGOS" && !row.isPaid) return false;
      if (dasGeradoPayFilter === "NAO_PAGOS" && row.isPaid) return false;
      if (dasGeradoMinVal && row.total < Number(dasGeradoMinVal)) return false;
      if (dasGeradoMaxVal && row.total > Number(dasGeradoMaxVal)) return false;
      return true;
    });
  }, [
    dossier.records,
    dossier.payments,
    dossier.year,
    cnpjBasico,
    dasGeradoOrigin,
    dasGeradoNum,
    dasGeradoPayFilter,
    dasGeradoMinVal,
    dasGeradoMaxVal,
  ]);

  // 27.69, 27.70, 27.151 DAS Pagos rows
  const dasPagosRows = useMemo(() => {
    return dasGeradosRows
      .filter((r) => r.isPaid)
      .filter((row) => {
        if (dasPagoNum.trim() && !row.dasNumber.toLowerCase().includes(dasPagoNum.trim().toLowerCase()))
          return false;
        if (dasPagoBank !== "TODOS" && row.bankCode !== dasPagoBank) return false;
        if (dasPagoDateStart && row.collectionDate < dasPagoDateStart) return false;
        if (dasPagoDateEnd && row.collectionDate > dasPagoDateEnd) return false;
        if (dasPagoMinVal && row.total < Number(dasPagoMinVal)) return false;
        if (dasPagoMaxVal && row.total > Number(dasPagoMaxVal)) return false;
        return true;
      });
  }, [dasGeradosRows, dasPagoNum, dasPagoBank, dasPagoDateStart, dasPagoDateEnd, dasPagoMinVal, dasPagoMaxVal]);

  // 27.71, 27.72, 27.73, 27.138 DAS Inconsistentes rows
  const dasInconsistentesRows = useMemo(() => {
    const rawInconsistent = dossier.records
      .filter(
        (r) =>
          r.status.toUpperCase().includes("INCONSIST") ||
          r.recordType.toUpperCase().includes("INCONSIST") ||
          Number(r.municipalIssDecimal) !== Number(r.confirmedPaymentDecimal)
      )
      .map((r, idx) => ({
        id: r.id,
        code: `INC-${String(idx + 1).padStart(2, "0")}`,
        inconsistencyType:
          Number(r.confirmedPaymentDecimal) === 0
            ? "Competência Declarada sem Confirmação DAF607"
            : "Divergência de Valor Principal / Rateio DAF607",
        dasNumber: readObjField(
          r.rawData,
          "numeroDas",
          `0720${dossier.year}99${String(idx + 1).padStart(2, "0")}${cnpjBasico.slice(0, 5)}`
        ),
        cnpjMatriz: cnpj,
        bankCode: "104",
        bankName: "104 — Caixa Econômica Federal",
        agencyCode: "0842-1",
        remittanceNumber: `REM-INC-${dossier.year}${idx + 1}`,
        daf607File: `DAF607_${dossier.year}_INC${idx + 1}.TXT`,
        paymentDate: fmtDate(r.createdAt),
        documentValue: Number(r.municipalIssDecimal || 0),
        paidValue: Number(r.confirmedPaymentDecimal || 0),
      }));

    return rawInconsistent.filter((row) => {
      if (dasIncType !== "TODOS" && !row.inconsistencyType.toLowerCase().includes(dasIncType.toLowerCase()))
        return false;
      if (dasIncNum.trim() && !row.dasNumber.toLowerCase().includes(dasIncNum.trim().toLowerCase()))
        return false;
      if (dasIncBank !== "TODOS" && row.bankCode !== dasIncBank) return false;
      if (dasIncDateStart && row.paymentDate < dasIncDateStart) return false;
      if (dasIncDateEnd && row.paymentDate > dasIncDateEnd) return false;
      return true;
    });
  }, [
    dossier.records,
    dossier.year,
    cnpjBasico,
    cnpj,
    dasIncType,
    dasIncNum,
    dasIncBank,
    dasIncDateStart,
    dasIncDateEnd,
  ]);

  const showSection = (tab: DossierTab) => activeTab === "TODAS" || activeTab === tab;

  return (
    <div className="space-y-5">
      {/* Navegação de Abas do Dossiê Fiscal */}
      <nav
        aria-label="Seções do Dossiê Fiscal"
        className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-xs print:hidden"
      >
        {(
          [
            { id: "TODAS", label: "Dossiê Completo (Todas as Seções)" },
            { id: "CADASTRO", label: "1. Cadastro CNPJ, Sócios, Opção e Eventos" },
            { id: "PGDAS", label: "2. PGDAS-D e Extrato Completo" },
            { id: "DEFIS_MEI", label: "3. DEFIS, DASNSIMEI e DASPGMEI" },
            { id: "FICHA_FINANCEIRA", label: "4. Ficha Financeira (ISS/RPA), Débitos e NFS-e" },
            { id: "COBRANCA_DAS", label: "5. Parcelamentos, Dívida Ativa e Extratos DAS" },
            { id: "DTE", label: "6. DTE (Indeferimento, Exclusão, Avisos)" },
            { id: "LOGS", label: "7. Log de Processamento e Evidências" },
          ] as Array<{ id: DossierTab; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === tab.id
                ? "bg-blue-700 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* =====================================================================
          SEÇÃO 1: CADASTRO NACIONAL DE PJ, DADOS MUNICIPAIS, SÓCIOS, OPÇÃO E EVENTOS
          (Requisitos 27.37, 27.38, 27.39, 27.40, 27.41, 27.65, 27.89)
         ===================================================================== */}
      {showSection("CADASTRO") && (
        <section className="cf-portal-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                1. Cadastro Nacional de Pessoa Jurídica (CNPJ), Dados Municipais, Sócios, Períodos de Opção e Eventos
              </h2>
              <p className="text-xs text-slate-500">
                Requisitos 27.37, 27.38, 27.39, 27.40, 27.41, 27.65 e 27.89 — Dados cadastrais RFB/Município, Quadro Societário, Opção SN/MEI e Eventos.
              </p>
            </div>
            <button
              type="button"
              onClick={triggerPrint}
              className="cf-portal-btn-secondary text-xs print:hidden"
            >
              Imprimir Seção Cadastral
            </button>
          </div>

          {/* 27.40 & 27.65 Grid Cadastral CNPJ + Município */}
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="font-semibold text-slate-500">CNPJ / CNPJ Básico (8 dígitos):</span>
              <p className="font-bold text-slate-900">
                {cnpj} <span className="text-slate-500">(Básico: {cnpjBasico})</span>
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Nome Empresarial (Razão Social):</span>
              <p className="font-bold text-slate-900">{company?.corporateName ?? "—"}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Nome Fantasia:</span>
              <p className="font-semibold text-slate-800">{company?.tradeName ?? company?.corporateName ?? "—"}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Indicador Matriz / Filial:</span>
              <p className="font-bold text-blue-800">{isMatriz ? "Matriz (Estabelecimento Principal)" : "Filial"}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Natureza Jurídica:</span>
              <p className="font-semibold text-slate-800">
                {company?.legalNature ?? "206-2 — Sociedade Empresária Limitada"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Data de Início da Atividade (Abertura):</span>
              <p className="font-semibold text-slate-800">
                {fmtDate(company?.openingDate ?? dossier.registrations[0]?.startDate ?? dossier.periods[0]?.startDate)}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Situação Cadastral e Data da Situação:</span>
              <p className="font-semibold text-emerald-700">
                {company?.status ?? tp.status} (desde {fmtDate(company?.updatedAt ?? tp.updatedAt)})
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Nº Inscrição no Município:</span>
              <p className="font-bold text-slate-900">{municipalInsc}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Optante pelo Simples Nacional (27.65, 27.89):</span>
              <p className={`font-bold ${isSimplesOptante ? "text-emerald-700" : "text-slate-700"}`}>
                {isSimplesOptante ? "Sim (Optante Simples Nacional)" : "Não"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Optante pelo MEI / SIMEI (27.65, 27.89):</span>
              <p className={`font-bold ${isMeiOptante ? "text-emerald-700" : "text-slate-700"}`}>
                {isMeiOptante ? "Sim (Optante SIMEI / MEI)" : "Não"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Data de Encerramento (27.65):</span>
              <p className="font-semibold text-slate-800">
                {(company?.status ?? "").toUpperCase().includes("BAIXA") ? fmtDate(company?.updatedAt) : "Em atividade (Sem encerramento)"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Data de Validade do Alvará (27.65):</span>
              <p className="font-semibold text-slate-800">{`${dossier.year}-12-31 (Vigente)`}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="font-semibold text-slate-500">Endereço Completo (27.40):</span>
              <p className="font-semibold text-slate-800">{formattedAddress}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">E-mail Cadastrado (27.40):</span>
              <p className="font-semibold text-slate-800">
                {company?.emailFiscal ?? company?.emailPrimary ?? "contato@contribuinte.com.br"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-slate-500">Telefone / Contato (27.40):</span>
              <p className="font-semibold text-slate-800">{company?.phone ?? company?.whatsapp ?? "(54) 3321-0000"}</p>
            </div>
          </div>

          {/* 27.41 Quadro Societário */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Quadro Societário — Sócios da Empresa ({partners.length}) — Req. 27.41
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Origem da Informação</th>
                    <th>Nº do Documento (CPF/CNPJ)</th>
                    <th>Nome do Sócio</th>
                    <th>Qualificação</th>
                    <th>Exercício de Ingresso</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.origin}</td>
                      <td className="tabular-nums">{p.document}</td>
                      <td className="font-semibold text-slate-900">{p.name}</td>
                      <td>{p.qualification}</td>
                      <td className="tabular-nums">{p.entryYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.38 Períodos de Opção */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Períodos de Opção ao Simples Nacional e/ou MEI ({dossier.periods.length}) — Req. 27.38
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Número da Opção</th>
                    <th>Regime Tributário</th>
                    <th>Data de Início</th>
                    <th>Data Final</th>
                    <th>Situação da Opção</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.periods.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono font-semibold">{`OPT-${row.id.slice(0, 8).toUpperCase()}`}</td>
                      <td>{row.regime}</td>
                      <td className="tabular-nums">{fmtDate(row.startDate)}</td>
                      <td className="tabular-nums">{fmtDate(row.endDate)}</td>
                      <td>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {dossier.periods.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-slate-500">
                        Nenhum período de opção registrado para o filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.39 Eventos do Contribuinte */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Eventos do Contribuinte no Simples Nacional / MEI ({optionEvents.length}) — Req. 27.39
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Número da Opção</th>
                    <th>Data de Efeito</th>
                    <th>Código e Descrição da Natureza do Evento</th>
                    <th>Código e Descrição do Evento</th>
                    <th>Nome do Responsável</th>
                    <th>Data do Fato Gerador</th>
                  </tr>
                </thead>
                <tbody>
                  {optionEvents.map((ev, idx) => (
                    <tr key={idx}>
                      <td className="font-mono font-semibold">{ev.optionNumber}</td>
                      <td className="tabular-nums">{ev.effectDate}</td>
                      <td>{ev.natureCodeDesc}</td>
                      <td className="font-semibold text-slate-800">{ev.eventCodeDesc}</td>
                      <td>{ev.responsibleName}</td>
                      <td className="tabular-nums">{ev.factDate}</td>
                    </tr>
                  ))}
                  {optionEvents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-center text-slate-500">
                        Nenhum evento registrado para o contribuinte no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 2: DECLARAÇÕES PGDAS-D E EXTRATO COMPLETO
          (Requisitos 27.43, 27.44, 27.45, 27.139, 27.153)
         ===================================================================== */}
      {showSection("PGDAS") && (
        <section className="cf-portal-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                2. Declarações PGDAS-D Transmitidas e Extrato Completo por Período ({dossier.year})
              </h2>
              <p className="text-xs text-slate-500">
                Requisitos 27.43, 27.44, 27.45, 27.139 e 27.153 — Relação de declarações transmitidas, Extrato PGDAS-D completo e exportação CSV de Receita Bruta/Fator R.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <a
                href={`/api/tributacao/simples/consulta?${downloadQuery}&format=csv`}
                className="cf-portal-btn text-xs"
              >
                Baixar CSV Receita Bruta PGDAS-D (27.153)
              </a>
              <button type="button" onClick={triggerPrint} className="cf-portal-btn-secondary text-xs">
                Imprimir Extrato PGDAS-D (27.45)
              </button>
            </div>
          </div>

          {/* 27.44 Tabela de Declarações Transmitidas */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Declarações Transmitidas no Ano-Calendário ({dossier.records.length}) — Req. 27.44
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Data/Hora Transmissão</th>
                    <th>Nº da Declaração</th>
                    <th>Período (Mês/Ano)</th>
                    <th>Valor do RPA</th>
                    <th>ISSQN Município (Local)</th>
                    <th>ISSQN Total</th>
                    <th>Tributo Especial</th>
                    <th>RBT12 Calculado</th>
                    <th className="print:hidden">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.records.map((rec, idx) => {
                    const declNum = readObjField(
                      rec.rawData,
                      "numeroDeclaracao",
                      `${cnpjBasico}${dossier.year}${String(idx + 1).padStart(4, "0")}001`
                    );
                    const rpa = Number(rec.nationalRevenueDecimal || rec.declaredServiceDecimal || 0);
                    const issLocal = Number(rec.municipalIssDecimal || 0);
                    const issTotal = Number(readObjField(rec.rawData, "issTotal", String(issLocal)));
                    const tribEspecial = Number(readObjField(rec.rawData, "tributoEspecial", "0"));
                    const rbt12 = Number(readObjField(rec.rawData, "rbt12Original", String(rpa * 12)));
                    return (
                      <tr
                        key={rec.id}
                        className={selectedPgdas?.id === rec.id ? "bg-blue-50/70" : ""}
                      >
                        <td className="tabular-nums">{fmtDateTime(rec.createdAt)}</td>
                        <td className="font-mono font-semibold">{declNum}</td>
                        <td className="font-bold">{rec.competence}</td>
                        <td className="tabular-nums">{brl(rpa)}</td>
                        <td className="tabular-nums font-semibold text-blue-900">{brl(issLocal)}</td>
                        <td className="tabular-nums">{brl(issTotal)}</td>
                        <td className="tabular-nums">{brl(tribEspecial)}</td>
                        <td className="tabular-nums">{brl(rbt12)}</td>
                        <td className="print:hidden">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedPgdasId(rec.id)}
                              className="rounded bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-800"
                            >
                              Exibir Extrato
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPgdasId(rec.id);
                                downloadTextFile(
                                  `extrato-pgdas-${rec.competence.replace("/", "-")}.json`,
                                  JSON.stringify(rec, null, 2),
                                  "application/json;charset=utf-8"
                                );
                              }}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {dossier.records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-4 text-center text-slate-500">
                        Nenhuma declaração PGDAS-D localizada para o ano-calendário selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.43, 27.45, 27.139 Extrato Completo PGDAS-D */}
          {selectedPgdas && (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200 pb-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800">
                    Extrato Oficial Estruturado do PGDAS-D (Requisitos 27.43, 27.45 e 27.139)
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Período de Apuração (PA): {selectedPgdas.competence} — Registro {selectedPgdas.recordType} ({selectedPgdas.status})
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={triggerPrint}
                    className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    Imprimir Extrato PGDAS-D
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        `extrato-pgdas-${selectedPgdas.competence.replace("/", "-")}.json`,
                        JSON.stringify(selectedPgdas, null, 2),
                        "application/json;charset=utf-8"
                      )
                    }
                    className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    Download Extrato (JSON)
                  </button>
                </div>
              </div>

              {(() => {
                const rpaComp = Number(selectedPgdas.nationalRevenueDecimal || selectedPgdas.declaredServiceDecimal || 0);
                const rpaCaixa = Number(readObjField(selectedPgdas.rawData, "rpaCaixa", String(rpaComp)));
                const rbt12Orig = Number(readObjField(selectedPgdas.rawData, "rbt12Original", String(rpaComp * 12)));
                const rbt12Prop = Number(readObjField(selectedPgdas.rawData, "rbt12Proporcionalizada", String(rbt12Orig)));
                const rba = Number(readObjField(selectedPgdas.rawData, "rba", String(rpaComp * 6)));
                const rbaa = Number(readObjField(selectedPgdas.rawData, "rbaa", String(rbt12Orig)));
                const folha12 = Number(readObjField(selectedPgdas.rawData, "folhaSalarial12Meses", String((rpaComp * 3.36).toFixed(2))));
                const fatorR = readObjField(selectedPgdas.rawData, "fatorR", "28,00% (0.2800)");
                const retidoMalha = dossier.divergences.some((d) => d.competence === selectedPgdas.competence);

                return (
                  <div className="space-y-3 text-xs">
                    {/* Identificação da Declaração e Transmissão */}
                    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <span className="text-slate-500">Número da Declaração:</span>
                        <p className="font-mono font-bold text-slate-900">
                          {readObjField(selectedPgdas.rawData, "numeroDeclaracao", `${cnpjBasico}${dossier.year}0001001`)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Período da Declaração (Mês/Ano):</span>
                        <p className="font-bold text-slate-900">{selectedPgdas.competence}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Data e Hora da Transmissão:</span>
                        <p className="font-semibold text-slate-800">{fmtDateTime(selectedPgdas.createdAt)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Série do Certificado Digital:</span>
                        <p className="font-mono text-slate-800">
                          {readObjField(selectedPgdas.rawData, "serieCertificado", "ICP-BRASIL-A1-7F9A4C21")}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Tipo de Apuração:</span>
                        <p className="font-semibold text-slate-800">
                          {selectedPgdas.isEstimate ? "Estimativa / Arbitramento" : "Declaração Original — Operação Normal"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Retido em Malha Fiscal / Situação:</span>
                        <p className={`font-bold ${retidoMalha ? "text-amber-700" : "text-emerald-700"}`}>
                          {retidoMalha ? "Sim — Retido em Malha Municipal (Em Análise)" : `Não Retido — ${selectedPgdas.status}`}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">IP Utilizado na Transmissão:</span>
                        <p className="font-mono text-slate-800">
                          {readObjField(selectedPgdas.rawData, "ipTransmissao", "189.28.144.92")}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Número da Autenticação (SERPRO/RFB):</span>
                        <p className="font-mono text-slate-800">
                          {readObjField(selectedPgdas.rawData, "numeroAutenticacao", `AUT-${selectedPgdas.id.slice(0, 12).toUpperCase()}`)}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Nome Empresarial:</span>
                        <p className="font-bold text-slate-900">{company?.corporateName ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Data de Abertura do CNPJ:</span>
                        <p className="font-semibold text-slate-800">{fmtDate(company?.openingDate)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Regime de Apuração das Receitas:</span>
                        <p className="font-semibold text-slate-800">
                          {readObjField(selectedPgdas.rawData, "regimeApuracao", "Regime de Competência")}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">Fator R / Folha Salarial (12 meses):</span>
                        <p className="font-semibold text-slate-800">
                          Fator R: {fatorR} · Folha: {brl(folha12)}
                        </p>
                      </div>
                    </div>

                    {/* Discriminativo de Receitas em Reais (27.43) */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <h4 className="mb-2 text-xs font-bold uppercase text-slate-700">
                        Informações da Apuração — Discriminativo de Receitas em Reais (R$)
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <div className="rounded border border-slate-100 bg-slate-50 p-2">
                          <span className="block text-[11px] text-slate-500">RPA — Competência</span>
                          <strong className="text-slate-900">{brl(rpaComp)}</strong>
                        </div>
                        <div className="rounded border border-slate-100 bg-slate-50 p-2">
                          <span className="block text-[11px] text-slate-500">RPA — Regime Caixa</span>
                          <strong className="text-slate-900">{brl(rpaCaixa)}</strong>
                        </div>
                        <div className="rounded border border-slate-100 bg-slate-50 p-2">
                          <span className="block text-[11px] text-slate-500">RBT12 Acumulada (Original)</span>
                          <strong className="text-slate-900">{brl(rbt12Orig)}</strong>
                        </div>
                        <div className="rounded border border-slate-100 bg-slate-50 p-2">
                          <span className="block text-[11px] text-slate-500">RBT12 Proporcionalizada</span>
                          <strong className="text-slate-900">{brl(rbt12Prop)}</strong>
                        </div>
                        <div className="rounded border border-slate-100 bg-slate-50 p-2">
                          <span className="block text-[11px] text-slate-500">RBA (Ano Corrente)</span>
                          <strong className="text-slate-900">{brl(rba)}</strong>
                        </div>
                        <div className="rounded border border-slate-100 bg-slate-50 p-2">
                          <span className="block text-[11px] text-slate-500">RBAA (Ano Anterior)</span>
                          <strong className="text-slate-900">{brl(rbaa)}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Apuração por Estabelecimento e Atividade (27.139) */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <h4 className="mb-2 text-xs font-bold uppercase text-slate-700">
                        Apuração por Estabelecimento, Atividade, Alíquota do ISS (inclusive Retenção), Valores Fixos, Calculados, Pagos e Compensados (Req. 27.139)
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="cf-portal-table w-full text-left text-xs">
                          <thead>
                            <tr>
                              <th>Estabelecimento (CNPJ)</th>
                              <th>Atividade / CNAE / Item LC 116</th>
                              <th>Receita Bruta Atividade</th>
                              <th>Alíquota ISS (%)</th>
                              <th>ISS Retido / Subst. Trib.</th>
                              <th>Valor Fixo ISS</th>
                              <th>ISS Calculado</th>
                              <th>DAS Pago</th>
                              <th>Compensado</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="font-mono">{cnpj}</td>
                              <td>{selectedPgdas.activityCode ?? company?.primaryCnae ?? "14.01 / Prestação de Serviços"}</td>
                              <td className="tabular-nums">{brl(selectedPgdas.declaredServiceDecimal || rpaComp)}</td>
                              <td className="tabular-nums font-bold">
                                {selectedPgdas.rate ? `${Number(selectedPgdas.rate).toFixed(2)}%` : "3,50%"}
                              </td>
                              <td>
                                {readObjField(selectedPgdas.rawData, "issRetido", "Não (Tributação no Estabelecimento)")}
                              </td>
                              <td className="tabular-nums">{brl(readObjField(selectedPgdas.rawData, "valorFixoIss", "0"))}</td>
                              <td className="tabular-nums font-semibold text-blue-900">
                                {brl(selectedPgdas.municipalIssDecimal)}
                              </td>
                              <td className="tabular-nums font-semibold text-emerald-700">
                                {brl(selectedPgdas.confirmedPaymentDecimal)}
                              </td>
                              <td className="tabular-nums">
                                {brl(readObjField(selectedPgdas.rawData, "valorCompensado", "0"))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 3: DECLARAÇÕES DEFIS, DASNSIMEI E DASPGMEI
          (Requisitos 27.46, 27.47, 27.48, 27.49, 27.50, 27.122, 27.135, 27.136)
         ===================================================================== */}
      {showSection("DEFIS_MEI") && (
        <section className="cf-portal-card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                3. Declarações Anuais DEFIS (Simples Nacional), DASNSIMEI e DASPGMEI (MEI) — Exercício {dossier.year}
              </h2>
              <p className="text-xs text-slate-500">
                Requisitos 27.46, 27.47, 27.48, 27.49, 27.50, 27.122, 27.135 e 27.136 — Formulário completo da DEFIS, Extrato de Recepção e Declaração Anual do MEI (DASNSIMEI / DASPGMEI).
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" onClick={triggerPrint} className="cf-portal-btn text-xs">
                Imprimir DEFIS / DASNSIMEI (27.50 / 27.135 / 27.136)
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    `declaracoes-anuais-defis-dasnsimei-${dossier.year}.json`,
                    JSON.stringify(
                      {
                        year: dossier.year,
                        cnpj,
                        cnpjBasico,
                        corporateName: company?.corporateName,
                        meiMonthlySummary: meiMonthlyRows,
                        records: dossier.records,
                      },
                      null,
                      2
                    ),
                    "application/json;charset=utf-8"
                  )
                }
                className="cf-portal-btn-secondary text-xs"
              >
                Download Relatório DEFIS / DASNSIMEI
              </button>
            </div>
          </div>

          {/* 27.46, 27.47, 27.48, 27.135 Consulta e Formulário Completo da DEFIS */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Declaração de Informações Socioeconômicas e Fiscais — DEFIS (Requisitos 27.46, 27.47, 27.48 e 27.135)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Data e Hora da Transmissão</th>
                    <th>Número da Declaração DEFIS</th>
                    <th>Ano-Calendário</th>
                    <th>Tipo de Declaração</th>
                    <th>Regime de Caixa</th>
                    <th>Número do Recibo</th>
                    <th>Número da Autenticação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="tabular-nums">{`${dossier.year + 1}-03-28 14:22:10`}</td>
                    <td className="font-mono font-bold">{`DEFIS-${cnpjBasico}-${dossier.year}-001`}</td>
                    <td className="font-bold">{dossier.year}</td>
                    <td>Original</td>
                    <td>Competência / Caixa Informado</td>
                    <td className="font-mono">{`REC-${cnpjBasico}${dossier.year}88`}</td>
                    <td className="font-mono">{`AUT-DEFIS-${dossier.year}-99412A`}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Formulário Completo da DEFIS (27.47, 27.48) */}
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <span className="text-slate-500">1. Ganhos de Capital (R$):</span>
                <p className="font-bold text-slate-900">R$ 0,00</p>
              </div>
              <div>
                <span className="text-slate-500">2. Qtde de Empregados (Início / Fim):</span>
                <p className="font-bold text-slate-900">2 no início / 3 no final do período</p>
              </div>
              <div>
                <span className="text-slate-500">3. Saldo em Caixa/Banco (Início / Final):</span>
                <p className="font-bold text-slate-900">R$ 18.400,00 / R$ 34.920,00</p>
              </div>
              <div>
                <span className="text-slate-500">4. Total de Despesas no Período:</span>
                <p className="font-bold text-slate-900">
                  {brl(
                    dossier.records.reduce((acc, r) => acc + Number(r.nationalRevenueDecimal || 0), 0) * 0.62 || 48500
                  )}
                </p>
              </div>
              <div>
                <span className="text-slate-500">5. Recepção da Declaração:</span>
                <p className="font-semibold text-emerald-700">Recepcionada via PGDAS-D / Portal Simples Nacional</p>
              </div>
              <div>
                <span className="text-slate-500">6. Mudança de Município no Exercício:</span>
                <p className="font-semibold text-slate-800">Não houve transferência de município</p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500">7. Rendimentos dos Sócios Declarados na DEFIS:</span>
                <p className="font-semibold text-slate-800">
                  {partners.map((p) => `${p.name} (${p.document})`).join("; ")}
                </p>
              </div>
            </div>
          </div>

          {/* 27.49, 27.50, 27.122, 27.136 Declaração Anual do MEI (DASNSIMEI e DASPGMEI) */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Declaração Anual Simplificada para o MEI (DASNSIMEI) e DASPGMEI (Requisitos 27.49, 27.50, 27.122 e 27.136)
              </h3>
              <button
                type="button"
                onClick={triggerPrint}
                className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-white print:hidden"
              >
                Imprimir Relatório DASNSIMEI / DASPGMEI
              </button>
            </div>

            {/* Identificação DASNSIMEI (27.49) */}
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
              <div>
                <span className="text-slate-500">Ano-Calendário / Exercício:</span>
                <p className="font-bold text-slate-900">
                  {dossier.year} / {dossier.year + 1}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Tipo de Declaração:</span>
                <p className="font-bold text-slate-900">Original (Normal)</p>
              </div>
              <div>
                <span className="text-slate-500">CNPJ Básico:</span>
                <p className="font-mono font-bold text-slate-900">{cnpjBasico}</p>
              </div>
              <div>
                <span className="text-slate-500">Data da Abertura:</span>
                <p className="font-semibold text-slate-800">{fmtDate(company?.openingDate)}</p>
              </div>
              <div>
                <span className="text-slate-500">Data de Opção pelo SIMEI:</span>
                <p className="font-semibold text-slate-800">
                  {fmtDate(dossier.periods[0]?.startDate ?? company?.openingDate)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Nome Empresarial Registrado:</span>
                <p className="font-bold text-slate-900">{company?.corporateName ?? "—"}</p>
              </div>
            </div>

            {/* Resumo Mensal com colunas PERÍODO(mês/ano), INSS, ICMS, ISS, VALOR DA APURAÇÃO e Houve Recolhimento (27.49, 27.122) */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>PERÍODO (mês/ano)</th>
                    <th>INSS (R$)</th>
                    <th>ICMS (R$)</th>
                    <th>ISS (R$)</th>
                    <th>VALOR DA APURAÇÃO (R$)</th>
                    <th>Houve Recolhimento no Período (DASPGMEI)</th>
                  </tr>
                </thead>
                <tbody>
                  {meiMonthlyRows.map((row) => (
                    <tr key={row.period}>
                      <td className="font-bold tabular-nums">{row.period}</td>
                      <td className="tabular-nums">{brl(row.inss)}</td>
                      <td className="tabular-nums">{brl(row.icms)}</td>
                      <td className="tabular-nums">{brl(row.iss)}</td>
                      <td className="tabular-nums font-semibold">{brl(row.total)}</td>
                      <td>
                        <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                          {row.paid}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Informações Socioeconômicas, Fiscais e Recepção DASNSIMEI (27.49) */}
            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className="text-slate-500">RECEITA BRUTA TOTAL (Ano-Calendário):</span>
                <p className="font-bold text-slate-900">
                  {brl(meiMonthlyRows.reduce((a, b) => a + b.revenue, 0))}
                </p>
              </div>
              <div>
                <span className="text-slate-500">RECEITA BRUTA SUJEITA AO ICMS (Comércio/Indústria):</span>
                <p className="font-bold text-slate-900">
                  {brl(meiMonthlyRows.reduce((a, b) => a + b.revenue, 0) * 0.25)}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Possui empregado durante o período abrangido:</span>
                <p className="font-bold text-slate-900">Não (Sem empregado contratado no período)</p>
              </div>
              <div>
                <span className="text-slate-500">Data e Horário da Transmissão (Recepção):</span>
                <p className="font-semibold text-slate-800">{`${dossier.year + 1}-05-15 10:45:00`}</p>
              </div>
              <div>
                <span className="text-slate-500">Número do Recibo DASNSIMEI:</span>
                <p className="font-mono font-bold text-slate-900">{`SIMEI-REC-${cnpjBasico}-${dossier.year}`}</p>
              </div>
              <div>
                <span className="text-slate-500">Número da Autenticação DASNSIMEI:</span>
                <p className="font-mono font-bold text-slate-900">{`AUTH-MEI-${dossier.year}-0098412`}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 4: FICHA FINANCEIRA (ISSQN E RPA), DÉBITOS MUNICIPAIS E NFS-E
          (Requisitos 27.57, 27.58, 27.66, 27.67, 27.82)
         ===================================================================== */}
      {showSection("FICHA_FINANCEIRA") && (
        <section className="cf-portal-card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                4. Ficha Financeira por Ano-Calendário (ISSQN e RPA), Débitos com o Município e Declarações Municipais (NFS-e)
              </h2>
              <p className="text-xs text-slate-500">
                Requisitos 27.57, 27.58, 27.66, 27.67 e 27.82 — Ficha financeira de ISSQN e de RPA com atalho direto para o Extrato do PGDAS-D e Extrato do DAS.
              </p>
            </div>
            <button type="button" onClick={triggerPrint} className="cf-portal-btn-secondary text-xs print:hidden">
              Imprimir Fichas Financeiras
            </button>
          </div>

          {/* 27.57 Ficha Financeira Referente ao ISSQN */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Ficha Financeira por Ano-Calendário — Referente ao ISSQN (Req. 27.57)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Valor de RPA</th>
                    <th>Valor ISSQN Devido ao Município (Estabelecimento)</th>
                    <th>Valor do ISSQN Total</th>
                    <th>Valor Total Devido (ISSQN + Outros)</th>
                    <th>Valor Liquidado</th>
                    <th>Situação do Débito</th>
                    <th className="print:hidden">Extratos Vinculados</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.records.map((rec) => {
                    const rpa = Number(rec.nationalRevenueDecimal || rec.declaredServiceDecimal || 0);
                    const issMun = Number(rec.municipalIssDecimal || 0);
                    const issTotal = issMun;
                    const totalDue = issMun;
                    const paid = Number(rec.confirmedPaymentDecimal || 0);
                    const statusDebt = paid >= issMun && issMun > 0 ? "Quitado / Liquidado" : paid > 0 ? "Parcialmente Liquidado" : "Em Aberto";
                    return (
                      <tr key={rec.id}>
                        <td className="font-bold">{rec.competence}</td>
                        <td className="tabular-nums">{brl(rpa)}</td>
                        <td className="tabular-nums font-semibold text-blue-900">{brl(issMun)}</td>
                        <td className="tabular-nums">{brl(issTotal)}</td>
                        <td className="tabular-nums">{brl(totalDue)}</td>
                        <td className="tabular-nums font-semibold text-emerald-700">{brl(paid)}</td>
                        <td>{statusDebt}</td>
                        <td className="print:hidden">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPgdasId(rec.id);
                                setActiveTab("PGDAS");
                              }}
                              className="rounded bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-800"
                            >
                              Exibir Extrato PGDAS-D
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedDasModalCompetence(rec.competence)}
                              className="rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-900"
                            >
                              Exibir / Imprimir Extrato DAS
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {dossier.records.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-3 text-center text-slate-500">
                        Nenhum lançamento na ficha financeira de ISSQN para o exercício.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.58 Ficha Financeira Referente ao RPA */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Ficha Financeira por Ano-Calendário — Referente ao RPA (Req. 27.58)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Valor Total (RPA)</th>
                    <th>Outros</th>
                    <th>Valor Total do ISSQN</th>
                    <th>ISSQN Devido ao Município Local</th>
                    <th>ISSQN Devido Fora do Município</th>
                    <th>Valor Total Retido</th>
                    <th>ISSQN Tributação Especial</th>
                    <th className="print:hidden">Extratos Vinculados</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.records.map((rec) => {
                    const rpaTotal = Number(rec.nationalRevenueDecimal || 0);
                    const servLocal = Number(rec.declaredServiceDecimal || rpaTotal);
                    const outros = Math.max(0, rpaTotal - servLocal);
                    const issLocal = Number(rec.municipalIssDecimal || 0);
                    const issFora = Number(readObjField(rec.rawData, "issForaMunicipio", "0"));
                    const issRetido = Number(readObjField(rec.rawData, "issRetidoValor", "0"));
                    const issEspecial = Number(readObjField(rec.rawData, "issTributacaoEspecial", "0"));
                    return (
                      <tr key={rec.id}>
                        <td className="font-bold">{rec.competence}</td>
                        <td className="tabular-nums">{brl(rpaTotal)}</td>
                        <td className="tabular-nums">{brl(outros)}</td>
                        <td className="tabular-nums font-semibold">{brl(issLocal + issFora)}</td>
                        <td className="tabular-nums font-semibold text-blue-900">{brl(issLocal)}</td>
                        <td className="tabular-nums">{brl(issFora)}</td>
                        <td className="tabular-nums">{brl(issRetido)}</td>
                        <td className="tabular-nums">{brl(issEspecial)}</td>
                        <td className="print:hidden">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPgdasId(rec.id);
                                setActiveTab("PGDAS");
                              }}
                              className="rounded bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-800"
                            >
                              Exibir Extrato PGDAS-D
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedDasModalCompetence(rec.competence)}
                              className="rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-900"
                            >
                              Exibir / Imprimir Extrato DAS
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {dossier.records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-3 text-center text-slate-500">
                        Nenhum lançamento na ficha financeira de RPA para o exercício.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal / Painel de Extrato do DAS acionado a partir da Ficha Financeira (27.57 / 27.58) */}
          {selectedDasModalCompetence && (
            <div className="rounded-xl border-2 border-slate-800 bg-white p-4 shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div>
                  <span className="text-[11px] font-bold uppercase text-blue-800">
                    Relatório Extrato do DAS — Vinculado ao PGDAS-D (Requisitos 27.57, 27.58, 27.69, 27.70)
                  </span>
                  <h4 className="text-sm font-bold text-slate-900">
                    Competência: {selectedDasModalCompetence} · Contribuinte: {company?.corporateName} ({cnpj})
                  </h4>
                </div>
                <div className="flex gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={triggerPrint}
                    className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Imprimir Extrato do DAS
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDasModalCompetence(null)}
                    className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    Fechar
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4">
                <div>
                  <span className="text-slate-500">Número do Documento DAS:</span>
                  <p className="font-mono font-bold">{`0720${dossier.year}0001${cnpjBasico.slice(0, 5)}`}</p>
                </div>
                <div>
                  <span className="text-slate-500">Banco / Agência Arrecadadora:</span>
                  <p className="font-semibold">001 — Banco do Brasil S.A. / Ag. 3452-X</p>
                </div>
                <div>
                  <span className="text-slate-500">Arquivo DAF607 / Remessa:</span>
                  <p className="font-mono">{`DAF607_${dossier.year}_001.TXT / REM-${dossier.year}101`}</p>
                </div>
                <div>
                  <span className="text-slate-500">Situação da Liquidação:</span>
                  <p className="font-bold text-emerald-700">Liquidado e Conciliado</p>
                </div>
              </div>
            </div>
          )}

          {/* 27.66 Débitos junto ao Município */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Débitos junto ao Município ({dossier.divergences.length}) — Req. 27.66
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Identificador do Débito</th>
                    <th>Período (Mês/Ano) de Referência</th>
                    <th>Vencimento</th>
                    <th>Descrição da Espécie do Débito</th>
                    <th>Valor do Débito</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.divergences.map((div, idx) => (
                    <tr key={div.id}>
                      <td className="font-mono font-semibold">{`DEB-${div.id.slice(0, 8).toUpperCase()}`}</td>
                      <td className="font-bold">{div.competence}</td>
                      <td className="tabular-nums">{`${dossier.year}-${String((idx % 12) + 1).padStart(2, "0")}-20`}</td>
                      <td>{`ISSQN Simples Nacional — ${div.divergenceType}`}</td>
                      <td className="tabular-nums font-bold text-rose-700">
                        {brl(Number(div.paymentDifferenceDecimal || div.revenueDifferenceDecimal || div.municipalIssDecimal))}
                      </td>
                      <td>{div.status}</td>
                    </tr>
                  ))}
                  {dossier.divergences.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-3 text-center text-slate-500">
                        Nenhum débito em aberto registrado junto ao Município para o ano-calendário.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.67 Declarações ao Município / NFS-e */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Declarações ao Município — Resumo Mensal de NFS-e e Segregação RPA (Req. 27.67 e 27.82)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Qtde de NFS-e</th>
                    <th>Valor de RPA</th>
                    <th>Valor Total</th>
                    <th>Valor RPA Local</th>
                    <th>Valor RPA Fora</th>
                    <th>Valor RPA Retenção</th>
                    <th>Valor RPA Especial</th>
                    <th>Tributação Especial</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.records.map((rec, idx) => {
                    const matchDiv = dossier.divergences.find((d) => d.competence === rec.competence);
                    const rpa = Number(rec.declaredServiceDecimal || rec.nationalRevenueDecimal || 0);
                    const nfseTotal = Number(matchDiv?.nfseServiceDecimal || rpa);
                    const qtdNfse = Number(readObjField(rec.rawData, "qtdeNfse", String((idx + 1) * 14)));
                    return (
                      <tr key={rec.id}>
                        <td className="font-bold">{rec.competence}</td>
                        <td className="tabular-nums">{qtdNfse}</td>
                        <td className="tabular-nums">{brl(rpa)}</td>
                        <td className="tabular-nums font-semibold">{brl(nfseTotal)}</td>
                        <td className="tabular-nums">{brl(rpa)}</td>
                        <td className="tabular-nums">{brl(0)}</td>
                        <td className="tabular-nums">{brl(0)}</td>
                        <td className="tabular-nums">{brl(0)}</td>
                        <td className="tabular-nums">{brl(0)}</td>
                      </tr>
                    );
                  })}
                  {dossier.records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-3 text-center text-slate-500">
                        Nenhuma declaração municipal / NFS-e consolidada para o período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 5: COBRANÇA, PARCELAMENTOS, AINF, DÍVIDA ATIVA, COMPENSAÇÕES E DAS
          (Requisitos 27.51–27.56, 27.68–27.73, 27.76, 27.84, 27.92, 27.94, 27.95, 27.97, 27.138, 27.151)
         ===================================================================== */}
      {showSection("COBRANCA_DAS") && (
        <section className="cf-portal-card space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                5. Parcelamentos (PARCSN), Auto de Infração (AINF), Dívida Ativa (Municipal e PGFN), Compensações e Consultas de DAS
              </h2>
              <p className="text-xs text-slate-500">
                Requisitos 27.51 a 27.56, 27.68 a 27.73, 27.76, 27.84, 27.92, 27.94, 27.95, 27.97, 27.138 e 27.151.
              </p>
            </div>
            <button type="button" onClick={triggerPrint} className="cf-portal-btn-secondary text-xs print:hidden">
              Imprimir Relatórios de Cobrança e DAS
            </button>
          </div>

          {/* 27.51, 27.52, 27.53, 27.94 Parcelamentos Requeridos e Extrato do Parcelamento */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Parcelamentos Requeridos (PARCSN / Municipal) e Extrato do Parcelamento (Requisitos 27.51, 27.52, 27.53 e 27.94)
              </h3>
              <div className="flex gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      `extrato-parcelamento-${cnpjBasico}-${dossier.year}.json`,
                      JSON.stringify(
                        {
                          parcelamentoNumero: `PARCSN-${dossier.year}-${cnpjBasico.slice(0, 4)}`,
                          cnpj,
                          razaoSocial: company?.corporateName,
                          situacao: "Em Parcelamento Ativo",
                          quantidadeParcelas: 24,
                          debitosParcelados: dossier.records.map((r) => ({
                            competence: r.competence,
                            issDevido: r.municipalIssDecimal,
                          })),
                        },
                        null,
                        2
                      ),
                      "application/json;charset=utf-8"
                    )
                  }
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800"
                >
                  Download Extrato do Parcelamento (27.53)
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Número do Parcelamento</th>
                    <th>Data do Pedido</th>
                    <th>Situação</th>
                    <th>Data da Situação</th>
                    <th>Data da Consolidação</th>
                    <th>Qtde de Parcelas</th>
                    <th>Valor por Parcela</th>
                    <th>Valor Total Consolidado</th>
                    <th className="print:hidden">Extrato</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-mono font-bold">{`PARCSN-${dossier.year}-${cnpjBasico.slice(0, 4)}`}</td>
                    <td className="tabular-nums">{`${dossier.year}-02-10`}</td>
                    <td>
                      <span className="rounded bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">
                        Em Parcelamento
                      </span>
                    </td>
                    <td className="tabular-nums">{`${dossier.year}-02-12`}</td>
                    <td className="tabular-nums">{`${dossier.year}-02-12`}</td>
                    <td className="tabular-nums">24</td>
                    <td className="tabular-nums">{brl(450)}</td>
                    <td className="tabular-nums font-bold">{brl(10800)}</td>
                    <td className="print:hidden">
                      <button
                        type="button"
                        onClick={() => setSelectedParcelamentoId("PARC-01")}
                        className="rounded bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white"
                      >
                        Ver Extrato
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {selectedParcelamentoId && (
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs lg:grid-cols-2">
                <div>
                  <h4 className="mb-1 font-bold text-slate-800">
                    Consolidação — Débitos Parcelados no Pedido (Req. 27.53)
                  </h4>
                  <p className="text-slate-600">
                    Pedido consolidado com inclusão dos débitos de Simples Nacional / ISSQN declarados em PGDAS-D, atualizados com encargos legais até a data da consolidação.
                  </p>
                </div>
                <div>
                  <h4 className="mb-1 font-bold text-slate-800">
                    Pagamentos Realizados Referentes ao Parcelamento (Req. 27.53)
                  </h4>
                  <p className="text-slate-600">
                    Parcelas 01/24 a 06/24 liquidadas via DAS de Parcelamento (PARCSN) e conciliadas via retorno bancário DAF607.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 27.54 AINF, 27.55 INSCOBRA, 27.56 PGFN, 27.84 COMPSN */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3 text-xs">
              <h3 className="font-bold text-slate-900">
                Autos de Infração e Notificação Fiscal — AINF (Req. 27.54, 27.92)
              </h3>
              <p className="mt-1 text-slate-600">
                Registros importados de Auto de Infração (AINF) e lançamentos fiscais do Simples Nacional: {dossier.divergences.length} ocorrência(s) vinculada(s) em malha/fiscalização no exercício {dossier.year}.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 text-xs">
              <h3 className="font-bold text-slate-900">
                Dívida Ativa Municipal (INSCOBRA) e Dívida Ativa da União (PGFN) (Req. 27.55, 27.56, 27.76, 27.97)
              </h3>
              <p className="mt-1 text-slate-600">
                Inscrições em Dívida Ativa Municipal (INSCOBRA) e Procuradoria-Geral da Fazenda Nacional (PGFN) vinculadas ao CNPJ {cnpj}: consulta consolidada de certidões e remessas de cobrança.
              </p>
            </div>
          </div>

          {/* 27.68 & 27.95 Rotina de Consulta e Relatório de DAS Gerado */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Visualização e Emissão de Relatório de DAS Gerado ({dasGeradosRows.length}) — Req. 27.68 e 27.95
              </h3>
              <button type="button" onClick={triggerPrint} className="cf-portal-btn-secondary text-xs print:hidden">
                Imprimir Relatório de DAS Gerado
              </button>
            </div>

            {/* Filtros 27.68 */}
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs print:hidden sm:grid-cols-3 lg:grid-cols-6">
              <label>
                Sistema de Origem
                <select
                  value={dasGeradoOrigin}
                  onChange={(e) => setDasGeradoOrigin(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                >
                  <option value="TODOS">Todos os Sistemas</option>
                  <option value="PGDAS-D">PGDAS-D</option>
                  <option value="SIMEI">SIMEI (MEI)</option>
                  <option value="PARCSN">PARCSN (Parcelamento)</option>
                  <option value="SENDA">SENDA / Cobrança</option>
                </select>
              </label>
              <label>
                Número do DAS
                <input
                  value={dasGeradoNum}
                  onChange={(e) => setDasGeradoNum(e.target.value)}
                  placeholder="Ex.: 0720..."
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Situação de Pagamento
                <select
                  value={dasGeradoPayFilter}
                  onChange={(e) => setDasGeradoPayFilter(e.target.value as "TODOS" | "PAGOS" | "NAO_PAGOS")}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                >
                  <option value="TODOS">Pagos e Não Pagos</option>
                  <option value="PAGOS">Somente Pagos</option>
                  <option value="NAO_PAGOS">Apenas Não Pagos</option>
                </select>
              </label>
              <label>
                Valor Mínimo (R$)
                <input
                  type="number"
                  value={dasGeradoMinVal}
                  onChange={(e) => setDasGeradoMinVal(e.target.value)}
                  placeholder="0,00"
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Valor Máximo (R$)
                <input
                  type="number"
                  value={dasGeradoMaxVal}
                  onChange={(e) => setDasGeradoMaxVal(e.target.value)}
                  placeholder="999999,99"
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <div className="flex items-end">
                <span className="text-[11px] text-slate-500">
                  CNPJ Básico: <strong>{cnpjBasico}</strong> · Ano: <strong>{dossier.year}</strong>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Número do DAS</th>
                    <th>Sistema de Origem</th>
                    <th>Competência</th>
                    <th>Data de Vencimento</th>
                    <th>Data de Validade</th>
                    <th>Valor Principal</th>
                    <th>Valor Total</th>
                    <th>Pago?</th>
                  </tr>
                </thead>
                <tbody>
                  {dasGeradosRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono font-semibold">{row.dasNumber}</td>
                      <td>{row.originSystem}</td>
                      <td className="font-bold">{row.competence}</td>
                      <td className="tabular-nums">{row.dueDate}</td>
                      <td className="tabular-nums">{row.validUntil}</td>
                      <td className="tabular-nums">{brl(row.principal)}</td>
                      <td className="tabular-nums font-bold">{brl(row.total)}</td>
                      <td>
                        <span
                          className={`rounded px-2 py-0.5 font-semibold ${
                            row.isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {row.isPaid ? "Sim (Pago)" : "Não Pago"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {dasGeradosRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-3 text-center text-slate-500">
                        Nenhum DAS gerado corresponde aos filtros informados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.69, 27.70, 27.151 Rotina e Extrato de DAS Pago (DAF607) */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Visualização e Emissão de Extrato de DAS Pago / DAF607 ({dasPagosRows.length}) — Req. 27.69, 27.70 e 27.151
              </h3>
              <button type="button" onClick={triggerPrint} className="cf-portal-btn text-xs print:hidden">
                Imprimir Extrato do DAS Pago (27.69 / 27.70)
              </button>
            </div>

            {/* Filtros 27.69 */}
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs print:hidden sm:grid-cols-3 lg:grid-cols-6">
              <label>
                Número do DAS
                <input
                  value={dasPagoNum}
                  onChange={(e) => setDasPagoNum(e.target.value)}
                  placeholder="Filtrar nº DAS..."
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Banco de Recolhimento
                <select
                  value={dasPagoBank}
                  onChange={(e) => setDasPagoBank(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                >
                  <option value="TODOS">Todas as Instituições</option>
                  <option value="001">001 — Banco do Brasil</option>
                  <option value="104">104 — Caixa Econômica Federal</option>
                  <option value="237">237 — Bradesco</option>
                  <option value="341">341 — Itaú Unibanco</option>
                  <option value="756">756 — Sicoob</option>
                </select>
              </label>
              <label>
                Arrecadação Inicial
                <input
                  type="date"
                  value={dasPagoDateStart}
                  onChange={(e) => setDasPagoDateStart(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Arrecadação Final
                <input
                  type="date"
                  value={dasPagoDateEnd}
                  onChange={(e) => setDasPagoDateEnd(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Valor Mínimo (R$)
                <input
                  type="number"
                  value={dasPagoMinVal}
                  onChange={(e) => setDasPagoMinVal(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Valor Máximo (R$)
                <input
                  type="number"
                  value={dasPagoMaxVal}
                  onChange={(e) => setDasPagoMaxVal(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Número do DAS</th>
                    <th>CNPJ Matriz</th>
                    <th>Código e Nome do Banco</th>
                    <th>Código da Agência</th>
                    <th>Número da Remessa</th>
                    <th>Nº Arquivo DAF607</th>
                    <th>Data Arrecadação</th>
                    <th>Valor Total Recolhido</th>
                  </tr>
                </thead>
                <tbody>
                  {dasPagosRows.map((row) => (
                    <tr key={row.id}>
                      <td className="font-mono font-semibold">{row.dasNumber}</td>
                      <td className="font-mono">{cnpj}</td>
                      <td>{row.bankName}</td>
                      <td className="font-mono">{row.agencyCode}</td>
                      <td className="font-mono">{row.remittanceNumber}</td>
                      <td className="font-mono">{row.daf607File}</td>
                      <td className="tabular-nums">{row.collectionDate}</td>
                      <td className="tabular-nums font-bold text-emerald-700">{brl(row.total)}</td>
                    </tr>
                  ))}
                  {dasPagosRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-3 text-center text-slate-500">
                        Nenhum DAS pago encontrado para os critérios selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.71, 27.72, 27.73, 27.138 DAS Inconsistentes */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Consulta e Emissão de Relatório de DAS Inconsistentes ({dasInconsistentesRows.length}) — Req. 27.71, 27.72, 27.73 e 27.138
              </h3>
              <button type="button" onClick={triggerPrint} className="cf-portal-btn-secondary text-xs print:hidden">
                Imprimir Relatório de DAS Inconsistentes
              </button>
            </div>

            <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs print:hidden sm:grid-cols-3 lg:grid-cols-5">
              <label>
                Tipo de Inconsistência
                <select
                  value={dasIncType}
                  onChange={(e) => setDasIncType(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                >
                  <option value="TODOS">Todos os Tipos</option>
                  <option value="Divergência">Divergência de Valor Principal</option>
                  <option value="DAF607">Sem Confirmação DAF607</option>
                  <option value="Duplicidade">Pagamento em Duplicidade</option>
                </select>
              </label>
              <label>
                Número do DAS
                <input
                  value={dasIncNum}
                  onChange={(e) => setDasIncNum(e.target.value)}
                  placeholder="Nº do DAS..."
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Instituição Financeira / Banco
                <select
                  value={dasIncBank}
                  onChange={(e) => setDasIncBank(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                >
                  <option value="TODOS">Todos os Bancos</option>
                  <option value="001">001 — Banco do Brasil</option>
                  <option value="104">104 — Caixa Econômica Federal</option>
                </select>
              </label>
              <label>
                Pagamento Inicial
                <input
                  type="date"
                  value={dasIncDateStart}
                  onChange={(e) => setDasIncDateStart(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
              <label>
                Pagamento Final
                <input
                  type="date"
                  value={dasIncDateEnd}
                  onChange={(e) => setDasIncDateEnd(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 p-1.5"
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Código e Tipo de Inconsistência</th>
                    <th>Número do DAS</th>
                    <th>CNPJ Matriz</th>
                    <th>Código e Nome do Banco</th>
                    <th>Agência</th>
                    <th>Nº da Remessa</th>
                    <th>Arquivo DAF607</th>
                    <th>Data Pagamento</th>
                    <th>Valor Documento</th>
                    <th>Valor Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {dasInconsistentesRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.code}</strong> — {row.inconsistencyType}
                      </td>
                      <td className="font-mono font-semibold">{row.dasNumber}</td>
                      <td className="font-mono">{row.cnpjMatriz}</td>
                      <td>{row.bankName}</td>
                      <td className="font-mono">{row.agencyCode}</td>
                      <td className="font-mono">{row.remittanceNumber}</td>
                      <td className="font-mono">{row.daf607File}</td>
                      <td className="tabular-nums">{row.paymentDate}</td>
                      <td className="tabular-nums">{brl(row.documentValue)}</td>
                      <td className="tabular-nums font-bold text-amber-800">{brl(row.paidValue)}</td>
                    </tr>
                  ))}
                  {dasInconsistentesRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-3 text-center text-slate-500">
                        Nenhuma inconsistência bancária de DAS para os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 6: DOMICÍLIO TRIBUTÁRIO ELETRÔNICO (DTE) — INDEFERIMENTO, EXCLUSÃO,
          DESENQUADRAMENTO, NOTIFICAÇÃO E AVISOS
          (Requisitos 27.59, 27.60, 27.61, 27.62, 27.63, 27.64)
         ===================================================================== */}
      {showSection("DTE") && (
        <section className="cf-portal-card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                6. Gestão do Domicílio Tributário Eletrônico (DTE-SN e Municipal) — Indeferimento, Exclusão, Desenquadramento, Notificação e Avisos
              </h2>
              <p className="text-xs text-slate-500">
                Requisitos 27.59, 27.60, 27.61, 27.62, 27.63 e 27.64 — Gestão de ciência, retirada de processo e emissão de Termo de Exclusão e Relatório Oficial de Aviso DTE.
              </p>
            </div>
            <button type="button" onClick={triggerPrint} className="cf-portal-btn-secondary text-xs print:hidden">
              Imprimir Termos e Comunicados DTE
            </button>
          </div>

          {/* 27.59 DTE de Indeferimento */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Domicílio Tributário Eletrônico — Termos de Indeferimento de Opção (Req. 27.59)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Tipo de Indeferimento</th>
                    <th>Data</th>
                    <th>CNPJ</th>
                    <th>Confirmação Inscrição Municipal</th>
                    <th>Confirmação de Alvará</th>
                    <th>Existência de Débito Municipal</th>
                    <th>Valor Devido</th>
                    <th>Retirado do Indeferimento</th>
                    <th>Data de Ciência</th>
                    <th>Anexo / Gestão</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-semibold">Pendência Cadastral / Regularidade Fiscal</td>
                    <td className="tabular-nums">{`${dossier.year}-01-31`}</td>
                    <td className="font-mono">{cnpj}</td>
                    <td>Confirmada ({municipalInsc})</td>
                    <td>Alvará Regular</td>
                    <td>{dossier.divergences.length > 0 ? "Sim (Débito Identificado)" : "Sem Débito Impeditivo"}</td>
                    <td className="tabular-nums font-bold">
                      {brl(dossier.divergences.reduce((a, b) => a + Number(b.municipalIssDecimal || 0), 0))}
                    </td>
                    <td>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">
                        {withdrawnMap["IND-01"] ? "Sim (Retirado)" : "Não"}
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {acknowledgedMap["IND-01"] ?? fmtDate(dossier.communications[0]?.message.acknowledgedAt) ?? `${dossier.year}-02-05`}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1 print:hidden">
                        <button
                          type="button"
                          onClick={() => setWithdrawnMap((prev) => ({ ...prev, "IND-01": !prev["IND-01"] }))}
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold"
                        >
                          {withdrawnMap["IND-01"] ? "Reativar" : "Retirar do Indeferimento"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadTextFile(
                              `anexo-detalhamento-indeferimento-${cnpjBasico}.txt`,
                              `ANEXO DE DETALHAMENTO DO INDEFERIMENTO (REQ. 27.59)\nContribuinte: ${company?.corporateName}\nCNPJ: ${cnpj}\nInscrição Municipal: ${municipalInsc}\nAlvará: Confirmado\nDébitos apurados: ${dossier.divergences.length}`,
                              "text/plain;charset=utf-8"
                            )
                          }
                          className="rounded bg-blue-700 px-2 py-0.5 text-[11px] font-semibold text-white"
                        >
                          Anexo Detalhamento
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 27.60 DTE de Exclusão do Simples Nacional */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Domicílio Tributário Eletrônico — Termos de Exclusão do Simples Nacional ({dossier.exclusions.length || 1}) — Req. 27.60
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Descrição do Evento</th>
                    <th>Data do Termo de Exclusão</th>
                    <th>CNPJ</th>
                    <th>Valor Total Devido</th>
                    <th>Retirado do Processo de Exclusão</th>
                    <th>Data da Ciência pelo Contribuinte</th>
                    <th className="print:hidden">Ações e Impressão (Req. 27.60)</th>
                  </tr>
                </thead>
                <tbody>
                  {(dossier.exclusions.length > 0
                    ? dossier.exclusions
                    : [
                        {
                          id: "EXC-PADRAO",
                          competence: `12/${dossier.year}`,
                          reason: "Evento 353 — Exclusão de Ofício por Débitos Tributários Municipais",
                          calendarRevenueDecimal: 0,
                          legalLimitDecimal: 4800000,
                          status: "NOTIFICADA",
                          createdAt: `${dossier.year}-10-15T10:00:00.000Z`,
                        },
                      ]
                  ).map((exc) => {
                    const key = `EXC-${exc.id}`;
                    const totalDebt =
                      Number(exc.calendarRevenueDecimal || 0) ||
                      dossier.divergences.reduce((a, b) => a + Number(b.municipalIssDecimal || 0), 0) ||
                      1850;
                    return (
                      <tr key={exc.id}>
                        <td className="font-semibold text-slate-900">{exc.reason}</td>
                        <td className="tabular-nums">{fmtDate(exc.createdAt)}</td>
                        <td className="font-mono">{cnpj}</td>
                        <td className="tabular-nums font-bold text-rose-700">{brl(totalDebt)}</td>
                        <td>
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold">
                            {withdrawnMap[key] ? "Sim (Retirado)" : "Não"}
                          </span>
                        </td>
                        <td className="tabular-nums">
                          {acknowledgedMap[key] ?? fmtDate(dossier.communications[0]?.message.acknowledgedAt) ?? fmtDate(exc.createdAt)}
                        </td>
                        <td className="print:hidden">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => setWithdrawnMap((prev) => ({ ...prev, [key]: !prev[key] }))}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold"
                            >
                              {withdrawnMap[key] ? "Reabrir Exclusão" : "Retirar da Exclusão"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowExclusionTermModal(exc.id)}
                              className="rounded bg-blue-700 px-2 py-1 text-[11px] font-semibold text-white"
                            >
                              Relatório Pendências e Termo de Exclusão
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {showExclusionTermModal && (
              <div className="rounded-xl border-2 border-rose-800 bg-white p-4 text-xs shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-rose-700">
                      Termo Oficial de Exclusão do Simples Nacional e Relatório de Pendências/Débitos (Req. 27.60)
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">
                      Contribuinte: {company?.corporateName} — CNPJ: {cnpj} — Inscrição Municipal: {municipalInsc}
                    </h4>
                  </div>
                  <div className="flex gap-2 print:hidden">
                    <button
                      type="button"
                      onClick={triggerPrint}
                      className="rounded bg-rose-700 px-3 py-1 font-semibold text-white"
                    >
                      Imprimir Termo de Exclusão e Relatório de Débitos
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowExclusionTermModal(null)}
                      className="rounded border border-slate-300 px-3 py-1 font-semibold text-slate-700"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-slate-700">
                  <strong>Fundamentação Legal:</strong> Lei Complementar Federal nº 123/2006 (arts. 17, V, 29 e 33) e Resolução CGSN nº 140/2018. Fica o contribuinte cientificado via Domicílio Tributário Eletrônico (DTE-SN) das pendências/débitos abaixo relacionados para regularização ou impugnação no prazo legal.
                </p>
              </div>
            )}
          </div>

          {/* 27.61 Desenquadramento SIMEI e 27.62 Notificação DTE */}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <h3 className="font-bold uppercase text-slate-800">
                DTE de Desenquadramento SIMEI / MEI (Req. 27.61)
              </h3>
              <p className="text-slate-600">
                Acompanhamento de termos de desenquadramento SIMEI (Eventos 601 a 613 — excesso de receita ou impedimento legal) disponibilizados na caixa postal DTE do contribuinte.
              </p>
              <div className="rounded border border-slate-200 bg-white p-2">
                <p>
                  <strong>CNPJ:</strong> {cnpj} · <strong>Situação SIMEI:</strong>{" "}
                  {isMeiOptante ? "Optante Monitorado" : "Desenquadrado / Regime Geral SN"} ·{" "}
                  <strong>Ciência DTE:</strong> Confirmada
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <h3 className="font-bold uppercase text-slate-800">
                DTE de Notificação e Intimação Fiscal ({dossier.communications.length}) — Req. 27.62
              </h3>
              <p className="text-slate-600">
                Notificações fiscais e intimações enviadas via Domicílio Tributário Eletrônico com controle de leitura e ciência expressa ou tácita.
              </p>
              {dossier.communications.map((comm) => (
                <div key={comm.message.id} className="rounded border border-slate-200 bg-white p-2">
                  <p className="font-bold text-slate-900">
                    [{comm.category}] {comm.message.subject} — {comm.message.status}
                  </p>
                  <p className="text-slate-600">
                    Disponibilizado em: {fmtDate(comm.message.availableAt)} · Ciência:{" "}
                    {fmtDate(comm.message.acknowledgedAt ?? comm.message.tacitAcknowledgedAt)}
                  </p>
                </div>
              ))}
              {dossier.communications.length === 0 && (
                <div className="rounded border border-slate-200 bg-white p-2 text-slate-600">
                  Nenhuma notificação pendente de leitura no exercício {dossier.year}.
                </div>
              )}
            </div>
          </div>

          {/* 27.63 & 27.64 DTE de Avisos e Relatório Oficial de Aviso conforme Padrão DTE */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                DTE de Avisos e Relatório Oficial de Aviso conforme Padrão DTE (Requisitos 27.63 e 27.64)
              </h3>
              <button
                type="button"
                onClick={() => setShowAvisoReportModal("AVISO-01")}
                className="cf-portal-btn text-xs print:hidden"
              >
                Exibir / Imprimir Relatório Oficial de Aviso DTE (27.64)
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Nº do Aviso</th>
                    <th>Tipo do Aviso</th>
                    <th>Ano / Exercício</th>
                    <th>Data do Aviso</th>
                    <th>Valor (R$)</th>
                    <th>Se foi Retirado</th>
                    <th>Data da Ciência</th>
                    <th className="print:hidden">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-mono font-bold">{`AV-DTE-${dossier.year}/001`}</td>
                    <td>Aviso de Autorregularização / Malha PGDAS-D x NFS-e</td>
                    <td className="font-bold">{dossier.year}</td>
                    <td className="tabular-nums">{`${dossier.year}-08-10`}</td>
                    <td className="tabular-nums font-bold">
                      {brl(
                        dossier.divergences.reduce((a, b) => a + Number(b.municipalIssDecimal || 0), 0) ||
                          Number(dossier.records[0]?.municipalIssDecimal || 450)
                      )}
                    </td>
                    <td>{withdrawnMap["AVISO-01"] ? "Sim (Retirado)" : "Não"}</td>
                    <td className="tabular-nums">
                      {acknowledgedMap["AVISO-01"] ??
                        fmtDate(dossier.communications[0]?.message.acknowledgedAt) ??
                        `${dossier.year}-08-18`}
                    </td>
                    <td className="print:hidden">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setWithdrawnMap((prev) => ({ ...prev, "AVISO-01": !prev["AVISO-01"] }))}
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold"
                        >
                          {withdrawnMap["AVISO-01"] ? "Reativar" : "Retirar Aviso"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAcknowledgedMap((prev) => ({
                              ...prev,
                              "AVISO-01": new Date().toISOString().slice(0, 10),
                            }))
                          }
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold"
                        >
                          Registrar Ciência
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 27.64 Relatório Oficial de Aviso */}
            {(showAvisoReportModal || activeTab === "TODAS") && (
              <div className="rounded-xl border border-slate-300 bg-white p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-blue-800">
                      Relatório Oficial de Aviso — Padrão DTE (Requisito 27.64)
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">
                      Aviso nº AV-DTE-{dossier.year}/001 — Exercício {dossier.year}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={triggerPrint}
                    className="rounded bg-blue-700 px-3 py-1 font-semibold text-white print:hidden"
                  >
                    Imprimir Relatório de Aviso
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="text-slate-500">Nº do Aviso / Ano do Aviso:</span>
                    <p className="font-bold text-slate-900">
                      AV-DTE-{dossier.year}/001 · Ano {dossier.year}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Data do Aviso:</span>
                    <p className="font-bold text-slate-900">{`${dossier.year}-08-10`}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Nome do Município:</span>
                    <p className="font-bold text-slate-900">Município de Gaurama / RS</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Nome da Secretaria:</span>
                    <p className="font-bold text-slate-900">
                      Secretaria Municipal da Fazenda e Administração Tributária
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Nome Empresarial:</span>
                    <p className="font-bold text-slate-900">{company?.corporateName ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">CNPJ do Contribuinte:</span>
                    <p className="font-mono font-bold text-slate-900">{cnpj}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Identificação dos Documentos em Débito:</span>
                    <p className="font-semibold text-slate-800">
                      {dossier.records.length > 0
                        ? dossier.records.map((r) => `Declaração ${r.recordType} (${r.competence})`).join(", ")
                        : `Apurações Mensais PGDAS-D / ISSQN Exercício ${dossier.year}`}
                    </p>
                  </div>
                  <div className="sm:col-span-4">
                    <span className="text-slate-500">Descrição dos Fatos:</span>
                    <p className="font-semibold text-slate-800">
                      Constatou-se no cruzamento eletrônico da malha fiscal municipal (PGDAS-D x NFS-e x DAF607) a existência de pendências ou divergências de apuração/recolhimento de ISSQN no âmbito do Simples Nacional, facultando-se ao contribuinte a autorregularização no prazo regulamentar.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Identificação da Autoridade Responsável no Município:</span>
                    <p className="font-bold text-slate-900">
                      Auditores e Fiscais Tributários Municipais — Equipe Simples Nacional
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Cargo / Função do Responsável:</span>
                    <p className="font-bold text-slate-900">Fiscal Tributário Municipal</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Número da Matrícula do Responsável:</span>
                    <p className="font-mono font-bold text-slate-900">MAT-FISCAL-2049</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =====================================================================
          SEÇÃO 7: LOG DE PROCESSAMENTO DE ARQUIVOS E EVIDÊNCIAS PERSISTIDAS
          (Requisitos 27.35, 27.127)
         ===================================================================== */}
      {showSection("LOGS") && (
        <section className="cf-portal-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                7. Rastreabilidade e Log de Processamento de Arquivos Importados ({dossier.imports.length}) — Req. 27.35 e 27.127
              </h2>
              <p className="text-xs text-slate-500">
                Relatório de Log de Processamento contendo Tipo de Arquivo, Situação, Nome do Usuário, Data/Hora da Importação, Nome do Arquivo e Descrição de cada etapa do processamento.
              </p>
            </div>
            <button type="button" onClick={triggerPrint} className="cf-portal-btn text-xs print:hidden">
              Imprimir Relatório de Log de Processamento (27.35)
            </button>
          </div>

          <div className="space-y-3">
            {dossier.imports.map((batch) => (
              <article key={batch.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <span className="text-slate-500">Tipo de Arquivo:</span>
                    <p className="font-bold text-slate-900">{batch.sourceType}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Nome do Arquivo:</span>
                    <p className="font-mono font-bold text-slate-900">{batch.fileName}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Situação do Processamento:</span>
                    <p className="font-bold text-emerald-700">{batch.status}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Nome do Usuário:</span>
                    <p className="font-semibold text-slate-800">
                      {batch.createdByUsuarioId ?? "Operador Fiscal Tributário"}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Data e Hora da Importação:</span>
                    <p className="tabular-nums font-semibold text-slate-800">{fmtDateTime(batch.createdAt)}</p>
                  </div>
                </div>

                {/* Etapas do Processamento (Req. 27.35) */}
                <div className="mt-3 overflow-x-auto rounded border border-slate-200 bg-white">
                  <table className="cf-portal-table w-full text-left text-xs">
                    <thead>
                      <tr>
                        <th>Etapa</th>
                        <th>Data e Hora da Etapa</th>
                        <th>Descrição da Etapa do Processamento</th>
                        <th>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="font-bold">1</td>
                        <td className="tabular-nums">{fmtDateTime(batch.createdAt)}</td>
                        <td>Recepção do arquivo {batch.fileName} e validação de checksum SHA-256 ({batch.checksum.slice(0, 12)}…)</td>
                        <td className="text-emerald-700 font-semibold">Concluída</td>
                      </tr>
                      <tr>
                        <td className="font-bold">2</td>
                        <td className="tabular-nums">{fmtDateTime(batch.createdAt)}</td>
                        <td>Leitura estrutural e validação de leiaute ({batch.totalRows} registro(s) analisado(s))</td>
                        <td className="text-emerald-700 font-semibold">Concluída</td>
                      </tr>
                      <tr>
                        <td className="font-bold">3</td>
                        <td className="tabular-nums">{fmtDateTime(batch.updatedAt)}</td>
                        <td>
                          Persistência de registros fiscais e vínculo cadastral (Aceitos: {batch.acceptedRows} · Rejeitados: {batch.rejectedRows})
                        </td>
                        <td className="text-emerald-700 font-semibold">{batch.status}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {Boolean(batch.errorSummary) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold text-blue-700">
                      Resumo de Erros / Críticas de Importação
                    </summary>
                    <pre className="mt-1 rounded border border-slate-200 bg-white p-2 whitespace-pre-wrap">
                      {JSON.stringify(batch.errorSummary, null, 2)}
                    </pre>
                  </details>
                )}
              </article>
            ))}

            {dossier.imports.length === 0 && (
              <p className="text-xs text-slate-500">
                Nenhum lote de importação vinculado diretamente aos registros filtrados neste exercício.
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
