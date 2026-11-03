import Link from "next/link";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { assetCatalogRecords as records } from "@/db/schema/assets-catalogs";
import { departments } from "@/db/schema/administration";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../_components/operational-columns";
import { clampPatrimonioListPage, parsePatrimonioListPage, PATRIMONIO_LIST_PAGE_SIZE } from "../listing";
import { assetInventoryAction } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; page?: string; view?: string; error?: string }> }) {
  const params = await searchParams;
  const { user } = await getTenantContextForModule("PATRIMONIO");
  const scope = isSystemAdministrator(user) ? undefined : eq(records.departmentId, user.departmentId || "__none__");
  const where = and(scope, params.session ? and(eq(records.kind, "inventarioBem"), sql`${records.details}->>'sessionId'=${params.session}`) : eq(records.kind, "inventarioBens"));
  const [{ total }] = await db.select({ total: count() }).from(records).where(where);
  const page = clampPatrimonioListPage(parsePatrimonioListPage(params.page), total);
  const rows = await db.select().from(records).where(where).orderBy(desc(records.createdAt)).limit(PATRIMONIO_LIST_PAGE_SIZE).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE);
  if (params.view === "operacoes") {
    const sectors = await db.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.isActive, true), isSystemAdministrator(user) ? undefined : eq(departments.id, user.departmentId || "__none__"))).orderBy(asc(departments.name));
    return <main className="space-y-3 p-3"><h1 className="text-lg font-semibold">Inventário de bens patrimoniais</h1><Link href="/patrimonio/inventario-bens">Voltar aos inventários</Link>
      <p className="text-sm">Abra o inventário por setor; a comissão registra a localização e reconcilia bens de outro setor. Cada responsável registra sua conformidade antes do fechamento.</p>
      <form action={assetInventoryAction} className="grid max-w-2xl gap-3">
        <label>Operação<select name="operation" required className="block h-9 w-full rounded border px-2"><option value="open">Abrir inventário</option><option value="count">Registrar bem localizado</option><option value="conform">Conformidade do responsável</option><option value="transfer">Comissão: transferir bem localizado de outro setor</option><option value="close">Fechar inventário</option></select></label>
        <label>Inventário (operações após abertura)<input name="sessionId" defaultValue={params.session || ""} className="block h-9 w-full rounded border px-2" /></label>
        <label>Setor de abertura<select name="departmentId" className="block h-9 w-full rounded border px-2"><option value="">Selecione</option>{sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Placa do bem<input name="patrimonyNumber" className="block h-9 w-full rounded border px-2" /></label>
        <label>Setor onde foi localizado<select name="foundDepartmentId" className="block h-9 w-full rounded border px-2"><option value="">Selecione</option>{sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Servidor responsável de destino (identificador, na transferência)<input name="responsibleId" className="block h-9 w-full rounded border px-2" /></label>
        <label>Justificativa ou evidência<textarea name="reason" required minLength={5} maxLength={2000} className="block w-full rounded border p-2" /></label>
        <button className="h-9 rounded border px-3">Registrar operação</button>
      </form></main>;
  }
  return <OperationalListFrame actions={<Link href={`?view=operacoes${params.session ? `&session=${encodeURIComponent(params.session)}` : ""}`}>Operações de inventário</Link>} toolbar={<><Link href="/patrimonio/inventario-bens">Inventários de bens</Link>{params.session && <span>Inventário: {params.session}</span>}{params.error && <p role="alert">{params.error}</p>}</>} pagination={<OperationalLinkPagination pathname="/patrimonio/inventario-bens" page={page} total={total} values={{ session: params.session }} />}>
    <OperationalTable preferenceId="patrimonio-inventario-bens" caption="Inventário patrimonial" columns={operationalColumns([["code", params.session ? "Placa" : "Inventário", 180, 100, "identifier"], ["name", "Descrição", 280, 130], ["expected", "Setor esperado", 160, 100], ["found", "Setor localizado", 160, 100], ["status", "Conformidade / situação", 180, 100, "status"]])} rows={rows.map(row => ({ id: row.id, label: row.name, values: { code: row.details.patrimonyNumber || row.id, name: row.name, expected: row.details.expectedDepartmentId || row.departmentId, found: row.details.foundDepartmentId || "Não localizado", status: params.session ? row.details.conformity ? "Conforme" : "Pendente" : row.details.status || "Aberto" }, cells: { code: <Link href={`?${params.session ? "view=operacoes&" : ""}session=${encodeURIComponent(params.session || row.id)}`}>{row.details.patrimonyNumber || row.id}</Link> } }))} />
  </OperationalListFrame>;
}
