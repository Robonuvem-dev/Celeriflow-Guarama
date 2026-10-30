"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { procurementAuxiliaryCatalogs, type ProcurementAuxiliaryCatalog, type ProcurementAuxiliaryRecord } from "@/lib/compras/auxiliary-catalogs";
import { saveAuxiliaryCatalog } from "./actions";
export function AuxiliaryCatalogClient({ catalog, records, options = {}, readOnly = false }: { catalog: ProcurementAuxiliaryCatalog; records: ProcurementAuxiliaryRecord[]; options?: Record<string, { value: string; label: string }[]>; readOnly?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProcurementAuxiliaryRecord | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const definition = procurementAuxiliaryCatalogs[catalog];
  return <main className="space-y-4 p-4">
    <Link href="/compras/cadastros">Voltar aos cadastros</Link><h1 className="text-xl font-semibold">{definition.title}</h1>
    {catalog === "crc" && <Link className="underline" href="/compras/cadastros/crc/relatorio">Relatório de totalização por período</Link>}
    {catalog === "remanejamentos" && <p>Distribua os itens entre requisitantes antes de registrar o ato. O remanejamento transfere o saldo entre distribuições do mesmo item e contrato, sem alterar a quantidade contratada. Atos registrados são imutáveis. <Link className="underline" href="/compras/cadastros/cotas-requisitantes">Consultar distribuições</Link></p>}
    {catalog === "cotas-requisitantes" && <Link className="underline" href="/compras/cadastros/remanejamentos">Registrar apostilamento de remanejamento</Link>}
    {!readOnly && <form key={editing?.id ?? "new"} className="grid max-w-2xl gap-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setFeedback("");
      const form = new FormData(event.currentTarget);
      try {
        const fields = Object.fromEntries(Object.keys(definition.fields).map(key => [key, ["fornecedores", "usuarios"].includes(key) ? form.getAll(key).map(String).join(", ") : String(form.get(key) ?? "")]));
        const result = await saveAuxiliaryCatalog(catalog, { id: editing?.id, code: String(form.get("code")), name: String(form.get("name")), fields });
        if (!result.success) setFeedback(result.error ?? "Falha ao salvar.");
        else { setEditing(null); setFeedback("Cadastro salvo."); router.refresh(); }
      } catch { setFeedback("Falha de comunicação. Tente novamente."); } finally { setBusy(false); }
    }}>
      <label>Código<input className="block rounded border p-2" name="code" required maxLength={50} defaultValue={editing?.code} /></label>
      <label>Descrição<input className="block w-full rounded border p-2" name="name" required maxLength={200} defaultValue={editing?.name} /></label>
      {Object.entries(definition.fields).map(([key, label]) => <label key={key}>{label}{options[key] ? <select className="block w-full rounded border p-2" name={key} required multiple={["fornecedores", "usuarios"].includes(key)} defaultValue={["fornecedores", "usuarios"].includes(key) ? editing?.fields[key]?.split(",").map(value => value.trim()) ?? [] : editing?.fields[key] ?? ""}><option value="" disabled>Selecione</option>{options[key].map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input className="block rounded border p-2" name={key} required={key !== "grupoPai"} defaultValue={editing?.fields[key]} maxLength={200} />}</label>)}
      <div className="flex gap-3"><button className="rounded border px-3 py-2" disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar"}</button>{editing && <button type="button" onClick={() => setEditing(null)}>Cancelar edição</button>}</div>
    </form>}
    <p role="status">{feedback}</p>
    <label>Pesquisar<input className="ml-2 rounded border p-2" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <table className="w-full text-left"><thead><tr><th>Código</th><th>Descrição</th>{Object.entries(definition.fields).map(([key,label]) => <th key={key}>{label}</th>)}<th>Ações</th></tr></thead><tbody>
      {records.filter(record => `${record.code} ${record.name} ${Object.entries(record.fields).map(([key, value]) => options[key] ? value.split(",").map(id => options[key].find(option => option.value === id.trim())?.label || value).join(" ") : value).join(" ")}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).map(record => <tr key={record.id} className="border-b"><td>{record.code}</td><td>{record.name}</td>{Object.keys(definition.fields).map(key => <td key={key}>{options[key] ? record.fields[key]?.split(",").map(value => options[key].find(option => option.value === value.trim())?.label || "Registro indisponível").join(", ") : record.fields[key] || "—"}</td>)}<td>{!readOnly && catalog !== "remanejamentos" && <button onClick={() => { setEditing(record); setFeedback(""); }}>Editar</button>}</td></tr>)}
    </tbody></table>{records.length === 0 && <p>Nenhum registro cadastrado.</p>}
  </main>;
}
