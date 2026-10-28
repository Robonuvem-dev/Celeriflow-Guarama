import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { getPrevention, electionResults, extinguisherValidity } from "@/lib/sst/prevention-service";
import { PreventionDocument } from "../../PreventionDocument";
import { PrintPrevention } from "./PrintPrevention";
import { findSstUnit } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
export const dynamic = "force-dynamic";
export default async function PreventionReport({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SST", "issueReports"), { id } = await params;
  const row = await getPrevention(context, id, true), latest = row.history.at(-1)?.artifact, original = row.history[0]?.artifact;
  const unit = await findSstUnit(sstDatabase(context), row.budgetUnitId);
  if (!unit) throw new Error("Unidade gestora não encontrada.");
  const results = row.kind === "ELECTION" ? await electionResults(context, id) : null;
  const validity = row.kind === "EXTINGUISHER" ? await extinguisherValidity(context, id) : null;
  return <main className="space-y-4 p-5"><PrintPrevention/><header><p>{unit.code} — {unit.name}</p><p>Documento SST {row.id} • emissão {new Date().toLocaleString("pt-BR")} • emitente {context.user.name}</p><p>Versão do histórico: {row.history.at(-1)?.version || 1}</p></header><PreventionDocument title={row.title} payload={row.payload} names={original && "names" in original ? original.names : {}} meeting={latest && "participants" in latest ? latest : undefined}/>{validity && <section><h2>Validade técnica atual</h2><p>Recarga: {new Date(validity.recharge).toLocaleDateString("pt-BR")}</p><p>Teste hidrostático: {validity.hydrostatic ? new Date(validity.hydrostatic).toLocaleDateString("pt-BR") : "Não registrado"}</p></section>}{results && <section><h2>Apuração CIPA</h2><p>{results.turnout}/{results.eligible} — participação {results.percent ?? "indisponível"}% — {results.closed ? results.valid ? "Quórum atingido" : "Quórum não atingido" : "Votação aberta; votos não publicados"}</p>{results.tally.map(t => <p key={t.candidateId || "blank"}>{t.name}: {t.votes}</p>)}</section>}</main>;
}
