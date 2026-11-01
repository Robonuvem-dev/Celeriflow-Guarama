import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { readManagedDesifInfraction } from "@/lib/tributacao/desif-infraction-management";
import { desifAdministrativeStatuses, desifMetadataFields, readDesifMetadata } from "@/lib/tributacao/desif-requirements";
import { saveDesifMetadataAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function DesifMetadataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("TRIBUTACAO");
  const database = taxActionConnection(context).db;
  const row = await readManagedDesifInfraction(database, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
  const metadata = await readDesifMetadata(database, id);
  return <main className="space-y-4 p-5"><h1 className="text-xl font-bold">Dados complementares do auto — {row.institutionName}</h1><Link href="/tributacao/iss-bancario/gestao">Voltar à gestão</Link><p>Última atualização complementar: {metadata.updatedAt ?? "Sem registro"}</p><p>Apuração original: {row.penalty}. As informações abaixo compõem o histórico administrativo; percentuais não recalculam automaticamente o débito e a fase não cancela o lançamento.</p><form action={saveDesifMetadataAction} className="grid gap-3 md:grid-cols-2"><input name="caseId" type="hidden" value={id}/><label>Situação administrativa<select name="status" className="block rounded border p-2" defaultValue={metadata.status ?? "Início"}>{desifAdministrativeStatuses.map(status => <option key={status}>{status}</option>)}</select></label>{desifMetadataFields.map(([name,label,type]) => <label key={name}>{label}<input name={name} type={type} step={type === "number" ? "any" : undefined} maxLength={4000} className="block w-full rounded border p-2" defaultValue={metadata[name] ?? (name === "calendarYear" ? row.competence.slice(0,4) : "")}/></label>)}<label>Justificativa da alteração<textarea className="block w-full rounded border p-2" name="reason" required minLength={10} maxLength={2000}/></label><button className="rounded border p-2">Salvar dados no histórico</button></form></main>;
}
