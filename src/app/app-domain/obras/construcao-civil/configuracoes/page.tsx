import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCatalogs, weightsSchema } from "@/lib/obras/construction-policy";
import ConstructionSettingsClient from "./ConstructionSettingsClient";
import { db } from "@/db/client";
import { loadPageSettings } from "@/db/repositories/works-pages/settings";

export default async function ConstructionSettingsPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; status?: string; page?: string; view?: string }> }) {
  const params = await searchParams;
  const kind = params.kind && Object.hasOwn(constructionCatalogs, params.kind) ? params.kind as keyof typeof constructionCatalogs : "PERMIT_TYPE";
  const q = (params.q || "").trim().slice(0, 160);
  const status = params.status === "active" || params.status === "inactive" ? params.status : "all";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const { total, page, entries, config, subjects } = await loadPageSettings(context.database ?? db, { kind, q, status, page: params.page });
  return <ConstructionSettingsClient key={kind} configurationMode={params.view === "parametros"} entries={entries} kind={kind} q={q} status={status} page={page} total={total} subjects={subjects.map((subject) => ({ id: subject.id, name: `${subject.processType.name} — ${subject.name}` }))} canManage={access.administrator || access.roles.includes("MANAGER")} config={config ? { version: config.version, publishedAt: config.publishedAt.toISOString(), freeRevisions: config.freeRevisions, correctionDays: config.correctionDays, checkPropertyDebts: config.checkPropertyDebts, subjectIds: config.subjectIds, areaWeights: weightsSchema.parse(config.areaWeights), instructions: config.instructions } : null} />;
}
