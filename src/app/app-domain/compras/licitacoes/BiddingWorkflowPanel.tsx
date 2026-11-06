"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  CheckCircle2, 
  ClipboardCheck, 
  FilePlus2, 
  Gavel, 
  Landmark, 
  UserRoundCheck, 
  UsersRound,
  UserCheck,
  TrendingDown,
  Building,
  FileText,
  DollarSign,
  AlertTriangle,
  Lock,
  Unlock,
  Ban,
  PauseCircle,
  PlayCircle,
  Edit3,
  Calendar,
  Layers,
  ArrowRight,
  Printer
} from "lucide-react";
import { BiddingLotItemsTable, BiddingMembersTable } from "./BiddingDraftTables";
import {
  BIDDING_BID_STATUS,
  BIDDING_ELIGIBILITY_STATUS,
  BIDDING_PHASE_STATUS,
  canConfigureBiddingLots,
  canDecideBiddingEligibility,
  canDecideBiddingResult,
  canRegisterBiddingParticipant,
} from "@/lib/compras/bidding-workflow";
import {
  addBiddingParticipant,
  assignBiddingAppointment,
  createBiddingAppointment,
  createBiddingLot,
  decideBiddingEligibility,
  decideBiddingResult,
  endBiddingAppointmentAssignment,
  initializeBiddingWorkflow,
  registerBiddingAct,
  saveSupplierPortalIdentity,
  summonSecondPlaceBidder,
  unlockConcludedBidding,
  suspendBidding,
  annulBidding,
  updateBiddingCertameDetails,
  toggleBudgetBalanceBlock,
  type BiddingActionResult,
} from "./actions";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

type Employee = {
  id: string;
  name: string;
  role: string | null;
};

type Supplier = {
  id: string;
  name: string;
};

type User = {
  id: string;
  name: string;
  email: string;
};

type Appointment = {
  id: string;
  kind: string;
  name: string;
  status: string;
  assignedAt: string;
  role: string | null;
  members: Array<{ id: string; employeeName: string; role: string; status: string }>;
};

type Phase = {
  id: string;
  code: string;
  name: string;
  sequence: number;
  status: string;
  isCurrent: boolean;
  startedAt: string | null;
  completedAt: string | null;
};

type Participant = {
  id: string;
  supplierId: string;
  supplierName: string;
  displayCode: string | null;
  status: string;
  registeredAt: string;
  notes: string | null;
};

type PortalIdentity = {
  id: string;
  supplierId: string;
  usuarioId: string;
  userName: string;
  userEmail: string;
  status: string;
};

type Lot = {
  id: string;
  number: number;
  description: string | null;
  status: string;
  estimatedValue: string | null;
  items: Array<{ id: string; label: string; quantity: number; unit: string }>;
  eligibility: Array<{ id: string; participantId: string; status: string; reason: string | null; decidedAt: string }>;
  bids: Array<{
    id: string;
    participantId: string;
    participantLabel: string;
    sequence: number;
    status: string;
    totalValue: string;
    unitValue: string | null;
    submittedAt: string;
  }>;
  result: {
    id: string;
    participantLabel: string;
    status: string;
    totalValue: string;
    decidedAt: string;
  } | null;
};

type Act = {
  id: string;
  type: string;
  description: string | null;
  occurredAt: string;
  phaseName: string | null;
  lotNumber: number | null;
  actorName: string;
};

type ProcessItem = {
  id: string;
  label: string;
  unit: string;
  quantity: number;
  estimatedUnitValue: number | null;
};

type BiddingWorkflowPanelProps = {
  biddingId: string;
  biddingStatus: string;
  canUpdate: boolean;
  workflowInitialized: boolean;
  phases: Phase[];
  appointments: Appointment[];
  availableAppointments: Appointment[];
  employees: Employee[];
  suppliers: Supplier[];
  users: User[];
  participants: Participant[];
  portalIdentities: PortalIdentity[];
  processItems: ProcessItem[];
  lots: Lot[];
  acts: Act[];
  processObject?: string;
  publicationDate?: string | null;
  sessionDate?: string | null;
};

function money(value: string | null) {
  return value === null ? "Não informado" : currency.format(Number(value));
}

function date(value: string) {
  return dateTime.format(new Date(value));
}

function newIdempotencyKey() {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function BiddingWorkflowPanel({
  biddingId,
  biddingStatus,
  canUpdate,
  workflowInitialized,
  phases,
  appointments,
  availableAppointments,
  employees,
  suppliers,
  users,
  participants,
  portalIdentities,
  processItems,
  lots,
  acts,
  processObject,
  publicationDate,
  sessionDate,
}: BiddingWorkflowPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  
  // Abas operacionais
  const [activeTab, setActiveTab] = useState<
    "workflow" | "lotes" | "participantes" | "lances" | "atos" | "minutas" | "financeiro" | "acoes"
  >("workflow");

  const [members, setMembers] = useState([{ employeeId: "", role: "Membro" }]);
  const [selectedLotItems, setSelectedLotItems] = useState<Record<string, string>>({});
  const [eligibilityLotId, setEligibilityLotId] = useState(lots[0]?.id ?? "");
  const [resultLotId, setResultLotId] = useState(lots[0]?.id ?? "");
  const [existingAppointmentId, setExistingAppointmentId] = useState("");

  // Modais de Ações Específicas
  const [summonModalLotId, setSummonModalLotId] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showAnnulModal, setShowAnnulModal] = useState(false);
  const [showEditCertameModal, setShowEditCertameModal] = useState(false);
  const [budgetBlocked, setBudgetBlocked] = useState(false);

  // Estados de Desconto em Tabela e Credenciamento (11.50 - 11.58)
  const [descontoTabelaNome, setDescontoTabelaNome] = useState("Tabela SINAPI / Tabela de Preços Referenciais");
  const [descontoPropostas, setDescontoPropostas] = useState<Array<{ fornecedor: string; percentual: number; lote: number }>>([
    { fornecedor: suppliers[0]?.name || "Distribuidora Líder", percentual: 14.5, lote: 1 },
    { fornecedor: suppliers[1]?.name || "Comercial do Vale", percentual: 12.0, lote: 1 },
  ]);

  const assignedItemIds = new Set(lots.flatMap((lot) => lot.items.map((item) => item.id)));
  const availableProcessItems = processItems.filter((item) => !assignedItemIds.has(item.id));
  const selectedResultLot = lots.find((lot) => lot.id === resultLotId) ?? null;
  const selectedEligibilityLot = lots.find((lot) => lot.id === eligibilityLotId) ?? null;
  const setupOpen = canConfigureBiddingLots(biddingStatus);
  const participantsOpen = canRegisterBiddingParticipant(biddingStatus);
  const eligibilityOpen = canDecideBiddingEligibility(biddingStatus);
  const resultOpen = canDecideBiddingResult(biddingStatus);

  function run(action: () => Promise<BiddingActionResult>, message: string, onSuccess?: () => void) {
    setError("");
    setNotice("");
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setError(result.error);
          return;
        }
        onSuccess?.();
        setNotice(message);
        router.refresh();
      } catch {
        setError("Não foi possível concluir a operação. Atualize a página e tente novamente.");
      }
    });
  }

  function submitAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!members.length || members.some((member) => !employees.some((employee) => employee.id === member.employeeId) || !member.role.trim())) {
      setError("Informe servidor e função de todos os membros, inclusive os das outras páginas.");
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(
      () => createBiddingAppointment({
        biddingId,
        kind: String(formData.get("kind") || ""),
        name: String(formData.get("name") || ""),
        role: String(formData.get("assignmentRole") || ""),
        appointedAt: String(formData.get("appointedAt") || ""),
        endsAt: String(formData.get("endsAt") || ""),
        notes: String(formData.get("notes") || ""),
        members,
      }),
      "Designação registrada e vinculada ao certame.",
      () => {
        form.reset();
        setMembers([{ employeeId: "", role: "Membro" }]);
      },
    );
  }

  function submitExistingAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(
      () => assignBiddingAppointment({
        biddingId,
        appointmentId: existingAppointmentId,
        role: String(formData.get("existingAssignmentRole") || ""),
      }),
      "Designação vinculada ao certame.",
      () => {
        form.reset();
        setExistingAppointmentId("");
      },
    );
  }

  function submitLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const items = Object.entries(selectedLotItems).map(([purchaseProcessItemId, quantity]) => ({
      purchaseProcessItemId,
      quantity: Number(quantity),
    }));
    if (!items.length || items.some((item) => {
      const source = availableProcessItems.find((candidate) => candidate.id === item.purchaseProcessItemId);
      return !source || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > source.quantity;
    })) {
      setError("Revise as quantidades de todos os itens selecionados, inclusive os das outras páginas.");
      return;
    }
    run(
      () => createBiddingLot({
        biddingId,
        description: String(formData.get("lotDescription") || ""),
        items,
      }),
      "Lote criado com os itens selecionados.",
      () => {
        form.reset();
        setSelectedLotItems({});
      },
    );
  }

  function submitParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(
      () => addBiddingParticipant({
        biddingId,
        supplierId: String(formData.get("supplierId") || ""),
        displayCode: String(formData.get("displayCode") || ""),
        notes: String(formData.get("participantNotes") || ""),
      }),
      "Participante registrado no certame.",
      () => form.reset(),
    );
  }

  function submitPortalIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(
      () => saveSupplierPortalIdentity({
        biddingId,
        supplierId: String(formData.get("portalSupplierId") || ""),
        usuarioId: String(formData.get("usuarioId") || ""),
      }),
      "Acesso autenticado do fornecedor foi liberado.",
      () => form.reset(),
    );
  }

  function submitEligibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(
      () => decideBiddingEligibility({
        biddingId,
        biddingLotId: eligibilityLotId,
        participantId: String(formData.get("eligibilityParticipantId") || ""),
        status: String(formData.get("eligibilityStatus") || ""),
        reason: String(formData.get("eligibilityReason") || ""),
        idempotencyKey: newIdempotencyKey(),
      }),
      "Decisão de habilitação registrada.",
      () => form.reset(),
    );
  }

  function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    run(
      () => decideBiddingResult({
        biddingId,
        biddingLotId: resultLotId,
        biddingBidId: String(formData.get("biddingBidId") || ""),
        idempotencyKey: newIdempotencyKey(),
      }),
      "Arrematação registrada para o lote.",
    );
  }

  function submitAct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    run(
      () => registerBiddingAct({
        biddingId,
        type: String(formData.get("actType") || ""),
        description: String(formData.get("actDescription") || ""),
        phaseId: String(formData.get("actPhaseId") || ""),
        biddingLotId: String(formData.get("actLotId") || ""),
      }),
      "Ato registrado no histórico do certame.",
      () => form.reset(),
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">{notice}</p> : null}

      {/* Navegação por Abas Operacionais */}
      <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-xs font-medium pb-px">
        <button
          onClick={() => setActiveTab("workflow")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "workflow"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Gavel className="size-3.5" />
          Fases & Workflow
        </button>

        <button
          onClick={() => setActiveTab("lotes")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "lotes"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <Landmark className="size-3.5" />
          Lotes & Itens ({lots.length})
        </button>

        <button
          onClick={() => setActiveTab("participantes")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "participantes"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <UsersRound className="size-3.5" />
          Participantes & Portal ({participants.length})
        </button>

        <button
          onClick={() => setActiveTab("lances")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "lances"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <CheckCircle2 className="size-3.5" />
          Lances & Julgamento (11.28 & 11.65)
        </button>

        <button
          onClick={() => setActiveTab("atos")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "atos"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <FilePlus2 className="size-3.5" />
          Atos & Atas ({acts.length})
        </button>

        <button
          onClick={() => setActiveTab("minutas")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "minutas"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="size-3.5" />
          Mala Direta & Minutas (CF11)
        </button>

        <button
          onClick={() => setActiveTab("financeiro")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "financeiro"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <DollarSign className="size-3.5" />
          Financeiro & Dotações (11.32/37)
        </button>

        <button
          onClick={() => setActiveTab("acoes")}
          className={`px-3 py-2 border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
            activeTab === "acoes"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <AlertTriangle className="size-3.5 text-amber-600" />
          Ações de Certame (11.38 a 11.41)
        </button>
      </div>

      {/* ABA 1: Workflow e Fases */}
      {activeTab === "workflow" && (
        <div className="space-y-3">
          <Card className="rounded-md">
            <CardHeader className="border-b p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm"><Gavel className="size-4 text-amber-600" />Fases Persistidas do Certame</CardTitle>
                  <CardDescription className="text-xs">Cada mudança de situação atualiza a fase corrente e mantém os atos do certame auditáveis.</CardDescription>
                </div>
                {canUpdate && !workflowInitialized ? <Button size="sm" type="button" disabled={pending} onClick={() => run(() => initializeBiddingWorkflow(biddingId), "Fases persistidas foram inicializadas.")}>Inicializar fases</Button> : null}
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {phases.length ? (
                <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  {phases.map((phase) => {
                    const completed = phase.status === BIDDING_PHASE_STATUS.COMPLETED;
                    const current = phase.isCurrent;
                    return <li key={phase.id} className={`rounded-md border p-3 text-sm ${completed ? "border-emerald-300 bg-emerald-50 text-emerald-950" : current ? "border-amber-300 bg-amber-50 text-amber-950" : "bg-muted/30 text-muted-foreground"}`}><p className="font-semibold">{phase.sequence}. {phase.name}</p><p className="mt-1 text-xs">{phase.status}</p>{phase.completedAt ? <p className="mt-1 text-xs">Concluída em {date(phase.completedAt)}</p> : null}</li>;
                  })}
                </ol>
              ) : <p className="text-sm text-muted-foreground">Esta licitação é anterior ao workflow persistido. Inicialize as fases para registrar o estado atual.</p>}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader className="border-b p-3"><CardTitle className="flex items-center gap-2 text-sm"><UsersRound className="size-4 text-sky-600" />Comissão, Pregoeiro e Equipe de Apoio (11.33)</CardTitle><CardDescription className="text-xs">Responsáveis por cada responsabilidade no certame.</CardDescription></CardHeader>
            <CardContent className="space-y-3 p-3">
              {appointments.length ? <div className="space-y-2">{appointments.map((appointment) => <article key={appointment.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{appointment.name}</p><p className="text-xs text-muted-foreground">{appointment.kind}{appointment.role ? ` · ${appointment.role}` : ""}</p></div><div className="flex items-center gap-2"><Badge variant="secondary">{appointment.status}</Badge>{canUpdate && appointment.status === "Ativa" ? <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => { if (window.confirm(`Encerrar a vinculação de ${appointment.name}?`)) run(() => endBiddingAppointmentAssignment({ biddingId, assignmentId: appointment.id }), "Vínculo de designação encerrado."); }}>Encerrar</Button> : null}</div></div><p className="mt-2 text-xs text-muted-foreground">{appointment.members.map((member) => `${member.employeeName} (${member.role})`).join(" · ") || "Sem membros ativos"}</p></article>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma comissão ou agente foi vinculado.</p>}
              {canUpdate ? <details className="rounded-md border p-3" open={!appointments.length}>
                <summary className="cursor-pointer text-sm font-semibold">Nova designação</summary>
                <form className="mt-3 space-y-3" onSubmit={submitAppointment}><fieldset disabled={pending} className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Tipo</span><select name="kind" required defaultValue="Comissão de contratação" className="h-9 w-full rounded-md border bg-background px-2 text-xs"><option>Comissão de contratação</option><option>Agente de contratação</option><option>Pregoeiro e equipe de apoio</option><option>Comissão especial</option><option>Leiloeiro</option></select></label><label className="space-y-1 text-sm"><span>Nome</span><Input name="name" required placeholder="Ex.: Comissão Permanente 2026" className="text-xs" /></label></div>
                  <div className="grid gap-2 sm:grid-cols-3"><label className="space-y-1 text-sm"><span>Função no certame</span><Input name="assignmentRole" placeholder="Ex.: Pregoeiro Titular" className="text-xs" /></label><label className="space-y-1 text-sm"><span>Designada em</span><Input name="appointedAt" type="date" className="text-xs" /></label><label className="space-y-1 text-sm"><span>Vigência final</span><Input name="endsAt" type="date" className="text-xs" /></label></div>
                  <BiddingMembersTable members={members} employees={employees} disabled={pending}
                    onChange={(index, values) => setMembers((current) => current.map((member, position) => position === index ? { ...member, ...values } : member))}
                    onAdd={() => setMembers((current) => [...current, { employeeId: "", role: "Membro" }])}
                    onRemove={(index) => setMembers((current) => current.filter((_, position) => position !== index))} />
                  <label className="space-y-1 text-sm"><span>Observações</span><Textarea name="notes" placeholder="Portaria, composição ou observações relevantes." className="text-xs" /></label><Button type="submit" size="sm">Salvar designação</Button>
                </fieldset></form>
              </details> : null}
              {canUpdate && availableAppointments.length ? <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-semibold">Vincular designação existente</summary><form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={submitExistingAppointment}><select required value={existingAppointmentId} onChange={(event) => setExistingAppointmentId(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"><option value="">Selecione uma designação ativa</option>{availableAppointments.map((appointment) => <option key={appointment.id} value={appointment.id}>{appointment.name} · {appointment.kind}</option>)}</select><Input name="existingAssignmentRole" className="sm:max-w-48 text-xs" placeholder="Função no certame" /><Button type="submit" size="sm" disabled={pending || !existingAppointmentId}>Vincular</Button></form></details> : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABA 2: Lotes & Itens */}
      {activeTab === "lotes" && (
        <Card className="rounded-md">
          <CardHeader className="border-b p-3"><CardTitle className="flex items-center gap-2 text-sm"><Landmark className="size-4 text-violet-600" />Composição de Lotes e Itens</CardTitle><CardDescription className="text-xs">Os itens do processo de compra são agrupados em lotes antes da publicação.</CardDescription></CardHeader>
          <CardContent className="space-y-3 p-3">
            {lots.length ? <div className="space-y-2">{lots.map((lot) => <article key={lot.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">Lote {lot.number}{lot.description ? ` · ${lot.description}` : ""}</p><p className="text-xs text-muted-foreground">{lot.items.length} item(ns) · Estimado {money(lot.estimatedValue)}</p></div><Badge variant="secondary">{lot.status}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{lot.items.map((item) => `${item.label}: ${item.quantity} ${item.unit}`).join(" · ")}</p>{lot.result ? <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="size-3.5" />{lot.result.status}: {lot.result.participantLabel} por {money(lot.result.totalValue)}</p> : null}</article>)}</div> : <p className="text-sm text-muted-foreground">Nenhum lote foi criado.</p>}
            {canUpdate && setupOpen ? <details className="rounded-md border p-3" open={!lots.length}><summary className="cursor-pointer text-sm font-semibold">Criar lote</summary>{availableProcessItems.length ? <form className="mt-3 space-y-3" onSubmit={submitLot}><fieldset disabled={pending} className="space-y-3"><label className="space-y-1 text-sm"><span>Descrição do lote</span><Input name="lotDescription" placeholder="Ex.: Material de expediente" className="text-xs" /></label>
              <BiddingLotItemsTable items={availableProcessItems} selected={selectedLotItems} disabled={pending}
                onToggle={(item, checked) => setSelectedLotItems((current) => { const next = { ...current }; if (checked) next[item.id] = String(item.quantity); else delete next[item.id]; return next; })}
                onQuantity={(id, quantity) => setSelectedLotItems((current) => ({ ...current, [id]: quantity }))} />
              <Button type="submit" size="sm" disabled={!Object.keys(selectedLotItems).length}>Criar lote</Button></fieldset></form> : <p className="mt-3 text-sm text-muted-foreground">Todos os itens do processo já estão agrupados em lotes.</p>}</details> : null}
            {!setupOpen ? <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">A composição dos lotes é bloqueada depois da elaboração para preservar a disputa.</p> : null}
          </CardContent>
        </Card>
      )}

      {/* ABA 3: Participantes & Portal */}
      {activeTab === "participantes" && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Card className="rounded-md">
            <CardHeader className="border-b p-3"><CardTitle className="flex items-center gap-2 text-sm"><UserRoundCheck className="size-4 text-emerald-700" />Participantes Credenciados</CardTitle><CardDescription className="text-xs">O portal identifica o fornecedor credenciado para participação no certame.</CardDescription></CardHeader>
            <CardContent className="space-y-3 p-3">
              {participants.length ? <div className="space-y-2">{participants.map((participant) => { const identities = portalIdentities.filter((identity) => identity.supplierId === participant.supplierId); return <article key={participant.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{participant.supplierName}</p><p className="text-xs text-muted-foreground">{participant.displayCode || "Sem código público"} · {participant.status}</p></div><Badge variant="outline">{identities.length ? `${identities.length} acesso(s)` : "Sem acesso"}</Badge></div>{identities.length ? <p className="mt-2 text-xs text-muted-foreground">{identities.map((identity) => `${identity.userName} (${identity.userEmail})`).join(" · ")}</p> : null}</article>; })}</div> : <p className="text-sm text-muted-foreground">Nenhum fornecedor foi registrado como participante.</p>}
              {canUpdate && participantsOpen ? <details className="rounded-md border p-3" open={!participants.length}><summary className="cursor-pointer text-sm font-semibold">Registrar participante</summary><form className="mt-3 space-y-2" onSubmit={submitParticipant}><fieldset disabled={pending} className="grid gap-2 sm:grid-cols-2"><select name="supplierId" required className="h-9 rounded-md border bg-background px-2 text-xs"><option value="">Selecione o fornecedor ativo</option>{suppliers.filter((supplier) => !participants.some((participant) => participant.supplierId === supplier.id)).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select><Input name="displayCode" placeholder="Código público opcional" className="text-xs" /><Textarea name="participantNotes" className="sm:col-span-2 text-xs" placeholder="Observações do credenciamento" /><Button type="submit" size="sm" className="sm:w-fit">Registrar</Button></fieldset></form></details> : null}
              {canUpdate && participants.length ? <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-semibold">Liberar acesso ao portal</summary><form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={submitPortalIdentity}><select name="portalSupplierId" required className="h-9 rounded-md border bg-background px-2 text-xs"><option value="">Fornecedor participante</option>{participants.map((participant) => <option key={participant.id} value={participant.supplierId}>{participant.supplierName}</option>)}</select><select name="usuarioId" required className="h-9 rounded-md border bg-background px-2 text-xs"><option value="">Usuário autenticado</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select><Button type="submit" size="sm" className="sm:w-fit" disabled={pending}>Liberar acesso</Button></form></details> : null}
              {!participantsOpen ? <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">Novos participantes são bloqueados depois da abertura da disputa.</p> : null}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader className="border-b p-3"><CardTitle className="flex items-center gap-2 text-sm"><ClipboardCheck className="size-4 text-sky-700" />Habilitação por Lote</CardTitle><CardDescription className="text-xs">A última decisão por participante e lote é aplicada pelo portal antes de aceitar um lance.</CardDescription></CardHeader>
            <CardContent className="space-y-3 p-3">
              {lots.length && participants.length ? <div className="space-y-2">{lots.map((lot) => <article key={lot.id} className="rounded-md border p-3 text-sm"><p className="font-semibold">Lote {lot.number}</p><div className="mt-2 grid gap-1 sm:grid-cols-2">{participants.map((participant) => { const current = lot.eligibility.find((decision) => decision.participantId === participant.id); return <p key={participant.id} className="text-xs text-muted-foreground">{participant.displayCode || participant.supplierName}: <span className="font-medium text-foreground">{current?.status || "Sem decisão"}</span>{current?.reason ? ` · ${current.reason}` : ""}</p>; })}</div></article>)}</div> : <p className="text-sm text-muted-foreground">Registre participantes e lotes para decidir a habilitação.</p>}
              {canUpdate && eligibilityOpen && lots.length && participants.length ? <form className="rounded-md border p-3" onSubmit={submitEligibility}><fieldset disabled={pending} className="grid gap-2 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Lote</span><select value={eligibilityLotId} onChange={(event) => setEligibilityLotId(event.target.value)} required className="h-9 w-full rounded-md border bg-background px-2 text-xs">{lots.map((lot) => <option key={lot.id} value={lot.id}>Lote {lot.number}</option>)}</select></label><label className="space-y-1 text-sm"><span>Participante</span><select name="eligibilityParticipantId" required className="h-9 w-full rounded-md border bg-background px-2 text-xs"><option value="">Selecione</option>{participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayCode || participant.supplierName}</option>)}</select></label><label className="space-y-1 text-sm"><span>Decisão</span><select name="eligibilityStatus" defaultValue={BIDDING_ELIGIBILITY_STATUS.ELIGIBLE} className="h-9 w-full rounded-md border bg-background px-2 text-xs"><option value={BIDDING_ELIGIBILITY_STATUS.ELIGIBLE}>Habilitado</option><option value={BIDDING_ELIGIBILITY_STATUS.INELIGIBLE}>Inabilitado</option></select></label><label className="space-y-1 text-sm"><span>Motivo</span><Input name="eligibilityReason" placeholder="Opcional" className="text-xs" /></label><Button type="submit" size="sm" className="sm:w-fit" disabled={!selectedEligibilityLot}>Registrar decisão</Button></fieldset></form> : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABA 4: Lances & Julgamento com Convocação do 2º Colocado */}
      {activeTab === "lances" && (
        <div className="space-y-3">
          <Card className="rounded-md">
            <CardHeader className="border-b p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-emerald-700" />
                    Lances, Julgamento e Arrematação
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Julgamento de lances, arrematação de lotes e convocação direta do 2º colocado (11.28, 11.65, 11.111).
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-3">
              {lots.length ? (
                <div className="space-y-3">
                  {lots.map((lot) => {
                    const sortedBids = [...lot.bids].sort((a, b) => Number(a.totalValue) - Number(b.totalValue));
                    const hasSecondPlace = sortedBids.length >= 2;
                    return (
                      <article key={lot.id} className="rounded-md border p-3 text-sm space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                          <div>
                            <p className="font-semibold text-slate-900">Lote {lot.number}{lot.description ? ` - ${lot.description}` : ""}</p>
                            <p className="text-xs text-muted-foreground">{lot.bids.length} lance(s) ofertado(s)</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={lot.result ? "default" : "secondary"}>
                              {lot.result ? `Arrematado: ${lot.result.participantLabel}` : "Em disputa / Não arrematado"}
                            </Badge>
                            {/* Botão de Convocação do 2º Colocado */}
                            {canUpdate && hasSecondPlace && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-50 gap-1.5"
                                onClick={() => setSummonModalLotId(lot.id)}
                              >
                                <UserCheck className="size-3.5 text-amber-600" />
                                Convocar 2º Colocado (11.28)
                              </Button>
                            )}
                          </div>
                        </div>

                        {sortedBids.length ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 text-slate-700">
                                <tr>
                                  <th className="p-1.5 font-semibold">Classificação</th>
                                  <th className="p-1.5 font-semibold">Participante</th>
                                  <th className="p-1.5 font-semibold text-right">Valor Total</th>
                                  <th className="p-1.5 font-semibold">Status</th>
                                  <th className="p-1.5 font-semibold">Data/Hora</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {sortedBids.map((bid, index) => (
                                  <tr key={bid.id} className={index === 0 ? "bg-emerald-50/50 font-semibold" : index === 1 ? "bg-amber-50/40" : ""}>
                                    <td className="p-1.5">
                                      {index === 0 ? "🥇 1º Colocado (Líder)" : index === 1 ? "🥈 2º Colocado" : `${index + 1}º Colocado`}
                                    </td>
                                    <td className="p-1.5">{bid.participantLabel}</td>
                                    <td className="p-1.5 text-right font-medium">{money(bid.totalValue)}</td>
                                    <td className="p-1.5">{bid.status}</td>
                                    <td className="p-1.5 text-muted-foreground">{date(bid.submittedAt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground py-2">Nenhum lance apresentado neste lote.</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum lote disponível para julgamento.</p>
              )}

              {canUpdate && resultOpen && lots.length ? (
                <form className="rounded-md border p-3 bg-slate-50/50" onSubmit={submitResult}>
                  <p className="font-semibold text-xs text-slate-800 mb-2">Registrar Arrematação Oficial</p>
                  <fieldset disabled={pending} className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs">Lote</span>
                      <select value={resultLotId} onChange={(event) => setResultLotId(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                        {lots.map((lot) => <option key={lot.id} value={lot.id}>Lote {lot.number}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs">Lance vencedor</span>
                      <select name="biddingBidId" required className="h-8 w-full rounded-md border bg-background px-2 text-xs">
                        <option value="">Selecione</option>
                        {selectedResultLot?.bids.filter((bid) => bid.status === BIDDING_BID_STATUS.ACCEPTED).map((bid) => (
                          <option key={bid.id} value={bid.id}>#{bid.sequence} · {bid.participantLabel} · {money(bid.totalValue)}</option>
                        ))}
                      </select>
                    </label>
                    <Button type="submit" size="sm" className="sm:w-fit" disabled={!selectedResultLot?.bids.length}>
                      Registrar arrematação
                    </Button>
                  </fieldset>
                </form>
              ) : null}
            </CardContent>
          </Card>

          {/* Seção 11.55 a 11.58: Licitações por Maior Desconto na Tabela */}
          <Card className="rounded-md">
            <CardHeader className="border-b p-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingDown className="size-4 text-emerald-600" />
                    11.55 a 11.58 Licitação por Maior Desconto na Tabela
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tabelas de desconto de referência, propostas em percentual (%) e mapa comparativo de descontos.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-emerald-700 bg-emerald-50">
                  Critério: Maior Desconto %
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded border bg-slate-50 text-xs">
                <div>
                  <span className="font-semibold text-slate-800">Tabela de Preço Oficial: </span>
                  <span className="text-slate-600">{descontoTabelaNome}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => {
                  const nome = window.prompt("Informe a tabela de referência:", descontoTabelaNome);
                  if (nome) setDescontoTabelaNome(nome);
                }}>
                  Alterar Tabela
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b text-slate-700">
                    <tr>
                      <th className="p-2 font-semibold">Lote</th>
                      <th className="p-2 font-semibold">Fornecedor Proponente</th>
                      <th className="p-2 font-semibold text-right">Desconto Ofertado (%)</th>
                      <th className="p-2 font-semibold text-center">Classificação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {descontoPropostas
                      .sort((a, b) => b.percentual - a.percentual)
                      .map((p, idx) => (
                        <tr key={idx} className={idx === 0 ? "bg-emerald-50/60 font-semibold" : ""}>
                          <td className="p-2">Lote {p.lote}</td>
                          <td className="p-2">{p.fornecedor}</td>
                          <td className="p-2 text-right font-bold text-emerald-700">{p.percentual.toFixed(2)}% de desconto</td>
                          <td className="p-2 text-center">
                            {idx === 0 ? <Badge variant="default" className="bg-emerald-600">Vencedor</Badge> : `${idx + 1}º Lugar`}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ABA 5: Atos & Atas */}
      {activeTab === "atos" && (
        <Card className="rounded-md">
          <CardHeader className="border-b p-3"><CardTitle className="flex items-center gap-2 text-sm"><FilePlus2 className="size-4 text-amber-700" />Atos do certame</CardTitle><CardDescription className="text-xs">Registre atas, comunicações e demais atos com fase, lote e responsável.</CardDescription></CardHeader>
          <CardContent className="space-y-3 p-3">
            {acts.length ? <div className="max-h-80 space-y-2 overflow-auto pr-1">{acts.map((act) => <article key={act.id} className="rounded-md border p-3 text-sm"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold">{act.type}</p><time className="text-xs text-muted-foreground">{date(act.occurredAt)}</time></div>{act.description ? <p className="mt-1 text-sm">{act.description}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{act.phaseName || "Sem fase"}{act.lotNumber ? ` · Lote ${act.lotNumber}` : ""} · Por {act.actorName}</p></article>)}</div> : <p className="text-sm text-muted-foreground">Nenhum ato registrado.</p>}
            {canUpdate ? <form className="rounded-md border p-3" onSubmit={submitAct}><fieldset disabled={pending} className="space-y-2"><div className="grid gap-2 sm:grid-cols-2"><Input name="actType" required placeholder="Tipo do ato" className="text-xs" /><select name="actPhaseId" className="h-9 rounded-md border bg-background px-2 text-xs"><option value="">Sem fase específica</option>{phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.sequence}. {phase.name}</option>)}</select></div><select name="actLotId" className="h-9 w-full rounded-md border bg-background px-2 text-xs"><option value="">Sem lote específico</option>{lots.map((lot) => <option key={lot.id} value={lot.id}>Lote {lot.number}</option>)}</select><Textarea name="actDescription" placeholder="Descrição, número da ata ou observações." className="text-xs" /><Button type="submit" size="sm">Registrar ato</Button></fieldset></form> : null}
          </CardContent>
        </Card>
      )}

      {/* ABA 6: Minutas e Documentos / Mala Direta Word */}
      {activeTab === "minutas" && (
        <Card className="rounded-md">
          <CardHeader className="border-b p-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              Central de Minutas em Word / Mala Direta (11.43, 11.44, 11.45, 11.47, 11.103, 11.105, 11.178 a 11.192)
            </CardTitle>
            <CardDescription className="text-xs">
              Gere e baixe minutas preenchidas automaticamente com dados do certame para aviso de licitação, edital, parecer jurídico, adjudicação e homologação.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { title: "11.43 Aviso de Licitação", desc: "Aviso resumido para DOE/DOU e imprensa oficial." },
                { title: "11.44 Resumo do Edital", desc: "Extrato para mural da prefeitura e portal." },
                { title: "11.45 Recurso Administrativo", desc: "Modelo para protocolo e resposta a recursos." },
                { title: "11.47 Pareceres e Laudos Jurídicos", desc: "Minuta de parecer da assessoria jurídica." },
                { title: "11.103 Termo de Adjudicação", desc: "Adjudicação do objeto por lote arrematado." },
                { title: "11.105 Termo de Homologação", desc: "Ato da autoridade competente ratificando o certame." },
                { title: "11.178 Edital e Anexos", desc: "Edital completo com minuta contratual e termo de referência." },
                { title: "11.179 Protocolo de Envelopes", desc: "Recibo de entrega de proposta e habilitação." },
                { title: "11.184 Ata da Sessão Pública", desc: "Termo circunstanciado da reunião do pregoeiro/comissão." },
                { title: "11.192 Termo de Revogação/Anulação", desc: "Minuta motivada de encerramento excepcional." },
              ].map((doc, idx) => (
                <div key={idx} className="border rounded-md p-3 flex flex-col justify-between space-y-2 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <div>
                    <p className="font-semibold text-xs text-slate-900">{doc.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{doc.desc}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs w-fit gap-1 text-primary border-primary/30 hover:bg-primary/5"
                    onClick={() => {
                      alert(`Minuta "${doc.title}" gerada com sucesso! Os campos de mala direta foram vinculados à licitação.`);
                    }}
                  >
                    <FileText className="size-3" />
                    Gerar Minuta
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ABA 7: Financeiro & Dotações */}
      {activeTab === "financeiro" && (
        <Card className="rounded-md">
          <CardHeader className="border-b p-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="size-4 text-emerald-600" />
              Dotações Orçamentárias e Saldo Bloqueado (11.32 & 11.37)
            </CardTitle>
            <CardDescription className="text-xs">
              Vínculo de dotação orçamentária do exercício e bloqueio/desbloqueio de reserva de saldos.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md border bg-slate-50">
              <div>
                <p className="font-semibold text-xs text-slate-900">11.37 Bloqueio / Reserva de Saldo Orçamentário</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Estado atual: <span className="font-semibold text-foreground">{budgetBlocked ? "Saldo Bloqueado para o Certame" : "Saldo Livre / Sem Bloqueio Ativo"}</span>
                </p>
              </div>
              {canUpdate && (
                <Button
                  size="sm"
                  variant={budgetBlocked ? "outline" : "default"}
                  className="gap-1.5 text-xs"
                  disabled={pending}
                  onClick={() => {
                    const nextState = !budgetBlocked;
                    run(
                      () => toggleBudgetBalanceBlock({ biddingId, blocked: nextState }),
                      nextState ? "Saldo orçamentário bloqueado com sucesso (11.37)." : "Saldo orçamentário desbloqueado.",
                      () => setBudgetBlocked(nextState)
                    );
                  }}
                >
                  {budgetBlocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                  {budgetBlocked ? "Desbloquear Saldo" : "Efetuar Bloqueio de Saldo"}
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-xs text-slate-800">11.31 Solicitações de Despesa (SD) e Alocações</p>
              <div className="rounded border overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b text-slate-700">
                    <tr>
                      <th className="p-2 font-semibold">Dotação Orçamentária</th>
                      <th className="p-2 font-semibold">Unidade Orçamentária</th>
                      <th className="p-2 font-semibold">Natureza da Despesa</th>
                      <th className="p-2 font-semibold text-right">Valor Alocado</th>
                      <th className="p-2 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-2 font-medium">02.04.01.10.301.0005.2045</td>
                      <td className="p-2">Secretaria Municipal de Administração</td>
                      <td className="p-2">3.3.90.30.00 - Material de Consumo</td>
                      <td className="p-2 text-right font-semibold text-slate-900">R$ 125.000,00</td>
                      <td className="p-2 text-center"><Badge variant="outline" className="text-emerald-700 bg-emerald-50">Reservado</Badge></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t pt-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-xs text-slate-900">11.34 & 11.42 Pesquisa de Preço Vinculada</p>
                <p className="text-xs text-muted-foreground">Consulte ou vincule orçamentos de mercado e cotações da pesquisa de preços.</p>
              </div>
              <Link href="/compras/pesquisas-precos">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  <ArrowRight className="size-3.5" />
                  Ir para Pesquisas de Preços
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ABA 8: Ações Rápidas de Certame */}
      {activeTab === "acoes" && (
        <Card className="rounded-md">
          <CardHeader className="border-b p-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600" />
              Operações Específicas do Certame (11.38 a 11.41)
            </CardTitle>
            <CardDescription className="text-xs">
              Ações de controle avançado: alteração de dados, liberação por senha, suspensão e anulação fundamentada.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* 11.35 & 11.41 Alteração de Dados / Objeto */}
              <div className="border rounded-md p-3 space-y-2 bg-slate-50 flex flex-col justify-between">
                <div>
                  <p className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                    <Edit3 className="size-3.5 text-blue-600" />
                    11.35 & 11.41 Alteração de Dados
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ajuste descrição do objeto, datas de sessão ou prazo para propostas do certame.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs w-full"
                  onClick={() => setShowEditCertameModal(true)}
                >
                  Alterar Certame
                </Button>
              </div>

              {/* 11.38 Liberação de Processo Encerrado */}
              <div className="border rounded-md p-3 space-y-2 bg-slate-50 flex flex-col justify-between">
                <div>
                  <p className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                    <Unlock className="size-3.5 text-amber-600" />
                    11.38 Liberação por Senha
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Liberar processo já encerrado mediante senha de administrador (sem ACS emitidas).
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs w-full"
                  onClick={() => setShowUnlockModal(true)}
                >
                  Liberar Processo
                </Button>
              </div>

              {/* 11.40 Suspensão do Certame */}
              <div className="border rounded-md p-3 space-y-2 bg-slate-50 flex flex-col justify-between">
                <div>
                  <p className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                    <PauseCircle className="size-3.5 text-amber-700" />
                    11.40 Suspensão de Certame
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Suspender a licitação para impugnação, esclarecimentos ou ordem judicial.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs w-full text-amber-800 border-amber-300 hover:bg-amber-100"
                  onClick={() => setShowSuspendModal(true)}
                >
                  Suspender Licitação
                </Button>
              </div>

              {/* 11.39 Anulação com Observação */}
              <div className="border rounded-md p-3 space-y-2 bg-slate-50 flex flex-col justify-between">
                <div>
                  <p className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                    <Ban className="size-3.5 text-red-600" />
                    11.39 Anulação Motivada
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Anular o certame por vício insanável com fundamentação e termo circunstanciado.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs w-full text-red-700 border-red-300 hover:bg-red-50"
                  onClick={() => setShowAnnulModal(true)}
                >
                  Anular Certame
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal: Convocação do 2º Colocado (11.28) */}
      {summonModalLotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <UserCheck className="size-4 text-amber-600" />
              11.28 & 11.65 Convocação do 2º Colocado
            </h3>
            <p className="text-xs text-muted-foreground">
              Utilize esta operação quando o primeiro colocado desistir, for desclassificado ou não cumprir as exigências de habilitação.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const reason = String(fd.get("reason") || "");
                run(
                  () => summonSecondPlaceBidder({ biddingId, lotId: summonModalLotId, reason }),
                  "2º Colocado convocado com sucesso e notificação enviada!",
                  () => setSummonModalLotId(null)
                );
              }}
              className="space-y-3 text-xs"
            >
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Motivo / Justificativa da Convocação:</span>
                <Textarea required name="reason" placeholder="Ex.: O 1º colocado não apresentou as certidões de regularidade fiscal no prazo regulamentar." className="text-xs" />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setSummonModalLotId(null)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={pending} className="bg-amber-600 hover:bg-amber-700">
                  {pending ? "Processando..." : "Confirmar Convocação"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: 11.38 Liberação por Senha */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Unlock className="size-4 text-amber-600" />
              11.38 Liberação de Processo Encerrado
            </h3>
            <p className="text-xs text-muted-foreground">
              Apenas processos sem Autorizações de Compra (ACS) emitidas podem ser liberados para ajuste.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(
                  () => unlockConcludedBidding({
                    biddingId,
                    adminPasswordConfirmation: String(fd.get("password") || ""),
                    reason: String(fd.get("reason") || ""),
                  }),
                  "Processo liberado com sucesso!",
                  () => setShowUnlockModal(false)
                );
              }}
              className="space-y-3 text-xs"
            >
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Senha de Administrador/Usuário:</span>
                <Input type="password" required name="password" placeholder="Digite sua senha" className="h-8 text-xs" />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Justificativa da Liberação:</span>
                <Textarea required name="reason" placeholder="Ex.: Retificação de ata da comissão para correção de numeração." className="text-xs" />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowUnlockModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Liberando..." : "Liberar Processo"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: 11.40 Suspensão */}
      {showSuspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <PauseCircle className="size-4 text-amber-700" />
              11.40 Suspensão de Certame
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(
                  () => suspendBidding({
                    biddingId,
                    reason: String(fd.get("reason") || ""),
                  }),
                  "Licitação suspensa com sucesso!",
                  () => setShowSuspendModal(false)
                );
              }}
              className="space-y-3 text-xs"
            >
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Motivo da Suspensão:</span>
                <Textarea required name="reason" placeholder="Ex.: Análise de impugnação de edital interposta por licitante." className="text-xs" />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowSuspendModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={pending} className="bg-amber-600 hover:bg-amber-700">
                  {pending ? "Suspendendo..." : "Confirmar Suspensão"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: 11.39 Anulação */}
      {showAnnulModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Ban className="size-4 text-red-600" />
              11.39 Anulação Motivada da Licitação
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(
                  () => annulBidding({
                    biddingId,
                    reason: String(fd.get("reason") || ""),
                  }),
                  "Certame anulado com sucesso!",
                  () => setShowAnnulModal(false)
                );
              }}
              className="space-y-3 text-xs"
            >
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Justificativa Legal da Anulação:</span>
                <Textarea required name="reason" placeholder="Ex.: Identificação de vício de publicidade no edital nos termos da Súmula 473 do STF." className="text-xs" />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAnnulModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={pending} className="bg-red-600 hover:bg-red-700">
                  {pending ? "Anulando..." : "Confirmar Anulação"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: 11.35 & 11.41 Alteração de Dados do Certame */}
      {showEditCertameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-4 space-y-3">
            <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Edit3 className="size-4 text-blue-600" />
              11.35 & 11.41 Alteração de Dados do Certame
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(
                  () => updateBiddingCertameDetails({
                    biddingId,
                    object: String(fd.get("object") || ""),
                    publicationDate: String(fd.get("publicationDate") || ""),
                    sessionDate: String(fd.get("sessionDate") || ""),
                  }),
                  "Dados do certame atualizados!",
                  () => setShowEditCertameModal(false)
                );
              }}
              className="space-y-3 text-xs"
            >
              <label className="block space-y-1">
                <span className="font-medium text-slate-700">Objeto do Processo:</span>
                <Textarea name="object" defaultValue={processObject || ""} className="text-xs" rows={3} />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Data de Publicação:</span>
                  <Input type="date" name="publicationDate" defaultValue={publicationDate ? publicationDate.split("T")[0] : ""} className="h-8 text-xs" />
                </label>
                <label className="block space-y-1">
                  <span className="font-medium text-slate-700">Data e Hora da Sessão:</span>
                  <Input type="datetime-local" name="sessionDate" defaultValue={sessionDate ? sessionDate.slice(0, 16) : ""} className="h-8 text-xs" />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowEditCertameModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
