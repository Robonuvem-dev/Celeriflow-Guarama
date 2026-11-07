"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  taxReferenceCatalogs,
  taxReferenceExtraFields,
  searchTaxReferences,
  renderReferenceConclusion,
  type TaxReferenceKind,
  type TaxReferenceRow,
} from "@/lib/tributacao/reference-catalog";
import { saveTaxReferenceAction } from "./actions";

const input =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-[#0e4c7e] focus:outline-none focus:ring-1 focus:ring-[#0e4c7e]";

const cf27QuickCatalogs: { kind: TaxReferenceKind; shortLabel: string; ref: string }[] = [
  { kind: "painel", shortLabel: "Painel / Links", ref: "27.10" },
  { kind: "orgao-municipio", shortLabel: "Órgãos / Municípios (TOM)", ref: "27.11" },
  { kind: "orgao-configuracao", shortLabel: "Prefeitura / Brasão / Auto", ref: "27.12-14" },
  { kind: "titulo-setor", shortLabel: "Títulos do Setor", ref: "27.15" },
  { kind: "usuario-municipal", shortLabel: "Usuários do Município", ref: "27.16-17" },
  { kind: "atividade", shortLabel: "Atividades SN", ref: "27.18-19" },
  { kind: "unidade-administrativa", shortLabel: "Unidades Administrativas", ref: "27.20" },
  { kind: "cnae-fiscal", shortLabel: "CNAE-Fiscal", ref: "27.21" },
  { kind: "evento", shortLabel: "Eventos SN", ref: "27.22-23" },
  { kind: "evento-mei", shortLabel: "Eventos MEI", ref: "27.24" },
  { kind: "instituicao-financeira", shortLabel: "Bancos / Inst. Financeiras", ref: "27.25" },
  { kind: "situacao-parcelamento", shortLabel: "Situações de Parcelamento", ref: "27.26" },
  { kind: "receita", shortLabel: "Receitas", ref: "27.27" },
  { kind: "tributo", shortLabel: "Tributos", ref: "27.28" },
  { kind: "sistema-origem", shortLabel: "Sistemas de Origem", ref: "27.29" },
  { kind: "tipo-arquivo", shortLabel: "Tipos de Arquivos", ref: "27.30" },
];

export default function TaxReferenceClient({
  rows,
  units,
  taxpayers,
  users,
  initialKind = "atividade",
}: {
  users: { id: string; label: string }[];
  taxpayers: { id: string; label: string }[];
  initialKind?: TaxReferenceKind;
  rows: TaxReferenceRow[];
  units: { id: string; entityId: string; label: string }[];
}) {
  const [kind, setKind] = useState<TaxReferenceKind>(initialKind);
  const [q, setQ] = useState("");
  const [id, setId] = useState("");
  const [viewId, setViewId] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const [filters, setFilters] = useState<Record<string, string>>({});

  const fields = taxReferenceExtraFields[kind] ?? [];
  const editing = rows.find((row) => row.id === id && !row.deleted);
  const viewing = rows.find((row) => row.id === viewId && !row.deleted);
  const visible = searchTaxReferences(rows, kind, q).filter((row) =>
    Object.entries(filters).every(([key, value]) => !value || String(row.data[key as keyof typeof row.data]) === value),
  );

  function selectCatalog(nextKind: TaxReferenceKind) {
    setKind(nextKind);
    setId("");
    setViewId("");
    setFilters({});
  }

  return (
    <main className="space-y-4 overflow-auto p-5">
      <header className="cf-portal-hero rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sky-800">
              Cadastros e Parâmetros Fiscais · Simples Nacional / DES-IF
            </p>
            <h1 className="text-xl font-bold text-slate-900">Tabelas Auxiliares Fiscais e Parâmetros do Simples Nacional</h1>
            <p className="mt-1 text-xs text-slate-600">
              Consulte, visualize, inclua e mantenha as referências do Simples Nacional, MEI, fiscalização e DES-IF por ente e unidade gestora.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 print:hidden" aria-label="Atalhos do Simples Nacional">
            <Link
              href="/tributacao/simples-nacional"
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100"
            >
              Painel Simples Nacional
            </Link>
            <Link
              href="/tributacao/simples-nacional/consulta"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Consulta / Dossiê SN
            </Link>
            <Link
              href="/tributacao/simples-nacional/arquivos"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Importação / Exportação SN
            </Link>
            <Link
              href="/configuracoes/usuarios"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Gestão de Usuários
            </Link>
          </nav>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 print:hidden">
          {cf27QuickCatalogs.map((item) => {
            const active = kind === item.kind;
            return (
              <button
                key={item.kind}
                type="button"
                onClick={() => selectCatalog(item.kind)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-sky-800 bg-sky-800 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </div>
      </header>

      {notice && (
        <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-950">
          {notice}
        </div>
      )}

      <section className="cf-portal-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-700">
            Tabela / Catálogo de Referência
            <select
              className={input}
              value={kind}
              onChange={(e) => selectCatalog(e.target.value as TaxReferenceKind)}
            >
              {Object.entries(taxReferenceCatalogs).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700 md:col-span-2">
            Pesquisar por código, nome, descrição ou atributo
            <input
              className={input}
              placeholder="Digite código, descrição, tipo de evento, natureza ou referência..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>

        {kind === "painel" && (
          <section className="grid gap-2 pt-1">
            {visible
              .filter((row) => row.data.validUntil >= new Date().toISOString().slice(0, 10))
              .map((row) => (
                <a
                  className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  href={row.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  key={row.id}
                >
                  {row.data.name} · válido até {row.data.validUntil} ({row.data.url})
                </a>
              ))}
          </section>
        )}

        <section className="flex flex-wrap items-end gap-3">
          {fields
            .filter((field) => field.filter)
            .map((field) => (
              <label key={field.name} className="text-xs font-semibold text-slate-700">
                {field.label}
                {field.type === "checkbox" || field.options ? (
                  <select
                    className={input}
                    value={filters[field.name] ?? ""}
                    onChange={(event) => setFilters({ ...filters, [field.name]: event.target.value })}
                  >
                    <option value="">Todos</option>
                    {field.type === "checkbox" ? (
                      <>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </>
                    ) : (
                      (field.options ?? [])
                        .filter(Boolean)
                        .map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))
                    )}
                  </select>
                ) : (
                  <input
                    className={input}
                    value={filters[field.name] ?? ""}
                    onChange={(event) => setFilters({ ...filters, [field.name]: event.target.value })}
                  />
                )}
              </label>
            ))}
          {kind === "orgao-municipio" && (
            <label className="text-xs font-semibold text-slate-700">
              Usuário vinculado
              <select
                className={input}
                value={filters.userId ?? ""}
                onChange={(event) => setFilters({ ...filters, userId: event.target.value })}
              >
                <option value="">Todos</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="ml-auto flex gap-2 print:hidden">
            {Object.values(filters).some(Boolean) && (
              <button
                type="button"
                onClick={() => setFilters({})}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Limpar filtros
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Imprimir consulta
            </button>
          </div>
        </section>
      </section>

      {viewing && (
        <section
          aria-label="Visualização detalhada do registro"
          className="rounded-xl border border-sky-300 bg-sky-50/70 p-4 shadow-sm print:hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-200 pb-2">
            <div>
              <span className="text-xs font-bold uppercase text-sky-800">{taxReferenceCatalogs[viewing.data.kind]}</span>
              <h2 className="text-sm font-bold text-slate-900">
                Visualizar registro: {viewing.data.code} — {viewing.data.name}
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setId(viewing.id);
                  setViewId("");
                }}
                className="rounded-md bg-sky-800 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-900"
              >
                Editar este registro
              </button>
              <button
                type="button"
                onClick={() => setViewId("")}
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fechar visualização
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 text-xs text-slate-800 md:grid-cols-3">
            <div>
              <strong className="block text-slate-500">Código:</strong>
              <span className="font-mono font-semibold">{viewing.data.code}</span>
            </div>
            <div>
              <strong className="block text-slate-500">Descrição / Nome:</strong>
              <span className="font-semibold">{viewing.data.name}</span>
            </div>
            <div>
              <strong className="block text-slate-500">Unidade Gestora (UG):</strong>
              <span>{units.find((u) => u.id === viewing.data.budgetUnitId)?.label ?? viewing.data.budgetUnitId}</span>
            </div>
            {viewing.data.details && (
              <div className="md:col-span-3">
                <strong className="block text-slate-500">Detalhes / Observações:</strong>
                <span>{viewing.data.details}</span>
              </div>
            )}
            {(taxReferenceExtraFields[viewing.data.kind] ?? []).map((field) => {
              const value = viewing.data[field.name];
              if (value === "" || value === undefined) return null;
              return (
                <div key={field.name}>
                  <strong className="block text-slate-500">{field.label}:</strong>
                  <span>{typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}</span>
                </div>
              );
            })}
            {viewing.data.userId && (
              <div>
                <strong className="block text-slate-500">Usuário / Servidor vinculado:</strong>
                <span>
                  {users.find((u) => u.id === viewing.data.userId)?.label ?? viewing.data.userId}
                  {viewing.data.position ? ` · ${viewing.data.position}` : ""}
                  {viewing.data.registration ? ` · Matrícula ${viewing.data.registration}` : ""}
                </span>
              </div>
            )}
            {viewing.data.relatedCode && (
              <div>
                <strong className="block text-slate-500">Código relacionado:</strong>
                <span>{viewing.data.relatedCode}</span>
              </div>
            )}
            <div>
              <strong className="block text-slate-500">Versão auditada:</strong>
              <span>v{viewing.version}</span>
            </div>
          </div>
        </section>
      )}

      <section className="cf-portal-card overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-bold text-slate-800">
            {taxReferenceCatalogs[kind]} · {visible.length} registro(s) encontrado(s)
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700">
              <th className="px-3 py-2 font-semibold">Código</th>
              <th className="px-3 py-2 font-semibold">Nome / descrição</th>
              <th className="px-3 py-2 font-semibold">Atributos e Detalhes</th>
              <th className="px-3 py-2 font-semibold">UG</th>
              <th className="px-3 py-2 font-semibold print:hidden">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visible.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono font-semibold text-slate-900">{row.data.code}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{row.data.name}</td>
                <td className="px-3 py-2 text-slate-700 space-y-0.5">
                  {row.data.userId && (
                    <p>
                      {users.find((user) => user.id === row.data.userId)?.label ?? row.data.userId}
                      {row.data.position ? ` · ${row.data.position}` : ""}
                      {row.data.registration ? ` · matrícula ${row.data.registration}` : ""}
                    </p>
                  )}
                  {row.data.taxpayerId && (
                    <p>
                      {taxpayers.find((t) => t.id === row.data.taxpayerId)?.label ?? row.data.taxpayerId} · {row.data.model} · série{" "}
                      {row.data.serialNumber} · {row.data.equipmentStatus}
                    </p>
                  )}
                  {row.data.coatUrl && (
                    <a
                      href={row.data.coatUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-700 underline"
                    >
                      Brasão do órgão
                    </a>
                  )}
                  {row.data.conclusionTemplate && (
                    <p>{renderReferenceConclusion(row.data.conclusionTemplate, row.data.code, row.data.name)}</p>
                  )}
                  {row.data.details && <p>{row.data.details}</p>}
                  {(taxReferenceExtraFields[row.data.kind] ?? []).map((field) => {
                    const value = row.data[field.name];
                    return value !== "" && value !== undefined ? (
                      <p key={field.name}>
                        <span className="font-semibold">{field.label}:</span>{" "}
                        {typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}
                      </p>
                    ) : null;
                  })}
                  {row.data.relatedCode && <p>Referência: {row.data.relatedCode}</p>}
                  {row.data.ignoreRevenue && <p className="text-amber-800 font-medium">Ignorar receita</p>}
                </td>
                <td className="px-3 py-2 text-slate-600">{units.find((u) => u.id === row.data.budgetUnitId)?.label}</td>
                <td className="px-3 py-2 space-x-1.5 whitespace-nowrap print:hidden">
                  <button
                    type="button"
                    onClick={() => setViewId(row.id)}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Visualizar
                  </button>
                  <button
                    type="button"
                    onClick={() => setId(row.id)}
                    className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    Visualizar / editar
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Excluir ${row.data.code} — ${row.data.name}?`))
                        start(async () => {
                          const result = await saveTaxReferenceAction(row.data, row.version, row.id, true);
                          setNotice(result.error ?? "Registro excluído. Histórico preservado.");
                          if (!result.error) {
                            setId("");
                            if (viewId === row.id) setViewId("");
                          }
                        });
                    }}
                    className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="p-4 text-xs text-slate-600">Nenhum registro encontrado para esta consulta.</p>
        )}
      </section>

      <section className="cf-portal-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-sm font-bold text-slate-900">
            {editing ? `Editar ${editing.data.code} — ${editing.data.name}` : `Incluir novo registro em ${taxReferenceCatalogs[kind]}`}
          </h2>
          <button
            type="button"
            onClick={() => setId("")}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Novo registro
          </button>
        </div>
        <form
          key={`${kind}:${id}:${editing?.version ?? 0}`}
          className="grid gap-3 md:grid-cols-2"
          action={(form) => {
            const unit = units.find((u) => u.id === form.get("unit"));
            start(async () => {
              const result = await saveTaxReferenceAction(
                {
                  kind,
                  code: String(form.get("code")),
                  name: String(form.get("name")),
                  details: String(form.get("details")),
                  userId: String(form.get("userId") ?? ""),
                  position: String(form.get("position") ?? ""),
                  registration: String(form.get("registration") ?? ""),
                  taxpayerId: String(form.get("taxpayerId") ?? ""),
                  model: String(form.get("model") ?? ""),
                  serialNumber: String(form.get("serialNumber") ?? ""),
                  equipmentStatus: String(form.get("equipmentStatus") ?? "ATIVO"),
                  url: String(form.get("url") ?? ""),
                  validUntil: String(form.get("validUntil") ?? ""),
                  coatUrl: String(form.get("coatUrl") ?? ""),
                  conclusionTemplate: String(form.get("conclusionTemplate") ?? ""),
                  relatedCode: String(form.get("relatedCode")),
                  ignoreRevenue: form.get("ignoreRevenue") === "on",
                  ...Object.fromEntries(
                    fields.map((field) => [
                      field.name,
                      field.type === "checkbox" ? form.get(field.name) === "on" : String(form.get(field.name) ?? ""),
                    ]),
                  ),
                  budgetUnitId: unit?.id ?? "",
                  governmentEntityId: unit?.entityId ?? "",
                },
                editing?.version ?? 0,
                editing?.id,
              );
              setNotice(result.error ?? "Registro salvo.");
              if (!result.error) setId("");
            });
          }}
        >
          <label className="text-xs font-semibold text-slate-700">
            Ente / UG
            <select name="unit" className={input} defaultValue={editing?.data.budgetUnitId} disabled={!!editing}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
            {editing && <input type="hidden" name="unit" value={editing.data.budgetUnitId} />}
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Código
            <input
              name="code"
              className={input}
              required
              maxLength={80}
              readOnly={!!editing}
              defaultValue={editing?.data.code}
            />
          </label>
          <label className="text-xs font-semibold text-slate-700 md:col-span-2">
            Nome / descrição
            <input name="name" className={input} required maxLength={240} defaultValue={editing?.data.name} />
          </label>
          <label className="text-xs font-semibold text-slate-700 md:col-span-2">
            Detalhes
            <textarea name="details" className={input} maxLength={4000} defaultValue={editing?.data.details} />
          </label>

          {kind === "usuario-municipal" && (
            <>
              <label className="text-xs font-semibold text-slate-700">
                Usuário do sistema
                <select name="userId" required className={input} defaultValue={editing?.data.userId}>
                  <option value="">Selecione</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Cargo / função
                <input name="position" required className={input} defaultValue={editing?.data.position} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Matrícula
                <input name="registration" required className={input} defaultValue={editing?.data.registration} />
              </label>
            </>
          )}

          {kind === "equipamento-credenciado" && (
            <>
              <label className="text-xs font-semibold text-slate-700">
                Credenciado
                <select name="taxpayerId" required className={input} defaultValue={editing?.data.taxpayerId}>
                  <option value="">Selecione</option>
                  {taxpayers.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Modelo
                <input name="model" required className={input} defaultValue={editing?.data.model} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Número de série
                <input name="serialNumber" required className={input} defaultValue={editing?.data.serialNumber} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Situação
                <select name="equipmentStatus" className={input} defaultValue={editing?.data.equipmentStatus}>
                  <option>ATIVO</option>
                  <option>INATIVO</option>
                </select>
              </label>
            </>
          )}

          {kind === "painel" && (
            <>
              <label className="text-xs font-semibold text-slate-700">
                Endereço do link
                <input type="url" name="url" required className={input} defaultValue={editing?.data.url} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Validade
                <input type="date" name="validUntil" required className={input} defaultValue={editing?.data.validUntil} />
              </label>
            </>
          )}

          {kind === "orgao-configuracao" && (
            <>
              <label className="text-xs font-semibold text-slate-700">
                URL HTTPS do brasão
                <input type="url" name="coatUrl" className={input} defaultValue={editing?.data.coatUrl} />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Conclusão do auto (tags: código e nome)
                <textarea name="conclusionTemplate" className={input} defaultValue={editing?.data.conclusionTemplate} />
              </label>
            </>
          )}

          {kind === "orgao-municipio" && (
            <label className="text-xs font-semibold text-slate-700">
              Usuário vinculado
              <select name="userId" className={input} defaultValue={editing?.data.userId ?? ""}>
                <option value="">Sem vínculo</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {fields.map((field) => (
            <label
              key={field.name}
              className={`text-xs font-semibold text-slate-700 ${field.type === "checkbox" ? "flex items-center gap-2 pt-4" : ""}`}
            >
              {field.type === "checkbox" ? (
                <>
                  <input
                    type="checkbox"
                    name={field.name}
                    defaultChecked={Boolean(editing?.data[field.name] ?? (field.name === "dueInMunicipality"))}
                  />
                  <span>{field.label}</span>
                </>
              ) : field.options ? (
                <>
                  {field.label}
                  <select name={field.name} className={input} defaultValue={String(editing?.data[field.name] ?? "")}>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option || "Selecione"}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  {field.label}
                  <input
                    name={field.name}
                    type={field.type ?? "text"}
                    className={input}
                    defaultValue={String(editing?.data[field.name] ?? "")}
                  />
                </>
              )}
            </label>
          ))}

          <label className="text-xs font-semibold text-slate-700">
            Código relacionado (serviço, UF, órgão ou conta)
            <input name="relatedCode" className={input} maxLength={80} defaultValue={editing?.data.relatedCode} />
          </label>

          {kind === "atividade" && (
            <label className="flex items-center gap-2 pt-4 text-xs font-semibold text-slate-700">
              <input type="checkbox" name="ignoreRevenue" defaultChecked={editing?.data.ignoreRevenue} />
              <span>Ignorar receita nesta atividade</span>
            </label>
          )}

          <div className="md:col-span-2 pt-2">
            <button
              disabled={pending || !units.length}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              Salvar
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
