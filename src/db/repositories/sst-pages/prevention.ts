import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { SstPageOption, SstPagePerson, SstPageUnit, SstSupplierPageDto } from "@/lib/contracts/sst-pages";

export async function readSstPreventionOptions(database: DatabaseExecutor, unit: SstPageUnit, usuarioId: string): Promise<{
  people: SstPagePerson[]; employees: (SstPageOption & { registration: string | null; person: { fullName: string } | null })[];
  suppliers: SstSupplierPageDto[]; assets: (SstPageOption & { patrimonyNumber: string })[];
  records: { id: string; title: string; kind: string }[]; professionals: { id: string; label: string }[];
}> {
  const [people, employees, suppliers, assets, records, professionals] = await Promise.all([
    database.execute<SstPagePerson>(sql`SELECT id,"fullName" FROM "Person" WHERE status='Ativo' ORDER BY "fullName" LIMIT 500`).then(result => result.rows),
    database.execute<SstPageOption & { registration: string | null; person: { fullName: string } | null }>(sql`SELECT e.id,e.name,e.registration,CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('fullName',p."fullName") END AS person FROM "Employee" e LEFT JOIN "Person" p ON p.id=e."personId" WHERE e."isActive" AND e."secretariatId"=${unit.secretariatId} AND e."personId" IS NOT NULL ORDER BY e.name LIMIT 500`).then(result => result.rows),
    database.execute<SstSupplierPageDto>(sql`SELECT s.id,CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('fullName',p."fullName") END AS person,CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('corporateName',c."corporateName") END AS company FROM "Supplier" s LEFT JOIN "Person" p ON p.id=s."personId" LEFT JOIN "Company" c ON c.id=s."companyId" WHERE s.status='Ativo' LIMIT 500`).then(result => result.rows),
    database.execute<SstPageOption & { patrimonyNumber: string }>(sql`SELECT a.id,a.name,a."patrimonyNumber" FROM "Asset" a JOIN "Department" d ON d.id=a."departmentId" WHERE d."secretariatId"=${unit.secretariatId} LIMIT 500`).then(result => result.rows),
    database.execute<{ id: string; title: string; kind: string }>(sql`SELECT "id","title","kind" FROM "SstPreventionRecord" WHERE "budgetUnitId"=${unit.id} AND "kind" IN ('CIPA','PCA','EXTINGUISHER') ORDER BY "createdAt" DESC,"id" LIMIT 500`).then(result => result.rows),
    database.execute<{ id: string; label: string }>(sql`SELECT r."id",p."fullName" || ' — ' || r."council" AS label FROM "SstProfessionalRole" r JOIN "Person" p ON p."id"=r."personId" WHERE r."budgetUnitId"=${unit.id} AND r."usuarioId"=${usuarioId} AND r."discipline"='MEDICINE' AND r."isActive"=true ORDER BY p."fullName" LIMIT 100`).then(result => result.rows),
  ]);
  return { people, employees, suppliers, assets, records, professionals };
}
