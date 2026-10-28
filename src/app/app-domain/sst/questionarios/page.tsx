import Link from "next/link";
import { getTenantContextForModule, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { integrationUnits } from "@/lib/sst/esocial-service";
import { findSstClinicalGrant } from "@/db/repositories/sst/access";
import { sstDatabase } from "@/lib/sst/database";
import { readSstQuestionnairesPage } from "@/db/repositories/sst-pages/clinical-options";
import { QuestionnaireForm } from "./QuestionnaireForm";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function SstQuestionnairesPage({ searchParams }: { searchParams: Promise<{ budgetUnitId?: string; q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await integrationUnits(context);
  const unit = units.find((item) => item.id === params.budgetUnitId);
  const { total, page, records } = await readSstQuestionnairesPage(database, params.budgetUnitId ? unit ? [unit.id] : [] : units.map(item => item.id), params);
  const grant = unit && !isSystemAdministrator(context.user) ? await findSstClinicalGrant(database, context.user.id, unit.id) : null;
  const create = canPerformModuleOperation(context.user, "SST", "create") && (isSystemAdministrator(context.user) || grant?.canAssess);
  const href = (value: number) => `/sst/questionarios?${new URLSearchParams({ budgetUnitId: params.budgetUnitId || "", q: params.q || "", page: String(value) })}`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Questionários de anamnese médica</h1><p>Versões preservadas por UG, com perguntas personalizadas e impressão em branco.</p>
    <form className="flex flex-wrap gap-2"><select aria-label="UG" name="budgetUnitId" defaultValue={params.budgetUnitId} className="rounded border p-2"><option value="">Todas as UGs clínicas autorizadas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Título" name="q" defaultValue={params.q} placeholder="Buscar por título" className="rounded border p-2"/><button className="rounded border p-2">Filtrar</button></form>
    {unit && create && <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Registrar questionário ou nova versão</summary><QuestionnaireForm key={unit.id} budgetUnitId={unit.id}/></details>}
    <table className="w-full table-fixed text-left text-sm"><thead><tr><th className="p-2">Código</th><th className="p-2">Título</th><th className="p-2">Versão</th><th className="p-2">Ficha</th></tr></thead><tbody>{records.map((record) => <tr key={record.id} className="border-b"><td className="break-words p-2">{record.code}</td><td className="break-words p-2">{record.title}</td><td className="p-2">{record.version}</td><td className="p-2"><Link className="underline" href={`/sst/questionarios/${record.id}`}>Abrir</Link></td></tr>)}</tbody></table>
    {!records.length && <p role="status">Nenhum questionário encontrado nas UGs clínicas autorizadas.</p>}
    <ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/>
  </div>;
}
