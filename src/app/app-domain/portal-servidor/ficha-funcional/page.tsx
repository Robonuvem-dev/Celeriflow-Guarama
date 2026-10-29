import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount, portalRows } from "@/db/repositories/portal-servidor/records";
import { portalEmployeeProfile } from "@/db/repositories/portal-servidor/profile";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";

export const dynamic = "force-dynamic";
type SearchParams = { page?: string | string[] };
function formatDate(value: Date) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(value); }

export default async function FichaFuncionalPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Ficha funcional indisponível. Procure a área de gestão de pessoas.</p>;
  const { context, employee } = access;
  const executor = context.database ?? db;
  const [profile, totalActs] = await Promise.all([portalEmployeeProfile(executor, employee.id), portalCount(executor, sql`SELECT count(*) FROM "PersonnelAct" WHERE "employeeId"=${employee.id}`)]);
  if (!profile) return <p className="p-4">Ficha funcional indisponível. Procure a área de gestão de pessoas.</p>;
  const rawPage = (await searchParams).page;
  const requested = Number.parseInt(Array.isArray(rawPage) ? rawPage[0] || "" : rawPage || "", 10);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, Math.max(1, Math.ceil(totalActs / OPERATIONAL_PAGE_SIZE))) : 1;
  const acts = await portalRows<{ id: string; type: string; actNumber: string | null; date: Date; createdAt: Date }>(executor, sql`SELECT id,type,"actNumber",date,"createdAt" FROM "PersonnelAct" WHERE "employeeId"=${employee.id} ORDER BY date DESC,id DESC LIMIT ${OPERATIONAL_PAGE_SIZE} OFFSET ${(page - 1) * OPERATIONAL_PAGE_SIZE}`);
  const lotacao = profile.department?.name || profile.secretariat?.name || "Não informada";
  return <PortalOperationalList id="ficha-funcional" label="Atos da minha ficha funcional" page={page} total={totalActs} actions={<Link href="/portal-servidor/documentos">Documentos</Link>} toolbar={<OperationalFilters label="Resumo funcional"><dl className="grid gap-3 text-sm">{[["Servidor", profile.name], ["Matrícula", profile.registration || "Não informada"], ["Cargo", profile.role?.name || "Não informado"], ["Lotação", lotacao], ["Situação", profile.isActive ? "Ativo" : "Inativo"], ["Jornada contratada", `${profile.contractedHours} h/mês`], ["Secretaria", profile.secretariat?.name || "Não informada"], ["Atos funcionais", `${totalActs} registrado(s)`]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{value}</dd></div>)}</dl></OperationalFilters>} columns={[portalColumn("date", "Data", 140, 100), portalColumn("type", "Tipo de ato", 320, 130), portalColumn("number", "Número", 200, 100, "identifier"), portalColumn("actions", "Registro", 140, 120, "actions", "right", 160)]} rows={acts.map(act => ({ id: act.id, label: act.type, values: { date: formatDate(act.date), type: act.type, number: act.actNumber || "Não informado" }, actions: <a href={`/api/portal-servidor/atos/${act.id}`}>Arquivo do ato</a> }))} />;
}
