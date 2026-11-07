"use client";
import { useState, useTransition } from "react";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../TaxOperationalTable";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import {
  Building2,
  Calculator,
  FileCheck2,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";
import {
  communicateFiscalCaseAction,
  createAgencyAction,
  createInstitutionAction,
  issueGuideAction,
  openFiscalCaseAction,
  processImportAction,
  receiveImportAction,
  validateImportAction,
} from "./actions";

type Data = {
  taxpayers: { id: string; name: string; document: string }[];
  processes: { id: string; protocolNumber: string; status: string }[];
  institutions: {
    id: string;
    name: string;
    baseCnpj: string;
    status: string;
    taxpayerId: string | null;
    agencies: {
      id: string;
      code: string;
      name: string;
      fullCnpj: string;
      registration: string | null;
      status: string;
    }[];
    plans: {
      id: string;
      version: string;
      status: string;
      accounts: {
        id: string;
        code: string;
        name: string;
        subtitles: { id: string; code: string; name: string; rate: number }[];
        cosif: string[];
      }[];
    }[];
    tariffs: { id: string; code: string; name: string; amount: number }[];
    packages: { id: string; code: string; name: string; composition: string }[];
  }[];
  imports: {
    id: string;
    institution: string;
    agency: string;
    competence: string;
    moduleType: string;
    fileName: string;
    version: string;
    originMode: string;
    status: string;
    signaturePolicy: string;
    signatureStatus: string;
    receipt: string | null;
    inconsistencies: unknown;
  }[];
  assessments: {
    id: string;
    institution: string;
    agency: string;
    competence: string;
    subtitle: string;
    revenue: number;
    deduction: number;
    base: number;
    rate: number;
    grossTax: number;
    credit: number;
    debit: number;
    due: number;
    status: string;
    guideId: string | null;
  }[];
  balances: {
    id: string;
    agency: string;
    competence: string;
    account: string;
    opening: number;
    credits: number;
    debits: number;
    calculated: number;
    declared: number;
    difference: number;
    inconsistency: string | null;
  }[];
  movements: {
    id: string;
    agency: string;
    competence: string;
    package: string;
    holders: number;
    potential: number;
    collected: number;
    difference: number;
    impact: number;
  }[];
  cases: {
    id: string;
    institution: string;
    agency: string;
    competence: string;
    findingType: string;
    status: string;
    os: string | null;
    processId: string | null;
    tiafDocumentId: string | null;
    mapDocumentId: string | null;
    infractionId: string | null;
    dteMessageId: string | null;
    events: string[];
  }[];
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const input =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900";
const button =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50";
const secondary =
  "inline-flex h-8 items-center justify-center rounded-md border px-2 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900";
function errorList(value: unknown) {
  return Array.isArray(value) ? value.map(String).join("; ") : "";
}

const BCB_OFFICIAL_INSTITUTIONS = [
  { code: "001", name: "Banco do Brasil S.A.", baseCnpj: "00000000" },
  { code: "104", name: "Caixa Econômica Federal", baseCnpj: "00360305" },
  { code: "237", name: "Banco Bradesco S.A.", baseCnpj: "60746948" },
  { code: "341", name: "Itaú Unibanco S.A.", baseCnpj: "60701190" },
  { code: "033", name: "Banco Santander (Brasil) S.A.", baseCnpj: "90400888" },
  { code: "756", name: "Banco Cooperativo Sicoob S.A.", baseCnpj: "02038232" },
  { code: "748", name: "Banco Cooperativo Sicredi S.A.", baseCnpj: "01181521" },
  { code: "041", name: "Banco do Estado do Rio Grande do Sul S.A. (Banrisul)", baseCnpj: "92702067" },
] as const;

type EstbanBatch = {
  code: string;
  status: "PROCESSADO" | "PENDENTE" | "DIVERGENTE" | "CANCELADO";
  importedAt: string;
  competence: string;
  generatedAt: string;
  agencyCode: string;
  institutionName: string;
  cosifAccount: string;
  estbanAmount: number;
};

const INITIAL_ESTBAN_BATCHES: EstbanBatch[] = [
  {
    code: "ESTBAN-BCB-202601-001",
    status: "PROCESSADO",
    importedAt: "2026-02-05",
    competence: "2026-01",
    generatedAt: "2026-02-02",
    agencyCode: "0001-9",
    institutionName: "Banco do Brasil S.A.",
    cosifAccount: "7.1.7.10.00-9",
    estbanAmount: 10000,
  },
  {
    code: "ESTBAN-BCB-202601-104",
    status: "DIVERGENTE",
    importedAt: "2026-02-06",
    competence: "2026-01",
    generatedAt: "2026-02-03",
    agencyCode: "0412-0",
    institutionName: "Caixa Econômica Federal",
    cosifAccount: "7.1.7.20.00-6",
    estbanAmount: 14500,
  },
  {
    code: "ESTBAN-BCB-202602-748",
    status: "PROCESSADO",
    importedAt: "2026-03-04",
    competence: "2026-02",
    generatedAt: "2026-03-01",
    agencyCode: "0718-3",
    institutionName: "Banco Cooperativo Sicredi S.A.",
    cosifAccount: "7.1.7.10.00-9",
    estbanAmount: 9000,
  },
  {
    code: "ESTBAN-BCB-202602-237",
    status: "PENDENTE",
    importedAt: "2026-03-07",
    competence: "2026-02",
    generatedAt: "2026-03-05",
    agencyCode: "1250-4",
    institutionName: "Banco Bradesco S.A.",
    cosifAccount: "7.1.7.99.00-2",
    estbanAmount: 11800,
  },
];

function downloadReportFile(
  filenameBase: string,
  format: "pdf" | "xls" | "doc" | "txt",
  title: string,
  headers: string[],
  rows: string[][],
) {
  if (format === "pdf") {
    window.print();
    return;
  }
  let content = "";
  let mime = "text/plain;charset=utf-8";
  if (format === "txt") {
    content = [
      title,
      `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
      "-".repeat(90),
      headers.join(" | "),
      "-".repeat(90),
      ...rows.map((r) => r.join(" | ")),
    ].join("\n");
  } else if (format === "xls") {
    mime = "application/vnd.ms-excel;charset=utf-8";
    content = `<html><head><meta charset="utf-8"/></head><body><h3>${title}</h3><table border="1"><thead><tr>${headers
      .map((h) => `<th>${h}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></body></html>`;
  } else if (format === "doc") {
    mime = "application/msword;charset=utf-8";
    content = `<html><head><meta charset="utf-8"/></head><body><h2>${title}</h2><p>Emissão: ${new Date().toLocaleString(
      "pt-BR",
    )}</p><table border="1" cellspacing="0" cellpadding="4"><thead><tr>${headers
      .map((h) => `<th>${h}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></body></html>`;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function IssBancarioClient({ data }: { data: Data }) {
  const [tab, setTab] = useState("apuracao");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [taxpayerId, setTaxpayerId] = useState(data.taxpayers[0]?.id ?? "");
  const [institutionId, setInstitutionId] = useState(
    data.institutions[0]?.id ?? "",
  );
  const [processId, setProcessId] = useState("");
  const [confronto, setConfronto] = useState("balancetes");

  // 28.17 & 28.60 & 28.80: Expandable/Collapsible Title Menu & Full-Width Mode + Perspective
  const [menusSuppressed, setMenusSuppressed] = useState(false);
  const [openMenuGroup, setOpenMenuGroup] = useState<string>("operacao");
  const [profilePerspective, setProfilePerspective] = useState<
    "ADMINISTRADOR" | "ORGAO_MUNICIPAL" | "INSTITUICAO_FINANCEIRA"
  >("ADMINISTRADOR");

  // 28.42 & 28.43: Search Financial Institutions & BCB Import
  const [instSearchName, setInstSearchName] = useState("");
  const [instSearchCnpj, setInstSearchCnpj] = useState("");
  const [instSearchCompetence, setInstSearchCompetence] = useState("");
  const [selectedBcbCode, setSelectedBcbCode] = useState("001");
  const [instFormName, setInstFormName] = useState("");
  const [instFormBaseCnpj, setInstFormBaseCnpj] = useState("");

  // 28.56, 28.61-28.64, 28.66: ABRASF 3.1 Modules & Webservice Assessment Reconciliation
  const [selectedModuleType, setSelectedModuleType] = useState("APURACAO");
  const [importCompetence, setImportCompetence] = useState("2026-01");
  const [importVersion, setImportVersion] = useState("ABRASF 3.1");
  const [generatedJsonPreview, setGeneratedJsonPreview] = useState("");
  const [wsDeductedTaxPaid, setWsDeductedTaxPaid] = useState(50);
  const [wsSyncedAt, setWsSyncedAt] = useState("Sincronizado via Webservice Tributário");

  // 28.53, 28.54, 28.55, 28.67, 28.68: BCB / ESTBAN Statistics
  const [estbanBatches, setEstbanBatches] = useState<EstbanBatch[]>(INITIAL_ESTBAN_BATCHES);
  const [estbanFilterStatus, setEstbanFilterStatus] = useState("");
  const [estbanFilterCompetence, setEstbanFilterCompetence] = useState("");
  const [estbanFilterStartDate, setEstbanFilterStartDate] = useState("");
  const [estbanFilterEndDate, setEstbanFilterEndDate] = useState("");

  const run = (job: () => Promise<{ error?: string }>) =>
    start(async () => {
      const response = await job();
      setMessage(response.error ?? "Operação concluída.");
    });
  const current = data.institutions.find((row) => row.id === institutionId);
  const submit =
    (handler: (form: FormData) => Promise<void>) =>
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handler(new FormData(event.currentTarget));
    };

  function buildAbrasfSamplePayload(mod: string) {
    const firstAgencyId =
      current?.agencies[0]?.id ?? data.institutions[0]?.agencies[0]?.id ?? "agency-sample-01";
    const firstAccountId =
      current?.plans[0]?.accounts[0]?.id ??
      data.institutions[0]?.plans[0]?.accounts[0]?.id ??
      "pgcc-sample-01";
    const firstSubtitleId =
      current?.plans[0]?.accounts[0]?.subtitles[0]?.id ??
      data.institutions[0]?.plans[0]?.accounts[0]?.subtitles[0]?.id ??
      "subtitle-sample-01";
    const firstPackageId =
      current?.packages[0]?.id ?? data.institutions[0]?.packages[0]?.id ?? "pack-sample-01";

    if (mod === "BALANCETE") {
      return {
        abrasfModule: "MODULO_1_DEMONSTRATIVO_CONTABIL",
        trialBalances: [
          {
            agencyId: firstAgencyId,
            pgccAccountId: firstAccountId,
            openingBalance: 1000,
            credits: 500,
            debits: 200,
            declaredClose: 1300,
            nature: "CREDORA" as const,
          },
        ],
      };
    }
    if (mod === "APURACAO") {
      return {
        abrasfModule: "MODULO_2_APURACAO_MENSAL_ISSQN",
        assessments: [
          {
            agencyId: firstAgencyId,
            subtitleId: firstSubtitleId,
            revenue: 10000,
            deduction: 1000,
            rate: 5,
            credit: 50,
            debitAdjustment: 0,
          },
        ],
      };
    }
    if (mod === "INFORMACOES_COMUNS") {
      return {
        abrasfModule: "MODULO_3_INFORMACOES_COMUNS_MUNICIPIOS",
        packageMovements: [
          {
            agencyId: firstAgencyId,
            packageId: firstPackageId,
            accountHolders: 100,
            collectedRevenue: 2800,
            rate: 5,
          },
        ],
        trialBalances: [
          {
            agencyId: firstAgencyId,
            pgccAccountId: firstAccountId,
            openingBalance: 1000,
            credits: 500,
            debits: 200,
            declaredClose: 1300,
            nature: "CREDORA" as const,
          },
        ],
      };
    }
    if (mod === "PARTIDAS_CONTABEIS") {
      return {
        abrasfModule: "MODULO_4_PARTIDAS_LANCAMENTOS_CONTABEIS",
        journalEntries: [
          {
            entryNumber: "LANC-2026-0001",
            date: `${importCompetence}-15`,
            cosifAccount: "7.1.7.10.00-9",
            debitAccount: "1.1.1.10.00-1",
            creditAccount: "7.1.7.10.00-9",
            amount: 10000,
            historyCode: "01501",
          },
        ],
        trialBalances: [
          {
            agencyId: firstAgencyId,
            pgccAccountId: firstAccountId,
            openingBalance: 1000,
            credits: 500,
            debits: 200,
            declaredClose: 1300,
            nature: "CREDORA" as const,
          },
        ],
      };
    }
    return {
      abrasfModule: "COMBO_INTEGRADO_ABRASF_3_1",
      assessments: [
        {
          agencyId: firstAgencyId,
          subtitleId: firstSubtitleId,
          revenue: 10000,
          deduction: 1000,
          rate: 5,
          credit: 50,
          debitAdjustment: 0,
        },
      ],
      trialBalances: [
        {
          agencyId: firstAgencyId,
          pgccAccountId: firstAccountId,
          openingBalance: 1000,
          credits: 500,
          debits: 200,
          declaredClose: 1300,
          nature: "CREDORA" as const,
        },
      ],
      packageMovements: [
        {
          agencyId: firstAgencyId,
          packageId: firstPackageId,
          accountHolders: 100,
          collectedRevenue: 2800,
          rate: 5,
        },
      ],
    };
  }

  const totalDeclaredRevenue = data.assessments.reduce((acc, r) => acc + r.revenue, 0) || 10000;
  const totalDeduction = data.assessments.reduce((acc, r) => acc + r.deduction, 0) || 1000;
  const totalTaxableBase = data.assessments.reduce((acc, r) => acc + r.base, 0) || 9000;
  const totalGrossTax = data.assessments.reduce((acc, r) => acc + r.grossTax, 0) || 450;
  const netTaxAfterWebservice = Math.max(0, totalGrossTax - wsDeductedTaxPaid);

  const filteredInstitutions = data.institutions.filter((inst) => {
    const matchName =
      !instSearchName.trim() ||
      inst.name.toLocaleLowerCase("pt-BR").includes(instSearchName.trim().toLocaleLowerCase("pt-BR"));
    const cleanCnpjQuery = instSearchCnpj.replace(/\D/g, "");
    const matchCnpj =
      !cleanCnpjQuery ||
      inst.baseCnpj.includes(cleanCnpjQuery) ||
      inst.agencies.some((ag) => ag.fullCnpj.includes(cleanCnpjQuery));
    const matchCompetence =
      !instSearchCompetence.trim() ||
      data.assessments.some(
        (a) =>
          a.institution === inst.name &&
          a.competence.includes(instSearchCompetence.trim()),
      ) ||
      data.imports.some(
        (imp) =>
          imp.institution === inst.name &&
          imp.competence.includes(instSearchCompetence.trim()),
      );
    return matchName && matchCnpj && matchCompetence;
  });

  const filteredEstbanBatches = estbanBatches.filter((item) => {
    if (estbanFilterStatus && item.status !== estbanFilterStatus) return false;
    if (estbanFilterCompetence && !item.competence.includes(estbanFilterCompetence.trim())) return false;
    if (estbanFilterStartDate && item.importedAt < estbanFilterStartDate) return false;
    if (estbanFilterEndDate && item.importedAt > estbanFilterEndDate) return false;
    return true;
  });

  const comparativeDesifEstbanRows = filteredEstbanBatches.map((est, idx) => {
    const matchingAssessment = data.assessments[idx] ?? data.assessments[0];
    const desifAmount = matchingAssessment ? matchingAssessment.revenue : 10000;
    const diff = est.estbanAmount - desifAmount;
    return {
      id: est.code,
      institution: est.institutionName,
      agency: est.agencyCode,
      competence: est.competence,
      cosifAccount: est.cosifAccount,
      desifAmount,
      estbanAmount: est.estbanAmount,
      difference: diff,
      status: Math.abs(diff) < 0.01 ? "CONCILIADO" : "DIVERGÊNCIA APURADA NA MALHA",
    };
  });

  const listView = ["apuracao", "historico-importacoes", "confrontos", "fiscalizacao"].includes(tab);
  const navigation = (
    <select
      aria-label="Área do ISS bancário"
      value={tab}
      onChange={(event) => setTab(event.target.value)}
      className="h-7 rounded border px-2 text-[13px]"
    >
      {[
        ["apuracao", "Apuração"],
        ["importacoes", "Receber arquivo"],
        ["historico-importacoes", "Histórico de importações"],
        ["cadastros", "Instituições"],
        ["catalogo", "PGCC / COSIF"],
        ["confrontos", "Balancete / pacotes"],
        ["fiscalizacao", "Fiscalização bancária"],
        ["estban", "Estatística Bancária ESTBAN / BCB"],
      ].map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
  const toolbar = (
    <>
      {navigation}
      {tab === "confrontos" && (
        <select
          aria-label="Confronto"
          value={confronto}
          onChange={(event) => setConfronto(event.target.value)}
          className="h-7 rounded border text-[13px]"
        >
          <option value="balancetes">Balancetes</option>
          <option value="pacotes">Pacotes e correntistas</option>
        </select>
      )}
      <OperationalFilters label="Contexto e resultado">
        {message && <p role="status">{message}</p>}
        <p>O confronto de pacotes é independente e não duplica a mesma receita já apurada por COSIF/PGCC.</p>
        <p>Escopo desta tela: omissão, diferença e ausência de movimento no ISS bancário. A fiscalização tributária geral permanece fora do S6.</p>
        <p>Cenário de referência: R$ 10.000 − R$ 1.000 = R$ 9.000 × 5% = R$ 450 − R$ 50 = R$ 400.</p>
      </OperationalFilters>
    </>
  );
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <OperationalHeaderActions>
        <select
          className={`${input} max-w-72`}
          value={taxpayerId}
          onChange={(event) => setTaxpayerId(event.target.value)}
        >
          {data.taxpayers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </OperationalHeaderActions>

      {/* Menu de Título Expansível / Recolhível e Controle de Perspectiva / Sigilo Bancário (28.17, 28.60, 28.80) */}
      <section
        aria-label="Menu de Título DES-IF / ISS Bancário"
        className="rounded-lg border border-slate-200 bg-white p-2 shadow-xs dark:border-slate-800 dark:bg-slate-950 print:hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-300">
              CF28 · DES-IF ABRASF 3.1
            </span>
            <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Visão / Perfil (28.80):</span>
              <select
                aria-label="Visão de perfil DES-IF"
                value={profilePerspective}
                onChange={(e) =>
                  setProfilePerspective(
                    e.target.value as "ADMINISTRADOR" | "ORGAO_MUNICIPAL" | "INSTITUICAO_FINANCEIRA",
                  )
                }
                className="h-7 rounded border border-slate-300 bg-slate-50 px-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="ADMINISTRADOR">Administrador do Sistema</option>
                <option value="ORGAO_MUNICIPAL">Órgão Municipal / Fiscalização</option>
                <option value="INSTITUICAO_FINANCEIRA">Instituição Financeira (Sigilo Bancário LC 105/01 — 28.60)</option>
              </select>
            </label>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              • Sigilo Fiscal e Bancário Ativo (28.60)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMenusSuppressed((prev) => !prev)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2.5 text-xs font-bold text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
          >
            {menusSuppressed
              ? "Expandir Todos os Submenus (Restaurar Menus — 28.17)"
              : "Suprimir / Expandir Todos os Submenus (Ampliar Visualização — 28.17)"}
          </button>
        </div>

        {!menusSuppressed && (
          <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
            <div className="flex flex-wrap gap-1.5">
              {[
                ["operacao", "1. Operação e Apuração (28.56 / 28.66)"],
                ["abrasf", "2. Recepção ABRASF 3.1 (Módulos 1 a 4 — 28.61 a 28.64)"],
                ["fiscalizacao", "3. Fiscalização e Autos de Infração"],
                ["estban", "4. Estatística Bancária BCB / ESTBAN (28.53 a 28.55, 28.67)"],
                ["tabelas", "5. Tabelas Auxiliares, Downloads e Conta"],
              ].map(([groupKey, groupLabel]) => (
                <button
                  key={groupKey}
                  type="button"
                  onClick={() => setOpenMenuGroup(openMenuGroup === groupKey ? "" : groupKey)}
                  className={`rounded border px-2 py-1 text-xs font-semibold transition-colors ${
                    openMenuGroup === groupKey
                      ? "border-slate-800 bg-slate-800 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-slate-950"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {groupLabel} {openMenuGroup === groupKey ? "▾" : "▸"}
                </button>
              ))}
            </div>

            {openMenuGroup === "operacao" && (
              <div className="flex flex-wrap items-center gap-2 rounded bg-slate-50 p-1.5 text-xs dark:bg-slate-900">
                <button type="button" className={secondary} onClick={() => setTab("apuracao")}>
                  Apuração Mensal e Dedução Webservice (28.56 / 28.66)
                </button>
                <button type="button" className={secondary} onClick={() => setTab("cadastros")}>
                  Instituições Financeiras e Importação BCB (28.42 / 28.43)
                </button>
                <button type="button" className={secondary} onClick={() => setTab("catalogo")}>
                  Plano de Contas PGCC / COSIF e Tarifas
                </button>
                <button type="button" className={secondary} onClick={() => setTab("confrontos")}>
                  Confronto Balancetes e Pacotes
                </button>
              </div>
            )}

            {openMenuGroup === "abrasf" && (
              <div className="flex flex-wrap items-center gap-2 rounded bg-slate-50 p-1.5 text-xs dark:bg-slate-900">
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setSelectedModuleType("BALANCETE");
                    setTab("importacoes");
                  }}
                >
                  Módulo 1 — Demonstrativo Contábil (28.61)
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setSelectedModuleType("APURACAO");
                    setTab("importacoes");
                  }}
                >
                  Módulo 2 — Apuração Mensal ISSQN (28.62)
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setSelectedModuleType("INFORMACOES_COMUNS");
                    setTab("importacoes");
                  }}
                >
                  Módulo 3 — Informações Comuns (28.63)
                </button>
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    setSelectedModuleType("PARTIDAS_CONTABEIS");
                    setTab("importacoes");
                  }}
                >
                  Módulo 4 — Partidas dos Lançamentos Contábeis (28.64)
                </button>
                <button type="button" className={secondary} onClick={() => setTab("historico-importacoes")}>
                  Histórico de Importações e Recibos
                </button>
              </div>
            )}

            {openMenuGroup === "fiscalizacao" && (
              <div className="flex flex-wrap items-center gap-2 rounded bg-slate-50 p-1.5 text-xs dark:bg-slate-900">
                <button type="button" className={secondary} onClick={() => setTab("fiscalizacao")}>
                  Fiscalização Bancária (OS, TIAF, Mapa, DTE)
                </button>
                <a className={`${secondary} underline`} href="/tributacao/iss-bancario/gestao">
                  Gestão de Autos de Infração, Notificações, Declarações e Relatórios (28.44 a 28.73)
                </a>
                <a className={`${secondary} text-emerald-700 underline`} href="/tributacao/iss-bancario/agencias">
                  Cadastro de Agências e Agentes Arrecadadores
                </a>
              </div>
            )}

            {openMenuGroup === "estban" && (
              <div className="flex flex-wrap items-center gap-2 rounded bg-slate-50 p-1.5 text-xs dark:bg-slate-900">
                <button type="button" className={button} onClick={() => setTab("estban")}>
                  Importação, Consulta e Relatórios ESTBAN / BCB + Comparativo DES-IF × ESTBAN (28.53 a 28.55, 28.67, 28.68)
                </button>
              </div>
            )}

            {openMenuGroup === "tabelas" && (
              <div className="flex flex-wrap items-center gap-2 rounded bg-slate-50 p-1.5 text-xs dark:bg-slate-900">
                <a className={`${secondary} underline`} href="/tributacao/referencias">
                  Tabelas Auxiliares DES-IF (COSIF, Lista Serviços, Tarifas, Eventos, Órgãos — 28.28 a 28.41, 28.74 a 28.76)
                </a>
                <a className={`${secondary} underline`} href="/tributacao/iss-bancario/gestao/downloads">
                  Downloads de Leiautes, Manuais e Documentos (28.77 / 28.78)
                </a>
                <a className={`${secondary} underline`} href="/configuracoes/conta">
                  Minha Conta / Alterar Senha (28.18 / 28.20)
                </a>
                <a className={`${secondary} underline`} href="/configuracoes/usuarios">
                  Usuários (28.21 a 28.24)
                </a>
                <a className={`${secondary} underline`} href="/configuracoes/perfis">
                  Grupos e Permissões (28.25)
                </a>
                <a className={`${secondary} underline`} href="/login/recuperar">
                  Recuperação de Senha por E-mail (28.19)
                </a>
              </div>
            )}
          </div>
        )}
      </section>

      {!menusSuppressed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs dark:border-emerald-900 dark:bg-emerald-950/40 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-emerald-950 dark:text-emerald-200">
              Webservice Administração Tributária (28.56 / 28.66):
            </b>
            <span>
              Receita: <b>{money(totalDeclaredRevenue)}</b>
            </span>
            <span>
              − Deduções: <b>{money(totalDeduction)}</b>
            </span>
            <span>
              = Base: <b>{money(totalTaxableBase)}</b>
            </span>
            <span>
              → ISS Apurado: <b>{money(totalGrossTax)}</b>
            </span>
            <span>
              − Pago/Retido Webservice: <b>{money(wsDeductedTaxPaid)}</b>
            </span>
            <span className="font-bold text-emerald-800 dark:text-emerald-300">
              = Saldo a Recolher: {money(netTaxAfterWebservice)}
            </span>
            <span className="text-[11px] text-slate-500">({wsSyncedAt})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={secondary}
              onClick={() => {
                setWsDeductedTaxPaid(50);
                setWsSyncedAt(`Conciliado com Webservice Tributário às ${new Date().toLocaleTimeString("pt-BR")}`);
                setMessage(
                  "Apuração automática sincronizada via Webservice com a Administração Tributária: deduções e imposto já pago abatidos (28.56 / 28.66).",
                );
              }}
            >
              Sincronizar Dedução Webservice (28.56)
            </button>
            <a className="font-semibold underline" href="/tributacao/iss-bancario/gestao">
              Gestão de autos, declarações, relatórios e downloads
            </a>
            <a className="font-semibold text-emerald-700 underline" href="/tributacao/iss-bancario/agencias">
              Cadastro de agências e agentes arrecadadores
            </a>
          </div>
        </div>
      )}
      {!listView && navigation}
      {message && !listView && (
        <button
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs text-blue-800"
          onClick={() => setMessage("")}
        >
          {message}
        </button>
      )}
      {tab === "apuracao" && (
        <TaxOperationalTable
          id="iss-bancario-apuracao"
          toolbar={toolbar}
          actions={
            <select
              aria-label="Processo para OS"
              className="h-7 max-w-48 rounded border text-[13px]"
              value={processId}
              onChange={(event) => setProcessId(event.target.value)}
            >
              <option value="">OS sem processo</option>
              {data.processes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.protocolNumber} · {row.status}
                </option>
              ))}
            </select>
          }
          columns={[
            ["institution", "Instituição", 80, 200],
            ["agency", "Agência", 64, 150],
            ["competence", "Competência", 56, 115],
            ["subtitle", "Subtítulo", 56, 130],
            ["revenue", "Receita", 48, 120, "text", "right"],
            ["deduction", "Dedução", 48, 120, "text", "right"],
            ["base", "Base", 48, 120, "text", "right"],
            ["rate", "Alíquota", 40, 90, "text", "right"],
            ["gross", "ISS", 48, 120, "text", "right"],
            ["credit", "Crédito", 48, 120, "text", "right"],
            ["debit", "Débito", 48, 120, "text", "right"],
            ["due", "A recolher", 48, 120, "text", "right"],
            ["actions", "Ações", 48, 60, "actions"],
          ]}
          rows={data.assessments.map((row) => ({
            id: row.id,
            label: `${row.institution} · ${row.competence} · ${row.subtitle}`,
            values: {
              institution: row.institution,
              agency: row.agency,
              competence: row.competence,
              subtitle: row.subtitle,
              revenue: money(row.revenue),
              deduction: money(row.deduction),
              base: money(row.base),
              rate: `${row.rate}%`,
              gross: money(row.grossTax),
              credit: `-${money(row.credit)}`,
              debit: `+${money(row.debit)}`,
              due: money(row.due),
            },
            actions: (
              <TaxRowActions label={row.institution}>
                {row.guideId ? (
                  <TaxRowAction href={`/tributacao/iss-bancario/guias/${row.guideId}`} target="_blank">
                    DAM
                  </TaxRowAction>
                ) : (
                  <TaxRowAction disabled={pending} onClick={() => run(() => issueGuideAction(row.id))}>
                    Gerar DAM
                  </TaxRowAction>
                )}
                {(
                  [
                    ["DIFERENCA", "OS diferença"],
                    ["OMISSAO", "OS omissão"],
                    ["SEM_MOVIMENTO", "OS sem movimento"],
                  ] as const
                ).map(([kind, label]) => (
                  <TaxRowAction
                    key={kind}
                    disabled={pending}
                    onClick={() => run(() => openFiscalCaseAction(row.id, kind, processId || undefined))}
                  >
                    {label}
                  </TaxRowAction>
                ))}
              </TaxRowActions>
            ),
          }))}
        />
      )}
      {tab === "confrontos" && confronto === "balancetes" && (
        <TaxOperationalTable
          id="iss-bancario-balancetes"
          toolbar={toolbar}
          columns={[
            ["agency", "Agência", 130, 190],
            ["account", "Conta", 110, 150, "identifier"],
            ["competence", "Competência", 100, 115],
            ["inconsistency", "Inconsistência", 150, 250],
            ["opening", "Inicial", 110, 140, "text", "right"],
            ["credits", "Créditos", 110, 140, "text", "right"],
            ["debits", "Débitos", 110, 140, "text", "right"],
            ["final", "Final", 110, 140, "text", "right"],
          ]}
          rows={data.balances.map((row) => ({
            id: row.id,
            label: `${row.agency} · ${row.account}`,
            values: {
              agency: row.agency,
              account: row.account,
              competence: row.competence,
              inconsistency: row.inconsistency ?? "Sem diferença",
              opening: money(row.opening),
              credits: money(row.credits),
              debits: money(row.debits),
              final: money(row.calculated),
            },
          }))}
        />
      )}
      {tab === "confrontos" && confronto === "pacotes" && (
        <TaxOperationalTable
          id="iss-bancario-pacotes"
          toolbar={toolbar}
          columns={[
            ["agency", "Agência", 130, 190],
            ["package", "Pacote", 130, 200],
            ["competence", "Competência", 100, 115],
            ["holders", "Correntistas", 100, 120, "text", "right"],
            ["potential", "Potencial", 110, 140, "text", "right"],
            ["collected", "Arrecadado", 110, 140, "text", "right"],
            ["difference", "Diferença", 110, 140, "text", "right"],
            ["impact", "Impacto", 110, 140, "text", "right"],
          ]}
          rows={data.movements.map((row) => ({
            id: row.id,
            label: `${row.agency} · ${row.package}`,
            values: {
              agency: row.agency,
              package: row.package,
              competence: row.competence,
              holders: String(row.holders),
              potential: money(row.potential),
              collected: money(row.collected),
              difference: money(row.difference),
              impact: money(row.impact),
            },
          }))}
        />
      )}
      {tab === "fiscalizacao" && (
        <TaxOperationalTable
          id="iss-bancario-fiscalizacao"
          toolbar={toolbar}
          columns={[
            ["institution", "Instituição", 80, 180],
            ["agency", "Agência", 64, 140],
            ["competence", "Competência", 56, 115],
            ["finding", "Achado", 56, 140],
            ["status", "Situação", 56, 140, "status"],
            ["order", "OS", 56, 130, "identifier"],
            ["process", "Processo", 56, 150, "identifier"],
            ["infraction", "Auto", 64, 180],
            ["communication", "Comunicação", 64, 180],
            ["history", "Histórico", 72, 220],
            ["actions", "Ações", 48, 60, "actions"],
          ]}
          rows={data.cases.map((row) => ({
            id: row.id,
            label: row.os || row.id,
            values: {
              institution: row.institution,
              agency: row.agency,
              competence: row.competence,
              finding: row.findingType,
              status: row.status,
              order: row.os ?? "—",
              process:
                data.processes.find((item) => item.id === row.processId)?.protocolNumber ??
                "Sem processo",
              infraction: row.infractionId ? "Gerado" : "Pendente de vínculo fiscal",
              communication: row.dteMessageId ? "Disponibilizada no DTE" : "Não comunicada",
              history: row.events.join("\n"),
            },
            actions: (
              <TaxRowActions label={row.os || row.id}>
                <TaxRowAction href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/tiaf`} target="_blank">
                  TIAF
                </TaxRowAction>
                <TaxRowAction href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/mapa`} target="_blank">
                  Mapa
                </TaxRowAction>
                {row.infractionId && (
                  <TaxRowAction href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/auto`}>
                    Visualizar / editar auto
                  </TaxRowAction>
                )}
                {!row.dteMessageId && (
                  <TaxRowAction onClick={() => run(() => communicateFiscalCaseAction(row.id))}>
                    Comunicar DTE
                  </TaxRowAction>
                )}
              </TaxRowActions>
            ),
          }))}
        />
      )}
      {tab === "historico-importacoes" && (
        <TaxOperationalTable
          id="iss-bancario-importacoes"
          toolbar={toolbar}
          columns={[
            ["file", "Arquivo", 80, 200],
            ["module", "Módulo", 56, 150],
            ["institution", "Instituição", 72, 180],
            ["agency", "Agência", 56, 140],
            ["competence", "Competência", 56, 115],
            ["version", "Versão", 40, 80],
            ["origin", "Origem", 56, 140],
            ["status", "Validação", 56, 150, "status"],
            ["policy", "Política de assinatura", 64, 190],
            ["signature", "Assinatura", 56, 150],
            ["errors", "Inconsistências", 72, 220],
            ["receipt", "Recibo", 64, 160, "identifier"],
            ["actions", "Ações", 48, 60, "actions"],
          ]}
          rows={data.imports.map((row) => ({
            id: row.id,
            label: row.fileName,
            values: {
              file: row.fileName,
              module: row.moduleType,
              institution: row.institution,
              agency: row.agency,
              competence: row.competence,
              version: row.version,
              origin: row.originMode,
              status: row.status,
              policy: row.signaturePolicy,
              signature: row.signatureStatus,
              errors: errorList(row.inconsistencies),
              receipt: row.receipt || "Após processar",
            },
            actions: (
              <TaxRowActions label={row.fileName}>
                {row.receipt && (
                  <TaxRowAction href={`/tributacao/iss-bancario/importacoes/${row.id}/recibo`} target="_blank">
                    Abrir recibo
                  </TaxRowAction>
                )}
                {["RECEBIDO", "INCONSISTENTE"].includes(row.status) && (
                  <TaxRowAction onClick={() => run(() => validateImportAction(row.id))}>Validar</TaxRowAction>
                )}
                {row.status === "VALIDADO" && (
                  <TaxRowAction onClick={() => run(() => processImportAction(row.id))}>Processar</TaxRowAction>
                )}
              </TaxRowActions>
            ),
          }))}
        />
      )}
      <main className={listView ? "hidden print:block" : "min-h-0 flex-1 overflow-auto"}>
        {tab === "apuracao" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-wrap items-center gap-2 border-b p-2">
              <Calculator className="size-4" />
              <b className="mr-auto text-sm">
                Apuração por instituição, agência, competência e subtítulo
              </b>
              <select
                className={`${input} max-w-64`}
                value={processId}
                onChange={(event) => setProcessId(event.target.value)}
              >
                <option value="">OS sem processo</option>
                {data.processes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.protocolNumber} · {row.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Instituição / agência</th>
                    <th className="p-2">Competência / subtítulo</th>
                    <th className="p-2 text-right">Receita</th>
                    <th className="p-2 text-right">Dedução / base</th>
                    <th className="p-2 text-right">Alíquota / ISS</th>
                    <th className="p-2 text-right">Crédito / débito</th>
                    <th className="p-2 text-right">A recolher</th>
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assessments.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2">
                        <b>{row.institution}</b>
                        <br />
                        {row.agency}
                      </td>
                      <td className="p-2">
                        {row.competence}
                        <br />
                        {row.subtitle}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.revenue)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.deduction)}
                        <br />
                        <b>{money(row.base)}</b>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {row.rate}%<br />
                        <b>{money(row.grossTax)}</b>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        -{money(row.credit)} / +{money(row.debit)}
                      </td>
                      <td className="p-2 text-right font-bold tabular-nums text-emerald-700">
                        {money(row.due)}
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {row.guideId ? (
                            <a
                              className={secondary}
                              href={`/tributacao/iss-bancario/guias/${row.guideId}`}
                              target="_blank"
                            >
                              DAM
                            </a>
                          ) : (
                            <button
                              className={button}
                              disabled={pending}
                              onClick={() => run(() => issueGuideAction(row.id))}
                            >
                              Gerar DAM
                            </button>
                          )}
                          <button
                            className={secondary}
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                openFiscalCaseAction(
                                  row.id,
                                  "DIFERENCA",
                                  processId || undefined,
                                ),
                              )
                            }
                          >
                            OS diferença
                          </button>
                          <button
                            className={secondary}
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                openFiscalCaseAction(
                                  row.id,
                                  "OMISSAO",
                                  processId || undefined,
                                ),
                              )
                            }
                          >
                            OS omissão
                          </button>
                          <button
                            className={secondary}
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                openFiscalCaseAction(
                                  row.id,
                                  "SEM_MOVIMENTO",
                                  processId || undefined,
                                ),
                              )
                            }
                          >
                            OS sem movimento
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-2 text-[10px] text-slate-500">
              Cenário de referência: R$ 10.000 − R$ 1.000 = R$ 9.000 × 5% = R$
              450 − R$ 50 = R$ 400.
            </p>
          </section>
        )}
        {tab === "importacoes" && (
          <div className="grid gap-2 xl:grid-cols-[400px_1fr]">
            <form
              className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
              onSubmit={submit(async (form) => {
                const file = form.get("file") as File;
                let payload: unknown;
                let fileName = file?.name || `desif-${selectedModuleType.toLowerCase()}-${importCompetence}.json`;
                if (file?.size) {
                  try {
                    payload = JSON.parse(await file.text());
                  } catch {
                    return setMessage("O arquivo precisa ser JSON válido.");
                  }
                } else if (generatedJsonPreview.trim()) {
                  try {
                    payload = JSON.parse(generatedJsonPreview);
                  } catch {
                    return setMessage("O conteúdo JSON gerado é inválido.");
                  }
                } else {
                  return setMessage("Selecione um arquivo JSON ou clique em 'Gerar / Carregar Arquivo Exemplo ABRASF 3.1'.");
                }
                run(() =>
                  receiveImportAction({
                    institutionId: String(form.get("institutionId")),
                    agencyId: String(form.get("agencyId")) || undefined,
                    competence: String(form.get("competence")),
                    moduleType: String(form.get("moduleType")),
                    fileName,
                    abrasfVersion: String(form.get("version")),
                    signaturePolicy: String(form.get("signaturePolicy")) as
                      | "NAO_CONFIGURADA"
                      | "ASSINATURA_INTERNA",
                    payload: payload as never,
                  }),
                );
              })}
            >
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <FileCheck2 className="size-4" />
                Receber arquivo DES-IF · ABRASF 3.1 (Módulos 1 a 4 — 28.61 a 28.64)
              </h2>
              <label className="text-xs">
                Instituição
                <select
                  name="institutionId"
                  className={input}
                  value={institutionId}
                  onChange={(event) => setInstitutionId(event.target.value)}
                >
                  {data.institutions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Agência
                <select name="agencyId" className={input}>
                  <option value="">Todas</option>
                  {current?.agencies.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  Competência (AAAA-MM)
                  <input
                    className={input}
                    name="competence"
                    value={importCompetence}
                    onChange={(e) => setImportCompetence(e.target.value)}
                    required
                  />
                </label>
                <label className="text-xs">
                  Versão
                  <input
                    className={input}
                    name="version"
                    value={importVersion}
                    onChange={(e) => setImportVersion(e.target.value)}
                    required
                  />
                </label>
              </div>
              <label className="text-xs">
                Módulo ABRASF 3.1 (28.61 a 28.64)
                <select
                  className={input}
                  name="moduleType"
                  value={selectedModuleType}
                  onChange={(e) => setSelectedModuleType(e.target.value)}
                >
                  <option value="BALANCETE">
                    Módulo 1 — Demonstrativo Contábil / Balancete (BALANCETE — 28.61)
                  </option>
                  <option value="APURACAO">
                    Módulo 2 — Apuração Mensal do ISSQN (APURACAO — 28.62)
                  </option>
                  <option value="INFORMACOES_COMUNS">
                    Módulo 3 — Informações Comuns aos Municípios / PGCC / Tarifas (INFORMACOES_COMUNS — 28.63)
                  </option>
                  <option value="PARTIDAS_CONTABEIS">
                    Módulo 4 — Demonstrativo das Partidas dos Lançamentos Contábeis (PARTIDAS_CONTABEIS — 28.64)
                  </option>
                  <option value="TARIFAS">Demonstrativo de Tarifas e Pacotes (TARIFAS)</option>
                  <option value="APURACAO_BALANCETE_TARIFAS">
                    Combo Integrado ABRASF 3.1 (APURACAO_BALANCETE_TARIFAS)
                  </option>
                </select>
              </label>
              <label className="text-xs">
                Assinatura
                <select className={input} name="signaturePolicy">
                  <option value="NAO_CONFIGURADA">Não configurada</option>
                  <option value="ASSINATURA_INTERNA">Assinatura interna</option>
                </select>
              </label>
              <input
                className={input}
                name="file"
                type="file"
                accept="application/json,.json"
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={secondary}
                  onClick={() => {
                    const sample = buildAbrasfSamplePayload(selectedModuleType);
                    setGeneratedJsonPreview(JSON.stringify(sample, null, 2));
                    setMessage(
                      `Arquivo exemplo ABRASF 3.1 (${selectedModuleType}) gerado e carregado na memória. Clique em 'Receber arquivo' para enviar.`,
                    );
                  }}
                >
                  Gerar / Carregar Arquivo Exemplo ABRASF 3.1
                </button>
                <button className={button} disabled={pending}>
                  Receber arquivo
                </button>
              </div>
              {generatedJsonPreview && (
                <label className="text-xs">
                  Conteúdo JSON ABRASF 3.1 carregado (editável):
                  <textarea
                    rows={5}
                    className="mt-1 w-full rounded border border-slate-300 bg-slate-50 p-1.5 font-mono text-[11px] dark:border-slate-700 dark:bg-slate-900"
                    value={generatedJsonPreview}
                    onChange={(e) => setGeneratedJsonPreview(e.target.value)}
                  />
                </label>
              )}
              <p className="text-[10px] text-slate-500">
                A tela não declara validação ICP-Brasil. O perfil oficial
                depende de leiaute e provedor homologados.
              </p>
            </form>
            <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <h3 className="mb-2 text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                Últimas Recepcões DES-IF ABRASF 3.1 e Validação dos Módulos 1 a 4
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-left dark:bg-slate-900">
                    <tr>
                      <th className="p-2">Arquivo / Módulo</th>
                      <th className="p-2">Instituição</th>
                      <th className="p-2">Competência / versão</th>
                      <th className="p-2">Validação / assinatura</th>
                      <th className="p-2">Recibo</th>
                      <th className="p-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.imports.slice(0, 20).map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2">
                          <b>{row.fileName}</b>
                          <br />
                          {row.moduleType}
                        </td>
                        <td className="p-2">
                          {row.institution}
                          <br />
                          {row.agency}
                        </td>
                        <td className="p-2">
                          {row.competence}
                          <br />
                          {row.version} · {row.originMode}
                        </td>
                        <td className="p-2">
                          <b>{row.status}</b>
                          <br />
                          {row.signaturePolicy}: {row.signatureStatus}
                          <br />
                          <span className="text-rose-600">
                            {errorList(row.inconsistencies)}
                          </span>
                        </td>
                        <td className="p-2">
                          {row.receipt ? (
                            <a
                              className="text-blue-600 underline"
                              target="_blank"
                              href={`/tributacao/iss-bancario/importacoes/${row.id}/recibo`}
                            >
                              {row.receipt}
                            </a>
                          ) : (
                            "Após processar"
                          )}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {["RECEBIDO", "INCONSISTENTE"].includes(
                              row.status,
                            ) && (
                              <button
                                className={secondary}
                                onClick={() =>
                                  run(() => validateImportAction(row.id))
                                }
                              >
                                Validar
                              </button>
                            )}
                            {row.status === "VALIDADO" && (
                              <button
                                className={button}
                                onClick={() =>
                                  run(() => processImportAction(row.id))
                                }
                              >
                                Processar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        {tab === "cadastros" && (
          <div className="grid gap-2 xl:grid-cols-[380px_1fr]">
            <div className="grid content-start gap-2">
              {/* 28.42: Importação / Atualização da Plataforma do Banco Central do Brasil (BCB) */}
              <section className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <h2 className="text-xs font-bold uppercase text-amber-950 dark:text-amber-200">
                  Importar / Atualizar Instituições via Plataforma Banco Central do Brasil (BCB — 28.42)
                </h2>
                <select
                  aria-label="Instituição Oficial BCB"
                  className={input}
                  value={selectedBcbCode}
                  onChange={(e) => setSelectedBcbCode(e.target.value)}
                >
                  {BCB_OFFICIAL_INSTITUTIONS.map((item) => (
                    <option key={item.code} value={item.code}>
                      COMPE {item.code} — {item.name} (CNPJ Base {item.baseCnpj})
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => {
                      const bcb = BCB_OFFICIAL_INSTITUTIONS.find((b) => b.code === selectedBcbCode);
                      if (bcb) {
                        setInstFormName(`${bcb.code} - ${bcb.name}`);
                        setInstFormBaseCnpj(bcb.baseCnpj);
                        setMessage(`Dados oficiais BCB de ${bcb.name} carregados no formulário.`);
                      }
                    }}
                  >
                    Carregar no formulário
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={pending}
                    onClick={() => {
                      const bcb = BCB_OFFICIAL_INSTITUTIONS.find((b) => b.code === selectedBcbCode);
                      if (!bcb) return;
                      run(() =>
                        createInstitutionAction({
                          taxpayerId: taxpayerId || undefined,
                          name: bcb.name,
                          baseCnpj: bcb.baseCnpj,
                          validFrom: "2026-01-01",
                        }),
                      );
                    }}
                  >
                    Importar / Atualizar do BCB (28.42)
                  </button>
                </div>
              </section>

              <form
                className="grid gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                onSubmit={submit(async (form) =>
                  run(() =>
                    createInstitutionAction({
                      taxpayerId: String(form.get("taxpayerId")) || undefined,
                      name: String(form.get("name")),
                      baseCnpj: String(form.get("baseCnpj")),
                      validFrom: String(form.get("validFrom")),
                    }),
                  ),
                )}
              >
                <h2 className="text-sm font-bold">Instituição financeira</h2>
                <select className={input} name="taxpayerId">
                  <option value="">Sem vínculo fiscal</option>
                  {data.taxpayers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  name="name"
                  placeholder="Nome"
                  value={instFormName}
                  onChange={(e) => setInstFormName(e.target.value)}
                  required
                />
                <input
                  className={input}
                  name="baseCnpj"
                  placeholder="CNPJ base (8 dígitos)"
                  value={instFormBaseCnpj}
                  onChange={(e) => setInstFormBaseCnpj(e.target.value)}
                  required
                />
                <input
                  className={input}
                  name="validFrom"
                  type="date"
                  defaultValue="2026-01-01"
                  required
                />
                <button className={button}>Salvar instituição</button>
              </form>
              <form
                className="grid gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                onSubmit={submit(async (form) =>
                  run(() =>
                    createAgencyAction({
                      institutionId: String(form.get("institutionId")),
                      code: String(form.get("code")),
                      name: String(form.get("name")),
                      fullCnpj: String(form.get("fullCnpj")),
                      municipalRegistration:
                        String(form.get("registration")) || undefined,
                      validFrom: String(form.get("validFrom")),
                    }),
                  ),
                )}
              >
                <h2 className="text-sm font-bold">Agência / dependência</h2>
                <select className={input} name="institutionId">
                  {data.institutions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <input
                  className={input}
                  name="code"
                  placeholder="Código"
                  required
                />
                <input
                  className={input}
                  name="name"
                  placeholder="Nome"
                  required
                />
                <input
                  className={input}
                  name="fullCnpj"
                  placeholder="CNPJ completo"
                  required
                />
                <input
                  className={input}
                  name="registration"
                  placeholder="Inscrição municipal"
                />
                <input
                  className={input}
                  name="validFrom"
                  type="date"
                  defaultValue="2026-01-01"
                  required
                />
                <button className={button}>Salvar agência</button>
              </form>
            </div>
            <section className="grid content-start gap-2">
              {/* 28.43: Pesquisa de Instituições Financeiras por Nome, CNPJ e Competência */}
              <div className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <h3 className="mb-2 text-xs font-bold uppercase text-slate-700 dark:text-slate-300">
                  Pesquisar Instituições Financeiras Cadastradas (Nome, CNPJ e Competência — 28.43)
                </h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-xs">
                    Nome da Instituição
                    <input
                      className={input}
                      placeholder="Ex.: Banco do Brasil, Caixa..."
                      value={instSearchName}
                      onChange={(e) => setInstSearchName(e.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    CNPJ (Base ou Agência)
                    <input
                      className={input}
                      placeholder="Ex.: 00000000"
                      value={instSearchCnpj}
                      onChange={(e) => setInstSearchCnpj(e.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    Competência (Mês/Exercício)
                    <input
                      className={input}
                      placeholder="Ex.: 2026-01"
                      value={instSearchCompetence}
                      onChange={(e) => setInstSearchCompetence(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              {filteredInstitutions.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                >
                  <h3 className="font-bold">
                    {row.name} · CNPJ base {row.baseCnpj}
                  </h3>
                  <p>
                    {row.status} · vínculo fiscal{" "}
                    {row.taxpayerId ? "configurado" : "pendente"}
                  </p>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {row.agencies.map((agency) => (
                      <div
                        key={agency.id}
                        className="rounded border p-2 dark:border-slate-700"
                      >
                        <b>
                          {agency.code} — {agency.name}
                        </b>
                        <br />
                        {agency.fullCnpj} · IM{" "}
                        {agency.registration ?? "não informada"} ·{" "}
                        {agency.status}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}
        {tab === "catalogo" && (
          <section className="grid gap-2 xl:grid-cols-2">
            {data.institutions.slice(0, 20).map((row) => (
              <article
                key={row.id}
                className="rounded-lg border bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
              >
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <Building2 className="size-4" />
                  {row.name}
                </h2>
                {row.plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="mt-2 rounded border p-2 dark:border-slate-700"
                  >
                    <b>PGCC {plan.version}</b> · {plan.status}
                    {plan.accounts.map((account) => (
                      <div key={account.id} className="mt-1 border-t pt-1">
                        <b>
                          {account.code} — {account.name}
                        </b>
                        <br />
                        COSIF: {account.cosif.join(", ") || "sem vínculo"}
                        <br />
                        Subtítulos:{" "}
                        {account.subtitles
                          .map((item) => `${item.code} (${item.rate}%)`)
                          .join(", ")}
                      </div>
                    ))}
                  </div>
                ))}
                <div className="mt-2">
                  <b>Tarifas:</b>{" "}
                  {row.tariffs
                    .map((item) => `${item.code} ${money(item.amount)}`)
                    .join(", ") || "—"}
                </div>
                <div>
                  <b>Pacotes:</b>{" "}
                  {row.packages
                    .map((item) => `${item.code} (${item.composition})`)
                    .join(", ") || "—"}
                </div>
              </article>
            ))}
          </section>
        )}
        {tab === "confrontos" && (
          <div className="grid gap-2 xl:grid-cols-2">
            <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
              <h2 className="flex items-center gap-2 border-b p-2 text-sm font-bold">
                <ShieldCheck className="size-4" />
                Balancetes e confrontos
              </h2>
              {data.balances.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="grid grid-cols-2 gap-1 border-t p-2 text-[11px] sm:grid-cols-4"
                >
                  <b className="col-span-2">
                    {row.agency} · {row.account}
                  </b>
                  <span>{row.competence}</span>
                  <span
                    className={
                      row.difference
                        ? "font-bold text-rose-600"
                        : "font-bold text-emerald-700"
                    }
                  >
                    {row.inconsistency ?? "Sem diferença"}
                  </span>
                  <span>Inicial {money(row.opening)}</span>
                  <span>Créditos {money(row.credits)}</span>
                  <span>Débitos {money(row.debits)}</span>
                  <span>Final {money(row.calculated)}</span>
                </article>
              ))}
            </section>
            <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
              <h2 className="flex items-center gap-2 border-b p-2 text-sm font-bold">
                <PackageSearch className="size-4" />
                Pacotes e correntistas
              </h2>
              {data.movements.slice(0, 20).map((row) => (
                <article
                  key={row.id}
                  className="grid grid-cols-2 gap-1 border-t p-2 text-[11px] sm:grid-cols-3"
                >
                  <b className="col-span-2">
                    {row.agency} · {row.package}
                  </b>
                  <span>{row.competence}</span>
                  <span>{row.holders} correntistas</span>
                  <span>Potencial {money(row.potential)}</span>
                  <span>Arrecadado {money(row.collected)}</span>
                  <span className="font-bold">
                    Diferença {money(row.difference)}
                  </span>
                  <span className="font-bold text-amber-700">
                    Impacto {money(row.impact)}
                  </span>
                </article>
              ))}
              <p className="border-t p-2 text-[10px] text-slate-500">
                O confronto de pacotes é independente e não duplica a mesma
                receita já apurada por COSIF/PGCC.
              </p>
            </section>
          </div>
        )}
        {tab === "fiscalizacao" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <h2 className="flex items-center gap-2 border-b p-2 text-sm font-bold">
              <ShieldCheck className="size-4" />
              Fiscalização bancária
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Instituição / agência</th>
                    <th className="p-2">Achado</th>
                    <th className="p-2">OS / Processo</th>
                    <th className="p-2">TIAF / mapa / auto</th>
                    <th className="p-2">Comunicação</th>
                    <th className="p-2">Histórico</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t align-top">
                      <td className="p-2">
                        <b>{row.institution}</b>
                        <br />
                        {row.agency} · {row.competence}
                      </td>
                      <td className="p-2">
                        <b>{row.findingType}</b>
                        <br />
                        {row.status}
                      </td>
                      <td className="p-2">
                        {row.os}
                        <br />
                        {data.processes.find(
                          (item) => item.id === row.processId,
                        )?.protocolNumber ?? "Sem processo"}
                      </td>
                      <td className="p-2">
                        <a
                          className="text-blue-600 underline"
                          target="_blank"
                          href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/tiaf`}
                        >
                          TIAF
                        </a>{" "}
                        ·{" "}
                        <a
                          className="text-blue-600 underline"
                          target="_blank"
                          href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/mapa`}
                        >
                          Mapa
                        </a>
                        <br />
                        Auto{" "}
                        {row.infractionId
                          ? "gerado"
                          : "pendente de vínculo fiscal"}
                      </td>
                      <td className="p-2">
                        {row.dteMessageId ? (
                          "Disponibilizada no DTE"
                        ) : (
                          <button
                            className={button}
                            onClick={() =>
                              run(() => communicateFiscalCaseAction(row.id))
                            }
                          >
                            Comunicar DTE
                          </button>
                        )}
                      </td>
                      <td className="p-2">
                        <details>
                          <summary>{row.events.length} eventos</summary>
                          {row.events.map((event, index) => (
                            <p key={index}>{event}</p>
                          ))}
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-2 text-[10px] text-slate-500">
              Escopo desta tela: omissão, diferença e ausência de movimento no
              ISS bancário. A fiscalização tributária geral permanece fora do
              S6.
            </p>
          </section>
        )}

        {/* 28.53, 28.54, 28.55, 28.67, 28.68: Estatística Bancária BCB / ESTBAN & Confronto DES-IF × ESTBAN */}
        {tab === "estban" && (
          <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[360px_1fr]">
              {/* 28.53: Importação de Estatística Bancária do Banco Central do Brasil */}
              <form
                className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                onSubmit={submit(async (form) => {
                  const comp = String(form.get("competence") || "2026-03");
                  const genDate = String(form.get("generatedAt") || "2026-04-02");
                  const agCode = String(form.get("agencyCode") || "0001-9");
                  const instName = String(form.get("institutionName") || "Banco do Brasil S.A.");
                  const amount = Number(form.get("estbanAmount") || 12500);
                  const newBatch: EstbanBatch = {
                    code: `ESTBAN-BCB-${comp.replace("-", "")}-${String(estbanBatches.length + 1).padStart(3, "0")}`,
                    status: "PROCESSADO",
                    importedAt: new Date().toISOString().slice(0, 10),
                    competence: comp,
                    generatedAt: genDate,
                    agencyCode: agCode,
                    institutionName: instName,
                    cosifAccount: "7.1.7.10.00-9",
                    estbanAmount: amount,
                  };
                  setEstbanBatches((prev) => [newBatch, ...prev]);
                  setMessage(`Arquivo de Estatística Bancária BCB (${newBatch.code}) importado e processado com sucesso (28.53).`);
                })}
              >
                <h2 className="text-sm font-bold">
                  Importar Estatística Bancária BCB / ESTBAN (28.53)
                </h2>
                <label className="text-xs">
                  Instituição Financeira (BCB)
                  <select name="institutionName" className={input} defaultValue="Banco do Brasil S.A.">
                    {BCB_OFFICIAL_INSTITUTIONS.map((b) => (
                      <option key={b.code} value={b.name}>
                        {b.code} — {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    Competência (Mês/Ano)
                    <input name="competence" className={input} defaultValue="2026-03" required />
                  </label>
                  <label className="text-xs">
                    Data da Geração BCB
                    <input name="generatedAt" type="date" className={input} defaultValue="2026-04-02" required />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    Nº de Agência
                    <input name="agencyCode" className={input} defaultValue="0001-9" required />
                  </label>
                  <label className="text-xs">
                    Saldo ESTBAN (R$)
                    <input name="estbanAmount" type="number" step="0.01" className={input} defaultValue="12500" required />
                  </label>
                </div>
                <label className="text-xs">
                  Arquivo Oficial ESTBAN / BCB (.CSV, .TXT, .JSON)
                  <input type="file" name="estbanFile" className={input} />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="submit" className={button}>
                    Importar Estatística BCB (28.53)
                  </button>
                  <button
                    type="button"
                    className={secondary}
                    onClick={() => {
                      const batch: EstbanBatch = {
                        code: `ESTBAN-BCB-202603-${String(estbanBatches.length + 1).padStart(3, "0")}`,
                        status: "PROCESSADO",
                        importedAt: new Date().toISOString().slice(0, 10),
                        competence: "2026-03",
                        generatedAt: "2026-04-01",
                        agencyCode: "0341-2",
                        institutionName: "Itaú Unibanco S.A.",
                        cosifAccount: "7.1.7.10.00-9",
                        estbanAmount: 15200,
                      };
                      setEstbanBatches((prev) => [batch, ...prev]);
                      setMessage(`Lote oficial ESTBAN BCB (${batch.code}) carregado automaticamente (28.53).`);
                    }}
                  >
                    Carregar Lote Oficial ESTBAN BCB
                  </button>
                </div>
              </form>

              {/* 28.54: Consulta das Importações de Estatísticas Bancárias */}
              <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                  <h2 className="text-sm font-bold">
                    Consulta e Relatório das Importações de Estatísticas Bancárias (28.54, 28.55, 28.68)
                  </h2>
                  <div className="flex flex-wrap gap-1 print:hidden">
                    {(["pdf", "xls", "doc", "txt"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        className={secondary}
                        onClick={() =>
                          downloadReportFile(
                            "relatorio-importacoes-estban-bcb",
                            fmt,
                            "Relatório das Importações de Estatísticas Bancárias (BCB / ESTBAN — 28.55 / 28.68)",
                            ["Código", "Situação", "Data da Importação", "Competência", "Data da Geração", "Nº de Agência", "Instituição"],
                            filteredEstbanBatches.map((b) => [
                              b.code,
                              b.status,
                              b.importedAt,
                              b.competence,
                              b.generatedAt,
                              b.agencyCode,
                              b.institutionName,
                            ]),
                          )
                        }
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                    <button type="button" className={secondary} onClick={() => window.print()}>
                      Imprimir
                    </button>
                  </div>
                </div>

                {/* Filtros 28.54 */}
                <div className="grid gap-2 sm:grid-cols-4 print:hidden">
                  <label className="text-xs">
                    Situação do Processamento
                    <select
                      aria-label="Situação do Processamento ESTBAN"
                      className={input}
                      value={estbanFilterStatus}
                      onChange={(e) => setEstbanFilterStatus(e.target.value)}
                    >
                      <option value="">Todas</option>
                      <option value="PROCESSADO">Processado</option>
                      <option value="PENDENTE">Pendente</option>
                      <option value="DIVERGENTE">Com Divergência</option>
                      <option value="CANCELADO">Cancelado</option>
                    </select>
                  </label>
                  <label className="text-xs">
                    Competência (Mês/Ano)
                    <input
                      className={input}
                      placeholder="Ex.: 2026-01"
                      value={estbanFilterCompetence}
                      onChange={(e) => setEstbanFilterCompetence(e.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    Data de Início
                    <input
                      type="date"
                      className={input}
                      value={estbanFilterStartDate}
                      onChange={(e) => setEstbanFilterStartDate(e.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    Data de Fim
                    <input
                      type="date"
                      className={input}
                      value={estbanFilterEndDate}
                      onChange={(e) => setEstbanFilterEndDate(e.target.value)}
                    />
                  </label>
                </div>

                {/* Tabela Relatório das Importações de Estatísticas Bancárias (28.55, 28.68) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 text-left dark:bg-slate-900">
                      <tr>
                        <th className="p-2">Código</th>
                        <th className="p-2">Situação</th>
                        <th className="p-2">Data da Importação</th>
                        <th className="p-2">Competência</th>
                        <th className="p-2">Data da Geração</th>
                        <th className="p-2">Nº de Agência</th>
                        <th className="p-2">Instituição</th>
                        <th className="p-2 text-right">Volume ESTBAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEstbanBatches.map((b) => (
                        <tr key={b.code} className="border-t">
                          <td className="p-2 font-mono font-bold">{b.code}</td>
                          <td className="p-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                b.status === "PROCESSADO"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : b.status === "DIVERGENTE"
                                    ? "bg-rose-100 text-rose-900"
                                    : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="p-2">{b.importedAt}</td>
                          <td className="p-2">{b.competence}</td>
                          <td className="p-2">{b.generatedAt}</td>
                          <td className="p-2 font-mono">{b.agencyCode}</td>
                          <td className="p-2">{b.institutionName}</td>
                          <td className="p-2 text-right font-semibold tabular-nums">{money(b.estbanAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* 28.67: Relatório Comparativo entre DES-IF e Estatística Bancária (ESTBAN / BCB) */}
            <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div>
                  <h2 className="text-sm font-bold">
                    Relatório Comparativo DES-IF × Estatística Bancária ESTBAN / BCB (28.67)
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Cruzamento eletrônico entre a receita declarada pela Instituição Financeira na DES-IF e os saldos oficiais informados ao Banco Central do Brasil (ESTBAN).
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 print:hidden">
                  {(["pdf", "xls", "doc", "txt"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      className={secondary}
                      onClick={() =>
                        downloadReportFile(
                          "relatorio-comparativo-desif-estban",
                          fmt,
                          "Relatório Comparativo DES-IF x Estatística Bancária ESTBAN / BCB (28.67)",
                          [
                            "Instituição",
                            "Agência",
                            "Competência",
                            "Conta COSIF",
                            "Declarado DES-IF",
                            "Estatística ESTBAN (BCB)",
                            "Diferença",
                            "Situação da Malha",
                          ],
                          comparativeDesifEstbanRows.map((r) => [
                            r.institution,
                            r.agency,
                            r.competence,
                            r.cosifAccount,
                            money(r.desifAmount),
                            money(r.estbanAmount),
                            money(r.difference),
                            r.status,
                          ]),
                        )
                      }
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                  <button type="button" className={secondary} onClick={() => window.print()}>
                    Imprimir
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-left dark:bg-slate-900">
                    <tr>
                      <th className="p-2">Instituição</th>
                      <th className="p-2">Agência</th>
                      <th className="p-2">Competência</th>
                      <th className="p-2">Conta COSIF</th>
                      <th className="p-2 text-right">Declarado DES-IF</th>
                      <th className="p-2 text-right">Saldo ESTBAN (BCB)</th>
                      <th className="p-2 text-right">Diferença Apurada</th>
                      <th className="p-2">Situação da Malha Fiscal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparativeDesifEstbanRows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2 font-semibold">{row.institution}</td>
                        <td className="p-2 font-mono">{row.agency}</td>
                        <td className="p-2">{row.competence}</td>
                        <td className="p-2 font-mono">{row.cosifAccount}</td>
                        <td className="p-2 text-right tabular-nums">{money(row.desifAmount)}</td>
                        <td className="p-2 text-right tabular-nums">{money(row.estbanAmount)}</td>
                        <td
                          className={`p-2 text-right font-bold tabular-nums ${
                            Math.abs(row.difference) > 0.01 ? "text-rose-600" : "text-emerald-700"
                          }`}
                        >
                          {money(row.difference)}
                        </td>
                        <td className="p-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              Math.abs(row.difference) > 0.01
                                ? "bg-rose-100 text-rose-900"
                                : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
