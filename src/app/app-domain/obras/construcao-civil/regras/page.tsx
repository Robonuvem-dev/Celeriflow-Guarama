import { notFound } from "next/navigation";
import Link from "next/link";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { definitionKinds, definitionSchema } from "@/lib/obras/construction-rules";
import ConstructionRulesClient from "./ConstructionRulesClient";
import { db } from "@/db/client";
import { loadPageRules } from "@/db/repositories/works-pages/settings";

export default async function ConstructionRulesPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string; page?: string; view?: string }> }) {
  const params = await searchParams;
  const tab = params.tab === "zones" || params.tab === "distribution" ? params.tab : "definitions";
  const kind = params.kind && Object.hasOwn(definitionKinds, params.kind) ? params.kind as keyof typeof definitionKinds : "FORM";
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.length) notFound();
  const { total, page, definitions, zones, distributions, latest, purposes, properties, zoneOptions, departments, employees } = await loadPageRules(context.database ?? db, access, { tab, kind, page: params.page });
  const departmentNames = new Map(departments.map((department) => [department.id, department.name]));
  const rows = tab === "definitions" ? definitions.map((definition) => { const data = definitionSchema.parse(definition.definition); return { id: definition.id, name: definitionKinds[definition.kind as keyof typeof definitionKinds], version: definition.version, summary: `${data.fields.length} campos; ${data.checks.length} critérios; ${data.documents.length} documentos`, date: definition.publishedAt.toISOString().slice(0, 10) }; }) : tab === "zones" ? zones.map((zone) => ({ id: zone.id, name: `${zone.code} — ${zone.name}`, version: zone.version, summary: `${zone.automatic ? "Cálculo automático" : "Análise técnica"}; CA ${zone.maxFloorAreaRatio.toString()}; mínimo ${zone.minimumLandArea.toString()} m²`, date: zone.publishedAt.toISOString().slice(0, 10) })) : distributions.map((distribution) => ({ id: distribution.id, name: departmentNames.get(distribution.departmentId) || distribution.departmentId, version: distribution.version, summary: distribution.strategy, date: distribution.publishedAt.toISOString().slice(0, 10) }));
  if (params.view === "editar") return <ConstructionRulesClient key={`${tab}:${kind}`} tab={tab} kind={kind} page={page} total={total} rows={rows} canManage={access.administrator || access.roles.includes("MANAGER")} definition={definitionSchema.parse(latest?.definition || { fields: [], checks: [], documents: [] })} purposes={purposes} properties={properties.map((property) => ({ id: property.id, name: [property.municipalInsc || "Sem inscrição", property.streetName, property.constructionZone ? `Zona ${property.constructionZone.zone.code} v${property.constructionZone.zone.version}` : "Sem zona"].filter(Boolean).join(" — ") }))} zoneOptions={zoneOptions.map((zone) => ({ id: zone.id, name: `${zone.code} v${zone.version} — ${zone.name}` }))} departments={departments} employees={employees} />;
  return <OperationalListFrame actions={<Link href={`?${new URLSearchParams({ tab, kind, view: "editar" })}`} className={styles.dialogButton}>Formulários, zoneamento e distribuição</Link>}
    toolbar={<><nav aria-label="Históricos publicados" className="flex gap-1">{[["definitions", "Formulários e checklists"], ["zones", "Zoneamento"], ["distribution", "Distribuição"]].map(([value, label]) => <Link key={value} href={`?${new URLSearchParams({ tab: value, kind })}`} aria-current={tab === value ? "page" : undefined} className={styles.dialogButton}>{label}</Link>)}</nav>{tab === "definitions" && <form className={styles.searchForm}><input type="hidden" name="tab" value={tab} /><select name="kind" aria-label="Etapa" defaultValue={kind} className="h-7 rounded border">{Object.entries(definitionKinds).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><button className={styles.dialogButton}>Selecionar</button></form>}</>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil/regras" values={{ tab, kind }} />}>
    <OperationalTable preferenceId={`obras-regras-${tab}`} caption="Histórico publicado" emptyMessage="Nenhuma versão publicada." columns={operationalColumns([["name", "Registro", 260, 140, "identifier"], ["version", "Versão", 90, 70, "text", "right"], ["summary", "Resumo", 400, 180], ["date", "Publicação", 130, 100]])} rows={rows.map(row => ({ id: row.id, label: row.name, values: { name: row.name, version: String(row.version), summary: row.summary, date: row.date } }))} />
  </OperationalListFrame>;
}
