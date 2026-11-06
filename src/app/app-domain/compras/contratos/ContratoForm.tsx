"use client";

import { useState } from "react";
import { saveContract } from "./actions";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, Save, Trash2, Users } from "lucide-react";

type ProcessOption = {
  id: string;
  number: string;
  modality: string | null;
  secretariatId: string;
  items: { quantity: number }[];
};

type SupplierOption = {
  id: string;
  company?: { corporateName: string; cnpj: string } | null;
  person?: { fullName: string; cpf: string | null } | null;
};

type SecretariatOption = { id: string; name: string };
type BudgetUnitOption = {
  id: string;
  code: string;
  name: string;
  secretariatId: string;
  isActive?: boolean;
};

export type ContractGovernanceOptions = {
  employees: { id: string; name: string; registration: string | null; roleName: string | null }[];
  people: { id: string; fullName: string; cpf: string | null }[];
  companies: { id: string; corporateName: string; tradeName: string | null; cnpj: string }[];
  suppliers: SupplierOption[];
  responsibilityGroups?: { id: string; name: string; description: string | null }[];
  instrumentParties?: {
    id: string;
    role: string;
    supplierId: string | null;
    personId: string | null;
    companyId: string | null;
    employeeId: string | null;
    responsibilityGroupId: string | null;
    activeFrom: Date | string | null;
    activeTo: Date | string | null;
    notes: string | null;
  }[];
};

type ContractInitialData = {
  id: string;
  number: string;
  processId: string;
  startDate: Date | string;
  endDate: Date | string;
  status: string;
  supplierId: string;
  secretariatId: string;
  sourceBudgetUnitId?: string | null;
  managerId?: string | null;
  inspectorId?: string | null;
  initialValue: number;
  object: string;
};

type DraftGroup = {
  id?: string;
  tempId: string;
  name: string;
  description: string;
};

type DraftParty = {
  id?: string;
  tempId: string;
  role: string;
  partyValue: string;
  groupRef: string;
  startDate: string;
  endDate: string;
  notes: string;
};

function dateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().split("T")[0];
}

function partyValueFromRow(row: {
  supplierId: string | null;
  personId: string | null;
  companyId: string | null;
  employeeId: string | null;
}) {
  if (row.supplierId) return `SUPPLIER:${row.supplierId}`;
  if (row.personId) return `PERSON:${row.personId}`;
  if (row.companyId) return `COMPANY:${row.companyId}`;
  if (row.employeeId) return `EMPLOYEE:${row.employeeId}`;
  return "";
}

const ROLE_PRESETS = [
  "Responsável",
  "Representante",
  "Representante Legal",
  "Signatário",
  "Gestor",
  "Fiscal Técnico",
  "Fiscal Administrativo",
  "Preposto",
];

const formControlClass =
  "min-h-10 w-full rounded border border-slate-300 bg-white px-2.5 text-base text-slate-700 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/15 disabled:bg-slate-100 disabled:text-slate-500 sm:h-8 sm:min-h-0 sm:text-xs";
const fieldLabelClass = "mb-1 block text-xs font-semibold text-slate-700";

export default function ContratoForm({
  processos,
  fornecedores,
  secretarias,
  unidadesGestoras,
  initialData,
  governanceOptions,
}: {
  processos: ProcessOption[];
  fornecedores: SupplierOption[];
  secretarias: SecretariatOption[];
  unidadesGestoras: BudgetUnitOption[];
  initialData?: ContractInitialData;
  governanceOptions?: ContractGovernanceOptions;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState(initialData?.processId || "");
  const [selectedSecretariatId, setSelectedSecretariatId] = useState(
    initialData?.secretariatId || "",
  );
  const [selectedBudgetUnitId, setSelectedBudgetUnitId] = useState(
    initialData?.sourceBudgetUnitId || "",
  );
  const [managerId, setManagerId] = useState(initialData?.managerId || "");
  const [inspectorId, setInspectorId] = useState(initialData?.inspectorId || "");

  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    (governanceOptions?.responsibilityGroups ?? []).map((g) => ({
      id: g.id,
      tempId: g.id,
      name: g.name,
      description: g.description || "",
    })),
  );
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");

  const [parties, setParties] = useState<DraftParty[]>(() =>
    (governanceOptions?.instrumentParties ?? []).map((p) => ({
      id: p.id,
      tempId: p.id,
      role: p.role,
      partyValue: partyValueFromRow(p),
      groupRef: p.responsibilityGroupId || "",
      startDate: dateInput(p.activeFrom),
      endDate: dateInput(p.activeTo),
      notes: p.notes || "",
    })),
  );
  const [newPartyRole, setNewPartyRole] = useState("Signatário");
  const [newPartyValue, setNewPartyValue] = useState("");
  const [newPartyGroupRef, setNewPartyGroupRef] = useState("");
  const [newPartyStartDate, setNewPartyStartDate] = useState("");
  const [newPartyEndDate, setNewPartyEndDate] = useState("");
  const [newPartyNotes, setNewPartyNotes] = useState("");

  const selectedProcess = processos.find((p) => p.id === selectedProcessId);
  const availableBudgetUnits = unidadesGestoras.filter(
    (unit) =>
      unit.secretariatId === selectedSecretariatId &&
      (unit.isActive !== false || unit.id === initialData?.sourceBudgetUnitId),
  );
  const isLifecycleControlledStatus =
    initialData?.status === "Aditado" ||
    initialData?.status === "Suspenso" ||
    initialData?.status === "Rescindido" ||
    initialData?.status === "Em Análise";

  function handleProcessChange(processId: string) {
    setSelectedProcessId(processId);
    const process = processos.find((item) => item.id === processId);
    if (!process) return;
    setSelectedSecretariatId(process.secretariatId);
    // Auto-select first matching budget unit for this secretariat if current doesn't match
    const matchingUnits = unidadesGestoras.filter(
      (unit) => unit.secretariatId === process.secretariatId && (unit.isActive !== false || unit.id === initialData?.sourceBudgetUnitId)
    );
    if (!matchingUnits.some((unit) => unit.id === selectedBudgetUnitId)) {
      setSelectedBudgetUnitId(matchingUnits[0]?.id || "");
    }
  }

  function handleSecretariatChange(secretariatId: string) {
    setSelectedSecretariatId(secretariatId);
    const matchingUnits = unidadesGestoras.filter(
      (unit) => unit.secretariatId === secretariatId && (unit.isActive !== false || unit.id === initialData?.sourceBudgetUnitId)
    );
    if (!matchingUnits.some((unit) => unit.id === selectedBudgetUnitId)) {
      setSelectedBudgetUnitId(matchingUnits[0]?.id || "");
    }
  }

  function addGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const tempId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setGroups((prev) => [
      ...prev,
      { tempId, name: trimmed, description: newGroupDesc.trim() },
    ]);
    setNewGroupName("");
    setNewGroupDesc("");
  }

  function removeGroup(tempId: string) {
    setGroups((prev) => prev.filter((g) => g.tempId !== tempId));
    setParties((prev) =>
      prev.map((p) => (p.groupRef === tempId ? { ...p, groupRef: "" } : p)),
    );
  }

  function addParty() {
    if (!newPartyRole.trim() || !newPartyValue) return;
    const tempId = `pty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setParties((prev) => [
      ...prev,
      {
        tempId,
        role: newPartyRole.trim(),
        partyValue: newPartyValue,
        groupRef: newPartyGroupRef,
        startDate: newPartyStartDate,
        endDate: newPartyEndDate,
        notes: newPartyNotes.trim(),
      },
    ]);
    setNewPartyValue("");
    setNewPartyNotes("");
  }

  function removeParty(tempId: string) {
    setParties((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  function resolvePartyLabel(partyValue: string) {
    if (!governanceOptions) return partyValue;
    const [kind, ...rest] = partyValue.split(":");
    const id = rest.join(":");
    if (kind === "EMPLOYEE") {
      const emp = governanceOptions.employees.find((e) => e.id === id);
      return emp ? `Servidor: ${emp.name}` : partyValue;
    }
    if (kind === "PERSON") {
      const person = governanceOptions.people.find((p) => p.id === id);
      return person ? `Pessoa Física: ${person.fullName}` : partyValue;
    }
    if (kind === "COMPANY") {
      const company = governanceOptions.companies.find((c) => c.id === id);
      return company ? `Pessoa Jurídica: ${company.corporateName}` : partyValue;
    }
    if (kind === "SUPPLIER") {
      const sup = governanceOptions.suppliers.find((s) => s.id === id);
      const name = sup?.company?.corporateName || sup?.person?.fullName || id;
      return `Fornecedor: ${name}`;
    }
    return partyValue;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    if (initialData?.id) formData.set("id", initialData.id);
    const res = await saveContract(formData);

    if (res.success) {
      router.push("/compras/contratos");
      router.refresh();
    } else {
      setError(res.error || "Erro ao salvar.");
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2.5 sm:p-3.5">
        {error && (
          <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="size-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={fieldLabelClass}>Número do Contrato *</label>
            <input
              type="text"
              name="number"
              required
              defaultValue={initialData?.number || ""}
              placeholder="Ex: 045/2026"
              className={formControlClass}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Processo Licitatório *</label>
            <select
              name="processId"
              required
              disabled={Boolean(initialData)}
              value={selectedProcessId}
              onChange={(e) => handleProcessChange(e.target.value)}
              className={formControlClass}
            >
              <option value="">Selecione um processo...</option>
              {processos.map((p) => (
                <option key={p.id} value={p.id}>
                  Proc. {p.number} ({p.modality})
                </option>
              ))}
            </select>
            {initialData && (
              <input type="hidden" name="processId" value={initialData.processId} />
            )}
          </div>

          <div>
            <label className={fieldLabelClass}>Data de Início da Vigência *</label>
            <input
              type="date"
              name="startDate"
              required
              disabled={Boolean(initialData)}
              defaultValue={
                initialData?.startDate
                  ? new Date(initialData.startDate).toISOString().split("T")[0]
                  : ""
              }
              className={formControlClass}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Data de Fim da Vigência *</label>
            <input
              type="date"
              name="endDate"
              required
              disabled={Boolean(initialData)}
              defaultValue={
                initialData?.endDate
                  ? new Date(initialData.endDate).toISOString().split("T")[0]
                  : ""
              }
              className={formControlClass}
            />
          </div>

          <div>
            <label className={fieldLabelClass}>Status do Contrato *</label>
            <select
              name="status"
              required
              defaultValue={initialData?.status || "Vigente"}
              disabled={isLifecycleControlledStatus}
              className={formControlClass}
            >
              {isLifecycleControlledStatus && initialData && (
                <option value={initialData.status}>{initialData.status}</option>
              )}
              <option value="Minuta">Minuta</option>
              <option value="Vigente">Vigente</option>
              <option value="Encerrado">Encerrado</option>
            </select>
            {isLifecycleControlledStatus && initialData && (
              <input type="hidden" name="status" value={initialData.status} />
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={fieldLabelClass}>Fornecedor Contratado *</label>
            <select
              name="supplierId"
              required
              defaultValue={initialData?.supplierId || ""}
              className={formControlClass}
            >
              <option value="">Selecione um fornecedor ativo...</option>
              {fornecedores.map((f) => {
                const name = f.company
                  ? `${f.company.corporateName} (CNPJ: ${f.company.cnpj})`
                  : f.person
                    ? `${f.person.fullName} (CPF: ${f.person.cpf})`
                    : "Desconhecido";
                return (
                  <option key={f.id} value={f.id}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className={fieldLabelClass}>Secretaria Gestora *</label>
            <select
              name="secretariatId"
              required
              disabled={Boolean(initialData)}
              value={selectedSecretariatId}
              onChange={(e) => handleSecretariatChange(e.target.value)}
              className={formControlClass}
            >
              <option value="">Selecione a secretaria...</option>
              {secretarias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {initialData && (
              <input type="hidden" name="secretariatId" value={initialData.secretariatId} />
            )}
          </div>

          <div>
            <label className={fieldLabelClass}>Unidade Gestora (UG) de Origem *</label>
            <select
              name="sourceBudgetUnitId"
              required
              value={selectedBudgetUnitId}
              onChange={(e) => setSelectedBudgetUnitId(e.target.value)}
              className={formControlClass}
            >
              <option value="">Selecione a unidade gestora...</option>
              {availableBudgetUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code} - {unit.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={fieldLabelClass}>Valor Global Inicial (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="initialValue"
              required
              disabled={Boolean(initialData)}
              defaultValue={initialData?.initialValue || ""}
              placeholder="0.00"
              className={formControlClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={fieldLabelClass}>Objeto do Contrato *</label>
            <textarea
              name="object"
              required
              rows={3}
              defaultValue={initialData?.object || ""}
              placeholder="Descreva o objeto contratual..."
              className={`${formControlClass} h-auto py-2`}
            />
          </div>
        </div>

        {selectedProcess && selectedProcess.items && selectedProcess.items.length > 0 && (
          <div className="rounded border border-indigo-100 bg-indigo-50/70 p-2.5">
            <h4 className="mb-1 text-xs font-bold text-indigo-900">
              Itens do Processo Selecionado ({selectedProcess.items.length})
            </h4>
            <p className="mb-2 text-[11px] text-indigo-700">
              Este contrato herdará a vinculação com os seguintes itens homologados no processo:
            </p>
            <ul className="max-h-28 space-y-1 overflow-y-auto pl-2 text-[11px] text-indigo-800">
              {selectedProcess.items.map((it, idx: number) => (
                <li key={idx} className="list-disc">
                  Item #{idx + 1} - Quantidade: {it.quantity}
                </li>
              ))}
            </ul>
          </div>
        )}

        {governanceOptions && (
          <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-indigo-900">
              <Users className="size-4 text-indigo-600" />
              Responsáveis pelo Contrato, Representantes, Signatários e Agrupamento de Responsáveis
            </div>

            <input
              type="hidden"
              name="responsibilityGroupsJson"
              value={JSON.stringify(groups)}
            />
            <input
              type="hidden"
              name="instrumentPartiesJson"
              value={JSON.stringify(parties)}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={fieldLabelClass}>Gestor do Contrato (Servidor Responsável)</label>
                <select
                  name="managerId"
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className={formControlClass}
                >
                  <option value="">Não designado</option>
                  {governanceOptions.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                      {emp.registration ? ` • Mat. ${emp.registration}` : ""}
                      {emp.roleName ? ` (${emp.roleName})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={fieldLabelClass}>Fiscal do Contrato (Servidor Responsável)</label>
                <select
                  name="inspectorId"
                  value={inspectorId}
                  onChange={(e) => setInspectorId(e.target.value)}
                  className={formControlClass}
                >
                  <option value="">Não designado</option>
                  {governanceOptions.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                      {emp.registration ? ` • Mat. ${emp.registration}` : ""}
                      {emp.roleName ? ` (${emp.roleName})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Agrupamento de responsáveis */}
              <div className="rounded border border-slate-200 bg-white p-2.5">
                <h4 className="mb-1.5 text-xs font-bold text-slate-800">
                  1. Agrupamento dos Responsáveis ({groups.length})
                </h4>
                <p className="mb-2 text-[11px] text-slate-500">
                  Crie grupos como Comissão de Fiscalização, Signatários ou Representantes Legais.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Nome do grupo (ex: Signatários)"
                    className={formControlClass}
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={newGroupDesc}
                      onChange={(e) => setNewGroupDesc(e.target.value)}
                      placeholder="Atribuição / descrição"
                      className={formControlClass}
                    />
                    <button
                      type="button"
                      onClick={addGroup}
                      className="inline-flex shrink-0 items-center gap-1 rounded bg-indigo-600 px-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
                    >
                      <Plus className="size-3.5" />
                      Grupo
                    </button>
                  </div>
                </div>

                {groups.length > 0 ? (
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
                    {groups.map((g) => (
                      <li
                        key={g.tempId}
                        className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1"
                      >
                        <div>
                          <span className="font-semibold text-slate-800">{g.name}</span>
                          {g.description ? (
                            <span className="ml-1.5 text-[11px] text-slate-500">
                              — {g.description}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeGroup(g.tempId)}
                          className="text-red-600 hover:text-red-800"
                          title="Remover grupo"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Nenhum agrupamento adicionado até o momento.
                  </p>
                )}
              </div>

              {/* Representantes, Signatários e Responsáveis */}
              <div className="rounded border border-slate-200 bg-white p-2.5">
                <h4 className="mb-1.5 text-xs font-bold text-slate-800">
                  2. Representantes, Signatários e Responsáveis ({parties.length})
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
                      Papel / Qualificação
                    </label>
                    <select
                      value={newPartyRole}
                      onChange={(e) => setNewPartyRole(e.target.value)}
                      className={formControlClass}
                    >
                      {ROLE_PRESETS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
                      Agrupamento vinculado
                    </label>
                    <select
                      value={newPartyGroupRef}
                      onChange={(e) => setNewPartyGroupRef(e.target.value)}
                      className={formControlClass}
                    >
                      <option value="">Sem agrupamento</option>
                      {groups.map((g) => (
                        <option key={g.tempId} value={g.tempId}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-0.5 block text-[11px] font-semibold text-slate-600">
                      Pessoa, Servidor, Empresa ou Fornecedor
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={newPartyValue}
                        onChange={(e) => setNewPartyValue(e.target.value)}
                        className={formControlClass}
                      >
                        <option value="">Selecione o responsável / representante / signatário...</option>
                        <optgroup label="Servidores">
                          {governanceOptions.employees.map((emp) => (
                            <option key={`EMPLOYEE:${emp.id}`} value={`EMPLOYEE:${emp.id}`}>
                              Servidor: {emp.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Pessoas Físicas (Representantes / Signatários)">
                          {governanceOptions.people.map((person) => (
                            <option key={`PERSON:${person.id}`} value={`PERSON:${person.id}`}>
                              Pessoa Física: {person.fullName}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Pessoas Jurídicas">
                          {governanceOptions.companies.map((company) => (
                            <option key={`COMPANY:${company.id}`} value={`COMPANY:${company.id}`}>
                              PJ: {company.corporateName}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Fornecedores">
                          {governanceOptions.suppliers.map((sup) => (
                            <option key={`SUPPLIER:${sup.id}`} value={`SUPPLIER:${sup.id}`}>
                              Fornecedor:{" "}
                              {sup.company?.corporateName || sup.person?.fullName || sup.id}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <button
                        type="button"
                        onClick={addParty}
                        className="inline-flex shrink-0 items-center gap-1 rounded bg-indigo-600 px-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        <Plus className="size-3.5" />
                        Incluir
                      </button>
                    </div>
                  </div>

                  <div>
                    <input
                      type="date"
                      value={newPartyStartDate}
                      onChange={(e) => setNewPartyStartDate(e.target.value)}
                      title="Início da atuação"
                      className={formControlClass}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={newPartyNotes}
                      onChange={(e) => setNewPartyNotes(e.target.value)}
                      placeholder="Observação / Portaria / Ato"
                      className={formControlClass}
                    />
                  </div>
                </div>

                {parties.length > 0 ? (
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
                    {parties.map((p) => {
                      const grp = groups.find((g) => g.tempId === p.groupRef);
                      return (
                        <li
                          key={p.tempId}
                          className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1"
                        >
                          <div>
                            <span className="font-semibold text-indigo-900">{p.role}:</span>{" "}
                            <span className="text-slate-800">
                              {resolvePartyLabel(p.partyValue)}
                            </span>
                            {grp ? (
                              <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
                                {grp.name}
                              </span>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeParty(p.tempId)}
                            className="text-red-600 hover:text-red-800"
                            title="Remover vínculo"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-slate-400">
                    Nenhum representante ou signatário adicionado.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-9 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:h-7 sm:min-h-0"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-9 items-center gap-1.5 rounded bg-indigo-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 sm:h-7 sm:min-h-0"
        >
          <Save className="size-3.5" />
          {loading ? "Salvando..." : initialData ? "Salvar Alterações" : "Registrar Contrato"}
        </button>
      </div>
    </form>
  );
}
