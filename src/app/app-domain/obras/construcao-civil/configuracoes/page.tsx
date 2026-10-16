import { Settings } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCatalogs, weightsSchema } from "@/lib/obras/construction-policy";
import ConstructionSettingsClient from "./ConstructionSettingsClient";

export default async function ConstructionSettingsPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const kind = params.kind && Object.hasOwn(constructionCatalogs, params.kind) ? params.kind as keyof typeof constructionCatalogs : "PERMIT_TYPE";
  const q = (params.q || "").trim().slice(0, 160);
  const status = params.status === "active" || params.status === "inactive" ? params.status : "all";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  const where = { kind, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}), ...(status !== "all" ? { isActive: status === "active" } : {}) };
  const total = await context.prisma.constructionCatalogEntry.count({ where });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const [entries, config, subjects] = await Promise.all([
    context.prisma.constructionCatalogEntry.findMany({ where, select: { id: true, kind: true, name: true, description: true, isActive: true }, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }),
    context.prisma.constructionConfigVersion.findFirst({ orderBy: { version: "desc" } }),
    context.prisma.subject.findMany({ where: { isActive: true, allowsInternalOpening: true, processType: { isActive: true, allowsInternalOpening: true } }, select: { id: true, name: true, processType: { select: { name: true } } }, orderBy: { name: "asc" } }),
  ]);
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Configurações da Construção Civil" icon={<Settings className="size-4" />} />
    <ConstructionSettingsClient key={kind} entries={entries} kind={kind} q={q} status={status} page={page} total={total} subjects={subjects.map((subject) => ({ id: subject.id, name: `${subject.processType.name} — ${subject.name}` }))} canManage={access.administrator || access.roles.includes("MANAGER")} config={config ? { version: config.version, publishedAt: config.publishedAt.toISOString(), freeRevisions: config.freeRevisions, correctionDays: config.correctionDays, checkPropertyDebts: config.checkPropertyDebts, subjectIds: config.subjectIds, areaWeights: weightsSchema.parse(config.areaWeights), instructions: config.instructions } : null} />
  </PageFrame>;
}
