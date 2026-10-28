import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { cemeteryQueryHref, cemeteryQuerySchema, type CemeterySearchParams } from "@/lib/cemeteries/query-policy";
import { cemeteryBurialReport } from "@/lib/cemeteries/queries";
import { CemeteryQueryFilters } from "@/components/cemeteries/CemeteryQueryFilters";
import CemeteryPrintButton from "@/components/cemeteries/CemeteryPrintButton";
import { db, databaseConnection } from "@/db/client";
import { recordCemeteryReport } from "@/db/repositories/cemeteries/reports";
import { randomUUID, createHash } from "node:crypto";

export default async function CemeteryBurialReportPage({ searchParams }: { searchParams: Promise<CemeterySearchParams> }) {
  const context = await getTenantContextForModuleOperation("CEMITERIOS", "issueReports");
  const parsed = cemeteryQuerySchema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert" className="p-6">Período inválido: {parsed.error.issues[0].message}</p>;
  const query = parsed.data;
  const rows = await cemeteryBurialReport(db, query);
  const reportId = randomUUID();
  await recordCemeteryReport(databaseConnection, { id: reportId, actorId: context.user.id, fieldName: "emissao", evidence: { filters: query, total: rows.length, rowsHash: createHash("sha256").update(JSON.stringify(rows)).digest("hex") } });
  return <main className="space-y-4 p-6"><div className="print:hidden"><CemeteryQueryFilters query={query} report /></div><header><h1 className="text-2xl font-bold">Prefeitura Municipal de Ibema · Relatório de sepultados</h1><p>Data efetiva: {query.start || "início do histórico"} até {query.end || "fim do histórico"} · Funerária: {query.funeralHome ? rows.find(r => r.funeralHomeId === query.funeralHome)?.funeralHome?.name || query.funeralHome : "todas"}</p><p>{rows.length} sepultamentos concluídos · emissão {new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></header><CemeteryPrintButton />
    <a className="inline-block rounded border p-2 print:hidden" target="_blank" rel="noreferrer" href={cemeteryQueryHref("/api/cemiterios/relatorios", query, 1)}>Baixar PDF completo</a>
    <table className="w-full text-left text-sm"><thead><tr>{["Comprovante", "Falecido", "Óbito", "Sepultamento efetivo", "Cemitério / sepultura", "Funerária", "Situação atual"].map(h => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td className="border-b p-2">{r.receiptCode}</td><td className="border-b p-2">{r.deceased.fullName}</td><td className="border-b p-2">{r.deceased.deathDate.toISOString().slice(0,10)}</td><td className="border-b p-2">{r.performedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="border-b p-2">{r.cemetery?.name} / {r.grave?.code}</td><td className="border-b p-2">{r.funeralHome?.name || "—"}</td><td className="border-b p-2">{r.status}</td></tr>)}</tbody></table>{!rows.length && <p>Nenhum sepultamento concluído no período.</p>}
  </main>;
}
