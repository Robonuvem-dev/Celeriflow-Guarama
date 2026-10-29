import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicQuerySchema, readEconomicProfiles } from "@/lib/tributacao/economic-query";
import GeographicPointPicker from "@/components/app-ui/GeographicPointPicker";
import { db, databaseConnection } from "@/db/client";
import { listFiscalPlanningUnits } from "@/db/repositories/taxation-pages/lookups";
import { TaxOperationalTable } from "../../TaxOperationalTable";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";

export const dynamic = "force-dynamic";
export default async function EconomicQueryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db; const params = await searchParams;
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const units = await listFiscalPlanningUnits(database, allowedBudgetUnitIds);
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity.name])).entries()];
  const raw = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = economicQuerySchema.safeParse({ governmentEntityId: entities[0]?.[0], ...raw });
  if (!parsed.success) return <p className="p-4">{parsed.error.issues[0]?.message}</p>;
  let rows: Awaited<ReturnType<typeof readEconomicProfiles>>;
  try { rows = await readEconomicProfiles(databaseConnection, { allowedBudgetUnitIds }, parsed.data); } catch (error) { return <p className="p-4">{error instanceof Error ? error.message : "Consulta indisponível."}</p>; }
  const points = rows.filter(row => row.profile.latitude !== null && row.profile.longitude !== null).map(row => ({ label: `${row.inscription} · ${row.name}`, latitude: row.profile.latitude!, longitude: row.profile.longitude! }));
  const latitude = points.length ? points.reduce((sum, point) => sum + point.latitude, 0) / points.length : null;
  const longitude = points.length ? points.reduce((sum, point) => sum + point.longitude, 0) / points.length : null;
  const spread = points.length ? Math.max(...points.map(point => Math.abs(point.latitude - latitude!)), ...points.map(point => Math.abs(point.longitude - longitude!))) : 0;
  const zoom = spread > 0 ? Math.max(2, Math.min(16, Math.floor(Math.log2(90 / spread)))) : 16;
  const field = "mt-1 block w-full rounded border p-1.5 text-xs";
  const query = new URLSearchParams(Object.entries(raw).filter(([key, value]) => key !== "view" && typeof value === "string").map(([key, value]) => [key, String(value)]));
  const filters = <form className="grid gap-2 sm:grid-cols-2"><label>Ente<select name="governmentEntityId" defaultValue={parsed.data.governmentEntityId} className={field}>{entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{([["query", "Empresa / inscrição"], ["companyType", "Tipo de empresa"], ["cnae", "CNAE principal ou secundário"], ["accountantId", "Código do contador"], ["partnerId", "Código do sócio"], ["fieldKey", "Chave do campo adicional"], ["fieldValue", "Valor do campo adicional"]] as const).map(([key, label]) => <label key={key}>{label}<input name={key} defaultValue={parsed.data[key]} className={field} /></label>)}<label>Simples Nacional<select name="simples" defaultValue={parsed.data.simples} className={field}><option value="ALL">Todos</option><option value="YES">Optante</option><option value="NO">Não optante</option></select></label><label>Abertura inicial<input name="startFrom" type="date" defaultValue={parsed.data.startFrom} className={field} /></label><label>Abertura final<input name="startUntil" type="date" defaultValue={parsed.data.startUntil} className={field} /></label><button className="rounded border p-2">Consultar</button></form>;
  const description = `${rows.length} cadastros com perfil documentado na origem selecionada; ${points.length} possuem coordenadas. Cadastros legados sem perfil continuam acessíveis na consulta econômica original.`;
  if (params.view === "map") return <div className="h-full space-y-3 overflow-auto p-4"><h1 className="text-lg font-bold">Consulta econômica por localização</h1><Link href={`?${query}`} className="text-emerald-700 underline">Voltar à tabela</Link>{filters}<p className="text-xs">{description}</p>{points.length > 0 && <><GeographicPointPicker latitude={latitude} longitude={longitude} markers={points} initialZoom={zoom} /><ol className="list-inside list-decimal text-xs">{points.map((point, index) => <li key={index}>{point.label} · {point.latitude}, {point.longitude}</li>)}</ol></>}</div>;
  return <TaxOperationalTable id="consulta-economica" resetKey={query.toString()}
    toolbar={<OperationalFilters label="Filtros de perfil e localização">{filters}<p>{description}</p></OperationalFilters>}
    actions={<Link href={`?${query}&view=map`} className="h-7 rounded border px-2 text-xs">Mapa ({points.length})</Link>}
    columns={[["name", "Empresa", 160, 260], ["inscription", "Inscrição", 110, 150, "identifier"], ["type", "Tipo", 100, 140], ["primary", "CNAE principal", 115, 150], ["secondary", "CNAEs secundários", 150, 220], ["status", "Situação", 100, 130, "status"], ["regime", "Regime", 120, 160], ["actions", "Ficha", 85, 85, "actions"]]}
    rows={rows.map(row => ({ id: row.id, label: row.name, values: { name: row.name, inscription: row.inscription, type: row.profile.companyType, primary: row.profile.primaryCnae, secondary: row.profile.secondaryCnaes.join(", "), status: row.status, regime: row.taxRegime ?? "—" }, actions: <Link href={`/tributacao/economico/${row.id}`} className="text-emerald-700 underline">Abrir ficha</Link> }))} />;
}
