"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Save } from "lucide-react";
import { updateSecretariatFull } from "../../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

type Secretariat = {
  id: string;
  name: string;
  acronym: string | null;
  managerName: string | null;
  managerId: string | null;
  isActive: boolean;
};

type EmployeeOption = {
  id: string;
  name: string;
  role: { name: string } | null;
  registration: string | null;
};

export default function EditarSecretariaForm({
  secretariat,
  employees,
  departments,
  units,
}: {
  secretariat: Secretariat;
  employees: EmployeeOption[];
  departments: { id: string; name: string; isActive: boolean }[];
  units: { id: string; name: string; type: string; isActive: boolean }[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await updateSecretariatFull(secretariat.id, new FormData(e.currentTarget));
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <PageFrame className="max-w-4xl space-y-4">
      <PageHeader
        title={`Editar Secretaria: ${secretariat.name}`}
        icon={<Building2 className="size-4 shrink-0 text-blue-600" />}
        action={
          <Link
            href="/administracao/secretarias"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="size-3.5" />
            Voltar
          </Link>
        }
      />

      <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#0e4c7e]">Dados Cadastrais da Secretaria</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Atualize o nome, a sigla institucional, o titular responsável e o status de ativação da secretaria.
          </p>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <label className="field block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Nome da Secretaria Municipal *</span>
            <input
              type="text"
              name="name"
              required
              defaultValue={secretariat.name}
              placeholder="Ex: Secretaria Municipal de Saúde"
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Sigla Oficial</span>
              <input
                type="text"
                name="acronym"
                defaultValue={secretariat.acronym || ""}
                placeholder="Ex: SMS"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 uppercase outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              />
            </label>

            <label className="field block">
              <span className="block text-xs font-semibold text-slate-700 mb-1">Titular (Secretário/a Municipal)</span>
              <select
                name="managerId"
                defaultValue={secretariat.managerId || ""}
                aria-label="Responsável pela secretaria"
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              >
                <option value="">Nenhum titular vinculado</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} {employee.role?.name ? `— ${employee.role.name}` : ""} {employee.registration ? `(${employee.registration})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked={secretariat.isActive}
              className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs font-medium text-slate-700">Secretaria Ativa (desmarque para inativar)</span>
          </label>

          {(departments.length > 0 || units.length > 0) && (
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50/60 p-4 space-y-3">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Estrutura Subordinada Vinculada</p>
              {departments.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Departamentos ({departments.length}):</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {departments.map((d) => (
                      <span key={d.id} className="rounded bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
                        {d.name} {!d.isActive && "(inativo)"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {units.length > 0 && (
                <div>
                  <span className="text-[11px] font-semibold text-slate-500">Unidades e Órgãos Vinculados ({units.length}):</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {units.map((u) => (
                      <span key={u.id} className="rounded bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-700">
                        {u.name} ({u.type}) {!u.isActive && "(inativo)"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-xs text-slate-500">Os campos marcados com * são de preenchimento obrigatório.</span>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0e4c7e] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#0b3d66] disabled:opacity-50"
          >
            <Save className="size-3.5" />
            {loading ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </form>
    </PageFrame>
  );
}
