import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { CemeteryLookupPage } from "@/lib/contracts/cemeteries";
import type { cemeteryLookupSchema } from "@/lib/cemeteries/lookups";
import type { z } from "zod";

export async function readCemeteryLookup(db: DatabaseExecutor, input: z.infer<typeof cemeteryLookupSchema>): Promise<CemeteryLookupPage> {
  const pattern = `%${input.q.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  let source: SQL;
  let ordering = sql`label ASC, id ASC`;
  switch (input.kind) {
    case "taxpayer":
      source = sql`SELECT t.id, CASE WHEN p.id IS NOT NULL THEN p."fullName" || ' · ' || coalesce(p.cpf, 'sem CPF') ELSE coalesce(c."corporateName", t.id) || ' · ' || coalesce(c.cnpj, 'sem CNPJ') END AS label
        FROM "Taxpayer" t LEFT JOIN "Person" p ON p.id=t."personId" LEFT JOIN "Company" c ON c.id=t."companyId"
        WHERE t.status='Ativo' AND (${input.personOnly !== "true"} OR t."personId" IS NOT NULL)
        AND (${!input.q} OR p."fullName" ILIKE ${pattern} OR p.cpf ILIKE ${pattern} OR c."corporateName" ILIKE ${pattern} OR c.cnpj ILIKE ${pattern})`;
      ordering = sql`id ASC`;
      break;
    case "grave":
      source = sql`SELECT g.id, g.code || ' · ' || c.name || ' · ' || g."occupantCount" || '/' || g.capacity || ' · ' || CASE WHEN g.active THEN g.status ELSE 'INATIVA' END AS label, g.code AS sort
        FROM "TaxGrave" g JOIN "TaxCemetery" c ON c.id=g."cemeteryId" WHERE (${!input.cemeteryId} OR g."cemeteryId"=${input.cemeteryId}) AND (${!input.q} OR g.code ILIKE ${pattern})`;
      ordering = sql`sort ASC, id ASC`;
      break;
    case "deceased":
      source = sql`SELECT id, "fullName" || ' · ' || to_char("deathDate", 'YYYY-MM-DD') || ' · ' || status AS label, "fullName" AS sort FROM "TaxDeceased" WHERE (${!input.cemeteryId} OR "cemeteryId"=${input.cemeteryId}) AND (${!input.q} OR "fullName" ILIKE ${pattern})`;
      ordering = sql`sort ASC, id ASC`;
      break;
    case "document":
      source = sql`SELECT id, title AS label FROM "Document" WHERE status IN ('Válido','Pendente') AND (${!input.q} OR title ILIKE ${pattern})`;
      break;
    case "cemetery":
      source = sql`SELECT id, name AS label FROM "TaxCemetery" WHERE (${!input.q} OR name ILIKE ${pattern})`;
      break;
    case "funeralHome":
      source = sql`SELECT id, name AS label FROM "TaxFuneralHome" WHERE active AND (${!input.q} OR name ILIKE ${pattern})`;
      break;
    case "cause":
      source = sql`SELECT id, code || ' · ' || description AS label, description AS sort FROM "TaxDeathCause" WHERE (${!input.q} OR description ILIKE ${pattern} OR code ILIKE ${pattern})`;
      ordering = sql`sort ASC, id ASC`;
      break;
    case "chapel":
      source = sql`SELECT id, name AS label FROM "CemeteryChapel" WHERE (${!input.cemeteryId} OR "cemeteryId"=${input.cemeteryId}) AND (${!input.q} OR name ILIKE ${pattern})`;
      break;
    case "sector":
      source = sql`SELECT id, code || ' · ' || name AS label, "sortOrder" AS sort FROM "TaxCemeterySector" WHERE (${!input.cemeteryId} OR "cemeteryId"=${input.cemeteryId}) AND (${!input.q} OR code ILIKE ${pattern} OR name ILIKE ${pattern})`;
      ordering = sql`sort ASC, id ASC`;
      break;
    case "lot":
      source = sql`SELECT id, identifier || ' · ' || CASE WHEN active THEN status ELSE 'INATIVO' END AS label, identifier AS sort FROM "CemeteryLot" WHERE (${!input.cemeteryId} OR "cemeteryId"=${input.cemeteryId}) AND (${!input.q} OR identifier ILIKE ${pattern})`;
      ordering = sql`sort ASC, id ASC`;
      break;
    case "ossuary":
      source = sql`SELECT id, code || ' · ' || "occupantCount" || '/' || capacity AS label, code AS sort FROM "CemeteryOssuary" WHERE (${!input.cemeteryId} OR "cemeteryId"=${input.cemeteryId}) AND (${!input.q} OR code ILIKE ${pattern})`;
      ordering = sql`sort ASC, id ASC`;
      break;
  }
  const totals = await db.execute<{ total: string }>(sql`SELECT count(*)::text AS total FROM (${source}) AS candidates`);
  const rows = await db.execute<{ id: string; label: string }>(sql`SELECT id, label FROM (${source}) AS candidates ORDER BY ${ordering} LIMIT 20 OFFSET ${(input.page - 1) * 20}`);
  return { items: rows.rows, total: Number(totals.rows[0].total), page: input.page, pageSize: 20 };
}
