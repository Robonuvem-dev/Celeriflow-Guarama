"use client";
import Link from "next/link";
import { useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { socialReportKinds, type SocialReport, type SocialReportFilter } from "@/lib/social/report-contract";
import type { SocialOption } from "@/lib/social/workflow-contract";

export function SocialReportPreview({ report, filters, units, options }: { report: SocialReport; filters: SocialReportFilter; units: { id: string; name: string }[]; options: Record<string, SocialOption[]> }) {
  const [section, setSection] = useState(0); const [page, setPage] = useState(1);
  const current = report.sections[section], field = "rounded border p-2 text-sm";
  const params = new URLSearchParams(filters);
  return <main className="space-y-3 p-3">
    <h1 className="text-xl font-semibold">Relatórios da Assistência Social</h1>
    <form className="grid gap-2 rounded border p-3 md:grid-cols-4">
      <label>Relatório<select name="kind" defaultValue={filters.kind} className={`${field} block w-full`}>{Object.entries(socialReportKinds).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
      <label>Início<input required type="date" name="from" defaultValue={filters.from} className={`${field} block w-full`} /></label>
      <label>Fim / referência etária<input required type="date" name="to" defaultValue={filters.to} className={`${field} block w-full`} /></label>
      <label>Unidade<select name="unitId" defaultValue={filters.unitId} className={`${field} block w-full`}><option value="">Todas autorizadas</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      {[["professionalId", "Profissional", "professionals"], ["groupId", "SCFV", "groups"], ["personId", "Beneficiário", "people"], ["familyId", "Família", "families"]].map(([key, label, reference]) => <label key={key}>{label}<select name={key} defaultValue={filters[key as keyof SocialReportFilter]} className={`${field} block w-full`}><option value="">Todos</option>{(options[reference] || []).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}
      <label>Tipo de encaminhamento<input name="referralType" defaultValue={filters.referralType} className={`${field} block w-full`} /></label>
      <button className="rounded bg-blue-600 px-3 py-2 text-white">Consultar</button><Link href="/social/relatorios">Limpar</Link>
    </form>
    <p className="text-sm">{report.title} — {report.period}</p><p className="text-xs text-slate-600">{report.note}</p>
    <nav className="flex gap-4">{["pdf", "csv", "xlsx"].map(format => <a key={format} className="text-blue-700 underline" href={`/api/social/relatorios?${params}&format=${format}`}>Emitir {format.toUpperCase()}</a>)}<Link href="/social">Painel</Link></nav>
    {current && <OperationalTablePanel title={report.title} triggerLabel="Consultar registros do relatório">
      <OperationalListFrame toolbar={<select aria-label="Seção" className={field} value={section} onChange={e => { setSection(Number(e.target.value)); setPage(1); }}>{report.sections.map((s, i) => <option key={i} value={i}>{s.title} ({s.rows.length})</option>)}</select>} pagination={<OperationalPagination page={page} total={current.rows.length} onPageChange={setPage} />}>
        <OperationalTable caption={current.title} preferenceId={`social-report-${filters.kind}-${section}`} columns={current.headers.map((label, i) => ({ key: String(i), label, initialWidth: 180, minWidth: 70, resizable: true, sortable: false, type: "text", details: "overflow" }))} rows={current.rows.slice((page - 1) * 20, page * 20).map((values, index) => ({ id: String((page - 1) * 20 + index), label: values[0] || "Registro", values: Object.fromEntries(values.map((v, i) => [String(i), v])) }))} />
      </OperationalListFrame>
    </OperationalTablePanel>}
  </main>;
}
