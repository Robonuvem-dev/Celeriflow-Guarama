import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { getPlanningContext } from "@/lib/planejamento/access";
import { planningBasePath, type PlanningJurisdiction } from "@/lib/planejamento/policy";
import { PlanningForm, type PlanningField } from "./PlanningForm";
import { PlanningReferencePage } from "./PlanningReferencePage";
import { pageDatabase } from "@/db/repositories/planning-pages/shared";
import { pageCanonicalCatalog, pageClassifiers } from "@/db/repositories/planning-pages/catalogs";

export async function PlanningCatalogPage({ jurisdiction, catalog, filters }: {
  jurisdiction: PlanningJurisdiction; catalog: string; filters: { page?: string; q?: string; versionId?: string };
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
  const href = (value: number) => `${base}?${new URLSearchParams({ q: filters.q ?? "", page: String(value) })}`;
  const { revenues, sources } = catalog === "revenue" && canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") ? await pageClassifiers(database) : { revenues: [], sources: [] };
  return <PageFrame className="space-y-3 p-3"><PageHeader title={names[catalog]} />
    <p className="text-xs text-muted-foreground">Catálogo municipal compartilhado entre as entidades.</p>
    <form method="get" className="flex gap-2"><input name="q" aria-label="Buscar código ou descrição" placeholder="Código ou descrição" defaultValue={filters.q} className="rounded border bg-background p-2 text-sm" /><button className="rounded border px-3 text-sm">Consultar</button><Link href={base} className="p-2 text-sm underline">Limpar</Link></form>
    <Card><CardContent className="pt-3"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Classificação / rateio</TableHead></TableRow></TableHeader><TableBody>{records.map((record) => <TableRow key={record.id}><TableCell>{record.code}</TableCell><TableCell>{record.name}</TableCell><TableCell>{"tceCode" in record && <span>TCE {String(record.tceCode ?? "—")} · STN {String(record.stnGroup ?? "—")}/{String(record.stnSpecification ?? "—")}/{String(record.stnDetail ?? "—")}</span>}{"degree" in record && <span>Grau {String(record.degree ?? "—")} · Reduzido {String(record.shortCode ?? "—")}</span>}{"planningAllocations" in record && record.planningAllocations.map((row) => <p key={row.id} className="text-xs">{row.resourceSource.name}: {row.percentage.toString()}%</p>)}</TableCell></TableRow>)}{!records.length && <TableRow><TableCell colSpan={3} className="py-8 text-center">Nenhum cadastro encontrado.</TableCell></TableRow>}</TableBody></Table><ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: base, values: { q: filters.q } }} /></CardContent></Card>
    {canPerformModuleOperation(context.user, "PLANEJAMENTO", "create") && <Card><CardHeader><CardTitle>Novo cadastro</CardTitle></CardHeader><CardContent><PlanningForm jurisdiction={jurisdiction} operation="catalog" hidden={{ kind: catalog.toUpperCase() }} fields={fields} /></CardContent></Card>}
    {catalog === "revenue" && canPerformModuleOperation(context.user, "PLANEJAMENTO", "update") && <Card><CardHeader><CardTitle>Relacionar fonte e percentual da receita</CardTitle></CardHeader><CardContent><PlanningForm jurisdiction={jurisdiction} operation="allocation" fields={[{ name: "revenueNatureId", label: "Natureza de receita", type: "select", options: revenues }, { name: "resourceSourceId", label: "Fonte", type: "select", options: sources }, { name: "percentage", label: "Percentual (%)", type: "number", step: "0.000001" }]} /></CardContent></Card>}
  </PageFrame>;
}
