import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection.ts";
import { createId } from "../src/db/ids.ts";

config({ path: ".env.local" });
config();

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL nao configurada.");

const connection = createDatabaseConnection(connectionString);
const db = connection.db;

async function main() {
  const suppliers = (await db.execute(sql`SELECT s.id,s.status,s."personId",s."companyId",p.id AS "personRecordId",p."fullName",p.cpf,c."corporateName",c.cnpj FROM "Supplier" s LEFT JOIN "Person" p ON p.id=s."personId" LEFT JOIN "Company" c ON c.id=s."companyId"`)).rows;
  let created = 0;

  for (const supplier of suppliers) {
    const name = supplier.corporateName ?? supplier.fullName;
    const document = supplier.cnpj ?? (supplier.personRecordId ? supplier.cpf : undefined);
    if (!name) continue;

    const [existing] = (await db.execute(sql`SELECT id FROM "Creditor" WHERE "supplierId"=${supplier.id} ${supplier.personId ? sql`OR "personId"=${supplier.personId}` : sql``} ${supplier.companyId ? sql`OR "companyId"=${supplier.companyId}` : sql``} LIMIT 1`)).rows;
    if (existing) {
      await db.execute(sql`UPDATE "Creditor" SET "supplierId"=${supplier.id},name=${name},status=${supplier.status},"updatedAt"=${new Date()} ${document === undefined ? sql`` : sql`,document=${document}`} WHERE id=${existing.id}`);
    } else {
      await db.execute(sql`INSERT INTO "Creditor" (id,"supplierId",name,document,status,"personId","companyId","updatedAt") VALUES (${createId()},${supplier.id},${name},${document ?? null},${supplier.status},${supplier.personId},${supplier.companyId},${new Date()})`);
      created += 1;
    }
  }

  console.log(JSON.stringify({ suppliers: suppliers.length, created }, null, 2));
}

main()
  .finally(async () => connection.pool.end())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
