import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getTenantContextForModuleOperation, assertBudgetUnitAccess, AccessError } from "@/lib/platform/tenant-context";
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const filter = z.object({ budgetUnitId: z.string().min(1).max(100), type: z.enum(["person", "employee", "supplier", "asset", "professional", "CIPA", "PCA", "EXTINGUISHER"]), q: z.string().trim().max(200).default("") }).parse(Object.fromEntries(new URL(request.url).searchParams));
    assertBudgetUnitAccess(context.user, filter.budgetUnitId);
    const unit = await context.prisma.budgetUnit.findUniqueOrThrow({ where: { id: filter.budgetUnitId } });
    const name = { contains: filter.q, mode: "insensitive" as const };
    let rows: { id: string; label: string }[];
    switch (filter.type) {
      case "person": rows = (await context.prisma.person.findMany({ where: { status: "Ativo", fullName: name }, select: { id: true, fullName: true }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 20 })).map(p => ({ id: p.id, label: p.fullName })); break;
      case "employee": rows = (await context.prisma.employee.findMany({ where: { isActive: true, personId: { not: null }, secretariatId: unit.secretariatId, OR: [{ person: { fullName: name } }, { registration: name }] }, include: { person: { select: { fullName: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20 })).map(e => ({ id: e.id, label: `${e.person?.fullName || e.name} — ${e.registration || e.id}` })); break;
      case "supplier": rows = (await context.prisma.supplier.findMany({ where: { status: "Ativo", OR: [{ person: { fullName: name } }, { company: { corporateName: name } }] }, include: { person: { select: { fullName: true } }, company: { select: { corporateName: true } } }, orderBy: { id: "asc" }, take: 20 })).map(s => ({ id: s.id, label: s.company?.corporateName || s.person?.fullName || s.id })); break;
      case "asset": rows = (await context.prisma.asset.findMany({ where: { department: { secretariatId: unit.secretariatId }, OR: [{ name }, { patrimonyNumber: name }] }, select: { id: true, name: true, patrimonyNumber: true }, orderBy: [{ patrimonyNumber: "asc" }, { id: "asc" }], take: 20 })).map(a => ({ id: a.id, label: `${a.patrimonyNumber} — ${a.name}` })); break;
      case "professional": rows = await context.prisma.$queryRaw<{ id: string; label: string }[]>(Prisma.sql`SELECT r."id",p."fullName" || ' — ' || r."council" AS label FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId"=${unit.id} AND r."usuarioId"=${context.user.id} AND r."discipline"='MEDICINE' AND r."isActive"=true AND p."fullName" ILIKE ${`%${filter.q}%`} ORDER BY p."fullName",r."id" LIMIT 20`); break;
      default: rows = await context.prisma.$queryRaw<{ id: string; label: string }[]>`SELECT "id","title" AS label FROM "SstPreventionRecord" WHERE "budgetUnitId"=${unit.id} AND "kind"=${filter.type} AND "title" ILIKE ${`%${filter.q}%`} ORDER BY "createdAt" DESC,"id" DESC LIMIT 20`;
    }
    return Response.json(rows, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível buscar referências." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
