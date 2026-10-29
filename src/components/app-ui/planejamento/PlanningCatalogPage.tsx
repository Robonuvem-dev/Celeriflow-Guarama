import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanningWorkspace } from "./PlanningWorkspace";
import { PlanningList, planningColumn as col } from "./PlanningList";
import styles from "@/components/app-ui/operational/operational.module.css";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { getPlanningContext } from "@/lib/planejamento/access";
import { planningBasePath, type PlanningJurisdiction } from "@/lib/planejamento/policy";
import { PlanningForm, type PlanningField } from "./PlanningForm";
import { PlanningReferencePage } from "./PlanningReferencePage";
import { pageDatabase } from "@/db/repositories/planning-pages/shared";
import { pageCanonicalCatalog, pageClassifiers } from "@/db/repositories/planning-pages/catalogs";

export async function PlanningCatalogPage({ jurisdiction, catalog, filters }: {
  jurisdiction: PlanningJurisdiction; catalog: string; filters: { page?: string; q?: string; versionId?: string; relationshipPage?: string; tableArea?: string };
}) {
  if (catalog === "versions") return <PlanningReferencePage jurisdiction={jurisdiction} filters={filters} />;
  const names: Record<string, string> = { source: "Fontes de recursos", revenue: "Naturezas de receita", expense: "Naturezas de despesa" };
  if (!Object.hasOwn(names, catalog)) notFound();
  const context = await getPlanningContext(jurisdiction);
  const base = `${planningBasePath(jurisdiction)}/cadastros/${catalog}`;
  const database = pageDatabase(context);
  const { total, page, records } = await pageCanonicalCatalog(database, catalog, filters);
  const fields: PlanningField[] = [{ name: "code", label: "Código" }, { name: "name", label: "Descrição" }, { name: "referenceYear", label: "Exercício de referência", type: "number", value: String(new Date().getUTCFullYear()) }];
  if (catalog === "source") fields.push({ name: "tceCode", label: "Código TCE" }, { name: "stnGroup", label: "Grupo STN" }, { name: "stnSpecification", label: "Especificação STN" }, { name: "stnDetail", label: "Detalhamento STN" });
  if (catalog === "revenue") fields.push({ name: "degree", label: "Grau da receita", type: "number", value: "6" }, { name: "shortCode", label: "Código reduzido" });
  const { revenues, sources } = catalog === "revenue" && canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") ? await pageClassifiers(database) : { revenues: [], sources: [] };
  return <PlanningWorkspace><PageHeader title={names[catalog]} />
    <p className="text-xs text-muted-foreground">Catálogo municipal compartilhado entre as entidades.</p>
    <section data-table-area="catalog" aria-label={names[catalog]}><PlanningList id={`planning:${jurisdiction}:catalog:${catalog}`} label={names[catalog]} page={page} total={total} pathname={base} values={{ q: filters.q }}
      toolbar={<form method="get" className={styles.searchForm}><input name="q" aria-label="Buscar código ou descrição" placeholder="Código ou descrição" defaultValue={filters.q} className={styles.searchInput} /><button className={styles.dialogButton}>Consultar</button><Link href={base} className={styles.dialogButton}>Limpar</Link></form>}
      columns={[col("code", "Código", 80, 130, { type: "identifier" }), col("name", "Descrição", 140, 300),
        ...(catalog === "source" ? [col("tce", "TCE", 64, 90), col("group", "Grupo STN", 86, 110), col("specification", "Especificação STN", 120, 150), col("detail", "Detalhe STN", 92, 130)] : []),
        ...(catalog === "revenue" ? [col("degree", "Grau", 52, 70), col("short", "Reduzido", 76, 100), col("allocations", "Rateio por fonte", 140, 260)] : [])]}
      rows={records.map(record => ({ id: record.id, label: record.code, values: { code: record.code, name: record.name,
        tce: "tceCode" in record ? String(record.tceCode ?? "—") : "", group: "stnGroup" in record ? String(record.stnGroup ?? "—") : "", specification: "stnSpecification" in record ? String(record.stnSpecification ?? "—") : "", detail: "stnDetail" in record ? String(record.stnDetail ?? "—") : "",
        degree: "degree" in record ? String(record.degree ?? "—") : "", short: "shortCode" in record ? String(record.shortCode ?? "—") : "", allocations: "planningAllocations" in record ? record.planningAllocations.map(row => `${row.resourceSource.name}: ${row.percentage.toString()}%`).join("; ") : "" } }))} /></section>
    {canPerformModuleOperation(context.user, "PLANEJAMENTO", "create") && <Card><CardHeader><CardTitle>Novo cadastro</CardTitle></CardHeader><CardContent><PlanningForm jurisdiction={jurisdiction} operation="catalog" hidden={{ kind: catalog.toUpperCase() }} fields={fields} /></CardContent></Card>}
    {catalog === "revenue" && canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") && <Card><CardHeader><CardTitle>Relacionar fonte e percentual da receita</CardTitle></CardHeader><CardContent><PlanningForm jurisdiction={jurisdiction} operation="allocation" fields={[{ name: "revenueNatureId", label: "Natureza de receita", type: "select", options: revenues }, { name: "resourceSourceId", label: "Fonte", type: "select", options: sources }, { name: "percentage", label: "Percentual (%)", type: "number", step: "0.000001" }]} /></CardContent></Card>}
  </PlanningWorkspace>;
}
