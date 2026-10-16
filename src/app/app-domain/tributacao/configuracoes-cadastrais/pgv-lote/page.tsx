import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readPgvBulkSelection } from "@/lib/tributacao/pgv-bulk";
import PgvBulkClient from "./PgvBulkClient";

export const dynamic = "force-dynamic";
export default async function PgvBulkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const params = await searchParams;
  const text = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units, neighborhoods, streets] = await Promise.all([
    prisma.planningEntityUnit.findMany({ where: allowedBudgetUnitIds ? { budgetUnitId: { in: allowedBudgetUnitIds } } : {}, include: { governmentEntity: true, budgetUnit: true } }),
    prisma.neighborhood.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.street.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const unit = units.find(row => row.budgetUnitId === text("unit"));
  const filter = unit ? { governmentEntityId: unit.governmentEntityId, budgetUnitId: unit.budgetUnitId, neighborhoodId: text("neighborhood") || null, streetId: text("street") || null } : null;
  const rows = filter ? await readPgvBulkSelection(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds }, filter) : [];
  return <div className="h-full space-y-3 overflow-auto p-4"><h1 className="text-lg font-bold">Alteração geral da planta genérica de valores</h1><form className="flex flex-wrap gap-3 rounded border bg-white p-3 text-xs"><label>Ente / UG<select name="unit" required defaultValue={text("unit")} className="ml-2 rounded border p-2"><option value="">Selecione</option>{units.map(row => <option key={row.budgetUnitId} value={row.budgetUnitId}>{row.governmentEntity.name} · {row.budgetUnit.code}</option>)}</select></label>{([["neighborhood", "Bairro", neighborhoods], ["street", "Logradouro", streets]] as const).map(([key, label, options]) => <label key={key}>{label}<select name={key} defaultValue={text(key)} className="ml-2 rounded border p-2"><option value="">Todos</option>{options.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>)}<button className="rounded border p-2">Conferir seleção</button></form>{filter && <PgvBulkClient key={JSON.stringify(filter)} filter={filter} neighborhoods={neighborhoods} streets={streets} rows={rows.map(({ entry, data }) => ({ id: entry.entityId, version: entry.version, name: data.name, value: data.landUnitValue, fields: data.fields }))}/>}</div>;
}
