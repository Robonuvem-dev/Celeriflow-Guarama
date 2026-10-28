import { desc, eq } from "drizzle-orm";
import type { Decimal } from "../../decimal";
import type { DatabaseExecutor } from "../../transaction";
import { taxAuditCrossChecks } from "../../schema/taxation-audit";
import type { TaxAuditCrossCheckRecord } from "@/lib/contracts/taxation-registry";

export async function insertTaxAuditCrossCheck(db: DatabaseExecutor, input: {
  cnpjCpfContribuinte: string; razaoSocial: string; origemCruzamento: string;
  valorDeclarado: Decimal; valorApuradoBancos: Decimal; divergenciaImposto: Decimal;
}): Promise<TaxAuditCrossCheckRecord> {
  const [record] = await db.insert(taxAuditCrossChecks).values({ ...input, statusMalha: "MALHA_FINA" }).returning();
  return record;
}

export async function updateTaxAuditInfractionNotice(db: DatabaseExecutor, id: string, numeroAutoInfracao: string): Promise<TaxAuditCrossCheckRecord> {
  const [record] = await db.update(taxAuditCrossChecks).set({ statusMalha: "AUTO_INFRACAO_EMITIDO", numeroAutoInfracao }).where(eq(taxAuditCrossChecks.id, id)).returning();
  if (!record) throw new Error("Registro de cruzamento fiscal não encontrado.");
  return record;
}

export async function readTaxAuditCrossChecks(db: DatabaseExecutor): Promise<TaxAuditCrossCheckRecord[]> {
  return db.select().from(taxAuditCrossChecks).orderBy(desc(taxAuditCrossChecks.createdAt)).limit(15);
}
