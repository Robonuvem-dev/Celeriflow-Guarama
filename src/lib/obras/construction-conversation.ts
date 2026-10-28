import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { constructionMessages, constructionTerms, constructionTermAcceptances } from "@/db/schema/construction-portal";
import { findConstructionCaseForAccess, findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import type { ConstructionAccess } from "./construction-policy";
import { constructionMessageSchema } from "./construction-portal-policy";

export async function appendConstructionMessage(tx: DatabaseTransaction, actor: { identityId: string } | { employeeId: string; access: ConstructionAccess }, input: unknown) {
  const data = constructionMessageSchema.parse(input);
  const external = "identityId" in actor;
  await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
  const item = external ? await findConstructionCaseForPortal(tx, data.caseId, actor.identityId) : await findConstructionCaseForAccess(tx, data.caseId, actor.access);
  if (!item) throw new Error("Solicitação indisponível para este participante.");
  const [existing] = await tx.select().from(constructionMessages).where(eq(constructionMessages.requestKey, data.requestKey)).limit(1);
  if (existing) {
    if (existing.caseId !== item.id || (external ? existing.identityId !== actor.identityId : existing.employeeId !== actor.employeeId)) throw new Error("Referência de mensagem indisponível.");
    return existing.id;
  }
  if (item.process.completedAt || ["Arquivado", "Cancelado"].includes(item.process.status)) throw new Error("Este processo está encerrado para novas mensagens.");
  const [term] = await tx.select({ id: constructionTerms.id, version: constructionTerms.version }).from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
  if (external && (!term || !(await tx.select({ id: constructionTermAcceptances.id }).from(constructionTermAcceptances).where(and(eq(constructionTermAcceptances.caseId, item.id), eq(constructionTermAcceptances.identityId, actor.identityId), eq(constructionTermAcceptances.termId, term.id))).limit(1)).length)) throw new Error("Aceite o termo de responsabilidade vigente antes de enviar.");
  const [record] = await tx.insert(constructionMessages).values({ ...data, ...(external ? { identityId: actor.identityId } : { employeeId: actor.employeeId }), evidenceSnapshot: external && term ? { termId: term.id, termVersion: term.version } : {} }).returning({ id: constructionMessages.id });
  return record.id;
}
