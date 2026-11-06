"use client";

import { useState, useTransition } from "react";
import type { z } from "zod";
import type { economicActivitySchema } from "@/lib/tributacao/economic-activity-registry";
import { publishEconomicActivityAction } from "./actions";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable } from "../../TaxOperationalTable";

export default function EconomicActivitiesClient(props: {
  units: { id: string; entityId: string; label: string }[];
  activities: { id: string; version: number; status: string; data: z.infer<typeof economicActivitySchema> }[];
  services: { id: string; label: string }[];
  cbos: { id: string; label: string }[];
}) {
  const [activityId, setActivityId] = useState("");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = props.activities.find(activity => activity.id === activityId);
  const field = "mt-1 w-full rounded border p-1.5 text-xs";
  const options = (items: { id: string; label: string }[]) => items.map(item => <option key={item.id} value={item.id}>{item.label}</option>);

  const filtered = props.activities.filter(act => {
    const term = search.toLowerCase();
    return act.data.cnae.includes(term) ||
      act.data.name.toLowerCase().includes(term) ||
      (act.data.municipalCode ?? "").toLowerCase().includes(term) ||
      (act.data.groupCode ?? "").toLowerCase().includes(term);
  });

  return (
    <div className="h-full space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Atividades Econômicas (CNAE / Municipais)</h1>
      </div>

      {notice && <p role="status" className="rounded border bg-amber-50 p-2 text-sm">{notice}</p>}

      <TaxOperationalTable
        id="tabela-atividades-economicas"
        resetKey={search}
        emptyMessage="Nenhuma atividade cadastrada."
        toolbar={
          <>
            <input
              aria-label="Buscar atividade"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por CNAE, código municipal, grupo ou descrição"
              className="h-8 min-w-0 flex-1 rounded border px-2 text-[13px]"
            />
            <button
              type="button"
              onClick={() => setActivityId("")}
              className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold text-white"
            >
              Nova atividade
            </button>
          </>
        }
        columns={[
          ["cnae", "CNAE", 100, 110, "identifier"],
          ["municipalCode", "Cód. Municipal", 100, 120],
          ["groupCode", "Grupo", 100, 120],
          ["name", "Descrição / Atividade", 180, 280],
          ["calculationType", "Cálculo", 90, 110],
          ["rate", "Alíquota (%)", 80, 95, "text", "right"],
          ["fixed1", "Fixo 1 (R$)", 80, 95, "text", "right"],
          ["fixed2", "Fixo 2 (R$)", 80, 95, "text", "right"],
          ["fixed3", "Fixo 3 (R$)", 80, 95, "text", "right"],
          ["risk", "Risco", 80, 90],
          ["status", "Status", 75, 85, "status"],
          ["actions", "Ações", 70, 80, "actions"]
        ]}
        rows={filtered.map(act => ({
          id: act.id,
          label: `${act.data.cnae} - ${act.data.name}`,
          values: {
            cnae: act.data.cnae,
            municipalCode: act.data.municipalCode || "—",
            groupCode: act.data.groupCode || "—",
            name: act.data.name,
            calculationType: act.data.calculationType ?? "ALIQUOTA",
            rate: `${Number(act.data.rate ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`,
            fixed1: Number(act.data.fixedValue1 ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
            fixed2: Number(act.data.fixedValue2 ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
            fixed3: Number(act.data.fixedValue3 ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
            risk: act.data.risk,
            status: act.status
          },
          actions: (
            <button
              onClick={() => setActivityId(act.id)}
              className="text-xs font-semibold text-emerald-700 underline"
            >
              Editar
            </button>
          )
        }))}
      />

      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800">
          {selected ? `Editar Atividade ${selected.data.cnae} (v${selected.version})` : "Nova Atividade Econômica"}
        </h2>

        <form
          key={`${activityId}:${selected?.version ?? 0}`}
          action={form => startTransition(async () => {
            const unit = props.units.find(u => u.id === form.get("unit"));
            const result = await publishEconomicActivityAction({
              activityId: activityId || undefined,
              expectedVersion: selected?.version ?? 0,
              governmentEntityId: unit?.entityId ?? "",
              budgetUnitId: unit?.id ?? "",
              cnae: String(form.get("cnae")),
              municipalCode: String(form.get("municipalCode") ?? "").trim() || null,
              groupCode: String(form.get("groupCode") ?? "").trim() || null,
              calculationType: (String(form.get("calculationType")) as "ALIQUOTA" | "VALOR_FIXO" | "ESTIMATIVA" | "MISTO") || "ALIQUOTA",
              rate: Number(form.get("rate") ?? 0),
              fixedValue1: Number(form.get("fixedValue1") ?? 0),
              fixedValue2: Number(form.get("fixedValue2") ?? 0),
              fixedValue3: Number(form.get("fixedValue3") ?? 0),
              name: String(form.get("name")),
              risk: String(form.get("risk")) as "BAIXO" | "MEDIO" | "ALTO" | "DEPENDENTE",
              active: form.get("active") === "on",
              serviceActivityIds: form.getAll("services").map(String),
              cboCodes: form.getAll("cbos").map(String),
              legalBasis: String(form.get("legalBasis"))
            });
            setNotice(result.error ?? "Atividade publicada com parâmetros, alíquotas e valores fixos versionados.");
          })}
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="text-xs font-medium">Ente / UG
            <select name="unit" required defaultValue={selected?.data.budgetUnitId} className={field}>
              {options(props.units)}
            </select>
          </label>

          <label className="text-xs font-medium">CNAE (7 dígitos)
            <input name="cnae" required pattern="[0-9]{7}" readOnly={Boolean(selected)} defaultValue={selected?.data.cnae} className={field} />
          </label>

          <label className="text-xs font-medium">Código Municipal
            <input name="municipalCode" defaultValue={selected?.data.municipalCode ?? ""} placeholder="Ex: 01.01.001" className={field} />
          </label>

          <label className="text-xs font-medium">Grupo da Atividade
            <input name="groupCode" defaultValue={selected?.data.groupCode ?? ""} placeholder="Ex: Serviços de Saúde / Comércio" className={field} />
          </label>

          <label className="text-xs font-medium">Parâmetro de Cálculo
            <select name="calculationType" defaultValue={selected?.data.calculationType ?? "ALIQUOTA"} className={field}>
              <option value="ALIQUOTA">Alíquota Percentual</option>
              <option value="VALOR_FIXO">Valor Fixo</option>
              <option value="ESTIMATIVA">Regime de Estimativa</option>
              <option value="MISTO">Misto (Alíquota + Fixo)</option>
            </select>
          </label>

          <label className="text-xs font-medium">Alíquota (%)
            <input name="rate" type="number" step="0.01" min="0" max="100" defaultValue={selected?.data.rate ?? 0} className={field} />
          </label>

          <label className="text-xs font-medium">Valor Fixo 1 - Taxa / Alvará (R$)
            <input name="fixedValue1" type="number" step="0.01" min="0" defaultValue={selected?.data.fixedValue1 ?? 0} className={field} />
          </label>

          <label className="text-xs font-medium">Valor Fixo 2 - ISS Fixo Anual (R$)
            <input name="fixedValue2" type="number" step="0.01" min="0" defaultValue={selected?.data.fixedValue2 ?? 0} className={field} />
          </label>

          <label className="text-xs font-medium">Valor Fixo 3 - Vistoria / Fiscalização (R$)
            <input name="fixedValue3" type="number" step="0.01" min="0" defaultValue={selected?.data.fixedValue3 ?? 0} className={field} />
          </label>

          <label className="text-xs font-medium sm:col-span-2">Descrição da Atividade
            <input name="name" required defaultValue={selected?.data.name} className={field} />
          </label>

          <label className="text-xs font-medium">Grau de Risco Sanitário/Ambiental
            <select name="risk" defaultValue={selected?.data.risk ?? "DEPENDENTE"} className={field}>
              <option value="BAIXO">Baixo</option>
              <option value="MEDIO">Médio</option>
              <option value="ALTO">Alto</option>
              <option value="DEPENDENTE">Dependente</option>
            </select>
          </label>

          <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">Lista de serviços ISS (seleção múltipla)
            <select name="services" multiple defaultValue={selected?.data.serviceActivityIds} className={`${field} min-h-24`}>
              {options(props.services)}
            </select>
          </label>

          <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">CBO para autônomos e profissionais liberais (seleção múltipla)
            <select name="cbos" multiple defaultValue={selected?.data.cboCodes} className={`${field} min-h-24`}>
              {options(props.cbos)}
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs font-medium sm:col-span-2 lg:col-span-3">
            <input name="active" type="checkbox" defaultChecked={selected?.data.active ?? true} />
            Atividade ativa para enquadramento
          </label>

          <label className="text-xs font-medium sm:col-span-2 lg:col-span-3">Fundamento Legal / Lei Municipal
            <textarea name="legalBasis" required defaultValue={selected?.data.legalBasis} className={field} />
          </label>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <button
              disabled={pending || selected?.status === "UNIFICADA"}
              className="rounded bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Publicar versão {(selected?.version ?? 0) + 1}
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => setActivityId("")}
                className="rounded border px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
