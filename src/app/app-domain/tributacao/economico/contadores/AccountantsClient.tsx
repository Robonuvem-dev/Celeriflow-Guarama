"use client";

import { useState, useTransition } from "react";
import { publishAccountantAction } from "./actions";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable } from "../../TaxOperationalTable";

type TaxpayerOption = {
  id: string;
  label: string;
  cpf?: string;
  phone?: string;
  email?: string;
};

type CompanyOption = {
  id: string;
  name: string;
  municipalInsc: string | null;
};

type AccountantEntry = {
  id: string;
  taxpayerId: string;
  version: number;
  crc: string;
  cpf: string;
  phone: string;
  email: string;
  associatedCompanies: string[];
  reason: string;
  date: string;
  actorId: string | null;
};

export default function AccountantsClient(props: {
  taxpayers: TaxpayerOption[];
  companiesList: CompanyOption[];
  entries: AccountantEntry[];
}) {
  const [taxpayerId, setTaxpayerId] = useState(props.taxpayers[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedTaxpayer = props.taxpayers.find(tp => tp.id === taxpayerId);
  const entries = props.entries.filter(entry => entry.taxpayerId === taxpayerId);
  const latest = entries[0];
  const field = "mt-1 w-full rounded border p-1.5 text-xs";

  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(
    latest?.associatedCompanies ?? []
  );

  const toggleCompany = (companyId: string) => {
    setSelectedCompanies(prev =>
      prev.includes(companyId) ? prev.filter(id => id !== companyId) : [...prev, companyId]
    );
  };

  const filteredEntries = props.entries.filter(entry => {
    const tp = props.taxpayers.find(t => t.id === entry.taxpayerId);
    const term = search.toLowerCase();
    return (
      entry.crc.toLowerCase().includes(term) ||
      (entry.cpf && entry.cpf.includes(term)) ||
      (tp && tp.label.toLowerCase().includes(term))
    );
  });

  return (
    <div className="h-full space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Gestão de Contadores e Responsáveis Técnicos</h1>
      </div>

      {notice && <p role="status" className="rounded border bg-amber-50 p-2 text-sm">{notice}</p>}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-3">
          <TaxOperationalTable
            id="tabela-contadores"
            resetKey={search}
            emptyMessage="Nenhum contador registrado."
            toolbar={
              <input
                aria-label="Buscar contador"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por CRC, CPF ou nome do contador"
                className="h-8 min-w-0 flex-1 rounded border px-2 text-[13px]"
              />
            }
            columns={[
              ["name", "Contador / Responsável", 160, 240],
              ["crc", "CRC", 90, 110, "identifier"],
              ["cpf", "CPF / Documento", 110, 130],
              ["contacts", "Contatos (Fone/Email)", 140, 180],
              ["companiesCount", "Empresas Vinculadas", 80, 100, "text", "right"],
              ["version", "Versão", 50, 60],
              ["actions", "Ações", 70, 80, "actions"]
            ]}
            rows={filteredEntries.map(entry => {
              const tp = props.taxpayers.find(t => t.id === entry.taxpayerId);
              const contactStr = [entry.phone || tp?.phone, entry.email || tp?.email].filter(Boolean).join(" · ");
              return {
                id: entry.id,
                label: `${entry.crc} - ${tp?.label ?? entry.taxpayerId}`,
                values: {
                  name: tp?.label ?? entry.taxpayerId,
                  crc: entry.crc,
                  cpf: entry.cpf || tp?.cpf || "—",
                  contacts: contactStr || "—",
                  companiesCount: String(entry.associatedCompanies?.length ?? 0),
                  version: `v${entry.version}`
                },
                actions: (
                  <button
                    onClick={() => {
                      setTaxpayerId(entry.taxpayerId);
                      setSelectedCompanies(entry.associatedCompanies ?? []);
                    }}
                    className="text-xs font-semibold text-emerald-700 underline"
                  >
                    Gerenciar
                  </button>
                )
              };
            })}
          />
        </div>

        <section className="rounded border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">
            {latest ? `Atualizar Cadastro · v${latest.version + 1}` : "Cadastrar / Habilitar Contador"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Informe CRC, CPF, contatos e vincule as empresas sob responsabilidade técnica.
          </p>

          <div className="mt-3">
            <label className="text-xs font-medium">Contribuinte / Profissional
              <select
                value={taxpayerId}
                onChange={e => {
                  setTaxpayerId(e.target.value);
                  const found = props.entries.find(ent => ent.taxpayerId === e.target.value);
                  setSelectedCompanies(found?.associatedCompanies ?? []);
                }}
                className={field}
              >
                <option value="">Selecione um contribuinte</option>
                {props.taxpayers.map(tp => (
                  <option key={tp.id} value={tp.id}>
                    {tp.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {taxpayerId && (
            <form
              key={`${taxpayerId}:${latest?.version ?? 0}`}
              action={form => startTransition(async () => {
                const result = await publishAccountantAction({
                  taxpayerId,
                  crc: String(form.get("crc")),
                  cpf: String(form.get("cpf") ?? "").trim() || selectedTaxpayer?.cpf || null,
                  phone: String(form.get("phone") ?? "").trim() || selectedTaxpayer?.phone || null,
                  email: String(form.get("email") ?? "").trim() || selectedTaxpayer?.email || null,
                  associatedCompanies: selectedCompanies,
                  expectedVersion: latest?.version ?? 0,
                  reason: String(form.get("reason"))
                });
                setNotice(result.error ?? "Cadastro do contador e vinculação de empresas atualizados.");
              })}
              className="mt-3 space-y-3"
            >
              <label className="block text-xs font-medium">Registro Profissional (CRC)
                <input name="crc" required maxLength={80} defaultValue={latest?.crc} placeholder="Ex: CRC/UF 12345/O" className={field} />
              </label>

              <label className="block text-xs font-medium">CPF do Contador
                <input name="cpf" defaultValue={latest?.cpf || selectedTaxpayer?.cpf || ""} placeholder="000.000.000-00" className={field} />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium">Telefone / WhatsApp
                  <input name="phone" defaultValue={latest?.phone || selectedTaxpayer?.phone || ""} placeholder="(00) 00000-0000" className={field} />
                </label>
                <label className="block text-xs font-medium">E-mail de Contato
                  <input name="email" type="email" defaultValue={latest?.email || selectedTaxpayer?.email || ""} placeholder="contador@dominio.com" className={field} />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium">Empresas Vinculadas ({selectedCompanies.length} selecionadas)</label>
                <div className="mt-1 max-h-36 overflow-auto rounded border p-2 text-xs space-y-1">
                  {props.companiesList.map(comp => (
                    <label key={comp.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-0.5 rounded">
                      <input
                        type="checkbox"
                        checked={selectedCompanies.includes(comp.id)}
                        onChange={() => toggleCompany(comp.id)}
                      />
                      <span className="truncate">{comp.name} {comp.municipalInsc ? `(${comp.municipalInsc})` : ""}</span>
                    </label>
                  ))}
                  {props.companiesList.length === 0 && (
                    <p className="text-slate-400">Nenhuma empresa cadastrada no sistema.</p>
                  )}
                </div>
              </div>

              <label className="block text-xs font-medium">Motivo / Fundamento
                <textarea name="reason" required placeholder="Ex: Regularização anual de CRC e vínculo societário/fiscal" className={field} />
              </label>

              <button
                disabled={pending}
                className="w-full rounded bg-emerald-700 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Salvar versão {(latest?.version ?? 0) + 1}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
