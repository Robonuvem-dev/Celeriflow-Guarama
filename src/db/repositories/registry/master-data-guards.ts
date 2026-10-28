import { sql } from "drizzle-orm";
import { MasterDataValidationError } from "@/lib/cadastros/master-data-service";
import type { MasterDataCatalog } from "@/app/app-domain/cadastros/master-data-types";
import type { DatabaseExecutor } from "../../transaction";

export async function assertCanInactivate(db: DatabaseExecutor, catalog: MasterDataCatalog, id: string): Promise<void> {
  // Explicit cross-module guards run on the caller's transactional connection.
  let query = sql`SELECT 0::int AS count`;
  switch (catalog) {
    case "families": query = sql`SELECT ((SELECT count(*) FROM "SocialFamily" WHERE "masterFamilyId"=${id} AND status='Ativo') + (SELECT count(*) FROM "HealthFamily" WHERE "masterFamilyId"=${id} AND "isActive"=true))::int AS count`; break;
    case "entities": query = sql`SELECT ((SELECT count(*) FROM "GovernmentEntity" WHERE "parentId"=${id} AND status='ATIVA') + (SELECT count(*) FROM "CostCenter" WHERE "governmentEntityId"=${id} AND "isActive"=true) + (SELECT count(*) FROM "LegalText" WHERE "governmentEntityId"=${id} AND status='VIGENTE') + (SELECT count(*) FROM "LegalReportSigner" WHERE "governmentEntityId"=${id} AND status='ATIVO'))::int AS count`; break;
    case "costCenters": query = sql`SELECT ((SELECT count(*) FROM "CostCenter" WHERE "parentId"=${id} AND "isActive"=true) + (SELECT count(*) FROM "Warehouse" WHERE "costCenterId"=${id} AND "isActive"=true))::int AS count`; break;
    case "cities": query = sql`SELECT ((SELECT count(*) FROM "Neighborhood" WHERE "cityId"=${id} AND status='Ativo') + (SELECT count(*) FROM "Street" WHERE "cityId"=${id} AND status='Ativo') + (SELECT count(*) FROM "BankBranch" WHERE "cityId"=${id} AND status='ATIVA') + (SELECT count(*) FROM "Warehouse" WHERE "cityId"=${id} AND "isActive"=true))::int AS count`; break;
    case "neighborhoods": query = sql`SELECT ((SELECT count(*) FROM "Street" WHERE "neighborhoodId"=${id} AND status='Ativo') + (SELECT count(*) FROM "Warehouse" WHERE "neighborhoodId"=${id} AND "isActive"=true))::int AS count`; break;
    case "banks": query = sql`SELECT ((SELECT count(*) FROM "BankBranch" WHERE "bankId"=${id} AND status='ATIVA') + (SELECT count(*) FROM "BankAccount" WHERE "bankId"=${id} AND "isActive"=true))::int AS count`; break;
    case "branches": query = sql`SELECT count(*)::int AS count FROM "BankAccount" WHERE "bankBranchId"=${id} AND "isActive"=true`; break;
    case "currencies": query = sql`SELECT count(*)::int AS count FROM "Currency" WHERE id=${id} AND "isDefault"=true`; break;
    case "products": query = sql`SELECT count(*)::int AS count FROM "Material" WHERE "catalogItemId"=${id} AND "isActive"=true`; break;
    case "cbos": query = sql`SELECT count(*)::int AS count FROM "HealthProfessional" WHERE "cboId"=${id} AND "isActive"=true`; break;
  }
  const result = await db.execute<{ count: number }>(query);
  const count = result.rows[0].count;
  if (count > 0) throw new MasterDataValidationError(`Não é possível inativar: existem ${count} vínculo(s) ativo(s).`);
}
