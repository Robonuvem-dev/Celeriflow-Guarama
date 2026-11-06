"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Landmark, Plus, Building } from "lucide-react";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../../TaxOperationalTable";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { createAgencyAction, createInstitutionAction } from "../actions";

type Institution = {
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
};

type Taxpayer = {
  id: string;
  name: string;
  document: string;
};

const input =
  "h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900";
const button =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50";

export default function AgenciasClient({
  institutions,
  taxpayers,
}: {
  institutions: Institution[];
  taxpayers: Taxpayer[];
}) {
  const [filterInstitution, setFilterInstitution] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [openModal, setOpenModal] = useState<"agency" | "institution" | null>(null);

  const run = (job: () => Promise<{ error?: string }>) =>
    start(async () => {
      const response = await job();
      setMessage(response.error ?? "Operação concluída com sucesso.");
      if (!response.error) setOpenModal(null);
    });

  const allAgencies = institutions.flatMap((inst) =>
    inst.agencies.map((agency) => ({
      ...agency,
      institutionId: inst.id,
      institutionName: inst.name,
      baseCnpj: inst.baseCnpj,
    }))
  );

  const filtered = allAgencies.filter((row) => {
    if (filterInstitution && row.institutionId !== filterInstitution) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      row.name.toLowerCase().includes(term) ||
      row.code.toLowerCase().includes(term) ||
      row.fullCnpj.includes(term) ||
      (row.registration ?? "").toLowerCase().includes(term) ||
      row.institutionName.toLowerCase().includes(term)
    );
  });

  const toolbar = (
    <>
      <select
        aria-label="Filtrar por instituição"
        value={filterInstitution}
        onChange={(e) => setFilterInstitution(e.target.value)}
        className="h-7 rounded border px-2 text-[13px]"
      >
        <option value="">Todas as instituições financeiras</option>
        {institutions.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.name} ({inst.baseCnpj})
          </option>
        ))}
      </select>
      <input
        aria-label="Buscar agências e agentes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por código, nome, CNPJ ou inscrição municipal..."
        className="h-7 min-w-0 flex-1 rounded border px-2 text-[13px]"
      />
      {message && (
        <OperationalFilters label="Aviso">
          <p role="status">{message}</p>
        </OperationalFilters>
      )}
    </>
  );

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpenModal("agency")}
        className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400"
      >
        <Plus className="size-3.5" />
        Nova agência / agente
      </button>
      <button
        type="button"
        onClick={() => setOpenModal("institution")}
        className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <Building className="size-3.5" />
        Nova instituição
      </button>
      <Link
        href="/tributacao/iss-bancario"
        className="inline-flex h-7 items-center gap-1 rounded border px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="size-3.5" />
        Voltar ao ISS Bancário
      </Link>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-2">
          <Landmark className="size-5 text-emerald-600" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Agências e Agentes Arrecadadores Bancários
            </h1>
            <p className="text-xs text-slate-500">
              Cadastro e controle de agências e postos arrecadadores vinculados a Instituições Financeiras (DES-IF / ISS Bancário).
            </p>
          </div>
        </div>
      </div>

      <TaxOperationalTable
        id="iss-bancario-agencias"
        resetKey={`${filterInstitution}:${search}`}
        toolbar={toolbar}
        actions={actions}
        emptyMessage="Nenhuma agência ou agente arrecadador cadastrado."
        columns={[
          ["institution", "Instituição Financeira", 130, 200],
          ["code", "Código / Prefixo", 70, 95, "identifier"],
          ["name", "Nome da Agência / Posto", 140, 220],
          ["fullCnpj", "CNPJ Completo", 110, 140, "identifier"],
          ["registration", "Inscrição Municipal", 90, 130, "identifier"],
          ["status", "Situação", 70, 90, "status"],
          ["actions", "Ações", 50, 50, "actions"],
        ]}
        rows={filtered.map((agency) => ({
          id: agency.id,
          label: `${agency.code} - ${agency.name}`,
          values: {
            institution: agency.institutionName,
            code: agency.code,
            name: agency.name,
            fullCnpj: agency.fullCnpj,
            registration: agency.registration ?? "Não informada",
            status: agency.status,
          },
          actions: (
            <TaxRowActions label={agency.name}>
              <TaxRowAction href={`/tributacao/iss-bancario`}>
                Ver apurações da instituição
              </TaxRowAction>
            </TaxRowActions>
          ),
        }))}
      />

      {/* Modal Nova Agência */}
      {openModal === "agency" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              run(() =>
                createAgencyAction({
                  institutionId: String(form.get("institutionId")),
                  code: String(form.get("code")),
                  name: String(form.get("name")),
                  fullCnpj: String(form.get("fullCnpj")),
                  municipalRegistration: String(form.get("registration")) || undefined,
                  validFrom: String(form.get("validFrom")),
                })
              );
            }}
            className="w-full max-w-lg rounded-lg border bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950"
          >
            <h2 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">
              Cadastrar Agência / Agente Arrecadador
            </h2>
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Instituição Financeira</label>
                <select className={input} name="institutionId" required>
                  {institutions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} (CNPJ Base {row.baseCnpj})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Código / Prefixo</label>
                  <input className={input} name="code" placeholder="Ex: 0001" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Nome da Agência / Posto</label>
                  <input className={input} name="name" placeholder="Ex: Agência Centro" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">CNPJ Completo (14 dígitos)</label>
                  <input className={input} name="fullCnpj" placeholder="00.000.000/0000-00" required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Inscrição Municipal</label>
                  <input className={input} name="registration" placeholder="Opcional" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Vigência a partir de</label>
                <input className={input} name="validFrom" type="date" defaultValue="2026-01-01" required />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="h-8 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button disabled={pending} className={button}>
                {pending ? "Salvando..." : "Salvar Agência"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Nova Instituição */}
      {openModal === "institution" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              run(() =>
                createInstitutionAction({
                  taxpayerId: String(form.get("taxpayerId")) || undefined,
                  name: String(form.get("name")),
                  baseCnpj: String(form.get("baseCnpj")),
                  validFrom: String(form.get("validFrom")),
                })
              );
            }}
            className="w-full max-w-lg rounded-lg border bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950"
          >
            <h2 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">
              Cadastrar Instituição Financeira
            </h2>
            <div className="grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Contribuinte Vinculado (Opcional)</label>
                <select className={input} name="taxpayerId">
                  <option value="">Sem vínculo fiscal prévio</option>
                  {taxpayers.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row.document})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Nome da Instituição</label>
                <input className={input} name="name" placeholder="Ex: Banco do Brasil S.A." required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">CNPJ Base (8 dígitos)</label>
                  <input className={input} name="baseCnpj" placeholder="00.000.000" maxLength={10} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Vigência a partir de</label>
                  <input className={input} name="validFrom" type="date" defaultValue="2026-01-01" required />
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="h-8 rounded border px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button disabled={pending} className={button}>
                {pending ? "Salvando..." : "Salvar Instituição"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
