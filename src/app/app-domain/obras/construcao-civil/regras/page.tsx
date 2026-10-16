import { SlidersHorizontal } from "lucide-react";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { definitionKinds, definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionRulesClient from "./ConstructionRulesClient";

export default async function ConstructionRulesPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string; page?: string }> }) {
  const params = await searchParams;
  const tab = params.tab === "zones" || params.tab === "distribution" ? params.tab : "definitions";
  const kind = params.kind && Object.hasOwn(definitionKinds, params.kind) ? params.kind as keyof typeof definitionKinds : "FORM";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.length) notFound();
  const distributionScope = access.administrator ? {} : { departmentId: access.departmentId || "" };
  const total = tab === "zones" ? await context.prisma.constructionZoneVersion.count() : tab === "distribution" ? await context.prisma.constructionDistributionVersion.count({ where: distributionScope }) : await context.prisma.constructionDefinitionVersion.count({ where: { kind } });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const [definitions, zones, distributions, latest, purposes, properties, zoneOptions, departments, employees] = await Promise.all([
    tab === "definitions" ? context.prisma.constructionDefinitionVersion.findMany({ where: { kind }, orderBy: { version: "desc" }, skip: (page - 1) * 20, take: 20 }) : [],
    tab === "zones" ? context.prisma.constructionZoneVersion.findMany({ orderBy: { publishedAt: "desc" }, skip: (page - 1) * 20, take: 20 }) : [],
    tab === "distribution" ? context.prisma.constructionDistributionVersion.findMany({ where: distributionScope, orderBy: { publishedAt: "desc" }, skip: (page - 1) * 20, take: 20 }) : [],
    context.prisma.constructionDefinitionVersion.findFirst({ where: { kind }, orderBy: { version: "desc" } }),
    context.prisma.constructionCatalogEntry.findMany({ where: { kind: "PURPOSE", isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.realEstate.findMany({ select: { id: true, municipalInsc: true, streetName: true, constructionZone: { select: { zone: { select: { code: true, version: true } } } } }, orderBy: { municipalInsc: "asc" } }),
    context.prisma.constructionZoneVersion.findMany({ select: { id: true, code: true, name: true, version: true }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    context.prisma.department.findMany({ where: { isActive: true, ...(access.administrator ? {} : { id: access.departmentId || "" }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.employee.findMany({ where: { isActive: true, ...(access.administrator ? {} : { departmentId: access.departmentId || "" }) }, select: { id: true, name: true, departmentId: true }, orderBy: { name: "asc" } }),
  ]);
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const rows = tab === "definitions" ? definitions.map((definition) => { const data = definitionSchema.parse(definition.definition); return { id: definition.id, name: definitionKinds[definition.kind as keyof typeof definitionKinds], version: definition.version, summary: `${data.fields.length} campos; ${data.checks.length} critérios; ${data.documents.length} documentos`, date: definition.publishedAt.toISOString().slice(0, 10) }; }) : tab === "zones" ? zones.map((zone) => ({ id: zone.id, name: `${zone.code} — ${zone.name}`, version: zone.version, summary: `${zone.automatic ? "Cálculo automático" : "Análise técnica"}; CA ${zone.maxFloorAreaRatio.toString()}; mínimo ${zone.minimumLandArea.toString()} m²`, date: zone.publishedAt.toISOString().slice(0, 10) })) : distributions.map((distribution) => ({ id: distribution.id, name: departmentNames.get(distribution.departmentId) || distribution.departmentId, version: distribution.version, summary: distribution.strategy, date: distribution.publishedAt.toISOString().slice(0, 10) }));
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Formulários, zoneamento e distribuição" icon={<SlidersHorizontal className="size-4" />} /><ConstructionRulesClient key={`${tab}:${kind}`} tab={tab} kind={kind} page={page} total={total} rows={rows} canManage={access.administrator || access.roles.includes("MANAGER")} definition={definitionSchema.parse(latest?.definition || { fields: [], checks: [], documents: [] })} purposes={purposes} properties={properties.map((property) => ({ id: property.id, name: [property.municipalInsc || "Sem inscrição", property.streetName, property.constructionZone ? `Zona ${property.constructionZone.zone.code} v${property.constructionZone.zone.version}` : "Sem zona"].filter(Boolean).join(" — ") }))} zoneOptions={zoneOptions.map((zone) => ({ id: zone.id, name: `${zone.code} v${zone.version} — ${zone.name}` }))} departments={departments} employees={employees} /></PageFrame>;
}
