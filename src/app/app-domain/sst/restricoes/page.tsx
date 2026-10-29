import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { sstDatabase } from "@/lib/sst/database";
import { readSstRestrictionOptions } from "@/db/repositories/sst-pages/clinical-options";
import { listRestrictions } from "@/lib/sst/restriction-service";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { sstColumn } from "../_components/operational-columns";
import { SstNewLink } from "../_components/SstNewLink";
import { RepeatableSstForm as SstForm } from "../acidentes/RepeatableSstForm";
import { saveRoleAttribute } from "./actions";
import { RestrictionForm } from "./RestrictionForm";
export const dynamic = "force-dynamic";
export default async function RestrictionsPage({ searchParams }: { searchParams: Promise<{ page?: string; employee?: string; view?: string }> }) {
  const context = await getTenantContextForModule("SST"), params = await searchParams, { rows, page, total } = await listRestrictions(context, Number(params.page || 1));
  const database = sstDatabase(context), units = await listSstUnits(database, context, "MEDICINE", true);
  const names = (params.employee || "").split(";").map(s => s.trim()).filter(s => s.length >= 3).slice(0, 5);
  const { employees, roles, attributes, canonicalRoles } = await readSstRestrictionOptions(database, units, names);
  if (params.view !== "manage") {
    const columns = [sstColumn("employee", "Servidor", 360, 170), sstColumn("endsAt", "Fim", 160, 110), sstColumn("actions", "Ações", 180, 155, "actions")];
    return <OperationalListFrame label="Restrições ocupacionais" actions={units.length > 0 && <SstNewLink href={`/sst/restricoes?${new URLSearchParams({ view: "manage", employee: params.employee || "" })}`}>Nova restrição</SstNewLink>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/sst/restricoes" values={{ employee: params.employee }} />}>
      <OperationalTable columns={columns} preferenceId="sst-restricoes" caption="Restrições ocupacionais" emptyMessage="Nenhuma restrição nas UGs clínicas autorizadas." rows={rows.map(r => ({ id: r.id, label: String(r.data.employeeName), values: { employee: String(r.data.employeeName), endsAt: r.endsAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) }, actions: <Link href={`/sst/restricoes/${r.id}`}>Acompanhamento</Link> }))} />
    </OperationalListFrame>;
  }
  return <main className="space-y-4 p-4"><h1 className="text-xl font-semibold">Restrições ocupacionais</h1><Link href="/sst/restricoes">Voltar à listagem</Link>
    {units.length > 0 && <><form className="flex gap-2"><input type="hidden" name="view" value="manage" /><input aria-label="Servidor e responsável" className="rounded border p-2" name="employee" defaultValue={params.employee || ""} placeholder="Servidor; responsável (3 letras por nome)" required /><button>Buscar vínculos</button></form><p>Até cinco nomes separados por ; e 20 correspondências. Refine a busca.</p><details><summary>Cadastrar atribuição do cargo canônico</summary><SstForm action={saveRoleAttribute}><label>Cargo<select name="roleId" required>{canonicalRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Atribuição<input name="description" required /></label></SstForm></details><details open={!!params.employee}><summary>Nova restrição</summary><RestrictionForm key={params.employee} employees={employees} units={units} roles={roles} attributes={attributes} /></details></>}
  </main>;
}
