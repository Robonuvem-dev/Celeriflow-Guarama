import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicQuerySchema, readEconomicProfiles } from "@/lib/tributacao/economic-query";
import GeographicPointPicker from "@/components/app-ui/GeographicPointPicker";

export const dynamic = "force-dynamic";

export default async function EconomicQueryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO"); const params = await searchParams;
  const allowedBudgetUnitIds = isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const units = await prisma.planningEntityUnit.findMany({ where: allowedBudgetUnitIds ? { budgetUnitId: { in: allowedBudgetUnitIds } } : {}, include: { governmentEntity: true } });
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity.name])).entries()];
  const raw = Object.fromEntries(Object.entries(params).filter(([, value]) => typeof value === "string" && value !== ""));
  const parsed = economicQuerySchema.safeParse({ governmentEntityId: entities[0]?.[0], ...raw });
  if (!parsed.success) return <p className="p-4">{parsed.error.issues[0]?.message}</p>;
  let rows: Awaited<ReturnType<typeof readEconomicProfiles>>;
  try { rows = await readEconomicProfiles(prisma, { allowedBudgetUnitIds }, parsed.data); } catch (error) { return <p className="p-4">{error instanceof Error ? error.message : "Consulta indisponível."}</p>; }
  const points = rows.filter(row => row.profile.latitude !== null && row.profile.longitude !== null).map(row => ({ label: `${row.inscription} · ${row.name}`, latitude: row.profile.latitude!, longitude: row.profile.longitude! }));
  const latitude = points.length ? points.reduce((sum, point) => sum + point.latitude, 0) / points.length : null;
  const longitude = points.length ? points.reduce((sum, point) => sum + point.longitude, 0) / points.length : null;
  const spread = points.length ? Math.max(...points.map(point => Math.abs(point.latitude - latitude!)), ...points.map(point => Math.abs(point.longitude - longitude!))) : 0;
  const zoom = spread > 0 ? Math.max(2, Math.min(16, Math.floor(Math.log2(90 / spread)))) : 16;
  const field = "mt-1 block w-full rounded border p-1.5 text-xs";
  return <div className="h-full space-y-3 overflow-auto p-4"><h1 className="text-lg font-bold">Consulta econômica por perfil e localização</h1><form className="grid gap-2 rounded border bg-white p-3 sm:grid-cols-4"><label className="text-xs">Ente<select name="governmentEntityId" defaultValue={parsed.data.governmentEntityId} className={field}>{entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{([["query", "Empresa / inscrição"], ["companyType", "Tipo de empresa"], ["cnae", "CNAE principal ou secundário"], ["accountantId", "Código do contador"], ["partnerId", "Código do sócio"], ["fieldKey", "Chave do campo adicional"], ["fieldValue", "Valor do campo adicional"]] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input name={key} defaultValue={parsed.data[key]} className={field}/></label>)}<label className="text-xs">Simples Nacional<select name="simples" defaultValue={parsed.data.simples} className={field}><option value="ALL">Todos</option><option value="YES">Optante</option><option value="NO">Não optante</option></select></label><label className="text-xs">Abertura inicial<input name="startFrom" type="date" defaultValue={parsed.data.startFrom} className={field}/></label><label className="text-xs">Abertura final<input name="startUntil" type="date" defaultValue={parsed.data.startUntil} className={field}/></label><button className="rounded bg-emerald-700 px-3 text-xs text-white">Consultar</button></form><p className="text-xs">{rows.length} cadastros com perfil documentado na origem selecionada; {points.length} possuem coordenadas. Cadastros legados sem perfil continuam acessíveis na consulta econômica original.</p><table className="w-full text-left text-xs"><thead><tr><th>Empresa / inscrição</th><th>Tipo</th><th>Atividades</th><th>Situação</th><th>Regime</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="py-2"><Link className="text-emerald-700 underline" href={`/tributacao/economico/${row.id}`}>{row.name} · {row.inscription}</Link></td><td>{row.profile.companyType}</td><td>{row.profile.primaryCnae} · {row.profile.secondaryCnaes.join(", ")}</td><td>{row.status}</td><td>{row.taxRegime}</td></tr>)}</tbody></table>{points.length > 0 && <><GeographicPointPicker latitude={latitude} longitude={longitude} markers={points} initialZoom={zoom}/><ol className="list-inside list-decimal text-xs">{points.map((point, index) => <li key={index}>{point.label} · {point.latitude}, {point.longitude}</li>)}</ol></>}</div>;
}
