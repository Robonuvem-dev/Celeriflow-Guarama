"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileCheck2, FilePenLine, Printer, Save, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useRef, useState } from "react";
import { generateContractProcurementAuthorizations, saveContractAmendment, updateContractResponsibles, changeContractLifecycleStatus, saveContractPublicationData, addContractBudgetAllocation, publishContractDocumentToTransparency } from "./actions";
import type { ContractAmendmentType } from "@/lib/compras/contract-lifecycle";

type Amendment = {
  id: string;
  type: string;
  justification: string;
  previousValue: number | null;
  newValue: number | null;
  previousEndDate: string | null;
  newEndDate: string | null;
  status: string;
  createdAt: string;
};

type LifecycleEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  actorName: string | null;
};

type EmployeeOption = {
  id: string;
  name: string;
  registration: string | null;
  roleName: string | null;
};

type SupplierRepresentative = {
  id: string;
  name: string;
  representationType: string;
};

type ContratoLifecyclePanelProps = {
  contract: {
    id: string;
    status: string;
    startDate: string;
    managerId: string | null;
    inspectorId: string | null;
    supplierName: string;
  };
  employees: EmployeeOption[];
  representatives: SupplierRepresentative[];
  amendments: Amendment[];
  events: LifecycleEvent[];
};

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    CONTRACT_AMENDMENT_APPLIED: "Aditivo aplicado",
    CONTRACT_SUSPENSION_REGISTERED: "Suspensão registrada",
    CONTRACT_RESCISSION_REGISTERED: "Rescisão registrada",
    CONTRACT_RESPONSIBLES_UPDATED: "Responsáveis atualizados",
    PURCHASE_RECEIPT_APPROVED: "Recebimento aprovado",
    INSTRUMENT_RESPONSIBILITY_GROUP_CREATED: "Grupo de responsabilidade criado",
    INSTRUMENT_RESPONSIBILITY_GROUP_UPDATED: "Grupo de responsabilidade atualizado",
    INSTRUMENT_RESPONSIBILITY_GROUP_DELETED: "Grupo de responsabilidade excluído",
    INSTRUMENT_PARTY_CREATED: "Parte do instrumento incluída",
    INSTRUMENT_PARTY_UPDATED: "Parte do instrumento atualizada",
    INSTRUMENT_PARTY_DELETED: "Parte do instrumento excluída",
    INSTRUMENT_MEASUREMENT_CREATED: "Medição criada",
    INSTRUMENT_MEASUREMENT_UPDATED: "Medição atualizada",
    INSTRUMENT_MEASUREMENT_CANCELLED: "Medição cancelada",
    INSTRUMENT_MEASUREMENT_DELETED: "Medição excluída",
    INSTRUMENT_MEASUREMENT_ITEM_CREATED: "Item de medição incluído",
    INSTRUMENT_MEASUREMENT_ITEM_UPDATED: "Item de medição atualizado",
    INSTRUMENT_MEASUREMENT_ITEM_DELETED: "Item de medição excluído",
    INSTRUMENT_INSTALLMENT_CREATED: "Parcela programada criada",
    INSTRUMENT_INSTALLMENT_UPDATED: "Parcela programada atualizada",
    INSTRUMENT_INSTALLMENT_DELETED: "Parcela programada excluída",
    PROCUREMENT_EXPENSE_AUTHORIZATION_CREATED: "AE derivada do contrato",
    PROCUREMENT_SUPPLY_AUTHORIZATION_CREATED: "AF gerada",
    PROCUREMENT_SUPPLY_AUTHORIZATION_CANCELLED: "AF anulada",
    PROCUREMENT_LIQUIDATION_AUTHORIZATION_CREATED: "AL gerada",
    PROCUREMENT_LIQUIDATION_AUTHORIZATION_CANCELLED: "AL anulada",
    PROCUREMENT_COMMITMENT_CREATED: "Empenho financeiro confirmado",
    PROCUREMENT_COMMITMENT_CANCELLED: "Empenho financeiro anulado",
    PROCUREMENT_SETTLEMENT_CREATED: "Liquidação financeira confirmada",
    PROCUREMENT_SETTLEMENT_CANCELLED: "Liquidação financeira anulada",
    CONTRACT_ENCERRADO_REGISTERED: "Contrato encerrado",
    CONTRACT_ANULADO_REGISTERED: "Contrato anulado",
    CONTRACT_CANCELADO_REGISTERED: "Contrato cancelado",
    CONTRACT_STATUS_REVERTED: "Estorno de situação contratual (Reversão)",
    CONTRACT_MANAGING_BODY_UPDATED: "Órgão gestor atualizado",
    CONTRACT_BUDGET_ALLOCATION_ADDED: "Nova dotação orçamentária vinculada",
    CONTRACT_PUBLICATION_DATA_SAVED: "Dados de publicação registrados",
    CONTRACT_DOCUMENT_PUBLISHED_TRANSPARENCY: "Documento publicado no Portal da Transparência",
  };
  return labels[eventType] ?? eventType.replaceAll("_", " ");
}

export function ContratoLifecyclePanel({ contract, employees, representatives, amendments, events }: ContratoLifecyclePanelProps) {
  const router = useRouter();
  const amendmentFormRef = useRef<HTMLFormElement>(null);
  const [amendmentType, setAmendmentType] = useState<ContractAmendmentType>("Valor");
  const [amendmentKey, setAmendmentKey] = useState(newIdempotencyKey);
  const [responsibleKey, setResponsibleKey] = useState(newIdempotencyKey);
  const [managerId, setManagerId] = useState(contract.managerId ?? "");
  const [inspectorId, setInspectorId] = useState(contract.inspectorId ?? "");
  const [isSavingAmendment, setIsSavingAmendment] = useState(false);
  const [isSavingResponsibles, setIsSavingResponsibles] = useState(false);
  const [isGeneratingAuthorizations, setIsGeneratingAuthorizations] = useState(false);
  const [amendmentFeedback, setAmendmentFeedback] = useState<string | null>(null);
  const [responsibleFeedback, setResponsibleFeedback] = useState<string | null>(null);
  const [authorizationFeedback, setAuthorizationFeedback] = useState<string | null>(null);
  const changesValue = amendmentType === "Valor" || amendmentType === "Ambos";
  const changesTerm = amendmentType === "Prazo" || amendmentType === "Ambos";
  const managerName = managerId ? employees.find((employee) => employee.id === managerId)?.name ?? "Servidor inativo ou não listado" : "Não designado";
  const inspectorName = inspectorId ? employees.find((employee) => employee.id === inspectorId)?.name ?? "Servidor inativo ou não listado" : "Não designado";

  async function handleAmendment(formData: FormData) {
    setIsSavingAmendment(true);
    setAmendmentFeedback(null);
    formData.set("idempotencyKey", amendmentKey);
    try {
      const result = await saveContractAmendment(formData);
      if (!result.success) {
        setAmendmentFeedback(result.error);
        return;
      }
      amendmentFormRef.current?.reset();
      setAmendmentType("Valor");
      setAmendmentKey(newIdempotencyKey());
      setAmendmentFeedback("Ato contratual registrado no histórico.");
      router.refresh();
    } catch {
      setAmendmentFeedback("Não foi possível registrar o ato contratual. Tente novamente.");
    } finally {
      setIsSavingAmendment(false);
    }
  }

  async function handleResponsibles(formData: FormData) {
    setIsSavingResponsibles(true);
    setResponsibleFeedback(null);
    formData.set("idempotencyKey", responsibleKey);
    try {
      const result = await updateContractResponsibles(formData);
      if (!result.success) {
        setResponsibleFeedback(result.error);
        return;
      }
      setResponsibleKey(newIdempotencyKey());
      setResponsibleFeedback("Responsáveis atualizados no histórico do contrato.");
      router.refresh();
    } catch {
      setResponsibleFeedback("Não foi possível atualizar os responsáveis. Tente novamente.");
    } finally {
      setIsSavingResponsibles(false);
    }
  }

  function handleGenerateAuthorizations() {
    startTransition(async () => {
      setIsGeneratingAuthorizations(true);
      setAuthorizationFeedback(null);
      try {
        const result = await generateContractProcurementAuthorizations(contract.id);
        if (!result.success) {
          setAuthorizationFeedback(result.error);
          return;
        }
        setAuthorizationFeedback("AE derivada por dotação e AF registradas. Empenho, liquidação e pagamento continuam dependentes de atos financeiros reais.");
        router.refresh();
      } catch {
        setAuthorizationFeedback("Não foi possível gerar as autorizações. Tente novamente.");
      } finally {
        setIsGeneratingAuthorizations(false);
      }
    });
  }

  return (
    <div className="space-y-6 text-sm">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4 text-indigo-600" />Partes e responsáveis</h2>
            <p className="text-xs text-muted-foreground">Vínculos recuperáveis do contrato, sem presumir assinatura eletrônica.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}><Printer className="size-3.5" />Imprimir razão</Button>
        </div>

        <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Fornecedor contratado</p>
            <p>{contract.supplierName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Representantes cadastrados do fornecedor</p>
            {representatives.length ? <div className="space-y-1">{representatives.map((representative) => <p key={representative.id}>{representative.name} <span className="text-muted-foreground">({representative.representationType})</span></p>)}</div> : <p className="text-muted-foreground">Nenhum representante ativo no cadastro do fornecedor.</p>}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Gestor designado</p>
            <p>{managerName}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Fiscal designado</p>
            <p>{inspectorName}</p>
          </div>
        </div>

        <form action={handleResponsibles} className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
          <input type="hidden" name="contractId" value={contract.id} />
          <input type="hidden" name="idempotencyKey" value={responsibleKey} />
          <div className="space-y-2">
            <Label htmlFor="managerId">Gestor do contrato</Label>
            <select id="managerId" name="managerId" value={managerId} onChange={(event) => setManagerId(event.target.value)} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Não designado</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.registration ? ` · ${employee.registration}` : ""}{employee.roleName ? ` · ${employee.roleName}` : ""}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inspectorId">Fiscal do contrato</Label>
            <select id="inspectorId" name="inspectorId" value={inspectorId} onChange={(event) => setInspectorId(event.target.value)} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Não designado</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.registration ? ` · ${employee.registration}` : ""}{employee.roleName ? ` · ${employee.roleName}` : ""}</option>)}
            </select>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Gestor e fiscal são os vínculos legados do contrato. Demais grupos, partes e designações são registrados na seção de execução do instrumento.</p>
            <Button type="submit" size="sm" disabled={isSavingResponsibles}><Save className="size-3.5" />{isSavingResponsibles ? "Salvando..." : "Salvar responsáveis"}</Button>
          </div>
          {responsibleFeedback && <p className="md:col-span-2 text-xs text-muted-foreground" role="status">{responsibleFeedback}</p>}
        </form>
      </section>

      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FileCheck2 className="size-4 text-emerald-600" />Autorizações de fornecimento</h2>
          <p className="text-xs text-muted-foreground">Gera AE por dotação e AF a partir do contrato vigente. Não emite empenho, liquidação ou pagamento.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
          <p className="text-xs text-muted-foreground">A repetição usa as mesmas chaves de origem e não cria outra AE ou AF.</p>
          <Button type="button" size="sm" disabled={contract.status !== "Vigente" || isGeneratingAuthorizations} onClick={handleGenerateAuthorizations}><FileCheck2 className="size-3.5" />{isGeneratingAuthorizations ? "Gerando..." : "Gerar AE e AF"}</Button>
        </div>
        {contract.status !== "Vigente" && <p className="text-xs text-amber-700">A geração exige contrato vigente.</p>}
        {authorizationFeedback && <p className="text-xs text-muted-foreground" role="status">{authorizationFeedback}</p>}
      </section>

      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FilePenLine className="size-4 text-indigo-600" />Aditivos e atos contratuais</h2>
          <p className="text-xs text-muted-foreground">O motivo e o momento de registro são mantidos no histórico; suspensão e rescisão não removem o instrumento.</p>
        </div>

        <form ref={amendmentFormRef} action={handleAmendment} className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
          <input type="hidden" name="contractId" value={contract.id} />
          <input type="hidden" name="idempotencyKey" value={amendmentKey} />
          <div className="space-y-2">
            <Label htmlFor="amendmentType">Tipo do ato</Label>
            <select id="amendmentType" name="type" value={amendmentType} onChange={(event) => setAmendmentType(event.target.value as ContractAmendmentType)} className="flex h-9 w-full rounded-md border bg-background px-3 text-sm" disabled={contract.status === "Rescindido"}>
              <option value="Valor">Aditivo de valor</option>
              <option value="Prazo">Aditivo de prazo</option>
              <option value="Ambos">Aditivo de valor e prazo</option>
              <option value="Suspensão">Suspensão</option>
              <option value="Rescisão">Rescisão</option>
            </select>
          </div>
          {changesValue && <div className="space-y-2">
            <Label htmlFor="newValue">Novo valor total (R$)</Label>
            <Input id="newValue" name="newValue" type="number" min="0" step="0.01" required disabled={contract.status === "Rescindido"} />
          </div>}
          {changesTerm && <div className="space-y-2">
            <Label htmlFor="newEndDate">Nova data final</Label>
            <Input id="newEndDate" name="newEndDate" type="date" min={contract.startDate.slice(0, 10)} required disabled={contract.status === "Rescindido"} />
          </div>}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="justification">Motivo / justificativa</Label>
            <Textarea id="justification" name="justification" required rows={3} disabled={contract.status === "Rescindido"} />
          </div>
          <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Não cria empenho, liquidação ou pagamento. Um ato aplicado preserva o valor e prazo anteriores.</p>
            <Button type="submit" size="sm" disabled={isSavingAmendment || contract.status === "Rescindido"}><Save className="size-3.5" />{isSavingAmendment ? "Registrando..." : "Registrar ato"}</Button>
          </div>
          {amendmentFeedback && <p className="md:col-span-2 text-xs text-muted-foreground" role="status">{amendmentFeedback}</p>}
        </form>

        {amendments.length ? <div className="space-y-2">{amendments.map((amendment) => <details key={amendment.id} className="rounded-md border p-3">
          <summary className="cursor-pointer font-medium">{amendment.type} · {amendment.status} · {formatDate(amendment.createdAt)}</summary>
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
            <p className="md:col-span-2"><span className="font-medium">Motivo:</span> {amendment.justification}</p>
            {amendment.previousValue !== null && <p><span className="font-medium">Valor anterior:</span> {formatMoney(amendment.previousValue)}</p>}
            {amendment.newValue !== null && <p><span className="font-medium">Novo valor:</span> {formatMoney(amendment.newValue)}</p>}
            {amendment.previousEndDate && <p><span className="font-medium">Término anterior:</span> {formatDate(amendment.previousEndDate)}</p>}
            {amendment.newEndDate && <p><span className="font-medium">Novo término:</span> {formatDate(amendment.newEndDate)}</p>}
          </div>
        </details>)}</div> : <p className="text-sm text-muted-foreground">Nenhum aditivo, suspensão ou rescisão registrado.</p>}
      </section>

      {/* CF16 — 16.15: Alteração da situação e Estorno */}
      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-700">Alteração de Situação Contratual e Estorno (CF16 — 16.15)</h2>
          <p className="text-xs text-muted-foreground">Permite alterar para Encerrado, Anulado, Cancelado, Suspenso ou Rescindido, ou realizar o estorno de qualquer alteração indevida de situação.</p>
        </div>
        <form
          action={async (formData) => {
            const res = await changeContractLifecycleStatus(formData);
            if (!res.success) alert(res.error);
            else router.refresh();
          }}
          className="grid gap-3 rounded-md border border-rose-200 bg-rose-50/30 p-3 md:grid-cols-2"
        >
          <input type="hidden" name="contractId" value={contract.id} />
          <div className="space-y-1">
            <Label htmlFor="statusAction" className="text-xs font-semibold">Nova Situação / Ato</Label>
            <select id="statusAction" name="status" defaultValue="Encerrado" className="flex h-9 w-full rounded border bg-white px-3 text-xs">
              <option value="Encerrado">Encerrado</option>
              <option value="Anulado">Anulado</option>
              <option value="Cancelado">Cancelado</option>
              <option value="Suspenso">Suspenso</option>
              <option value="Rescindido">Rescindido</option>
              <option value="Vigente">Estorno (Reverter para Vigente)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="isReversal" className="text-xs font-semibold">Tipo do Ato</Label>
            <select id="isReversal" name="isReversal" defaultValue="false" className="flex h-9 w-full rounded border bg-white px-3 text-xs">
              <option value="false">Alteração Regular de Situação</option>
              <option value="true">Estorno / Anulação de Lançamento Indevido</option>
            </select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="justificationStatus" className="text-xs font-semibold">Justificativa / Motivação Legal do Ato</Label>
            <Textarea id="justificationStatus" name="justification" required rows={2} placeholder="Descreva a fundamentação legal ou o motivo do estorno..." className="bg-white text-xs" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" size="sm" variant="destructive" className="text-xs">Aplicar Alteração / Estorno de Situação</Button>
          </div>
        </form>
      </section>

      {/* CF16 — 16.16: Manutenção dos dados de publicação */}
      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-sky-800">Manutenção dos Dados de Publicação (CF16 — 16.16)</h2>
          <p className="text-xs text-muted-foreground">Registre os veículos, edições e datas de publicação oficial do contrato inicial, aditivos ou rescisões.</p>
        </div>
        <form
          action={async (formData) => {
            const res = await saveContractPublicationData(formData);
            if (!res.success) alert(res.error);
            else {
              alert("Dados de publicação registrados com sucesso.");
              router.refresh();
            }
          }}
          className="grid gap-3 rounded-md border p-3 md:grid-cols-3 text-xs"
        >
          <input type="hidden" name="contractId" value={contract.id} />
          <div>
            <Label className="text-xs font-semibold">Documento Publicado</Label>
            <select name="documentType" defaultValue="Contrato Inicial" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs">
              <option value="Contrato Inicial">Contrato Inicial</option>
              <option value="Termo Aditivo">Termo Aditivo</option>
              <option value="Termo de Rescisão">Termo de Rescisão</option>
              <option value="Apostilamento">Apostilamento</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold">Veículo de Publicação</Label>
            <input name="veiculo" defaultValue="Diário Oficial do Município" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Data da Publicação*</Label>
            <input required type="date" name="dataPublicacao" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Número da Edição / Página</Label>
            <input name="numeroEdicao" placeholder="Ex.: Edição 1420, pág. 12" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs font-semibold">Link Público / URL do Diário</Label>
            <input name="urlPublicacao" placeholder="https://..." className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button type="submit" size="sm" className="bg-sky-900 text-white hover:bg-sky-800 text-xs">Salvar Dados de Publicação</Button>
          </div>
        </form>
      </section>

      {/* CF16 — 16.10: Inserção de novas dotações em contratos vigentes */}
      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-700">Inserção de Novas Dotações no Contrato Vigente (CF16 — 16.10)</h2>
          <p className="text-xs text-muted-foreground">Vincule novas dotações orçamentárias complementares a este contrato vigente para reforço financeiro.</p>
        </div>
        <form
          action={async (formData) => {
            const res = await addContractBudgetAllocation(formData);
            if (!res.success) alert(res.error);
            else {
              alert("Nova dotação vinculada ao contrato com sucesso.");
              router.refresh();
            }
          }}
          className="grid gap-3 rounded-md border p-3 md:grid-cols-3 text-xs"
        >
          <input type="hidden" name="contractId" value={contract.id} />
          <div>
            <Label className="text-xs font-semibold">Unidade / Dotação de Destino</Label>
            <input required name="budgetUnitId" placeholder="ID ou Código da Unidade Gestora" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Percentual (%) Alocado</Label>
            <input type="number" step="0.01" min="0" max="100" name="percentage" defaultValue={100} className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Justificativa Contábil</Label>
            <input required name="justification" placeholder="Ex.: Reforço orçamentário para exercício corrente" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button type="submit" size="sm" disabled={contract.status !== "Vigente"} className="bg-emerald-700 text-white hover:bg-emerald-800 text-xs">Vincular Nova Dotação</Button>
          </div>
        </form>
      </section>

      {/* CF16 — 16.35: Conversão de .DOC/.DOCX para PDF e Publicação na Transparência */}
      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-700">Documento em PDF e Publicação no Portal da Transparência (CF16 — 16.35)</h2>
          <p className="text-xs text-muted-foreground">Cadastro de documentos contratuais em PDF e conversão automática de arquivos .DOC / .DOCX para publicação oficial no Portal da Transparência.</p>
        </div>
        <form
          action={async (formData) => {
            const res = await publishContractDocumentToTransparency(formData);
            if (!res.success) alert(res.error);
            else {
              alert("Documento publicado com sucesso no Portal da Transparência!");
              router.refresh();
            }
          }}
          className="grid gap-3 rounded-md border p-3 md:grid-cols-3 text-xs"
        >
          <input type="hidden" name="contractId" value={contract.id} />
          <div>
            <Label className="text-xs font-semibold">Título do Documento</Label>
            <input required name="title" defaultValue={`Contrato ${contract.id.slice(-6)}`} placeholder="Ex.: Contrato Integral Assinado" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Tipo de Documento</Label>
            <select name="documentKind" defaultValue="OUTRO" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs">
              <option value="OUTRO">Contrato Principal</option>
              <option value="ADITIVO">Termo Aditivo</option>
              <option value="RESCISAO">Termo de Rescisão</option>
              <option value="ATA">Ata de Registro de Preços</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-semibold">Nome do Arquivo (PDF, DOC ou DOCX)</Label>
            <input required name="filename" defaultValue={`contrato_${contract.id.slice(-6)}.docx`} placeholder="exemplo.docx ou contrato.pdf" className="mt-1 flex h-8 w-full rounded border bg-white px-2 text-xs" />
          </div>
          <div className="md:col-span-3 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">Arquivos .DOC e .DOCX são convertidos para PDF padronizado para atendimento da LAI e PNTP.</span>
            <Button type="submit" size="sm" className="bg-indigo-700 text-white hover:bg-indigo-800 text-xs">Converter e Publicar na Transparência ↗</Button>
          </div>
        </form>
      </section>

      <section className="space-y-3 border-t pt-4">
        <div>
          <h2 className="text-sm font-semibold">Trilha de auditoria</h2>
          <p className="text-xs text-muted-foreground">Eventos append-only do ciclo de compras vinculados ao contrato.</p>
        </div>
        {events.length ? <div className="space-y-2">{events.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 rounded-md border p-3 text-xs"><span className="font-medium">{eventLabel(event.eventType)}</span><span>{event.actorName ?? "Usuário não informado"}</span><span className="text-muted-foreground">{formatDateTime(event.createdAt)}</span></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhum evento de compras registrado para este contrato.</p>}
      </section>
    </div>
  );
}
