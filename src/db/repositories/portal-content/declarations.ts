import { Decimal } from "@/db/decimal";
import { taxRegistryEntries as referenceEntries } from "@/db/schema/taxation-registry";
import { complementaryDeclarationSchema } from "@/lib/tributacao/complementary-declarations";
import { and, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { inspectionDmsDeclarations as declarations } from "@/db/schema/tax-inspection-operations";
import { authorizedTaxpayerIds } from "@/lib/portal-cidadao/tax-account";
import { citizenDeclarationQuery } from "@/lib/portal-cidadao/declaration-query";
import { desifImportBatches, desifInstitutions } from "@/db/schema/tax-collection-operations";

/** Apply ownership before counting or pagination; a query never grants access. */
export async function readCitizenDeclarations(database: DatabaseExecutor, actorId: string, raw: unknown) {
  const query = citizenDeclarationQuery.parse(raw);
  const ids = await authorizedTaxpayerIds(database, actorId, query.kind === "BANCOS" ? "DESIF" : query.kind === "DIVERSOS" ? "DECLARACOES_DIVERSOS" : query.kind === "CARTORIO" ? "DECLARACOES_CARTORIO" : "NFSE");
  if (!ids.length) return { rows: [], total: 0, page: 1, query };
  const escaped = query.protocol.replace(/[\\%_]/g, "\\$&");
  if(query.kind==="DIVERSOS"||query.kind==="CARTORIO"){
    const competence=query.competence?`${query.competence.slice(3)}-${query.competence.slice(0,2)}`:"";
    const where=and(eq(referenceEntries.entityType,"DECLARACAO_COMPLEMENTAR"),eq(referenceEntries.category,"DECLARACAO_COMPLEMENTAR"),
      sql`${referenceEntries.data}->>'taxpayerId' IN (${sql.join(ids.map(id=>sql`${id}`),sql`, `)})`,
      sql`${referenceEntries.data}->>'type'=${query.kind}`,
      competence?sql`${referenceEntries.data}->>'competence'=${competence}`:undefined,
      query.protocol?sql`${referenceEntries.data}->>'protocol' LIKE ${`%${escaped}%`}`:undefined,
      query.status?sql`${referenceEntries.data}->>'status'=${query.status}`:undefined,
      sql`NOT EXISTS (SELECT 1 FROM "TaxRegistryEntry" newer WHERE newer."entityType"='DECLARACAO_COMPLEMENTAR' AND newer.category='DECLARACAO_COMPLEMENTAR' AND newer."entityId"=${referenceEntries.entityId} AND newer.version>${referenceEntries.version})`);
    const [{total}]=await database.select({total:count()}).from(referenceEntries).where(where);
    const page=Math.min(query.page,Math.max(1,Math.ceil(total/20)));
    const entries=await database.select({id:referenceEntries.entityId,data:referenceEntries.data}).from(referenceEntries).where(where).orderBy(desc(referenceEntries.createdAt),desc(referenceEntries.entityId)).limit(20).offset((page-1)*20);
    return {rows:entries.map(entry=>{const data=complementaryDeclarationSchema.parse(entry.data);return {id:entry.id,protocol:data.protocol,competence:`${data.competence.slice(5)}/${data.competence.slice(0,4)}`,direction:data.type,channel:"REGISTRO_COMPLEMENTAR",status:data.status,noMovement:null,serviceValue:new Decimal(data.amount),ownIss:null,retainedIss:null};}),total,page,query};
  }
  if (query.kind === "BANCOS") {
    const where = and(inArray(desifInstitutions.taxpayerId, ids),
      query.competence ? eq(desifImportBatches.competence, query.competence) : undefined,
      query.protocol ? like(desifImportBatches.receiptNumber, `%${escaped}%`) : undefined,
      query.status ? eq(desifImportBatches.status, query.status) : undefined);
    const [{ total }] = await database.select({ total: count() }).from(desifImportBatches)
      .innerJoin(desifInstitutions, eq(desifInstitutions.id, desifImportBatches.institutionId)).where(where);
    const page = Math.min(query.page, Math.max(1, Math.ceil(total / 20)));
    const banks = await database.select({ id: desifImportBatches.id, protocol: desifImportBatches.receiptNumber,
      competence: desifImportBatches.competence, direction: desifImportBatches.moduleType,
      channel: desifImportBatches.originMode, status: desifImportBatches.status,
    }).from(desifImportBatches).innerJoin(desifInstitutions, eq(desifInstitutions.id, desifImportBatches.institutionId))
      .where(where).orderBy(desc(desifImportBatches.createdAt), desc(desifImportBatches.id)).limit(20).offset((page - 1) * 20);
    return { rows: banks.map(row => ({ ...row, protocol: row.protocol || "Sem recibo", noMovement: null,
      serviceValue: null, ownIss: null, retainedIss: null })), total, page, query };
  }
  const where = and(inArray(declarations.taxpayerId, ids),
    query.competence ? eq(declarations.competence, query.competence) : undefined,
    query.protocol ? like(declarations.protocol, `%${escaped}%`) : undefined,
    query.status ? eq(declarations.status, query.status) : undefined,
    query.direction ? eq(declarations.direction, query.direction) : undefined);
  const [{ total }] = await database.select({ total: count() }).from(declarations).where(where);
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await database.select({ id: declarations.id, protocol: declarations.protocol,
    competence: declarations.competence, direction: declarations.direction, channel: declarations.channel,
    status: declarations.status, noMovement: declarations.noMovement,
    serviceValue: declarations.serviceValueDecimal, ownIss: declarations.ownIssDecimal,
    retainedIss: declarations.retainedIssDecimal,
  }).from(declarations).where(where).orderBy(desc(declarations.createdAt), desc(declarations.id)).limit(20).offset((page - 1) * 20);
  return { rows, total, page, query };
}
