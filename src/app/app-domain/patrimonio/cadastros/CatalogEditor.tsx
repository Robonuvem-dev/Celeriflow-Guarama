"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import type { catalogDefinition } from "@/lib/patrimonio/catalog-definitions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalDevice } from "@/components/app-ui/operational/OperationalContext";
import { saveCatalogAction } from "./actions";

type EditorProps = {
  kind: string;
  year: number;
  base: string;
  title: string;
  fields: ReturnType<typeof catalogDefinition>["fields"];
  departments: { id: string; name: string }[];
  initial: Record<string, string>;
};

export function CatalogEditor({ kind, year, base, title, fields, departments, initial }: EditorProps) {
  const [draft, setDraft] = useState(initial);
  const device = useOperationalDevice();
  const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900";
  const input = (key: string) => ({
    value: draft[key] || "",
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
  });
  return (
    <OperationalTablePanel title={`${draft.id ? "Editar" : "Cadastrar"} — ${title}`} triggerLabel={draft.id ? "Abrir edição selecionada" : "Cadastrar"}>
      <OperationalPagedContent device={device} label={`Formulário de ${title}`}>
        <form action={saveCatalogAction} className="cf-portal-form grid gap-3 p-4 md:grid-cols-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="id" value={draft.id || ""} />
          <input type="hidden" name="version" value={draft.version || ""} />
          <label className="text-xs font-semibold text-slate-700">
            Setor
            <select className={inputClass} required name="departmentId" {...input("departmentId")}>
              {departments.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Código
            <input className={inputClass} name="code" required maxLength={80} {...input("code")} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Nome
            <input className={inputClass} name="name" required maxLength={250} {...input("name")} />
          </label>
          {fields.map((field) => (
            <label key={field.key} className="text-xs font-semibold text-slate-700">
              {field.label}
              <input
                className={inputClass}
                name={field.key}
                required={field.required}
                readOnly={field.readOnly}
                type={field.type || "text"}
                step={field.type === "number" ? "any" : undefined}
                min={field.type === "number" ? "0" : undefined}
                maxLength={4000}
                {...input(field.key)}
              />
            </label>
          ))}
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <button className="cf-portal-btn">{draft.id ? "Salvar alterações" : "Cadastrar"}</button>
            {draft.id && (
              <Link className="cf-portal-btn-secondary" href={`${base}?kind=${kind}&year=${year}`}>
                Cancelar edição
              </Link>
            )}
          </div>
          {kind === "tiposVeiculo" && (
            <section className="space-y-2 md:col-span-2">
              <p className="text-xs text-slate-600">
                Envie as imagens em <Link className="font-semibold text-blue-700 underline" href="/frotas/gestao/anexos">Anexos da Frota</Link> e use seus IDs neste banco. As permissões dos anexos são preservadas.
              </p>
              {draft.vehicleImage && draft.backgroundImage && draft.tireImage && (
                <figure>
                  <div className="relative h-64 w-full max-w-xl overflow-hidden rounded-xl border border-slate-200" aria-label={`Conjunto do veículo ${draft.name}`}>
                    {/* Imagens privadas usam a rota autenticada, sem otimizador externo. */}
                    {/* eslint-disable @next/next/no-img-element */}
                    <img src={`/api/frotas/controle/anexos/${encodeURIComponent(draft.backgroundImage)}?inline=1`} alt="Fundo" className="absolute inset-0 h-full w-full object-cover" />
                    <img src={`/api/frotas/controle/anexos/${encodeURIComponent(draft.vehicleImage)}?inline=1`} alt={draft.model} className="absolute inset-0 h-full w-full object-contain" />
                    <img src={`/api/frotas/controle/anexos/${encodeURIComponent(draft.tireImage)}?inline=1`} alt="Pneu dianteiro" className="absolute bottom-[12%] left-[20%] h-[20%] w-[12%] object-contain" />
                    <img src={`/api/frotas/controle/anexos/${encodeURIComponent(draft.tireImage)}?inline=1`} alt="Pneu traseiro" className="absolute bottom-[12%] right-[20%] h-[20%] w-[12%] object-contain" />
                  </div>
                  <figcaption className="mt-1 text-xs text-slate-500">{draft.name} · {draft.model}</figcaption>
                </figure>
              )}
            </section>
          )}
        </form>
      </OperationalPagedContent>
    </OperationalTablePanel>
  );
}
