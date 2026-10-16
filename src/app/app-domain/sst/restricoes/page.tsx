import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { disciplineUnitWhere } from "@/lib/sst/clinical-access";
import { listRestrictions } from "@/lib/sst/restriction-service";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { RepeatableSstForm as SstForm } from "../acidentes/RepeatableSstForm";
import { saveRoleAttribute } from "./actions";
import { RestrictionForm } from "./RestrictionForm";
import { Prisma } from "@prisma/client";
export const dynamic = "force-dynamic";
export default async function RestrictionsPage({ searchParams }: { searchParams: Promise<{ page?: string; employee?: string }> }) {
  const context = await getTenantContextForModule("SST"), params = await searchParams, { rows, page, total } = await listRestrictions(context, Number(params.page || 1));
  const units = await context.prisma.budgetUnit.findMany({ where: disciplineUnitWhere(context, "MEDICINE", true), select: { id: true, name: true, secretariatId: true } });
  const names = (params.employee || "").split(";").map(s => s.trim()).filter(s => s.length >= 3).slice(0, 5);
  const employees = names.length ? await context.prisma.employee.findMany({ where: { isActive: true, OR: names.map(name => ({ name: { contains: name, mode: "insensitive" as const } })), secretariatId: { in: units.flatMap(u => u.secretariatId ? [u.secretariatId] : []) } }, select: { id: true, name: true, roleId: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20 }) : [];
  const professionalRows = units.length ? await context.prisma.$queryRaw<{ id: string; council: string; fullName: string }[]>`SELECT r."id",r."council",p."fullName" FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId" IN (${Prisma.join(units.map(u => u.id))}) AND r."discipline"='MEDICINE' AND r."isActive" ORDER BY p."fullName",r."id"` : [];
  const roles = professionalRows.map(r => ({ id: r.id, council: r.council, person: { fullName: r.fullName } }));
  const attributes = await context.prisma.$queryRaw<{ id: string; roleId: string; description: string }[]>`SELECT * FROM "SstRoleAttribute" ORDER BY "roleId","description"`;
  const canonicalRoles = await context.prisma.role.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const href = (p: number) => `/sst/restricoes?page=${p}`;
  return <main className="space-y-4 p-4"><h1 className="text-xl font-semibold">Restrições ocupacionais</h1><table className="w-full table-fixed text-sm"><thead><tr><th>Servidor</th><th>Fim</th><th>Ações</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-b"><td className="break-words p-2">{String(r.data.employeeName)}</td><td className="text-center">{r.endsAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="text-center"><Link href={`/sst/restricoes/${r.id}`}>Acompanhamento</Link></td></tr>)}</tbody></table>{!rows.length && <p>Nenhuma restrição nas UGs clínicas autorizadas.</p>}
    <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: "/sst/restricoes" }} />
    {units.length > 0 && <><form className="flex gap-2"><input className="rounded border p-2" name="employee" defaultValue={params.employee || ""} placeholder="Servidor; responsável (3 letras por nome)" required /><button>Buscar vínculos</button></form><p>Até cinco nomes separados por ; e 20 correspondências. Refine a busca.</p><details><summary>Cadastrar atribuição do cargo canônico</summary><SstForm action={saveRoleAttribute}><label>Cargo<select name="roleId" required>{canonicalRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Atribuição<input name="description" required /></label></SstForm></details><details open={!!params.employee}><summary>Nova restrição</summary><RestrictionForm key={params.employee} employees={employees} units={units} roles={roles} attributes={attributes} /></details></>}
  </main>;
}
