"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilePlus2, X } from "lucide-react";
import { reviewTaxRegistryEntry, saveTaxRegistryEntry, type FiscalEntityType } from "./actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../TaxOperationalTable";

export type FiscalRegistryEntryView = {
  id: string;
  category: string;
  title: string;
  data: unknown;
  status: string;
  source: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  processId: string | null;
  documentId: string | null;
  version: number;
  createdAt: string;
};

type LinkItem = { label: string; href: string; description?: string };
type OptionItem = { id: string; label: string };

const tabCategories: Record<FiscalEntityType, { key: string; label: string; categories: string[] }[]> = {
  TAXPAYER: [
    { key: "dados", label: "Dados", categories: ["SITUACAO", "ATRIBUTO", "OBSERVACAO"] },
    { key: "enderecos", label: "Endereços e contatos", categories: ["ENDERECO", "CONTATO"] },
    { key: "vinculos", label: "Vínculos", categories: ["RELACIONAMENTO", "SOCIO", "COOPERADO"] },
    { key: "historico", label: "Histórico", categories: ["HISTORICO", "PEDIDO_ALTERACAO"] },
    { key: "processos", label: "Processos e documentos", categories: ["PROCESSO", "DOCUMENTO"] },
  ],
  REAL_ESTATE: [
    { key: "dados", label: "Dados", categories: ["SITUACAO", "ATRIBUTO", "CARACTERISTICA", "OBSERVACAO"] },
    { key: "proprietarios", label: "Proprietários", categories: ["PROPRIETARIO", "PARTICIPACAO"] },
    { key: "areas", label: "BCI e áreas", categories: ["BCI", "AREA", "VALORACAO", "CONDOMINIO", "UNIDADE"] },
    { key: "historico", label: "Histórico", categories: ["HISTORICO", "RECADASTRAMENTO", "CAMPANHA_RECADASTRAMENTO", "PEDIDO_ALTERACAO"] },
    { key: "tributos", label: "Tributos e ITBI", categories: ["SITUACAO_FISCAL", "TRIBUTO", "ITBI"] },
    { key: "processos", label: "Processos e documentos", categories: ["PROCESSO", "DOCUMENTO"] },
  ],
  ECONOMIC_REGISTRATION: [
    { key: "dados", label: "Dados", categories: ["SITUACAO", "ATRIBUTO", "CNAE", "REGIME", "ESTRUTURA", "RISCO_ATIVIDADE", "CREDENCIAMENTO_NFSE"] },
    { key: "contatos", label: "Endereços e contatos", categories: ["ENDERECO", "CONTATO"] },
    { key: "socios", label: "Sócios e vínculos", categories: ["SOCIO", "COOPERADO", "IMOVEL", "MATRIZ_FILIAL"] },
    { key: "historico", label: "Histórico", categories: ["HISTORICO", "SIMPLES", "FATURAMENTO", "OBSERVACAO"] },
    { key: "processos", label: "Processos e documentos", categories: ["PROCESSO", "DOCUMENTO", "NOTIFICACAO"] },
  ],
};

const categoryOptions: Record<FiscalEntityType, string[]> = {
  TAXPAYER: ["SITUACAO", "ATRIBUTO", "OBSERVACAO", "ENDERECO", "CONTATO", "RELACIONAMENTO", "SOCIO", "COOPERADO", "HISTORICO", "PEDIDO_ALTERACAO", "PROCESSO", "DOCUMENTO"],
  REAL_ESTATE: ["SITUACAO", "ATRIBUTO", "CARACTERISTICA", "OBSERVACAO", "PROPRIETARIO", "PARTICIPACAO", "BCI", "AREA", "VALORACAO", "CONDOMINIO", "UNIDADE", "HISTORICO", "RECADASTRAMENTO", "PEDIDO_ALTERACAO", "SITUACAO_FISCAL", "TRIBUTO", "ITBI", "PROCESSO", "DOCUMENTO"],
  ECONOMIC_REGISTRATION: ["SITUACAO", "ATRIBUTO", "CNAE", "REGIME", "ESTRUTURA", "RISCO_ATIVIDADE", "CREDENCIAMENTO_NFSE", "ENDERECO", "CONTATO", "SOCIO", "COOPERADO", "IMOVEL", "MATRIZ_FILIAL", "HISTORICO", "SIMPLES", "FATURAMENTO", "OBSERVACAO", "PROCESSO", "DOCUMENTO", "NOTIFICACAO"],
};

export function FiscalRecordWorkspace({ entityType, entityId, entries, links, processes, documents }: {
  entityType: FiscalEntityType;
  entityId: string;
  entries: FiscalRegistryEntryView[];
  links: LinkItem[];
  processes: OptionItem[];
  documents: OptionItem[];
}) {
  const tabs = tabCategories[entityType];
  const [activeTab, setActiveTab] = useState(tabs[0].key);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const active = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const visible = useMemo(() => entries.filter((entry) => active.categories.includes(entry.category)), [active, entries]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const result = await saveTaxRegistryEntry({
      entityType,
      entityId,
      category: String(form.get("category") ?? ""),
      title: String(form.get("title") ?? ""),
      details: String(form.get("details") ?? ""),
      value: String(form.get("value") ?? ""),
      percentage: String(form.get("percentage") ?? ""),
      effectiveFrom: String(form.get("effectiveFrom") ?? ""),
      effectiveUntil: String(form.get("effectiveUntil") ?? ""),
      source: String(form.get("source") ?? "INTERNO"),
      processId: String(form.get("processId") ?? ""),
      documentId: String(form.get("documentId") ?? ""),
      requiresReview: form.get("requiresReview") === "on",
    });
    setSubmitting(false);
    if (result.error) return setMessage(result.error);
    setOpen(false);
    setMessage("Registro fiscal salvo com histórico e vigência.");
  }

  async function review(id: string, decision: "APPROVE" | "REJECT") {
    const result = await reviewTaxRegistryEntry(id, decision);
    setMessage(result.error ?? (decision === "APPROVE" ? "Registro aprovado." : "Registro rejeitado."));
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2">
      <div className="flex min-w-0 flex-wrap gap-1">
        {tabs.map((tab) => <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`h-7 rounded px-2.5 text-[11px] font-semibold ${activeTab === tab.key ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{tab.label}</button>)}
      </div>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2.5 text-[11px] font-bold text-slate-950 hover:bg-amber-600"><FilePlus2 className="size-3.5" />Adicionar registro</button>
    </div>

    {message && <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{message}</p>}

    {links.length > 0 && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{links.map((link) => <Link key={link.href + link.label} href={link.href} className="rounded-md border border-slate-200 bg-white p-2 hover:border-emerald-300"><span className="block truncate text-xs font-semibold text-slate-800">{link.label}</span>{link.description && <span className="block truncate text-[10px] text-slate-500">{link.description}</span>}</Link>)}</div>}

    <OperationalTablePanel title="Registros da ficha fiscal" triggerLabel={`Abrir registros fiscais — ${active.label}`} description="Consulta por área cadastral com todas as versões, origens, detalhes e decisões; a ficha e o formulário de inclusão permanecem montados.">
      <TaxOperationalTable id={`registros-fiscais-${entityType}`} resetKey={`${entityId}:${activeTab}`} emptyMessage="Nenhum registro nesta aba."
        toolbar={<><select aria-label="Área dos registros fiscais" value={activeTab} onChange={event => setActiveTab(event.target.value)} className="h-7 rounded border px-2 text-[13px]">{tabs.map(tab => <option key={tab.key} value={tab.key}>{tab.label}</option>)}</select>{message && <OperationalFilters label="Resultado da revisão"><p role="status">{message}</p></OperationalFilters>}</>}
        columns={[["category", "Tipo", 56, 120], ["title", "Registro", 80, 180], ["version", "Versão", 40, 55], ["source", "Origem", 56, 100], ["details", "Detalhes", 80, 200], ["value", "Valor / referência", 60, 120], ["percentage", "Participação", 48, 70, "text", "right"], ["from", "Início da vigência", 64, 100], ["until", "Fim da vigência", 64, 100], ["status", "Situação", 70, 120, "status"], ["actions", "Ações", 48, 48, "actions"]]}
        rows={visible.map(entry => {
          const record = entry.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data as Record<string, unknown> : null;
          const display = (value: unknown) => value == null ? "—" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
          return { id: entry.id, label: entry.title, values: { category: entry.category.replaceAll("_", " "), title: entry.title, version: String(entry.version), source: entry.source, details: display(record ? record.details : entry.data), value: display(record?.value), percentage: record?.percentage == null ? "—" : `${String(record.percentage)}%`, from: new Date(entry.effectiveFrom).toLocaleDateString("pt-BR"), until: entry.effectiveUntil ? new Date(entry.effectiveUntil).toLocaleDateString("pt-BR") : "—", status: entry.status.replaceAll("_", " ") }, actions: entry.status === "PENDENTE_VALIDACAO" ? <TaxRowActions label={entry.title}><TaxRowAction onClick={() => review(entry.id, "APPROVE")}>Aprovar</TaxRowAction><TaxRowAction onClick={() => review(entry.id, "REJECT")}>Rejeitar</TaxRowAction></TaxRowActions> : null };
        })} />
    </OperationalTablePanel>

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-md bg-white shadow-xl"><div className="sticky top-0 flex items-center justify-between border-b bg-white px-4 py-3"><h2 className="text-sm font-bold">Novo registro cadastral</h2><button type="button" onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4" /></button></div><div className="grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-xs font-semibold">Categoria<select name="category" required className="input mt-1">{categoryOptions[entityType].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold">Título<input name="title" required className="input mt-1" /></label>
      <label className="text-xs font-semibold sm:col-span-2">Detalhamento<textarea name="details" required rows={3} className="input mt-1 h-auto" /></label>
      <label className="text-xs font-semibold">Valor ou referência<input name="value" className="input mt-1" /></label>
      <label className="text-xs font-semibold">Participação percentual<input name="percentage" type="number" min="0" max="100" step="0.0001" className="input mt-1" /></label>
      <label className="text-xs font-semibold">Início da vigência<input name="effectiveFrom" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input mt-1" /></label>
      <label className="text-xs font-semibold">Fim da vigência<input name="effectiveUntil" type="date" className="input mt-1" /></label>
      <label className="text-xs font-semibold">Origem<select name="source" className="input mt-1"><option value="INTERNO">Cadastro interno</option><option value="CONTRIBUINTE">Solicitação do contribuinte</option><option value="IMPORTACAO">Importação autorizada</option><option value="REDESIM">REDESIM</option></select></label>
      <label className="text-xs font-semibold">Processo<select name="processId" className="input mt-1"><option value="">Sem processo</option>{processes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="text-xs font-semibold sm:col-span-2">Documento GED<select name="documentId" className="input mt-1"><option value="">Sem documento</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label className="flex items-center gap-2 text-xs sm:col-span-2"><input name="requiresReview" type="checkbox" />Enviar para validação do gestor antes de vigorar</label>
      {message && <p className="text-xs text-rose-700 sm:col-span-2">{message}</p>}
    </div><div className="flex justify-end gap-2 border-t bg-slate-50 px-4 py-3"><button type="button" onClick={() => setOpen(false)} className="h-7 rounded border bg-white px-3 text-xs font-semibold">Cancelar</button><button disabled={submitting} className="h-7 rounded bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-60">{submitting ? "Salvando..." : "Salvar registro"}</button></div></form></div>}
  </div>;
}
