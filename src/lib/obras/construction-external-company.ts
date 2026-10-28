import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";

/** Administrative representation scope does not replace a current builder/professional qualification. */
export async function assertConstructionExternalCompany(tx: DatabaseExecutor, identityId: string, companyId: string | null, now = new Date()) {
  if (!companyId) return;
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  const company = (await tx.execute<{ id: string }>(sql`SELECT c.id FROM "Company" c JOIN "ConstructionCompanyProfile" p ON p."companyId"=c.id WHERE c.id=${companyId} AND c.status='Ativo' AND p."isActive"=true AND p."startsAt"<=${today.toISOString().slice(0, 10)}::date AND p."endsAt">=${today.toISOString().slice(0, 10)}::date LIMIT 1`)).rows[0];
  if (!company) throw new Error("A construtora requerente precisa de habilitação vigente.");
  const identity = (await tx.execute<{ id: string }>(sql`SELECT i.id FROM "ConstructionPortalIdentity" i JOIN "ConstructionProfessional" p ON p.id=i."professionalId" WHERE i.id=${identityId} AND i."isActive"=true AND p."isActive"=true AND p."startsAt"<=${today.toISOString().slice(0, 10)}::date AND (p."endsAt" IS NULL OR p."endsAt">=${today.toISOString().slice(0, 10)}::date) AND EXISTS (SELECT 1 FROM "ConstructionProfessionalEmployer" e WHERE e."professionalId"=p.id AND e."companyId"=${companyId} AND e."isActive"=true AND e."startsAt"<=${today.toISOString().slice(0, 10)}::date AND (e."endsAt" IS NULL OR e."endsAt">=${today.toISOString().slice(0, 10)}::date)) LIMIT 1`)).rows[0];
  if (!identity) throw new Error("O profissional precisa de vínculo vigente à construtora, além da autorização de representação.");
}
