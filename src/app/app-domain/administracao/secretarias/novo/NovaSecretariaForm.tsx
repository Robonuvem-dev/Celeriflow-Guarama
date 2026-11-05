"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Landmark, Layers, Save } from "lucide-react";
import { createSecretariat } from "../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

type EntityKind = "SECRETARIA" | "ORGAO_ADMINISTRATIVO" | "UNIDADE_VINCULADA";

export default function NovaSecretariaForm({
  employees,
  secretariats = [],
}: {
  employees: { id: string; name: string; role: { name: string } | null }[];
  secretariats?: { id: string; name: string; acronym: string | null }[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entityKind, setEntityKind] = useState<EntityKind>("SECRETARIA");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await createSecretariat(new FormData(e.currentTarget));
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <PageFrame className="max-w-4xl space-y-4">
      <PageHeader
        title="Novo Órgão Administrativo ou Secretaria"
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
          <p className="text-xs font-bold uppercase tracking-wider text-[#0e4c7e]">Natureza da Estrutura</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Selecione se deseja cadastrar uma Secretaria Municipal, um Órgão Administrativo de primeiro escalão (Gabinete, Procuradoria, Controladoria, Autarquia) ou uma Unidade vinculada.
          </p>

          <input type="hidden" name="entityKind" value={entityKind} />

          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setEntityKind("SECRETARIA")}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                entityKind === "SECRETARIA"
                  ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Landmark className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-xs font-bold">Secretaria Municipal</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Pasta finalística ou meio da administração direta.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setEntityKind("ORGAO_ADMINISTRATIVO")}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                entityKind === "ORGAO_ADMINISTRATIVO"
                  ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Building2 className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-xs font-bold">Órgão Administrativo</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Gabinete, Procuradoria, Controladoria, Fundo ou Autarquia.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setEntityKind("UNIDADE_VINCULADA")}
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                entityKind === "UNIDADE_VINCULADA"
                  ? "border-[#0e4c7e] bg-[#0e4c7e]/5 text-[#0e4c7e] ring-2 ring-[#0e4c7e]/15"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Layers className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-xs font-bold">Unidade / Órgão Vinculado</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Unidade administrativa subordinada a uma secretaria existente.</p>
              </div>
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          {entityKind === "UNIDADE_VINCULADA" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="field">
                  <span>Secretaria / Órgão Superior Vinculante *</span>
                  <select name="parentSecretariatId" required className="input">
                    <option value="">Selecione a secretaria ou órgão superior...</option>
                    {secretariats.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name} {sec.acronym ? `(${sec.acronym})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Classificação do Órgão / Unidade *</span>
                  <select name="unitType" defaultValue="Órgão Administrativo" className="input">
                    <option value="Órgão Administrativo">Órgão Administrativo</option>
                    <option value="Coordenadoria">Coordenadoria / Diretoria</option>
                    <option value="Departamento">Departamento Operacional</option>
                    <option value="Unidade de Atendimento">Unidade de Atendimento</option>
                    <option value="Conselho Municipal">Conselho Municipal</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Nome da Unidade ou Órgão Administrativo *</span>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Ex: Coordenadoria de Defesa Civil / PROCON Municipal"
                  className="input"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="field">
                  <span>Responsável / Titular</span>
                  <input type="text" name="managerName" placeholder="Nome do dirigente ou responsável" className="input" />
                </label>
                <label className="field">
                  <span>Endereço / Localização</span>
                  <input type="text" name="address" placeholder="Rua, número, sala ou prédio administrativo" className="input" />
                </label>
              </div>
            </>
          ) : (
            <>
              <label className="field">
                <span>
                  {entityKind === "SECRETARIA"
                    ? "Nome da Secretaria Municipal *"
                    : "Nome do Órgão Administrativo *"}
                </span>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder={
                    entityKind === "SECRETARIA"
                      ? "Ex: Secretaria Municipal de Saúde"
                      : "Ex: Gabinete do Prefeito / Procuradoria-Geral do Município / Controladoria Interna"
                  }
                  className="input"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="field">
                  <span>Sigla Oficial</span>
                  <input
                    type="text"
                    name="acronym"
                    placeholder={entityKind === "SECRETARIA" ? "Ex: SMS" : "Ex: PGM / CGM / GAPRE"}
                    className="input uppercase"
                  />
                </label>

                <label className="field">
                  <span>
                    {entityKind === "SECRETARIA"
                      ? "Titular (Secretário/a Municipal)"
                      : "Titular / Dirigente do Órgão"}
                  </span>
                  <select
                    name="managerId"
                    aria-label="Responsável pela secretaria ou órgão"
                    className="input"
                  >
                    <option value="">Vincular após concluir o cadastro</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} {employee.role?.name ? `— ${employee.role.name}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Selecione um servidor disponível ou vincule o dirigente posteriormente na edição do órgão.
                  </p>
                </label>
              </div>
            </>
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
            {loading
              ? "Salvando..."
              : entityKind === "SECRETARIA"
                ? "Salvar Secretaria"
                : "Salvar Órgão Administrativo"}
          </button>
        </div>
      </form>
    </PageFrame>
  );
}
