import { z } from "zod";
import { sql } from "drizzle-orm";
import { findSstUnit } from "@/db/repositories/sst/scope";
import { sstRows } from "@/db/repositories/sst/sql";
import { sstDatabase } from "@/lib/sst/database";
import { getTenantContextForModuleOperation, assertBudgetUnitAccess, AccessError } from "@/lib/platform/tenant-context";
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const filter = z.object({ budgetUnitId: z.string().min(1).max(100), type: z.enum(["person", "employee", "supplier", "asset", "professional", "CIPA", "PCA", "EXTINGUISHER"]), q: z.string().trim().max(200).default("") }).parse(Object.fromEntries(new URL(request.url).searchParams));
    assertBudgetUnitAccess(context.user, filter.budgetUnitId);
    const database = sstDatabase(context), unit = await findSstUnit(database, filter.budgetUnitId);
    if (!unit) throw new Error("Unidade gestora não encontrada.");
    const name = `%${filter.q}%`;
    let rows: { id: string; label: string }[];
    switch (filter.type) {
      case "person": rows = await sstRows<{ id: string; label: string }>(database, sql`SELECT id,"fullName" AS label FROM "Person" WHERE status='Ativo' AND "fullName" ILIKE ${name} ORDER BY "fullName",id LIMIT 20`); break;
      case "employee": rows = (await sstRows<{ id: string; name: string; fullName: string | null; registration: string | null }>(database, sql`SELECT e.id,e.name,p."fullName",e.registration FROM "Employee" e LEFT JOIN "Person" p ON p.id=e."personId" WHERE e."isActive" AND e."personId" IS NOT NULL AND e."secretariatId"=${unit.secretariatId} AND (p."fullName" ILIKE ${name} OR e.registration ILIKE ${name}) ORDER BY e.name,e.id LIMIT 20`)).map(e => ({ id: e.id, label: `${e.fullName || e.name} — ${e.registration || e.id}` })); break;
      case "supplier": rows = (await sstRows<{ id: string; fullName: string | null; corporateName: string | null }>(database, sql`SELECT s.id,p."fullName",c."corporateName" FROM "Supplier" s LEFT JOIN "Person" p ON p.id=s."personId" LEFT JOIN "Company" c ON c.id=s."companyId" WHERE s.status='Ativo' AND (p."fullName" ILIKE ${name} OR c."corporateName" ILIKE ${name}) ORDER BY s.id LIMIT 20`)).map(s => ({ id: s.id, label: s.corporateName || s.fullName || s.id })); break;
      case "asset": rows = (await sstRows<{ id: string; name: string; patrimonyNumber: string }>(database, sql`SELECT a.id,a.name,a."patrimonyNumber" FROM "Asset" a JOIN "Department" d ON d.id=a."departmentId" WHERE d."secretariatId"=${unit.secretariatId} AND (a.name ILIKE ${name} OR a."patrimonyNumber" ILIKE ${name}) ORDER BY a."patrimonyNumber",a.id LIMIT 20`)).map(a => ({ id: a.id, label: `${a.patrimonyNumber} — ${a.name}` })); break;
      case "professional": rows = await sstRows<{ id: string; label: string }>(database, sql`SELECT r."id",p."fullName" || ' — ' || r."council" AS label FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId"=${unit.id} AND r."usuarioId"=${context.user.id} AND r."discipline"='MEDICINE' AND r."isActive"=true AND p."fullName" ILIKE ${name} ORDER BY p."fullName",r."id" LIMIT 20`); break;
      default: rows = await sstRows<{ id: string; label: string }>(database, sql`SELECT "id","title" AS label FROM "SstPreventionRecord" WHERE "budgetUnitId"=${unit.id} AND "kind"=${filter.type} AND "title" ILIKE ${name} ORDER BY "createdAt" DESC,"id" DESC LIMIT 20`);
    }
    return Response.json(rows, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível buscar referências." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
