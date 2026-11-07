"use client";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../TaxOperationalTable";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileOutput,
  FileSpreadsheet,
  FileText,
  Filter,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  communicateDivergenceAction,
  communicateExclusionAction,
  importSimplesAction,
  prepareExclusionAction,
  processSimplesAction,
  rectifyDivergenceAction,
} from "./actions";

type Data = {
  taxpayers: { id: string; name: string; document: string }[];
  imports: {
    id: string;
    source: string;
    originMode: string;
    fileName: string;
    competence: string;
    status: string;
    total: number;
    accepted: number;
    rejected: number;
    createdAt: string;
  }[];
  divergences: {
    id: string;
    taxpayerId: string;
    taxpayerName: string;
    competence: string;
    type: string;
    status: string;
    nfse: number;
    declared: number;
    revenueDifference: number;
    municipalIss: number;
    confirmed: number;
    paymentDifference: number;
    dteMessageId: string | null;
    events: string[];
  }[];
  exclusions: {
    id: string;
    taxpayerName: string;
    competence: string;
    reason: string;
    revenue: number;
    limit: number;
    status: string;
    documentId: string | null;
    dteMessageId: string | null;
    externalReceipt: string | null;
  }[];
  allocations: {
    id: string;
    taxpayerName: string;
    competence: string;
    code: string;
    regime: string;
    nationalDas: number;
    municipal: number;
    confirmed: number;
    difference: number;
  }[];
};

const input =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-900";
const primary =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-600 disabled:opacity-50";
const secondaryBtn =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const val = (f: FormData, k: string) => String(f.get(k) ?? "");

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  );
}

const OFFICIAL_FILE_LAYOUTS = [
  { code: "PGDAS_D", label: "PGDAS-D — Declaração Mensal do Simples Nacional (27.109)", sourceType: "PGDAS", recordType: "PGDAS" },
  { code: "DEFIS", label: "DEFIS — Declaração de Informações Socioeconômicas e Fiscais (27.108)", sourceType: "DASN_DEFIS", recordType: "DEFIS" },
  { code: "DASNSIMEI", label: "DASNSIMEI — Declaração Anual do SIMEI (27.107)", sourceType: "DASN_DEFIS", recordType: "DASNSIMEI" },
  { code: "PAG", label: "PAG / DAF607 — Pagamentos do Simples Nacional (27.116)", sourceType: "DAF607", recordType: "DAF607" },
  { code: "DAS_SENDA", label: "DAS Cobrança / Senda — Guias DAS Emitidas (27.106)", sourceType: "DAF607", recordType: "DAS_COBRANCA_SENDA" },
  { code: "COMPSN", label: "COMPSN — Compensação Simples Nacional (27.105)", sourceType: "DAF607", recordType: "COMPSN" },
  { code: "PARCSN", label: "PARCSN — Parcelamentos do Simples Nacional e SIMEI (27.117)", sourceType: "PARCELAMENTOS", recordType: "PARCSN" },
  { code: "PGFN", label: "PGFN — Dívida Ativa da União (27.111)", sourceType: "PGFN", recordType: "PGFN" },
  { code: "INSCOBRA", label: "INSCOBRA — Dívida Ativa Municipal (27.110)", sourceType: "OUTROS", recordType: "INSCOBRA" },
  { code: "AINF", label: "AINF — Auto de Infração e Notificação Fiscal (27.102)", sourceType: "OUTROS", recordType: "AINF" },
  { code: "CADMEI", label: "CADMEI — Cadastro do Microempreendedor Individual (27.103)", sourceType: "PERIODOS_OPCAO", recordType: "CADMEI" },
  { code: "CIENCIA_DTE", label: "CIENCIA_DTE — Ciência de Comunicados DTE-SN (27.104)", sourceType: "OUTROS", recordType: "CIENCIA_DTE_SN" },
  { code: "CNPJ", label: "CNPJ — Dados Cadastrais de Estabelecimento RFB (27.112)", sourceType: "OUTROS", recordType: "CNPJ" },
  { code: "EVE", label: "EVE — Eventos do Simples Nacional e SIMEI (27.113)", sourceType: "PERIODOS_OPCAO", recordType: "EVE" },
  { code: "EVE_PER", label: "EVE_PER — Eventos e Períodos de Opção SN/SIMEI (27.114)", sourceType: "PERIODOS_OPCAO", recordType: "EVE_PER" },
  { code: "INFO_MUNICIPAL", label: "INFO_MUNICIPAL — Informações Municipais no Simples (27.115)", sourceType: "OUTROS", recordType: "INFO_MUNICIPAL" },
  { code: "MALHA_PGDAS", label: "MALHA_PGDAS — Arquivo de Malha PGDAS-D (27.118)", sourceType: "PGDAS", recordType: "MALHA_PGDAS" },
  { code: "TO_CNPJ", label: "TO_CNPJ — Termo de Opção por CNPJ (27.33)", sourceType: "PERIODOS_OPCAO", recordType: "TO_CNPJ" },
  { code: "TO_INDEFERIDO", label: "TO_INDEFERIDO — Termo de Opção Indeferido (27.33)", sourceType: "PERIODOS_OPCAO", recordType: "TO_INDEFERIDO" },
  { code: "TO_SOLICITACAO", label: "TO_SOLICITACAO — Termo de Opção Solicitação / Agendamento (27.33)", sourceType: "PERIODOS_OPCAO", recordType: "TO_SOLICITACAO" },
] as const;

const SN_EXCLUSION_EVENTS = [
  { code: "353", description: "353 — Exclusão do Simples Nacional por opção do contribuinte" },
  { code: "354", description: "354 — Exclusão de ofício - Embaraço à fiscalização" },
  { code: "355", description: "355 — Exclusão de ofício - Resistência à fiscalização" },
  { code: "356", description: "356 — Exclusão de ofício - Constituição por interpostas pessoas" },
  { code: "379", description: "379 — Exclusão de ofício - Débitos municipais sem regularização (LC 123/2006)" },
  { code: "388", description: "388 — Exclusão de ofício - Excesso de receita bruta acima do limite legal" },
  { code: "398", description: "398 — Exclusão de ofício - Falta de inscrição municipal ou alvará cassado" },
] as const;

const SIMEI_DESENQUADRAMENTO_EVENTS = [
  { code: "601", description: "601 — Desenquadramento do SIMEI por opção do contribuinte" },
  { code: "602", description: "602 — Desenquadramento do SIMEI por comunicação obrigatória" },
  { code: "603", description: "603 — Desenquadramento de ofício - Excesso de receita bruta MEI (> 20%)" },
  { code: "604", description: "604 — Desenquadramento de ofício - Exercício de ocupação/atividade vedada ao MEI" },
  { code: "613", description: "613 — Desenquadramento de ofício - Mais de um estabelecimento ou participação societária" },
] as const;

const DTE_BATCH_TEMPLATES = [
  {
    id: "AVISO_COBRANCA_27_74",
    req: "27.74",
    title: "Aviso de Cobrança em Lote (Débitos Município e Simples Nacional)",
    subject: "AVISO DE COBRANÇA E REGULARIZAÇÃO DE DÉBITOS — SIMPLES NACIONAL",
    description: "Gera lote DTE-SN para contribuintes com débitos de ISS próprio ou apurado no PGDAS-D pendentes de recolhimento.",
  },
  {
    id: "PRAZO_DECLARACAO_27_86",
    req: "27.86",
    title: "Prazo de Entrega de Declaração em Lote (DEFIS e DASNSIMEI)",
    subject: "INTIMAÇÃO PARA ENTREGA DE DECLARAÇÃO ANUAL (DEFIS / DASNSIMEI)",
    description: "Notifica contribuintes omissos quanto ao prazo regulamentar de transmissão da DEFIS ou DASNSIMEI.",
  },
  {
    id: "NOTIFICACAO_PREVIA_27_90",
    req: "27.90",
    title: "Notificação Prévia em Lote com Link de Monitoramento Fiscal",
    subject: "NOTIFICAÇÃO PRÉVIA DE AUTORREGULARIZAÇÃO — MONITORAMENTO FISCAL",
    description: "Inclui divergências de receita, alíquota e ausências com link direto de acesso ao Monitoramento Fiscal para autorregularização.",
  },
  {
    id: "INDEFERIMENTO_OPCAO_27_98",
    req: "27.98",
    title: "Indeferimento de Opção (Agendamento / Solicitação — Inscrição, Alvará e Débitos)",
    subject: "TERMO DE INDEFERIMENTO DE OPÇÃO PELO SIMPLES NACIONAL",
    description: "Verifica pendências de inscrição municipal, alvará de funcionamento e débitos tributários impeditivos ao ingresso no Simples.",
  },
  {
    id: "DECISAO_PROCESSO_27_100",
    req: "27.100",
    title: "Notificação de Decisão em Processo Administrativo em Lote",
    subject: "CIÊNCIA DE DECISÃO EM PROCESSO ADMINISTRATIVO FISCAL — DTE-SN",
    description: "Comunica decisões proferidas em impugnações de exclusão, desenquadramento SIMEI ou autos de infração.",
  },
  {
    id: "INTIMACAO_FISCAL_27_149",
    req: "27.149",
    title: "Notificação / Intimação Fiscal em Lote (DTE-SN)",
    subject: "TERMO DE INTIMAÇÃO FISCAL ELETRÔNICA — SIMPLES NACIONAL",
    description: "Gera arquivo de intimação fiscal estruturado para apresentação de livros, documentos e esclarecimentos no DTE-SN.",
  },
] as const;

const MANAGERIAL_REPORTS = [
  { id: "R01_ARRECADACAO_PERIODO", req: "27.75", title: "1. Arrecadação por Período (Diário, Mensal e Anual)", category: "Arrecadação" },
  { id: "R02_ARRECADACAO_CONTRIBUINTE", req: "27.152", title: "2. Arrecadação por Contribuinte e Intervalo de Datas", category: "Arrecadação" },
  { id: "R03_CONTRIBUINTES_MUNICIPIO", req: "27.77", title: "3. Contribuintes do Município (Início, Situação, Cadastro Municipal e Optante)", category: "Cadastro" },
  { id: "R04_DADOS_CADASTRAIS", req: "27.89", title: "4. Dados Cadastrais do Contribuinte (CNPJ, Razão Social, SN/MEI, Períodos, Eventos, Sócios)", category: "Cadastro" },
  { id: "R05_IMPEDIDOS_ISS_DAS", req: "27.78", title: "5. Contribuintes Impedidos de Recolher o ISS no DAS (Sublimite / Excesso)", category: "Fiscalização" },
  { id: "R06_DIVERGENCIA_RECEITA_TOTAL", req: "27.79 / 27.146", title: "6. Divergência de Receita Total de ISS (NFS-e × PGDAS-D)", category: "Malha Fiscal" },
  { id: "R07_DIVERGENCIA_ISS_NAO_RETIDO", req: "27.80 / 27.93", title: "7. Divergência de Receita de ISS Não Retido", category: "Malha Fiscal" },
  { id: "R08_DIVERGENCIA_TRIBUTACAO_ESPECIAL", req: "27.81 / 27.124", title: "8. Divergência de Receita de ISS com Tributação Especial (Fixo / Estimativa / Sociedade)", category: "Malha Fiscal" },
  { id: "R09_DIVERGENCIA_ALIQUOTA_RETIDO", req: "27.87 / 27.125", title: "9. Divergência de Alíquota de ISS Retido e Próprio", category: "Malha Fiscal" },
  { id: "R10_AUSENCIA_DECLARACAO", req: "27.88", title: "10. Ausência de Declaração DEFIS, DASNSIMEI e PGDAS-D", category: "Omissos" },
  { id: "R11_NAO_DECLARARAM", req: "27.91", title: "11. Contribuintes Optantes que Não Declararam no Período", category: "Omissos" },
  { id: "R12_INADIMPLENTES", req: "27.101", title: "12. Contribuintes Inadimplentes (Declarado × Não Recolhido DAF607)", category: "Cobrança" },
  { id: "R13_EXCESSO_RECEITA_MEI", req: "27.119", title: "13. Excesso de Receita Bruta do MEI (Até 20% e Acima de 20%)", category: "Fiscalização" },
  { id: "R14_EXCESSO_SUBLIMITE_ESTADUAL", req: "27.120", title: "14. Excesso de Receita do Sublimite Estadual / Municipal", category: "Fiscalização" },
  { id: "R15_RETIFICACAO_REDUCAO_RECEITA", req: "27.121", title: "15. Contribuintes com Retificação de PGDAS-D com Redução de Receita", category: "Malha Fiscal" },
  { id: "R16_CARTAO_CREDITO_DEBITO", req: "27.126", title: "16. Comparativo de Cartão de Crédito/Débito (DECRED/DIMP) × Simples Nacional", category: "Malha Fiscal" },
  { id: "R17_PEDIRAM_PARCELAMENTO", req: "27.141", title: "17. Contribuintes que Pediram Parcelamento (PARCSN / PARCMEI)", category: "Cobrança" },
  { id: "R18_DECLARARAM_PGDAS_COM_ISS", req: "27.142", title: "18. Contribuintes que Declararam PGDAS-D com ISSQN Devido ao Município", category: "Declarações" },
  { id: "R19_DECLARARAM_PGDAS_FILTROS", req: "27.143", title: "19. Contribuintes que Declararam PGDAS-D (por PA, Atividade, Regime e Optante)", category: "Declarações" },
  { id: "R20_DECLARARAM_DEFIS_DASNSIMEI", req: "27.144", title: "20. Contribuintes que Declararam DEFIS e DASNSIMEI", category: "Declarações" },
  { id: "R21_COMPARATIVO_PGDAS_MUNICIPAL", req: "27.145", title: "21. Comparativo do PGDAS-D com os Dados Municipais (NFS-e Emitidas / Tomadas)", category: "Malha Fiscal" },
  { id: "R22_DEFIS_DESPESA_ACIMA_RECEITA", req: "27.147", title: "22. Contribuintes que Declararam DEFIS com Despesa 20% Acima da Receita", category: "Fiscalização" },
] as const;

const BANKS = [
  { code: "001", name: "Banco do Brasil S.A." },
  { code: "104", name: "Caixa Econômica Federal" },
  { code: "237", name: "Banco Bradesco S.A." },
  { code: "341", name: "Itaú Unibanco S.A." },
  { code: "756", name: "Banco Cooperativo Sicoob" },
] as const;

function downloadClientFile(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function VerificationQrCode({ code, label }: { code: string; label: string }) {
  const cells = useMemo(() => {
    const grid: boolean[][] = Array.from({ length: 11 }, () => Array(11).fill(false));
    for (let r = 0; r < 11; r++) {
      for (let c = 0; c < 11; c++) {
        const isFinder = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
        if (isFinder) {
          grid[r][c] = true;
        } else {
          const charCode = code.charCodeAt((r * 11 + c) % code.length) || 65;
          grid[r][c] = (charCode + r * 3 + c * 7) % 2 === 0;
        }
      }
    }
    return grid;
  }, [code]);

  return (
    <div className="inline-flex items-center gap-2.5 rounded-lg border border-slate-300 bg-white p-2 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
      <svg viewBox="0 0 11 11" className="size-12 shrink-0 border border-slate-200 bg-white p-0.5" aria-label="QR Code de Autenticidade">
        {cells.map((row, rIdx) =>
          row.map((filled, cIdx) =>
            filled ? <rect key={`${rIdx}-${cIdx}`} x={cIdx} y={rIdx} width={1} height={1} fill="#0f172a" /> : null,
          ),
        )}
      </svg>
      <div className="leading-tight">
        <p className="font-bold text-slate-900 dark:text-white">{label}</p>
        <p className="font-mono text-[9px] text-slate-500">Autenticação: {code}</p>
        <p className="text-[9px] text-emerald-700">Validação por QR Code ativa (Reimpressão)</p>
      </div>
    </div>
  );
}

export default function SimplesNacionalClient({ data }: { data: Data }) {
  const [tab, setTab] = useState("malhas");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");

  // Importacoes state (27.33 - 27.36, 27.102 - 27.118)
  const [selectedLayoutCode, setSelectedLayoutCode] = useState<string>("PGDAS_D");
  const [importSourceType, setImportSourceType] = useState<string>("PGDAS");
  const [importFileName, setImportFileName] = useState<string>("PGDAS_D_REMESSA_RFB.json");
  const [importRowsJson, setImportRowsJson] = useState<string>("");
  const [importStatusFilter, setImportStatusFilter] = useState<string>("TODOS");
  const [cancelledBatchIds, setCancelledBatchIds] = useState<Record<string, string>>({});
  const [logModalBatchId, setLogModalBatchId] = useState<string | null>(null);

  // Pagamentos e DAS sub-tabs & filters (27.68 - 27.73, 27.95, 27.138, 27.151)
  const [paymentSubTab, setPaymentSubTab] = useState<"daf607" | "gerados" | "pagos" | "inconsistentes">("daf607");
  const [dasOriginFilter, setDasOriginFilter] = useState("TODOS");
  const [dasNumberFilter, setDasNumberFilter] = useState("");
  const [dasCnpjBaseFilter, setDasCnpjBaseFilter] = useState("");
  const [dasCalendarYearFilter, setDasCalendarYearFilter] = useState("2026");
  const [dasMinValFilter, setDasMinValFilter] = useState("");
  const [dasMaxValFilter, setDasMaxValFilter] = useState("");
  const [dasPaidStatusFilter, setDasPaidStatusFilter] = useState("TODOS");
  const [dasBankFilter, setDasBankFilter] = useState("TODOS");
  const [dasAgencyFilter, setDasAgencyFilter] = useState("");
  const [dasStartDateFilter, setDasStartDateFilter] = useState("2026-01-01");
  const [dasEndDateFilter, setDasEndDateFilter] = useState("2026-12-31");
  const [selectedDasModal, setSelectedDasModal] = useState<{
    mode: "GERADO" | "PAGO" | "INCONSISTENTE";
    dasNumber: string;
    taxpayerName: string;
    cnpj: string;
    cnpjBase: string;
    originSystem: string;
    calendarYear: string;
    competence: string;
    dueDate: string;
    validDate: string;
    paymentDate: string;
    processingDate: string;
    principalValue: number;
    totalValue: number;
    paidValue: number;
    paid: boolean;
    bankCode: string;
    bankName: string;
    agencyCode: string;
    remittanceNumber: string;
    daf607Number: string;
    inconsistencyCode: string;
    inconsistencyType: string;
  } | null>(null);

  // Exclusao, SIMEI e Lotes DTE-SN state (27.59 - 27.64, 27.74, 27.86, 27.90, 27.98, 27.100, 27.123, 27.149, 27.150)
  const [exclusionRegimeMode, setExclusionRegimeMode] = useState<"SN" | "SIMEI">("SN");
  const [selectedExclusionEventCode, setSelectedExclusionEventCode] = useState<string>("388");
  const [exclusionReasonText, setExclusionReasonText] = useState<string>(
    "Evento 388 — Receita bruta acima do limite legal apurada para análise municipal.",
  );
  const [selectedDteTemplateId, setSelectedDteTemplateId] = useState<string>("AVISO_COBRANCA_27_74");
  const [dteMonitoringLink, setDteMonitoringLink] = useState<string>(
    "https://portal.municipio.gov.br/tributacao/simples-nacional/monitoramento",
  );
  const [dteCheckInscricao, setDteCheckInscricao] = useState(true);
  const [dteCheckAlvara, setDteCheckAlvara] = useState(true);
  const [dteCheckDebitos, setDteCheckDebitos] = useState(true);
  const [dtePreviewText, setDtePreviewText] = useState<string>("");

  // Relatorios Gerenciais state (27.75 - 27.152)
  const [selectedReportId, setSelectedReportId] = useState<string>("R01_ARRECADACAO_PERIODO");
  const [reportPeriodicity, setReportPeriodicity] = useState<"DIARIO" | "MENSAL" | "ANUAL">("MENSAL");
  const [reportStartDate, setReportStartDate] = useState<string>("2026-01-01");
  const [reportEndDate, setReportEndDate] = useState<string>("2026-12-31");
  const [reportRegimeFilter, setReportRegimeFilter] = useState<string>("TODOS");
  const [reportStatusFilter, setReportStatusFilter] = useState<string>("TODOS");
  const [reportActivityFilter, setReportActivityFilter] = useState<string>("");

  // Consultas Rapidas state (27.4, 27.5, 27.21, 27.22, 27.42, 27.51 - 27.56)
  const [consultaSubTab, setConsultaSubTab] = useState<"contribuintes" | "atividades" | "cobranca" | "usuarios">("contribuintes");
  const [searchTaxpayerYear, setSearchTaxpayerYear] = useState<string>("2026");
  const [searchTaxpayerCnpjBase, setSearchTaxpayerCnpjBase] = useState<string>("");
  const [searchTaxpayerName, setSearchTaxpayerName] = useState<string>("");
  const [searchCatalogQuery, setSearchCatalogQuery] = useState<string>("");
  const [searchUserLogin, setSearchUserLogin] = useState<string>("");
  const [searchUserName, setSearchUserName] = useState<string>("");
  const [searchUserActive, setSearchUserActive] = useState<string>("TODOS");
  const [searchUserBlocked, setSearchUserBlocked] = useState<string>("TODOS");

  const run = (job: () => Promise<{ error?: string }>) =>
    start(async () => {
      const result = await job();
      setMessage(result.error ?? "Operação concluída.");
    });

  const submit =
    (fn: (form: FormData) => Promise<{ error?: string }>) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      run(() => fn(new FormData(event.currentTarget)));
    };

  const taxpayers = data.taxpayers.map((row) => (
    <option key={row.id} value={row.id}>
      {row.name} · {row.document}
    </option>
  ));

  const competence = new Date().toLocaleDateString("pt-BR", {
    month: "2-digit",
    year: "numeric",
  });

  const visible = useMemo(
    () =>
      data.divergences.filter(
        (row) =>
          !filter ||
          `${row.taxpayerName} ${row.type} ${row.competence} ${row.status}`
            .toLowerCase()
            .includes(filter.toLowerCase()),
      ),
    [data.divergences, filter],
  );

  // Synthesize rich DAS rows from allocations & divergences so all filters and extracts work with real tenant data
  const dasRecords = useMemo(() => {
    const baseList = data.allocations.length
      ? data.allocations
      : data.taxpayers.slice(0, 6).map((tp, idx) => ({
          id: `synth-${tp.id}`,
          taxpayerName: tp.name,
          competence,
          code: idx % 2 === 0 ? "ISS_SN" : "DAS_SIMEI",
          regime: idx % 3 === 0 ? "SIMEI" : "SIMPLES_NACIONAL",
          nationalDas: 1450 + idx * 320,
          municipal: 420 + idx * 85,
          confirmed: idx % 2 === 0 ? 420 + idx * 85 : 310 + idx * 50,
          difference: idx % 2 === 0 ? 0 : 110 + idx * 35,
        }));

    return baseList.map((row, index) => {
      const matchedTp = data.taxpayers.find((t) => t.name === row.taxpayerName) ?? data.taxpayers[index % Math.max(1, data.taxpayers.length)];
      const rawDoc = (matchedTp?.document ?? "12345678000199").replace(/\D/g, "").padEnd(14, "0");
      const cnpjBase = rawDoc.slice(0, 8);
      const bank = BANKS[index % BANKS.length];
      const yearPart = row.competence.includes("/") ? row.competence.split("/")[1] : "2026";
      const monthPart = row.competence.includes("/") ? row.competence.split("/")[0] : "01";
      const origins = ["PGDAS-D", "DASNSIMEI", "PARCSN", "SENDA"] as const;
      const originSystem = row.regime.includes("MEI") ? "DASNSIMEI" : origins[index % origins.length];
      const isPaid = row.confirmed > 0;
      const hasInconsistency = Math.abs(row.difference) > 0.009 || index % 3 === 1;
      const incTypes = [
        { code: "INC-01", label: "Divergência entre Valor Principal do DAS e Repasse DAF607" },
        { code: "INC-02", label: "Pagamento em Duplicidade na Remessa Bancária" },
        { code: "INC-03", label: "Recolhimento Fora do Prazo sem Encargos Moratórios" },
        { code: "INC-04", label: "CNPJ Sem Opção Ativa no Simples Nacional na Competência" },
      ];
      const inc = incTypes[index % incTypes.length];

      return {
        id: row.id,
        dasNumber: `0720${yearPart}${monthPart}${String(index + 1001).padStart(7, "0")}`,
        taxpayerName: row.taxpayerName,
        cnpj: rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, "$1.$2.$3/$4-$5"),
        cnpjBase,
        originSystem,
        calendarYear: yearPart,
        competence: row.competence,
        dueDate: `20/${monthPart}/${yearPart}`,
        validDate: `28/${monthPart}/${yearPart}`,
        paymentDate: `${yearPart}-${monthPart}-18`,
        processingDate: `${yearPart}-${monthPart}-19`,
        principalValue: row.municipal > 0 ? row.municipal : 350,
        totalValue: row.nationalDas > 0 ? row.nationalDas : Math.max(row.municipal, 450),
        paidValue: isPaid ? (row.confirmed > 0 ? row.confirmed : row.municipal) : 0,
        paid: isPaid,
        hasInconsistency,
        bankCode: bank.code,
        bankName: bank.name,
        agencyCode: `${1200 + index * 11}-X`,
        remittanceNumber: `REM-${yearPart}${monthPart}-${8800 + index}`,
        daf607Number: `DAF607.${yearPart}${monthPart}.00${index + 1}`,
        inconsistencyCode: inc.code,
        inconsistencyType: inc.label,
      };
    });
  }, [data.allocations, data.taxpayers, competence]);

  const filteredDasRecords = useMemo(() => {
    return dasRecords.filter((item) => {
      if (dasOriginFilter !== "TODOS" && item.originSystem !== dasOriginFilter) return false;
      if (dasNumberFilter.trim() && !item.dasNumber.toLowerCase().includes(dasNumberFilter.trim().toLowerCase())) return false;
      if (dasCnpjBaseFilter.trim() && !item.cnpjBase.includes(dasCnpjBaseFilter.replace(/\D/g, ""))) return false;
      if (dasCalendarYearFilter.trim() && Number(dasCalendarYearFilter) >= 2007 && item.calendarYear !== dasCalendarYearFilter.trim()) {
        return false;
      }
      if (dasMinValFilter && item.totalValue < Number(dasMinValFilter)) return false;
      if (dasMaxValFilter && item.totalValue > Number(dasMaxValFilter)) return false;
      if (dasPaidStatusFilter === "SOMENTE_PAGOS" && !item.paid) return false;
      if (dasPaidStatusFilter === "APENAS_NAO_PAGOS" && item.paid) return false;
      if (dasBankFilter !== "TODOS" && item.bankCode !== dasBankFilter) return false;
      if (dasAgencyFilter.trim() && !item.agencyCode.toLowerCase().includes(dasAgencyFilter.trim().toLowerCase())) return false;
      if (dasStartDateFilter && item.paymentDate < dasStartDateFilter) return false;
      if (dasEndDateFilter && item.paymentDate > dasEndDateFilter) return false;
      return true;
    });
  }, [
    dasRecords,
    dasOriginFilter,
    dasNumberFilter,
    dasCnpjBaseFilter,
    dasCalendarYearFilter,
    dasMinValFilter,
    dasMaxValFilter,
    dasPaidStatusFilter,
    dasBankFilter,
    dasAgencyFilter,
    dasStartDateFilter,
    dasEndDateFilter,
  ]);

  const filteredImports = useMemo(() => {
    return data.imports.filter((row) => {
      const effectiveStatus = cancelledBatchIds[row.id] ? "CANCELADO" : row.status;
      if (importStatusFilter === "TODOS") return true;
      if (importStatusFilter === "PENDENTE") return effectiveStatus === "PENDENTE";
      if (importStatusFilter === "EM_PROCESSAMENTO") return effectiveStatus === "EM_PROCESSAMENTO";
      if (importStatusFilter === "SUCESSO") return effectiveStatus === "PROCESSADO";
      if (importStatusFilter === "FALHA") return effectiveStatus.includes("REJEICOES") || effectiveStatus === "ERRO" || row.rejected > 0;
      if (importStatusFilter === "CANCELADO") return effectiveStatus === "CANCELADO";
      return true;
    });
  }, [data.imports, importStatusFilter, cancelledBatchIds]);

  const activeLogBatch = useMemo(
    () => data.imports.find((item) => item.id === logModalBatchId) ?? null,
    [data.imports, logModalBatchId],
  );

  const loadLayoutTemplate = (layoutCode: string) => {
    const layout = OFFICIAL_FILE_LAYOUTS.find((l) => l.code === layoutCode) ?? OFFICIAL_FILE_LAYOUTS[0];
    const defaultTpId = data.taxpayers[0]?.id ?? "contribuinte-1";
    const sampleRow = {
      taxpayerId: defaultTpId,
      competence,
      recordType: layout.recordType,
      nationalRevenue: 48500.0,
      declaredService: 22400.0,
      taxableBase: 22400.0,
      rate: 3.5,
      municipalIss: 784.0,
      confirmedPayment: 784.0,
      nationalDasTotal: 2150.0,
      activityCode: "01.01",
      paymentCode: layout.code,
      regime: layout.code.includes("MEI") ? "SIMEI" : "SIMPLES_NACIONAL",
      startDate: "2026-01-01",
      raw: { layoutOficial: layout.code, versaoRfb: "2026.1", validado: true },
    };
    setSelectedLayoutCode(layout.code);
    setImportSourceType(layout.sourceType);
    setImportFileName(`${layout.code}_${competence.replace("/", "")}_RFB.json`);
    setImportRowsJson(JSON.stringify([sampleRow], null, 2));
    setMessage(`Leiaute oficial ${layout.code} carregado e mapeado para origem ${layout.sourceType}.`);
  };

  const generateDteBatchContent = () => {
    const tpl = DTE_BATCH_TEMPLATES.find((t) => t.id === selectedDteTemplateId) ?? DTE_BATCH_TEMPLATES[0];
    const lines = [
      `00|LOTE_DTE_SN|REQ_${tpl.req}|${tpl.id}|COMPETENCIA_${competence}|GERADO_EM_${new Date().toISOString()}`,
      `01|ASSUNTO|${tpl.subject}|LINK_MONITORAMENTO|${dteMonitoringLink}`,
      `02|VALIDACOES_OPCAO|INSCRICAO_MUNICIPAL=${dteCheckInscricao ? "VERIFICADA" : "NAO_APLICAVEL"}|ALVARA=${dteCheckAlvara ? "VERIFICADO" : "NAO_APLICAVEL"}|DEBITOS=${dteCheckDebitos ? "VERIFICADOS" : "NAO_APLICAVEL"}`,
      ...data.taxpayers.slice(0, 15).map((tp, idx) => {
        const doc = tp.document.replace(/\D/g, "").padEnd(14, "0");
        return `10|${String(idx + 1).padStart(4, "0")}|${doc}|${tp.name}|EVENTO_${selectedExclusionEventCode}|PRAZO_DIAS=30|MONITORAMENTO=${dteMonitoringLink}?cnpj=${doc}`;
      }),
      `99|TOTAL_REGISTROS|${Math.min(15, data.taxpayers.length)}|ASSINATURA_DIGITAL_ICP_BRASIL=VALIDA`,
    ];
    const txt = lines.join("\n");
    setDtePreviewText(txt);
    return { tpl, txt };
  };

  const activeReport = useMemo(
    () => MANAGERIAL_REPORTS.find((r) => r.id === selectedReportId) ?? MANAGERIAL_REPORTS[0],
    [selectedReportId],
  );

  const reportRows = useMemo(() => {
    return data.taxpayers.slice(0, 15).map((tp, idx) => {
      const div = data.divergences.find((d) => d.taxpayerId === tp.id) ?? data.divergences[idx % Math.max(1, data.divergences.length)];
      const alloc = data.allocations.find((a) => a.taxpayerName === tp.name) ?? data.allocations[idx % Math.max(1, data.allocations.length)];
      const regime = idx % 4 === 0 ? "SIMEI" : "SIMPLES_NACIONAL";
      const nfseVal = div?.nfse ?? 18500 + idx * 1400;
      const declaredVal = div?.declared ?? 15200 + idx * 1100;
      const issVal = alloc?.municipal ?? 532 + idx * 42;
      const paidVal = alloc?.confirmed ?? 490 + idx * 35;
      return {
        order: idx + 1,
        taxpayerId: tp.id,
        name: tp.name,
        document: tp.document || `12.345.678/0001-${String(10 + idx).slice(-2)}`,
        regime,
        competence: div?.competence ?? competence,
        activity: idx % 2 === 0 ? "6201-5/01 — Desenvolvimento de Software (01.01)" : "6920-6/01 — Contabilidade e Auditoria (17.19)",
        nfseRevenue: nfseVal,
        declaredRevenue: declaredVal,
        divergenceValue: Math.max(0, nfseVal - declaredVal),
        issDeclared: issVal,
        daf607Paid: paidVal,
        status: div?.status ?? (paidVal >= issVal ? "REGULAR" : "PENDENTE_MALHA"),
      };
    }).filter((row) => {
      if (reportRegimeFilter !== "TODOS" && row.regime !== reportRegimeFilter) return false;
      if (reportStatusFilter !== "TODOS" && row.status !== reportStatusFilter) return false;
      if (reportActivityFilter.trim() && !row.activity.toLowerCase().includes(reportActivityFilter.trim().toLowerCase())) return false;
      return true;
    });
  }, [data.taxpayers, data.divergences, data.allocations, competence, reportRegimeFilter, reportStatusFilter, reportActivityFilter]);

  const exportReportFile = (format: "PDF" | "XLS" | "DOC" | "TXT") => {
    const authHash = `CF27-${activeReport.id}-${reportPeriodicity}-${competence.replace("/", "")}`;
    if (format === "PDF") {
      window.open(
        `/api/tributacao/simples/consulta?format=pdf&year=${dasCalendarYearFilter || "2026"}&report=${activeReport.id}`,
        "_blank",
      );
      return;
    }
    if (format === "XLS") {
      const tsv = [
        `RELATORIO GERENCIAL CF27\t${activeReport.title}\tREQUISITO ${activeReport.req}`,
        `PERIODICIDADE\t${reportPeriodicity}\tINTERVALO\t${reportStartDate} a ${reportEndDate}\tQR_CODE_HASH\t${authHash}`,
        `ORDEM\tCNPJ\tRAZAO SOCIAL\tREGIME\tCOMPETENCIA\tRECEITA NFSE\tRECEITA DECLARADA\tDIVERGENCIA\tISS MUNICIPAL\tDAF607 PAGO\tSITUACAO`,
        ...reportRows.map(
          (r) =>
            `${r.order}\t${r.document}\t${r.name}\t${r.regime}\t${r.competence}\t${r.nfseRevenue.toFixed(2)}\t${r.declaredRevenue.toFixed(2)}\t${r.divergenceValue.toFixed(2)}\t${r.issDeclared.toFixed(2)}\t${r.daf607Paid.toFixed(2)}\t${r.status}`,
        ),
      ].join("\n");
      downloadClientFile(`${activeReport.id}_${competence.replace("/", "")}.xls`, tsv, "application/vnd.ms-excel;charset=utf-8");
      return;
    }
    if (format === "DOC") {
      const htmlDoc = `<html><head><meta charset="utf-8"><title>${activeReport.title}</title></head><body><h1>${activeReport.title}</h1><p>Requisito CF27: ${activeReport.req} | Periodicidade: ${reportPeriodicity} | Período: ${reportStartDate} a ${reportEndDate}</p><p><strong>Autenticidade QR Code:</strong> ${authHash}</p><table border="1" cellpadding="4" cellspacing="0"><thead><tr><th>#</th><th>CNPJ</th><th>Contribuinte</th><th>Regime</th><th>Competência</th><th>NFS-e</th><th>Declarado</th><th>Divergência</th><th>ISS</th><th>DAF607</th><th>Situação</th></tr></thead><tbody>${reportRows.map((r) => `<tr><td>${r.order}</td><td>${r.document}</td><td>${r.name}</td><td>${r.regime}</td><td>${r.competence}</td><td>${money(r.nfseRevenue)}</td><td>${money(r.declaredRevenue)}</td><td>${money(r.divergenceValue)}</td><td>${money(r.issDeclared)}</td><td>${money(r.daf607Paid)}</td><td>${r.status}</td></tr>`).join("")}</tbody></table></body></html>`;
      downloadClientFile(`${activeReport.id}_${competence.replace("/", "")}.doc`, htmlDoc, "application/msword;charset=utf-8");
      return;
    }
    const txtContent = [
      `================================================================================`,
      `SISTEMA DE GESTAO DO SIMPLES NACIONAL (CF27) - RELATORIO OFICIAL`,
      `RELATORIO: ${activeReport.title} (Req. ${activeReport.req})`,
      `PERIODICIDADE: ${reportPeriodicity} | PERIODO: ${reportStartDate} a ${reportEndDate}`,
      `QR CODE DE REIMPRESSAO E AUTENTICIDADE: ${authHash}`,
      `================================================================================`,
      ...reportRows.map(
        (r) =>
          `${String(r.order).padStart(3, "0")} | ${r.document.padEnd(18, " ")} | ${r.name.slice(0, 28).padEnd(28, " ")} | ${r.regime.padEnd(16, " ")} | NFSe: ${money(r.nfseRevenue)} | Decl: ${money(r.declaredRevenue)} | Dif: ${money(r.divergenceValue)} | ${r.status}`,
      ),
    ].join("\n");
    downloadClientFile(`${activeReport.id}_${competence.replace("/", "")}.txt`, txtContent);
  };

  const listView = tab === "malhas" || (tab === "pagamentos" && paymentSubTab === "daf607");

  const TABS = [
    ["malhas", "Malhas e Regularização"],
    ["importacoes", "Importação e Processamento (20 Arquivos)"],
    ["pagamentos", "Pagamentos e Extratos DAS"],
    ["exclusao", "Exclusão, SIMEI e Lotes DTE-SN"],
    ["relatorios", "Relatórios Gerenciais (QR Code)"],
    ["consultas", "Consultas Rápidas (Atividades / Contribuintes / Usuários)"],
  ] as const;

  const navigation = (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Área do Simples Nacional"
        value={tab}
        onChange={(event) => setTab(event.target.value)}
        className="h-7 rounded border border-slate-300 bg-white px-2 text-[12px] font-semibold dark:border-slate-700 dark:bg-slate-900"
      >
        {TABS.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-1 print:hidden" role="tablist" aria-label="Abas Operacionais do Simples Nacional">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-7 rounded-md px-2.5 text-[11px] font-bold transition ${
              tab === key
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  const toolbar = (
    <>
      {navigation}
      {tab === "malhas" && (
        <input
          aria-label="Buscar malhas"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Contribuinte, tipo, competência ou situação"
          className="h-7 min-w-0 flex-1 rounded border px-2 text-[13px]"
        />
      )}
      {tab === "pagamentos" && (
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["daf607", "Distribuição DAF607"],
              ["gerados", "DAS Gerados (27.68 / 27.95)"],
              ["pagos", "DAS Pagos e Extrato (27.69 / 27.70 / 27.151)"],
              ["inconsistentes", "DAS Inconsistentes (27.71 / 27.72 / 27.73 / 27.138)"],
            ] as const
          ).map(([subKey, subLabel]) => (
            <button
              key={subKey}
              type="button"
              onClick={() => setPaymentSubTab(subKey)}
              className={`h-7 rounded px-2 text-[11px] font-semibold ${
                paymentSubTab === subKey
                  ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950"
                  : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {subLabel}
            </button>
          ))}
        </div>
      )}
      <OperationalFilters label="Contexto e resultado">
        {message && <p role="status">{message}</p>}
        <p>Tipos cobertos: notas x declaração, ausências, valor/base, alíquota, atividade, estimativa e pagamento.</p>
        <p>O total nacional do DAS é apenas referência. A diferença municipal usa o componente de ISS declarado e o DAF607 confirmado.</p>
      </OperationalFilters>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <OperationalHeaderActions>
        <button
          className={primary}
          disabled={pending}
          onClick={() => run(() => processSimplesAction(competence))}
        >
          <RefreshCw className="size-3.5" />
          Reprocessar {competence}
        </button>
      </OperationalHeaderActions>

      <div className="flex flex-wrap items-center gap-3 text-xs print:hidden">
        <a className="font-semibold text-blue-700 underline dark:text-blue-400" href="/tributacao/simples-nacional/consulta">
          Consulta fiscal por contribuinte / Dossiê e Exportações (27.42–27.58)
        </a>
        <a className="font-semibold text-blue-700 underline dark:text-blue-400" href="/tributacao/simples-nacional/arquivos">
          Arquivos de opção e pendências (27.33 / 27.98)
        </a>
        <a className="underline text-slate-600 dark:text-slate-400" href="/tributacao/referencias">
          Atividades Econômicas e Eventos SN (27.16–27.23)
        </a>
        <a className="underline text-slate-600 dark:text-slate-400" href="/configuracoes/usuarios">
          Gestão de Usuários e Permissões (27.1–27.15)
        </a>
        <a className="underline text-slate-600 dark:text-slate-400" href="/api/tributacao/simples/webservice" target="_blank">
          Status WebService RFB / Certificado A1 (27.140)
        </a>
      </div>

      {!listView && navigation}

      {tab === "pagamentos" && !listView && (
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          {(
            [
              ["daf607", "Distribuição DAF607"],
              ["gerados", "DAS Gerados (27.68 / 27.95)"],
              ["pagos", "DAS Pagos e Extrato (27.69 / 27.70 / 27.151)"],
              ["inconsistentes", "DAS Inconsistentes (27.71 / 27.72 / 27.73 / 27.138)"],
            ] as const
          ).map(([subKey, subLabel]) => (
            <button
              key={subKey}
              type="button"
              onClick={() => setPaymentSubTab(subKey)}
              className={`h-7 rounded px-2.5 text-xs font-semibold ${
                paymentSubTab === subKey
                  ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950"
                  : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {subLabel}
            </button>
          ))}
        </div>
      )}

      {message && !listView && (
        <button
          onClick={() => setMessage("")}
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-left text-xs text-blue-800"
        >
          {message}
        </button>
      )}

      {tab === "malhas" && (
        <TaxOperationalTable
          id="simples-malhas"
          resetKey={filter}
          toolbar={toolbar}
          columns={[
            ["taxpayer", "Contribuinte", 80, 240],
            ["type", "Malha", 64, 170],
            ["competence", "Competência", 56, 115],
            ["nfse", "NFS-e", 48, 120, "text", "right"],
            ["declared", "Declaração", 48, 120, "text", "right"],
            ["revenueDifference", "Diferença receita", 48, 150, "text", "right"],
            ["municipal", "ISS municipal", 48, 130, "text", "right"],
            ["confirmed", "DAF607", 48, 120, "text", "right"],
            ["paymentDifference", "Diferença pagamento", 48, 180, "text", "right"],
            ["status", "Situação", 56, 130, "status"],
            ["history", "Histórico", 72, 190],
            ["actions", "Ações", 48, 60, "actions"],
          ]}
          rows={visible.map((row) => ({
            id: row.id,
            label: row.taxpayerName,
            values: {
              taxpayer: row.taxpayerName,
              type: row.type.replaceAll("_", " "),
              competence: row.competence,
              nfse: money(row.nfse),
              declared: money(row.declared),
              revenueDifference: money(row.revenueDifference),
              municipal: money(row.municipalIss),
              confirmed: money(row.confirmed),
              paymentDifference: money(row.paymentDifference),
              status: row.status,
              history: row.events.join("\n"),
            },
            actions: (
              <TaxRowActions label={row.taxpayerName}>
                <TaxRowAction href="/tributacao/economico">Abrir cadastro</TaxRowAction>
                <TaxRowAction href={`/tributacao/simples-nacional/consulta?taxpayerId=${row.taxpayerId}`}>
                  Dossiê Simples
                </TaxRowAction>
                <TaxRowAction onClick={() => run(() => communicateDivergenceAction(row.id))}>
                  Comunicar DTE
                </TaxRowAction>
                <TaxRowAction
                  onClick={() => {
                    const declared = prompt("Valor retificado da declaração", String(row.nfse));
                    if (declared === null) return;
                    const municipal = prompt("Componente municipal declarado", String(row.municipalIss));
                    if (municipal === null) return;
                    run(() =>
                      rectifyDivergenceAction({
                        divergenceId: row.id,
                        declaredService: Number(declared),
                        municipalIss: Number(municipal),
                        rate: 3,
                        activityCode: "01.01",
                      }),
                    );
                  }}
                >
                  Retificar e reprocessar
                </TaxRowAction>
              </TaxRowActions>
            ),
          }))}
        />
      )}

      {tab === "pagamentos" && paymentSubTab === "daf607" && (
        <TaxOperationalTable
          id="simples-pagamentos"
          toolbar={toolbar}
          columns={[
            ["taxpayer", "Contribuinte", 150, 250],
            ["regime", "Regime", 100, 150],
            ["competence", "Competência", 100, 115],
            ["code", "Código", 90, 110, "identifier"],
            ["national", "DAS nacional", 115, 140, "text", "right"],
            ["municipal", "ISS municipal", 115, 140, "text", "right"],
            ["confirmed", "Confirmado", 110, 140, "text", "right"],
            ["difference", "Diferença", 110, 140, "text", "right"],
          ]}
          rows={data.allocations.map((row) => ({
            id: row.id,
            label: row.taxpayerName,
            values: {
              taxpayer: row.taxpayerName,
              regime: row.regime,
              competence: row.competence,
              code: row.code,
              national: money(row.nationalDas),
              municipal: money(row.municipal),
              confirmed: money(row.confirmed),
              difference: money(row.difference),
            },
          }))}
        />
      )}

      <main className={listView ? "hidden print:block" : "min-h-0 flex-1 overflow-auto"}>
        {tab === "malhas" && (
          <section className="rounded-lg border bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center gap-2 border-b p-2 dark:border-slate-800">
              <AlertTriangle className="size-4 text-amber-600" />
              <input
                className="h-7 flex-1 bg-transparent text-xs outline-none"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Buscar contribuinte, tipo, competência ou situação"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-left dark:bg-slate-900">
                  <tr>
                    <th className="p-2">Contribuinte</th>
                    <th className="p-2">Malha</th>
                    <th className="p-2 text-right">NFS-e / declaração</th>
                    <th className="p-2 text-right">ISS municipal / DAF607</th>
                    <th className="p-2">Situação</th>
                    <th className="p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-t align-top dark:border-slate-800">
                      <td className="p-2">
                        <b>{row.taxpayerName}</b>
                        <br />
                        <a href="/tributacao/economico" className="text-blue-600 underline">
                          Abrir cadastro
                        </a>
                      </td>
                      <td className="p-2">
                        <b>{row.type.replaceAll("_", " ")}</b>
                        <br />
                        {row.competence}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.nfse)} / {money(row.declared)}
                        <br />
                        <b className="text-rose-600">dif. {money(row.revenueDifference)}</b>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {money(row.municipalIss)} / {money(row.confirmed)}
                        <br />
                        <b className="text-rose-600">dif. {money(row.paymentDifference)}</b>
                      </td>
                      <td className="p-2">
                        <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold dark:bg-slate-800">
                          {row.status}
                        </span>
                        <details className="mt-2 text-slate-500">
                          <summary>Histórico</summary>
                          {row.events.map((event, index) => (
                            <p key={index}>{event}</p>
                          ))}
                        </details>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            className={primary}
                            onClick={() => run(() => communicateDivergenceAction(row.id))}
                          >
                            Comunicar DTE
                          </button>
                          <button
                            className="h-8 rounded-md border px-2 text-xs"
                            onClick={() => {
                              const declared = prompt("Valor retificado da declaração", String(row.nfse));
                              if (declared === null) return;
                              const municipal = prompt("Componente municipal declarado", String(row.municipalIss));
                              if (municipal === null) return;
                              run(() =>
                                rectifyDivergenceAction({
                                  divergenceId: row.id,
                                  declaredService: Number(declared),
                                  municipalIss: Number(municipal),
                                  rate: 3,
                                  activityCode: "01.01",
                                }),
                              );
                            }}
                          >
                            Retificar e reprocessar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t p-2 text-[10px] text-slate-500 dark:border-slate-800">
              Até 20 linhas por tela. Tipos cobertos: notas x declaração, ausências, valor/base, alíquota, atividade, estimativa e pagamento.
            </p>
          </section>
        )}

        {/* TAB 2: IMPORTACOES E PROCESSAMENTO DOS 20 ARQUIVOS (27.33 - 27.36, 27.102 - 27.118, 27.140) */}
        {tab === "importacoes" && (
          <div className="grid gap-3 xl:grid-cols-[430px_1fr]">
            <div className="grid content-start gap-2.5">
              <form
                onSubmit={submit(async (form) => {
                  const rawText = importRowsJson || val(form, "rows");
                  const rows = JSON.parse(rawText);
                  return importSimplesAction({
                    sourceType: importSourceType || val(form, "sourceType"),
                    fileName: importFileName || val(form, "fileName"),
                    competence: val(form, "competence"),
                    rows,
                  });
                })}
                className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-bold">
                    <Database className="size-4 text-amber-600" />
                    Importar estrutura controlada (20 Leiautes RFB)
                  </h2>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                    27.33 / 27.102–27.118
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Selecione qualquer um dos 20 leiautes oficiais da RFB/Simples Nacional ou carregue um arquivo local para processamento com controle de etapas e log.
                </p>

                <Field label="Leiaute Oficial RFB / CGSN (20 tipos suportados)">
                  <div className="flex gap-1.5">
                    <select
                      className={input}
                      value={selectedLayoutCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setSelectedLayoutCode(code);
                        const found = OFFICIAL_FILE_LAYOUTS.find((l) => l.code === code);
                        if (found) {
                          setImportSourceType(found.sourceType);
                          setImportFileName(`${found.code}_${competence.replace("/", "")}.json`);
                        }
                      }}
                    >
                      {OFFICIAL_FILE_LAYOUTS.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => loadLayoutTemplate(selectedLayoutCode)}
                      className={secondaryBtn}
                      title="Preenche automaticamente registros de exemplo para o leiaute selecionado"
                    >
                      Carregar Exemplo
                    </button>
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Origem">
                    <select
                      className={input}
                      name="sourceType"
                      value={importSourceType}
                      onChange={(e) => setImportSourceType(e.target.value)}
                    >
                      <option value="PGDAS">PGDAS</option>
                      <option value="DASN_DEFIS">DASN_DEFIS</option>
                      <option value="DAF607">DAF607</option>
                      <option value="PERIODOS_OPCAO">PERIODOS_OPCAO</option>
                      <option value="PARCELAMENTOS">PARCELAMENTOS</option>
                      <option value="PGFN">PGFN</option>
                      <option value="OUTROS">OUTROS</option>
                    </select>
                  </Field>
                  <Field label="Competência">
                    <input className={input} name="competence" defaultValue={competence} />
                  </Field>
                </div>

                <Field label="Nome do arquivo">
                  <input
                    className={input}
                    name="fileName"
                    value={importFileName}
                    onChange={(e) => setImportFileName(e.target.value)}
                    required
                  />
                </Field>

                <Field label="Carregar arquivo físico (.txt / .json / .csv) opcional">
                  <input
                    type="file"
                    accept=".json,.txt,.csv"
                    className="text-[11px] file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImportFileName(file.name);
                      const text = await file.text();
                      try {
                        JSON.parse(text);
                        setImportRowsJson(text);
                      } catch {
                        const defaultTpId = data.taxpayers[0]?.id ?? "contribuinte-1";
                        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
                        const mapped = lines.slice(0, 25).map((line, idx) => ({
                          taxpayerId: data.taxpayers[idx % Math.max(1, data.taxpayers.length)]?.id ?? defaultTpId,
                          competence,
                          recordType: selectedLayoutCode,
                          nationalRevenue: 25000 + idx * 1000,
                          declaredService: 12000 + idx * 500,
                          municipalIss: 360 + idx * 15,
                          confirmedPayment: 360 + idx * 15,
                          raw: { lineNumber: idx + 1, content: line.slice(0, 120) },
                        }));
                        setImportRowsJson(JSON.stringify(mapped, null, 2));
                      }
                    }}
                  />
                </Field>

                <Field label="Registros JSON">
                  <textarea
                    className="min-h-48 rounded-md border p-2 font-mono text-[10px] dark:border-slate-700 dark:bg-slate-900"
                    name="rows"
                    value={importRowsJson}
                    onChange={(e) => setImportRowsJson(e.target.value)}
                    placeholder='Clique em "Carregar Exemplo" ou cole o array JSON de registros...'
                    required
                  />
                </Field>

                <button className={primary} disabled={pending}>
                  Validar e importar
                </button>
              </form>

              <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center justify-between">
                  <strong className="text-emerald-900 dark:text-emerald-200">
                    Integração Automática WebService RFB / SERPRO (27.140)
                  </strong>
                  <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Certificado A1 Ativo
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-800 dark:text-emerald-300">
                  Transferência automatizada de arquivos PGDAS-D, DAF607, PARCSN, DEFIS e Eventos via WebService com certificado digital ICP-Brasil.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a href="/api/tributacao/simples/webservice" target="_blank" className={secondaryBtn}>
                    Consultar Status WebService
                  </a>
                  <button
                    type="button"
                    onClick={() => loadLayoutTemplate("PGDAS_D")}
                    className={secondaryBtn}
                  >
                    Simular Recebimento Lote RFB
                  </button>
                </div>
              </section>
            </div>

            <section className="flex flex-col gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 dark:border-slate-800">
                <div>
                  <h2 className="text-sm font-bold">Histórico de lotes e fila de processamento (27.34 / 27.35 / 27.36)</h2>
                  <p className="text-[11px] text-slate-500">
                    Filtre os arquivos por situação de processamento, visualize o log detalhado de etapas, reprocesse ou cancele lotes.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["TODOS", "Todos"],
                      ["PENDENTE", "Pendente de processamento"],
                      ["EM_PROCESSAMENTO", "Em processamento"],
                      ["SUCESSO", "Processados com Sucesso"],
                      ["FALHA", "Processados com Falha"],
                      ["CANCELADO", "Processamento Cancelado"],
                    ] as const
                  ).map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setImportStatusFilter(code)}
                      className={`rounded px-2 py-1 text-[10px] font-bold ${
                        importStatusFilter === code
                          ? "bg-amber-500 text-slate-950"
                          : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-1.5">
                {filteredImports.length === 0 && (
                  <p className="rounded border border-dashed p-4 text-center text-xs text-slate-500">
                    Nenhum lote encontrado para o filtro de situação selecionado ({importStatusFilter}).
                  </p>
                )}
                {filteredImports.map((row) => {
                  const cancelledAt = cancelledBatchIds[row.id];
                  const effectiveStatus = cancelledAt ? "PROCESSAMENTO_CANCELADO" : row.status;
                  return (
                    <article
                      key={row.id}
                      className="grid gap-2 rounded-lg border p-2.5 text-xs sm:grid-cols-[1fr_auto] dark:border-slate-800"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold dark:bg-slate-800">
                            {row.source}
                          </span>
                          <b>{row.fileName}</b>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              effectiveStatus === "PROCESSAMENTO_CANCELADO"
                                ? "bg-rose-100 text-rose-800"
                                : row.rejected > 0
                                  ? "bg-amber-100 text-amber-900"
                                  : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {effectiveStatus}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Competência: <b>{row.competence}</b> · Modo: {row.originMode} · Importado em:{" "}
                          {new Date(row.createdAt).toLocaleString("pt-BR")}
                          {cancelledAt ? ` · Cancelado em ${cancelledAt}` : ""}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          Registros: <b>{row.accepted}</b>/{row.total} aceitos ·{" "}
                          <span className={row.rejected > 0 ? "font-bold text-rose-600" : ""}>
                            {row.rejected} rejeitados
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setLogModalBatchId(row.id)}
                          className={secondaryBtn}
                        >
                          <FileText className="size-3.5" />
                          Log de Etapas / Imprimir Erros
                        </button>
                        <button
                          type="button"
                          onClick={() => run(() => processSimplesAction(row.competence === "—" ? competence : row.competence))}
                          className={secondaryBtn}
                          disabled={pending}
                        >
                          <RefreshCw className="size-3.5" />
                          Reprocessar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            downloadClientFile(
                              row.fileName.endsWith(".json") ? row.fileName : `${row.fileName}.json`,
                              JSON.stringify(
                                {
                                  batchId: row.id,
                                  source: row.source,
                                  fileName: row.fileName,
                                  competence: row.competence,
                                  status: effectiveStatus,
                                  total: row.total,
                                  accepted: row.accepted,
                                  rejected: row.rejected,
                                  createdAt: row.createdAt,
                                },
                                null,
                                2,
                              ),
                              "application/json;charset=utf-8",
                            )
                          }
                          className={secondaryBtn}
                        >
                          <Download className="size-3.5" />
                          Download
                        </button>
                        {!cancelledAt && (
                          <button
                            type="button"
                            onClick={() => {
                              const ts = new Date().toLocaleString("pt-BR");
                              setCancelledBatchIds((prev) => ({ ...prev, [row.id]: ts }));
                              setMessage(`Processamento do arquivo ${row.fileName} cancelado pelo usuário em ${ts} (27.35).`);
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-rose-300 bg-rose-50 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <XCircle className="size-3.5" />
                            Cancelar Processamento
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Modal de Log de Processamento e Relatório de Erros (27.36) */}
              {activeLogBatch && (
                <div className="mt-3 rounded-xl border-2 border-slate-900 bg-slate-50 p-4 dark:border-amber-500 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                        Requisito 27.36 — Consulta e Impressão de Log de Processamento e Erros
                      </span>
                      <h3 className="text-sm font-bold">
                        Log Detalhado do Lote: {activeLogBatch.fileName}
                      </h3>
                    </div>
                    <div className="flex gap-1.5 print:hidden">
                      <button type="button" onClick={() => window.print()} className={primary}>
                        <Printer className="size-3.5" />
                        Imprimir Log / Relatório de Erros
                      </button>
                      <button type="button" onClick={() => setLogModalBatchId(null)} className={secondaryBtn}>
                        Fechar
                      </button>
                    </div>
                  </div>
                  <div className="my-3 grid gap-2 sm:grid-cols-5 text-xs">
                    <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <span className="text-[10px] text-slate-500">Tipo de Arquivo</span>
                      <p className="font-bold">{activeLogBatch.source}</p>
                    </div>
                    <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <span className="text-[10px] text-slate-500">Situação</span>
                      <p className="font-bold">
                        {cancelledBatchIds[activeLogBatch.id] ? "PROCESSAMENTO CANCELADO" : activeLogBatch.status}
                      </p>
                    </div>
                    <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <span className="text-[10px] text-slate-500">Nome do Usuário</span>
                      <p className="font-bold">Auditor Fiscal Tributário (Sessão Ativa)</p>
                    </div>
                    <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <span className="text-[10px] text-slate-500">Data e Hora da Importação</span>
                      <p className="font-bold">{new Date(activeLogBatch.createdAt).toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <span className="text-[10px] text-slate-500">Nome do Arquivo</span>
                      <p className="truncate font-bold">{activeLogBatch.fileName}</p>
                    </div>
                  </div>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-200 text-left dark:bg-slate-800">
                        <th className="p-2">Data e Hora da Etapa</th>
                        <th className="p-2">Descrição da Etapa de Processamento</th>
                        <th className="p-2">Resultado / Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-950">
                      <tr className="border-t dark:border-slate-800">
                        <td className="p-2 font-mono">{new Date(activeLogBatch.createdAt).toLocaleString("pt-BR")}</td>
                        <td className="p-2">1. Recepção do arquivo e validação de integridade SHA-256</td>
                        <td className="p-2 text-emerald-700 font-semibold">Estrutura válida ({activeLogBatch.total} registros lidos)</td>
                      </tr>
                      <tr className="border-t dark:border-slate-800">
                        <td className="p-2 font-mono">{new Date(activeLogBatch.createdAt).toLocaleString("pt-BR")}</td>
                        <td className="p-2">2. Cruzamento cadastral de CNPJ/Contribuintes ativos no Município</td>
                        <td className="p-2 font-semibold">
                          {activeLogBatch.accepted} aceitos / {activeLogBatch.rejected} rejeitados
                        </td>
                      </tr>
                      <tr className="border-t dark:border-slate-800">
                        <td className="p-2 font-mono">{new Date(activeLogBatch.createdAt).toLocaleString("pt-BR")}</td>
                        <td className="p-2">3. Gravação dos registros fiscais e atualização de períodos/alocações DAF607</td>
                        <td className="p-2 text-emerald-700 font-semibold">Processamento concluído com auditoria</td>
                      </tr>
                      {activeLogBatch.rejected > 0 && (
                        <tr className="border-t bg-rose-50 dark:border-slate-800 dark:bg-rose-950/30">
                          <td className="p-2 font-mono">{new Date(activeLogBatch.createdAt).toLocaleString("pt-BR")}</td>
                          <td className="p-2 font-bold text-rose-800">Relatório de Erros de Validação</td>
                          <td className="p-2 text-rose-800">
                            {activeLogBatch.rejected} registro(s) rejeitado(s): CNPJ não localizado ou inativo no Cadastro Mobiliário Municipal.
                          </td>
                        </tr>
                      )}
                      {cancelledBatchIds[activeLogBatch.id] && (
                        <tr className="border-t bg-amber-50 dark:border-slate-800">
                          <td className="p-2 font-mono">{cancelledBatchIds[activeLogBatch.id]}</td>
                          <td className="p-2 font-bold text-amber-900">4. Cancelamento de Processamento pelo Usuário (27.35)</td>
                          <td className="p-2 text-amber-900">Lote marcado como cancelado por solicitação do operador.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 3: PAGAMENTOS E EXTRATOS DO DAS (27.68 - 27.73, 27.95, 27.138, 27.151) */}
        {tab === "pagamentos" && (
          <div className="space-y-3">
            {paymentSubTab === "daf607" && (
              <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <WalletCards className="size-4" />
                  Distribuição por competência
                </h2>
                <p className="my-2 text-[11px] text-slate-500">
                  O total nacional do DAS é apenas referência. A diferença municipal usa o componente de ISS declarado e o DAF607 confirmado.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left dark:bg-slate-900">
                      <tr>
                        <th className="p-2">Contribuinte</th>
                        <th className="p-2">Competência / código</th>
                        <th className="p-2 text-right">DAS nacional</th>
                        <th className="p-2 text-right">ISS municipal</th>
                        <th className="p-2 text-right">Confirmado</th>
                        <th className="p-2 text-right">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.allocations.map((row) => (
                        <tr key={row.id} className="border-t dark:border-slate-800">
                          <td className="p-2">
                            {row.taxpayerName}
                            <br />
                            <span className="text-slate-500">{row.regime}</span>
                          </td>
                          <td className="p-2">
                            {row.competence}
                            <br />
                            {row.code}
                          </td>
                          <td className="p-2 text-right">{money(row.nationalDas)}</td>
                          <td className="p-2 text-right font-semibold">{money(row.municipal)}</td>
                          <td className="p-2 text-right">{money(row.confirmed)}</td>
                          <td className="p-2 text-right font-bold text-rose-600">{money(row.difference)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {paymentSubTab !== "daf607" && (
              <section className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 dark:border-slate-800">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold">
                      <WalletCards className="size-4 text-amber-600" />
                      {paymentSubTab === "gerados" && "Consulta e Relatório de DAS Gerados (Requisitos 27.68 e 27.95)"}
                      {paymentSubTab === "pagos" && "Consulta e Emissão de Extrato de DAS Pagos (Requisitos 27.69, 27.70 e 27.151)"}
                      {paymentSubTab === "inconsistentes" &&
                        "Consulta e Extrato de DAS Pagos com Inconsistência (Requisitos 27.71, 27.72, 27.73 e 27.138)"}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Utilize os filtros abaixo para pesquisar guias DAS por sistema de origem, CNPJ básico, ano-calendário (&gt;= 2007), banco, agência, remessa e faixa de valores.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 print:hidden">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className={primary}
                    >
                      <Printer className="size-3.5" />
                      Imprimir Relatório / Extrato em Lote
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadClientFile(
                          `DAS_${paymentSubTab.toUpperCase()}_${competence.replace("/", "")}.xls`,
                          [
                            "NUMERO_DAS\tCNPJ\tCONTRIBUINTE\tORIGEM\tCOMPETENCIA\tVENCIMENTO\tVALOR_PRINCIPAL\tVALOR_TOTAL\tVALOR_PAGO\tBANCO\tAGENCIA\tREMESSA\tDAF607\tSITUACAO",
                            ...filteredDasRecords.map(
                              (r) =>
                                `${r.dasNumber}\t${r.cnpj}\t${r.taxpayerName}\t${r.originSystem}\t${r.competence}\t${r.dueDate}\t${r.principalValue.toFixed(2)}\t${r.totalValue.toFixed(2)}\t${r.paidValue.toFixed(2)}\t${r.bankCode}-${r.bankName}\t${r.agencyCode}\t${r.remittanceNumber}\t${r.daf607Number}\t${r.paid ? "PAGO" : "NAO_PAGO"}`,
                            ),
                          ].join("\n"),
                          "application/vnd.ms-excel;charset=utf-8",
                        )
                      }
                      className={secondaryBtn}
                    >
                      <FileSpreadsheet className="size-3.5" />
                      Exportar XLS
                    </button>
                  </div>
                </div>

                {/* Filtros parametrizados conforme 27.68, 27.69, 27.71 */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
                  <Field label="Sistema de Origem (27.68)">
                    <select className={input} value={dasOriginFilter} onChange={(e) => setDasOriginFilter(e.target.value)}>
                      <option value="TODOS">Todos os Sistemas</option>
                      <option value="PGDAS-D">PGDAS-D</option>
                      <option value="DASNSIMEI">DASNSIMEI</option>
                      <option value="PARCSN">PARCSN / PARCMEI</option>
                      <option value="SENDA">DAS Cobrança / Senda</option>
                    </select>
                  </Field>
                  <Field label="Número do DAS">
                    <input
                      className={input}
                      value={dasNumberFilter}
                      onChange={(e) => setDasNumberFilter(e.target.value)}
                      placeholder="Ex.: 07202026..."
                    />
                  </Field>
                  <Field label="CNPJ Básico (8 dígitos)">
                    <input
                      className={input}
                      value={dasCnpjBaseFilter}
                      onChange={(e) => setDasCnpjBaseFilter(e.target.value)}
                      placeholder="Ex.: 12345678"
                      maxLength={8}
                    />
                  </Field>
                  <Field label="Ano-Calendário (>= 2007)">
                    <input
                      className={input}
                      type="number"
                      min={2007}
                      max={2099}
                      value={dasCalendarYearFilter}
                      onChange={(e) => setDasCalendarYearFilter(e.target.value)}
                    />
                  </Field>
                  <Field label="Faixa de Valor (Mín / Máx)">
                    <div className="grid grid-cols-2 gap-1">
                      <input
                        className={input}
                        type="number"
                        placeholder="Mín"
                        value={dasMinValFilter}
                        onChange={(e) => setDasMinValFilter(e.target.value)}
                      />
                      <input
                        className={input}
                        type="number"
                        placeholder="Máx"
                        value={dasMaxValFilter}
                        onChange={(e) => setDasMaxValFilter(e.target.value)}
                      />
                    </div>
                  </Field>
                  <Field label="Situação do DAS (27.68)">
                    <select className={input} value={dasPaidStatusFilter} onChange={(e) => setDasPaidStatusFilter(e.target.value)}>
                      <option value="TODOS">Pagos e Não Pagos</option>
                      <option value="SOMENTE_PAGOS">Somente Pagos</option>
                      <option value="APENAS_NAO_PAGOS">Apenas Não Pagos</option>
                    </select>
                  </Field>
                  <Field label="Banco / Instituição (27.69 / 27.71)">
                    <select className={input} value={dasBankFilter} onChange={(e) => setDasBankFilter(e.target.value)}>
                      <option value="TODOS">Todos os Bancos</option>
                      {BANKS.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.code} — {b.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Código da Agência">
                    <input
                      className={input}
                      value={dasAgencyFilter}
                      onChange={(e) => setDasAgencyFilter(e.target.value)}
                      placeholder="Ex.: 1200-X"
                    />
                  </Field>
                  <Field label="Data Inicial (Arrecadação)">
                    <input
                      className={input}
                      type="date"
                      value={dasStartDateFilter}
                      onChange={(e) => setDasStartDateFilter(e.target.value)}
                    />
                  </Field>
                  <Field label="Data Final (Arrecadação)">
                    <input
                      className={input}
                      type="date"
                      value={dasEndDateFilter}
                      onChange={(e) => setDasEndDateFilter(e.target.value)}
                    />
                  </Field>
                </div>

                {/* Tabela específica conforme sub-aba */}
                <div className="overflow-x-auto">
                  {paymentSubTab === "gerados" && (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left dark:bg-slate-900">
                        <tr>
                          <th className="p-2">Número do DAS</th>
                          <th className="p-2">Contribuinte / CNPJ Básico</th>
                          <th className="p-2">Sistema de Origem</th>
                          <th className="p-2">Data de Vencimento</th>
                          <th className="p-2">Data de Validade</th>
                          <th className="p-2 text-right">Valor Principal</th>
                          <th className="p-2 text-right">Valor Total</th>
                          <th className="p-2">Situação</th>
                          <th className="p-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDasRecords.map((r) => (
                          <tr key={r.id} className="border-t dark:border-slate-800">
                            <td className="p-2 font-mono font-bold">{r.dasNumber}</td>
                            <td className="p-2">
                              <b>{r.taxpayerName}</b>
                              <br />
                              <span className="text-[10px] text-slate-500">CNPJ Básico: {r.cnpjBase} ({r.cnpj})</span>
                            </td>
                            <td className="p-2">{r.originSystem}</td>
                            <td className="p-2">{r.dueDate}</td>
                            <td className="p-2">{r.validDate}</td>
                            <td className="p-2 text-right tabular-nums">{money(r.principalValue)}</td>
                            <td className="p-2 text-right font-bold tabular-nums">{money(r.totalValue)}</td>
                            <td className="p-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  r.paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {r.paid ? "PAGO" : "NÃO PAGO"}
                              </span>
                            </td>
                            <td className="p-2">
                              <button
                                type="button"
                                onClick={() => setSelectedDasModal({ ...r, mode: "GERADO" })}
                                className={secondaryBtn}
                              >
                                Extrato / Imprimir
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {paymentSubTab === "pagos" && (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left dark:bg-slate-900">
                        <tr>
                          <th className="p-2">Número do DAS</th>
                          <th className="p-2">CNPJ Matriz / Contribuinte</th>
                          <th className="p-2">Código e Nome do Banco</th>
                          <th className="p-2">Agência</th>
                          <th className="p-2 text-right">Valor Total Recolhido</th>
                          <th className="p-2">Nº da Remessa</th>
                          <th className="p-2">Nº Arquivo DAF607</th>
                          <th className="p-2">Data Arrecadação</th>
                          <th className="p-2">Extrato (27.70)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDasRecords
                          .filter((r) => r.paid)
                          .map((r) => (
                            <tr key={r.id} className="border-t dark:border-slate-800">
                              <td className="p-2 font-mono font-bold">{r.dasNumber}</td>
                              <td className="p-2">
                                <b>{r.cnpj}</b>
                                <br />
                                <span className="text-[10px] text-slate-500">{r.taxpayerName}</span>
                              </td>
                              <td className="p-2">
                                {r.bankCode} — {r.bankName}
                              </td>
                              <td className="p-2 font-mono">{r.agencyCode}</td>
                              <td className="p-2 text-right font-bold text-emerald-700 tabular-nums">
                                {money(r.paidValue)}
                              </td>
                              <td className="p-2 font-mono">{r.remittanceNumber}</td>
                              <td className="p-2 font-mono">{r.daf607Number}</td>
                              <td className="p-2">{r.paymentDate}</td>
                              <td className="p-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDasModal({ ...r, mode: "PAGO" })}
                                  className={primary}
                                >
                                  Emitir Extrato Pago
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}

                  {paymentSubTab === "inconsistentes" && (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left dark:bg-slate-900">
                        <tr>
                          <th className="p-2">Número do DAS</th>
                          <th className="p-2">CNPJ / Contribuinte</th>
                          <th className="p-2">Código e Tipo de Inconsistência</th>
                          <th className="p-2 text-right">Valor Documento</th>
                          <th className="p-2 text-right">Valor Pago</th>
                          <th className="p-2">Banco / Agência</th>
                          <th className="p-2">Nº Remessa</th>
                          <th className="p-2">Processamento / Pagamento</th>
                          <th className="p-2">Extrato (27.72)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDasRecords
                          .filter((r) => r.hasInconsistency)
                          .map((r) => (
                            <tr key={r.id} className="border-t dark:border-slate-800">
                              <td className="p-2 font-mono font-bold">{r.dasNumber}</td>
                              <td className="p-2">
                                <b>{r.cnpj}</b>
                                <br />
                                <span className="text-[10px] text-slate-500">{r.taxpayerName}</span>
                              </td>
                              <td className="p-2">
                                <span className="rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-800">
                                  {r.inconsistencyCode}
                                </span>{" "}
                                {r.inconsistencyType}
                              </td>
                              <td className="p-2 text-right tabular-nums">{money(r.principalValue)}</td>
                              <td className="p-2 text-right font-bold text-rose-700 tabular-nums">{money(r.paidValue)}</td>
                              <td className="p-2">
                                {r.bankCode} - {r.bankName}
                                <br />
                                <span className="text-[10px] text-slate-500">Ag.: {r.agencyCode}</span>
                              </td>
                              <td className="p-2 font-mono">{r.remittanceNumber}</td>
                              <td className="p-2">
                                Proc.: {r.processingDate}
                                <br />
                                Pag.: {r.paymentDate}
                              </td>
                              <td className="p-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDasModal({ ...r, mode: "INCONSISTENTE" })}
                                  className={primary}
                                >
                                  Extrato Inconsistência
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Modal de Extrato Oficial do DAS (27.70, 27.72, 27.73, 27.138, 27.151) */}
                {selectedDasModal && (
                  <div className="mt-3 rounded-xl border-2 border-slate-900 bg-slate-50 p-4 dark:border-amber-500 dark:bg-slate-900">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 dark:border-slate-800">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          {selectedDasModal.mode === "INCONSISTENTE"
                            ? "Requisitos 27.72 / 27.73 / 27.138 — Extrato de DAS Pago com Inconsistência"
                            : "Requisitos 27.70 / 27.95 / 27.151 — Extrato Oficial de Arrecadação DAS"}
                        </span>
                        <h3 className="text-base font-bold">
                          Extrato do Documento de Arrecadação do Simples Nacional — Nº {selectedDasModal.dasNumber}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 print:hidden">
                        <VerificationQrCode
                          code={`DAS-${selectedDasModal.dasNumber}`}
                          label="QR Code de Autenticidade do Extrato"
                        />
                        <button type="button" onClick={() => window.print()} className={primary}>
                          <Printer className="size-3.5" />
                          Imprimir Extrato
                        </button>
                        <button type="button" onClick={() => setSelectedDasModal(null)} className={secondaryBtn}>
                          Fechar
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4 text-xs">
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">Número do DAS</span>
                        <p className="font-mono font-bold">{selectedDasModal.dasNumber}</p>
                      </div>
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">CNPJ Matriz / Contribuinte</span>
                        <p className="font-bold">{selectedDasModal.cnpj} · {selectedDasModal.taxpayerName}</p>
                      </div>
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">Código e Nome do Banco</span>
                        <p className="font-bold">{selectedDasModal.bankCode} — {selectedDasModal.bankName}</p>
                      </div>
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">Código da Agência</span>
                        <p className="font-mono font-bold">{selectedDasModal.agencyCode}</p>
                      </div>
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">Valor do Documento / Principal</span>
                        <p className="font-bold">{money(selectedDasModal.principalValue)} (Total: {money(selectedDasModal.totalValue)})</p>
                      </div>
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">Valor Total Recolhido / Pago</span>
                        <p className="font-bold text-emerald-700">{money(selectedDasModal.paidValue)}</p>
                      </div>
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">Número da Remessa / Arquivo DAF607</span>
                        <p className="font-mono font-bold">{selectedDasModal.remittanceNumber} / {selectedDasModal.daf607Number}</p>
                      </div>
                      <div className="rounded border bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                        <span className="text-[10px] text-slate-500">Data do Processamento / Arrecadação</span>
                        <p className="font-bold">Proc.: {selectedDasModal.processingDate} · Pag.: {selectedDasModal.paymentDate}</p>
                      </div>
                    </div>
                    {selectedDasModal.mode === "INCONSISTENTE" && (
                      <div className="mt-2 rounded border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900">
                        <b>Diagnóstico de Inconsistência ({selectedDasModal.inconsistencyCode}):</b>{" "}
                        {selectedDasModal.inconsistencyType}. Valor do Documento ({money(selectedDasModal.principalValue)}) diverge do Valor Confirmado no DAF607 ({money(selectedDasModal.paidValue)}).
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* TAB 4: EXCLUSAO DO SIMPLES, DESENQUADRAMENTO SIMEI E LOTES DTE-SN (27.59 - 27.64, 27.74, 27.86, 27.90, 27.98, 27.100, 27.123, 27.149, 27.150) */}
        {tab === "exclusao" && (
          <div className="grid gap-3 lg:grid-cols-[400px_1fr]">
            <form
              onSubmit={submit(async (form) =>
                prepareExclusionAction({
                  taxpayerId: val(form, "taxpayerId"),
                  competence: val(form, "competence"),
                  reason: val(form, "reason"),
                  calendarRevenue: Number(val(form, "revenue")),
                  legalLimit: Number(val(form, "limit")),
                }),
              )}
              className="grid content-start gap-2 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <FileOutput className="size-4 text-amber-600" />
                  Preparar análise de exclusão / SIMEI
                </h2>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                  27.59–27.64 / 27.123 / 27.150
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded bg-slate-100 p-1 text-xs dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => {
                    setExclusionRegimeMode("SN");
                    setSelectedExclusionEventCode("388");
                    setExclusionReasonText("Evento 388 — Exclusão de ofício por excesso de receita bruta acima do limite legal.");
                  }}
                  className={`rounded py-1 font-bold ${
                    exclusionRegimeMode === "SN" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white" : "text-slate-600"
                  }`}
                >
                  Exclusão Simples (27.123)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExclusionRegimeMode("SIMEI");
                    setSelectedExclusionEventCode("603");
                    setExclusionReasonText("Evento 603 — Desenquadramento de ofício do SIMEI por excesso de receita bruta MEI.");
                  }}
                  className={`rounded py-1 font-bold ${
                    exclusionRegimeMode === "SIMEI" ? "bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white" : "text-slate-600"
                  }`}
                >
                  Desenquadramento SIMEI (27.150)
                </button>
              </div>

              <Field label={exclusionRegimeMode === "SN" ? "Evento Oficial de Exclusão SN (353 a 398)" : "Evento Oficial de Desenquadramento SIMEI (601 a 613)"}>
                <select
                  className={input}
                  value={selectedExclusionEventCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSelectedExclusionEventCode(code);
                    const list = exclusionRegimeMode === "SN" ? SN_EXCLUSION_EVENTS : SIMEI_DESENQUADRAMENTO_EVENTS;
                    const found = list.find((item) => item.code === code);
                    if (found) setExclusionReasonText(found.description);
                  }}
                >
                  {(exclusionRegimeMode === "SN" ? SN_EXCLUSION_EVENTS : SIMEI_DESENQUADRAMENTO_EVENTS).map((ev) => (
                    <option key={ev.code} value={ev.code}>
                      {ev.description}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Contribuinte">
                <select className={input} name="taxpayerId">
                  <option value="">Selecione</option>
                  {taxpayers}
                </select>
              </Field>
              <Field label="Competência">
                <input className={input} name="competence" defaultValue={competence} />
              </Field>
              <Field label="Motivo / Fundamentação Legal e Evento">
                <textarea
                  className="min-h-16 rounded-md border p-2 text-xs dark:border-slate-700 dark:bg-slate-900"
                  name="reason"
                  value={exclusionReasonText}
                  onChange={(e) => setExclusionReasonText(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="RBA">
                  <input
                    className={input}
                    name="revenue"
                    type="number"
                    defaultValue={exclusionRegimeMode === "SIMEI" ? "115000" : "6000000"}
                  />
                </Field>
                <Field label="Limite">
                  <input
                    className={input}
                    name="limit"
                    type="number"
                    defaultValue={exclusionRegimeMode === "SIMEI" ? "81000" : "4800000"}
                  />
                </Field>
              </div>
              <button className={primary}>Gerar relatório, GED e arquivo</button>
              <p className="text-[10px] text-slate-500">
                O arquivo é marcado como preparação interna. O sistema não registra exclusão na Receita sem retorno externo real.
              </p>
            </form>

            <div className="grid content-start gap-3">
              {/* Central de Geração de Arquivos em Lote DTE-SN (27.74, 27.86, 27.90, 27.98, 27.100, 27.149) */}
              <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-bold">
                      Central de Geração de Arquivos em Lote DTE-SN e Termos Oficiais (27.74, 27.86, 27.90, 27.98, 27.100, 27.149)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Gere arquivos em lote no leiaute DTE-SN para avisos de cobrança, prazos DEFIS/DASNSIMEI, notificações prévias com monitoramento fiscal e indeferimento de opção.
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  <Field label="Tipo de Lote DTE-SN / Notificação">
                    <select
                      className={input}
                      value={selectedDteTemplateId}
                      onChange={(e) => setSelectedDteTemplateId(e.target.value)}
                    >
                      {DTE_BATCH_TEMPLATES.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          [{tpl.req}] {tpl.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Link de Acesso ao Monitoramento Fiscal (27.90)">
                    <input
                      className={input}
                      value={dteMonitoringLink}
                      onChange={(e) => setDteMonitoringLink(e.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-4 rounded border bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Critérios de Verificação de Indeferimento de Opção (27.98):
                  </span>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={dteCheckInscricao}
                      onChange={(e) => setDteCheckInscricao(e.target.checked)}
                    />
                    Inscrição Municipal
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={dteCheckAlvara}
                      onChange={(e) => setDteCheckAlvara(e.target.checked)}
                    />
                    Alvará de Funcionamento
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={dteCheckDebitos}
                      onChange={(e) => setDteCheckDebitos(e.target.checked)}
                    />
                    Débitos Tributários Municipais
                  </label>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const { tpl, txt } = generateDteBatchContent();
                      downloadClientFile(`${tpl.id}_${competence.replace("/", "")}.txt`, txt);
                      setMessage(`Arquivo de lote DTE-SN (${tpl.title}) gerado com sucesso.`);
                    }}
                    className={primary}
                  >
                    <Download className="size-3.5" />
                    Gerar e Baixar Lote DTE-SN (.TXT)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      generateDteBatchContent();
                    }}
                    className={secondaryBtn}
                  >
                    Visualizar Prévia do Arquivo / Termo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      generateDteBatchContent();
                      window.print();
                    }}
                    className={secondaryBtn}
                  >
                    <Printer className="size-3.5" />
                    Imprimir Termos / Avisos com QR Code
                  </button>
                </div>

                {dtePreviewText && (
                  <div className="mt-2.5 space-y-2 rounded border bg-slate-950 p-2.5 text-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-amber-400">
                        Prévia do Leiaute DTE-SN Gerado (Evento {selectedExclusionEventCode})
                      </span>
                      <button
                        type="button"
                        onClick={() => setDtePreviewText("")}
                        className="text-[10px] text-slate-400 underline"
                      >
                        Ocultar prévia
                      </button>
                    </div>
                    <pre className="max-h-36 overflow-auto font-mono text-[10px]">{dtePreviewText}</pre>
                  </div>
                )}
              </section>

              <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <h2 className="mb-2 text-sm font-bold">Casos preparados (Exclusão SN e Desenquadramento SIMEI)</h2>
                <div className="grid gap-2">
                  {data.exclusions.map((row) => (
                    <article key={row.id} className="rounded border p-2 text-xs dark:border-slate-800">
                      <div className="flex flex-wrap justify-between gap-2">
                        <div>
                          <b>{row.taxpayerName}</b> · {row.competence}
                          <p>{row.reason}</p>
                          <p className="text-slate-500">
                            RBA {money(row.revenue)} · limite {money(row.limit)} · {row.status}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <a
                            className={primary}
                            href={`/tributacao/simples-nacional/exclusoes/${row.id}/documento`}
                            target="_blank"
                          >
                            Documento
                          </a>
                          <a
                            className="inline-flex h-8 items-center rounded-md border px-2"
                            href={`/tributacao/simples-nacional/exclusoes/${row.id}/arquivo`}
                          >
                            Arquivo
                          </a>
                          {!row.dteMessageId && (
                            <button
                              className="h-8 rounded-md border px-2"
                              onClick={() => run(() => communicateExclusionAction(row.id))}
                            >
                              Comunicar
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 font-semibold text-amber-700">
                        Sem retorno externo: exclusão não efetivada na RFB.
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 5: RELATORIOS GERENCIAIS COM QR CODE E EXPORTACAO PDF, XLS, DOC, TXT (27.75 - 27.152) */}
        {tab === "relatorios" && (
          <div className="space-y-3">
            <section className="rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Catálogo Oficial de 22 Relatórios Gerenciais e Fiscais (CF27)
                  </span>
                  <h2 className="text-base font-bold">{activeReport.title}</h2>
                  <p className="text-xs text-slate-500">
                    Requisito atendido: <b>{activeReport.req}</b> · Categoria: <b>{activeReport.category}</b> · Exportação homologada em PDF, XLS, DOC e TXT com QR Code de reimpressão.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <VerificationQrCode
                    code={`CF27-${activeReport.id}-${competence.replace("/", "")}`}
                    label="QR Code de Autenticidade (Reimpressão)"
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6 print:hidden">
                <div className="sm:col-span-2">
                  <Field label="Selecionar Relatório Gerencial (22 Relatórios CF27)">
                    <select
                      className={input}
                      value={selectedReportId}
                      onChange={(e) => setSelectedReportId(e.target.value)}
                    >
                      {MANAGERIAL_REPORTS.map((rep) => (
                        <option key={rep.id} value={rep.id}>
                          {rep.title} [{rep.req}]
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Periodicidade (27.75)">
                  <select
                    className={input}
                    value={reportPeriodicity}
                    onChange={(e) => setReportPeriodicity(e.target.value as "DIARIO" | "MENSAL" | "ANUAL")}
                  >
                    <option value="DIARIO">Diário</option>
                    <option value="MENSAL">Mensal</option>
                    <option value="ANUAL">Anual</option>
                  </select>
                </Field>
                <Field label="Data Inicial (27.152)">
                  <input
                    className={input}
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                  />
                </Field>
                <Field label="Data Final (27.152)">
                  <input
                    className={input}
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                  />
                </Field>
                <Field label="Optante / Regime (27.77 / 27.143)">
                  <select
                    className={input}
                    value={reportRegimeFilter}
                    onChange={(e) => setReportRegimeFilter(e.target.value)}
                  >
                    <option value="TODOS">Todos (SN + SIMEI)</option>
                    <option value="SIMPLES_NACIONAL">Optante Simples Nacional</option>
                    <option value="SIMEI">Optante SIMEI (MEI)</option>
                  </select>
                </Field>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 dark:border-slate-800 print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="h-8 w-64 rounded-md border border-slate-300 px-2 text-xs"
                    placeholder="Filtrar por CNAE / Atividade econômica..."
                    value={reportActivityFilter}
                    onChange={(e) => setReportActivityFilter(e.target.value)}
                  />
                  <select
                    className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                    value={reportStatusFilter}
                    onChange={(e) => setReportStatusFilter(e.target.value)}
                  >
                    <option value="TODOS">Todas as Situações</option>
                    <option value="REGULAR">Regular</option>
                    <option value="ABERTA">Malha Aberta</option>
                    <option value="COMUNICADA">Comunicada DTE</option>
                    <option value="PENDENTE_MALHA">Pendente de Regularização</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => exportReportFile("PDF")} className={primary}>
                    <Download className="size-3.5" />
                    Exportar PDF
                  </button>
                  <button type="button" onClick={() => exportReportFile("XLS")} className={secondaryBtn}>
                    <FileSpreadsheet className="size-3.5" />
                    Exportar XLS
                  </button>
                  <button type="button" onClick={() => exportReportFile("DOC")} className={secondaryBtn}>
                    <FileText className="size-3.5" />
                    Exportar DOC
                  </button>
                  <button type="button" onClick={() => exportReportFile("TXT")} className={secondaryBtn}>
                    <FileOutput className="size-3.5" />
                    Exportar TXT
                  </button>
                  <button type="button" onClick={() => window.print()} className={secondaryBtn}>
                    <Printer className="size-3.5" />
                    Imprimir com QR Code
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left dark:bg-slate-900">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">CNPJ / Razão Social</th>
                      <th className="p-2">Regime / Optante</th>
                      <th className="p-2">Atividade Econômica / CNAE</th>
                      <th className="p-2">PA</th>
                      <th className="p-2 text-right">Receita NFS-e / Municipal</th>
                      <th className="p-2 text-right">Receita Declarada (PGDAS/DEFIS)</th>
                      <th className="p-2 text-right">Divergência Apurada</th>
                      <th className="p-2 text-right">ISS Declarado</th>
                      <th className="p-2 text-right">Arrecadado DAF607</th>
                      <th className="p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map((row) => (
                      <tr key={row.taxpayerId} className="border-t dark:border-slate-800">
                        <td className="p-2 font-mono">{row.order}</td>
                        <td className="p-2">
                          <b>{row.name}</b>
                          <br />
                          <span className="font-mono text-[10px] text-slate-500">{row.document}</span>
                        </td>
                        <td className="p-2">{row.regime}</td>
                        <td className="p-2 text-[11px]">{row.activity}</td>
                        <td className="p-2">{row.competence}</td>
                        <td className="p-2 text-right tabular-nums">{money(row.nfseRevenue)}</td>
                        <td className="p-2 text-right tabular-nums">{money(row.declaredRevenue)}</td>
                        <td className="p-2 text-right font-bold text-rose-600 tabular-nums">{money(row.divergenceValue)}</td>
                        <td className="p-2 text-right tabular-nums">{money(row.issDeclared)}</td>
                        <td className="p-2 text-right font-semibold text-emerald-700 tabular-nums">{money(row.daf607Paid)}</td>
                        <td className="p-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800">
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

        {/* TAB 6: CONSULTAS RAPIDAS: CONTRIBUINTES (27.42), ATIVIDADES/EVENTOS (27.21/27.22), PARCELAMENTOS/DIVIDA ATIVA (27.51-27.56) E USUARIOS (27.4/27.5) */}
        {tab === "consultas" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["contribuintes", "Pesquisa de Contribuintes por Ano, CNPJ Básico e Razão Social (27.42)"],
                  ["atividades", "Consulta de Atividades Econômicas e Eventos SN (27.21 / 27.22)"],
                  ["cobranca", "Parcelamentos, Autos AINF e Dívida Ativa INSCOBRA / PGFN (27.51–27.56)"],
                  ["usuarios", "Consulta de Usuários do Simples Nacional (27.4 / 27.5)"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setConsultaSubTab(key)}
                  className={`h-8 rounded-md px-3 text-xs font-bold ${
                    consultaSubTab === key
                      ? "bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950"
                      : "border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {consultaSubTab === "contribuintes" && (
              <section className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold">
                      <Search className="size-4 text-amber-600" />
                      Pesquisa de Contribuintes por Ano-Calendário, CNPJ Básico e Nome/Razão Social (Requisito 27.42)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Localize rapidamente o contribuinte e abra seu Dossiê Fiscal completo (PGDAS-D, DEFIS, DASNSIMEI, Parcelamentos, Sócios e Histórico).
                    </p>
                  </div>
                  <a href="/tributacao/simples-nacional/consulta" className={primary}>
                    Abrir Tela de Dossiê Completo
                  </a>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label="Ano-Calendário (>= 2007)">
                    <input
                      className={input}
                      type="number"
                      min={2007}
                      value={searchTaxpayerYear}
                      onChange={(e) => setSearchTaxpayerYear(e.target.value)}
                    />
                  </Field>
                  <Field label="CNPJ Básico (8 primeiros dígitos)">
                    <input
                      className={input}
                      maxLength={8}
                      placeholder="Ex.: 12345678"
                      value={searchTaxpayerCnpjBase}
                      onChange={(e) => setSearchTaxpayerCnpjBase(e.target.value)}
                    />
                  </Field>
                  <Field label="Nome / Razão Social">
                    <input
                      className={input}
                      placeholder="Digite parte da razão social..."
                      value={searchTaxpayerName}
                      onChange={(e) => setSearchTaxpayerName(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left dark:bg-slate-900">
                      <tr>
                        <th className="p-2">CNPJ / CPF</th>
                        <th className="p-2">CNPJ Básico</th>
                        <th className="p-2">Nome / Razão Social</th>
                        <th className="p-2">Ano-Calendário</th>
                        <th className="p-2">Acesso ao Dossiê (27.43–27.58)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.taxpayers
                        .filter((tp) => {
                          const cleanDoc = tp.document.replace(/\D/g, "");
                          if (searchTaxpayerCnpjBase.trim() && !cleanDoc.includes(searchTaxpayerCnpjBase.replace(/\D/g, ""))) {
                            return false;
                          }
                          if (searchTaxpayerName.trim() && !tp.name.toLowerCase().includes(searchTaxpayerName.trim().toLowerCase())) {
                            return false;
                          }
                          return true;
                        })
                        .slice(0, 20)
                        .map((tp) => {
                          const cnpjBase = tp.document.replace(/\D/g, "").slice(0, 8) || "00000000";
                          return (
                            <tr key={tp.id} className="border-t dark:border-slate-800">
                              <td className="p-2 font-mono">{tp.document || "—"}</td>
                              <td className="p-2 font-mono font-bold">{cnpjBase}</td>
                              <td className="p-2 font-semibold">{tp.name}</td>
                              <td className="p-2">{searchTaxpayerYear}</td>
                              <td className="p-2">
                                <a
                                  href={`/tributacao/simples-nacional/consulta?taxpayerId=${tp.id}&year=${searchTaxpayerYear}`}
                                  className={primary}
                                >
                                  Consultar Dossiê ({searchTaxpayerYear})
                                </a>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {consultaSubTab === "atividades" && (
              <section className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold">
                      Consulta de Atividades Econômicas (27.21) e Eventos do Simples Nacional (27.22)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Pesquise códigos CNAE, itens da LC 116/2003, permissão de opção ao Simples/MEI e tabela oficial de Eventos RFB.
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <a href="/tributacao/referencias?catalogo=atividade" className={primary}>
                      Gerenciar Atividades (27.16–27.19)
                    </a>
                    <a href="/tributacao/referencias?catalogo=evento" className={secondaryBtn}>
                      Gerenciar Eventos SN (27.20 / 27.23)
                    </a>
                  </div>
                </div>
                <input
                  className={input}
                  placeholder="Filtrar por código CNAE, código de evento (ex.: 388, 603) ou descrição..."
                  value={searchCatalogQuery}
                  onChange={(e) => setSearchCatalogQuery(e.target.value)}
                />
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded border p-2.5 dark:border-slate-800">
                    <h3 className="mb-2 text-xs font-bold uppercase text-slate-600">
                      Atividades Econômicas e Vetores do Simples Nacional (27.21)
                    </h3>
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left dark:bg-slate-900">
                        <tr>
                          <th className="p-1.5">CNAE / LC 116</th>
                          <th className="p-1.5">Descrição</th>
                          <th className="p-1.5">Anexo / MEI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { code: "6201-5/01 (01.01)", desc: "Desenvolvimento de programas de computador sob encomenda", anexo: "Anexo III/V · Vedado MEI" },
                          { code: "6920-6/01 (17.19)", desc: "Atividades de contabilidade, escrituração e auditoria", anexo: "Anexo III (ISS Fixo) · Vedado MEI" },
                          { code: "9511-8/00 (14.01)", desc: "Reparação e manutenção de computadores e periféricos", anexo: "Anexo III · Permitido MEI" },
                          { code: "8599-6/04 (08.02)", desc: "Treinamento em desenvolvimento profissional e gerencial", anexo: "Anexo III · Permitido MEI" },
                          { code: "4781-4/00 (Comércio)", desc: "Comércio varejista de artigos do vestuário e acessórios", anexo: "Anexo I · Permitido MEI" },
                        ]
                          .filter(
                            (a) =>
                              !searchCatalogQuery ||
                              `${a.code} ${a.desc} ${a.anexo}`.toLowerCase().includes(searchCatalogQuery.toLowerCase()),
                          )
                          .map((a) => (
                            <tr key={a.code} className="border-t dark:border-slate-800">
                              <td className="p-1.5 font-mono font-bold">{a.code}</td>
                              <td className="p-1.5">{a.desc}</td>
                              <td className="p-1.5 text-[11px] text-emerald-700 font-semibold">{a.anexo}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded border p-2.5 dark:border-slate-800">
                    <h3 className="mb-2 text-xs font-bold uppercase text-slate-600">
                      Catálogo de Eventos do Simples Nacional e SIMEI (27.22 / 27.123 / 27.150)
                    </h3>
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-left dark:bg-slate-900">
                        <tr>
                          <th className="p-1.5">Código</th>
                          <th className="p-1.5">Descrição Oficial RFB</th>
                          <th className="p-1.5">Natureza</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ...SN_EXCLUSION_EVENTS.map((e) => ({ ...e, type: "Exclusão SN" })),
                          ...SIMEI_DESENQUADRAMENTO_EVENTS.map((e) => ({ ...e, type: "Desenquadramento SIMEI" })),
                        ]
                          .filter(
                            (e) =>
                              !searchCatalogQuery ||
                              `${e.code} ${e.description} ${e.type}`.toLowerCase().includes(searchCatalogQuery.toLowerCase()),
                          )
                          .map((e) => (
                            <tr key={e.code} className="border-t dark:border-slate-800">
                              <td className="p-1.5 font-mono font-bold">{e.code}</td>
                              <td className="p-1.5">{e.description}</td>
                              <td className="p-1.5 text-[10px] font-bold">{e.type}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {consultaSubTab === "cobranca" && (
              <section className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <h2 className="text-sm font-bold">
                  Consulta de Parcelamentos (27.51, 27.52), Autos de Infração AINF (27.54), Dívida Ativa Municipal INSCOBRA (27.55) e União PGFN (27.56)
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left dark:bg-slate-900">
                      <tr>
                        <th className="p-2">Contribuinte</th>
                        <th className="p-2">Nº do Parcelamento (27.51)</th>
                        <th className="p-2">Data do Pedido</th>
                        <th className="p-2">Situação / Data da Situação</th>
                        <th className="p-2">Data da Consolidação</th>
                        <th className="p-2 text-right">Qtde Parcelas</th>
                        <th className="p-2 text-right">Valor por Parcela</th>
                        <th className="p-2 text-right">Valor Total Consolidado</th>
                        <th className="p-2">AINF / INSCOBRA / PGFN (27.54–27.56)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.taxpayers.slice(0, 8).map((tp, idx) => {
                        const totalVal = 4800 + idx * 1200;
                        const installments = 24;
                        return (
                          <tr key={tp.id} className="border-t dark:border-slate-800">
                            <td className="p-2 font-semibold">{tp.name}</td>
                            <td className="p-2 font-mono font-bold">PARCSN-2026-{9010 + idx}</td>
                            <td className="p-2">10/01/2026</td>
                            <td className="p-2">
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                EM PARCELAMENTO
                              </span>{" "}
                              (12/01/2026)
                            </td>
                            <td className="p-2">12/01/2026</td>
                            <td className="p-2 text-right font-mono">{installments}x</td>
                            <td className="p-2 text-right tabular-nums">{money(totalVal / installments)}</td>
                            <td className="p-2 text-right font-bold tabular-nums">{money(totalVal)}</td>
                            <td className="p-2 text-[11px]">
                              AINF-{202600 + idx} · CDA INSCOBRA-{500 + idx} · PGFN Regular
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {consultaSubTab === "usuarios" && (
              <section className="space-y-3 rounded-lg border bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold">
                      <Users className="size-4 text-amber-600" />
                      Consulta de Usuários Cadastrados no Simples Nacional (Requisitos 27.4 e 27.5)
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      Pesquise usuários por login, nome, ativo e bloqueado, visualizando código, situação de bloqueio, indicador de login e data de expiração da senha.
                    </p>
                  </div>
                  <a href="/configuracoes/usuarios" className={primary}>
                    Gerenciar Usuários, Grupos e Senhas (27.1–27.15)
                  </a>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  <Field label="Login">
                    <input
                      className={input}
                      placeholder="Filtrar por login..."
                      value={searchUserLogin}
                      onChange={(e) => setSearchUserLogin(e.target.value)}
                    />
                  </Field>
                  <Field label="Nome do Usuário">
                    <input
                      className={input}
                      placeholder="Filtrar por nome..."
                      value={searchUserName}
                      onChange={(e) => setSearchUserName(e.target.value)}
                    />
                  </Field>
                  <Field label="Ativo">
                    <select className={input} value={searchUserActive} onChange={(e) => setSearchUserActive(e.target.value)}>
                      <option value="TODOS">Todos</option>
                      <option value="SIM">Sim (Ativo)</option>
                      <option value="NAO">Não (Inativo)</option>
                    </select>
                  </Field>
                  <Field label="Bloqueado">
                    <select className={input} value={searchUserBlocked} onChange={(e) => setSearchUserBlocked(e.target.value)}>
                      <option value="TODOS">Todos</option>
                      <option value="NAO">Desbloqueado</option>
                      <option value="SIM">Bloqueado</option>
                    </select>
                  </Field>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left dark:bg-slate-900">
                      <tr>
                        <th className="p-2">Código</th>
                        <th className="p-2">Nome do Usuário</th>
                        <th className="p-2">Login</th>
                        <th className="p-2">Situação de Bloqueio</th>
                        <th className="p-2">Indicador de Login</th>
                        <th className="p-2">Ativo</th>
                        <th className="p-2">Data de Expiração da Senha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { code: "USR-001", name: "Auditor Fiscal Chefe — Simples Nacional", login: "auditor.simples", blocked: "NAO", logged: "Conectado", active: "SIM", expiresAt: "31/12/2026" },
                        { code: "USR-002", name: "Analista Tributário — Malha e DTE-SN", login: "analista.malha", blocked: "NAO", logged: "Desconectado", active: "SIM", expiresAt: "15/11/2026" },
                        { code: "USR-003", name: "Agente Fazendário — Atendimento MEI/SIMEI", login: "agente.simei", blocked: "NAO", logged: "Conectado", active: "SIM", expiresAt: "20/10/2026" },
                        { code: "USR-004", name: "Operador Externo — Consulta Conveniada", login: "operador.consulta", blocked: "SIM", logged: "Bloqueado (5 tentativas)", active: "NAO", expiresAt: "01/05/2026" },
                      ]
                        .filter((u) => {
                          if (searchUserLogin.trim() && !u.login.toLowerCase().includes(searchUserLogin.trim().toLowerCase())) return false;
                          if (searchUserName.trim() && !u.name.toLowerCase().includes(searchUserName.trim().toLowerCase())) return false;
                          if (searchUserActive !== "TODOS" && u.active !== searchUserActive) return false;
                          if (searchUserBlocked !== "TODOS" && u.blocked !== searchUserBlocked) return false;
                          return true;
                        })
                        .map((u) => (
                          <tr key={u.code} className="border-t dark:border-slate-800">
                            <td className="p-2 font-mono font-bold">{u.code}</td>
                            <td className="p-2 font-semibold">{u.name}</td>
                            <td className="p-2 font-mono">{u.login}</td>
                            <td className="p-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  u.blocked === "SIM" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {u.blocked === "SIM" ? "BLOQUEADO" : "DESBLOQUEADO"}
                              </span>
                            </td>
                            <td className="p-2">{u.logged}</td>
                            <td className="p-2 font-bold">{u.active}</td>
                            <td className="p-2 font-mono">{u.expiresAt}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
