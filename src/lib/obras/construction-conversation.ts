import type { Prisma } from "@prisma/client";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";
import { constructionMessageSchema, constructionPortalCaseWhere } from "./construction-portal-policy";

export async function appendConstructionMessage(tx: Prisma.TransactionClient, actor: { identityId: string } | { employeeId: string; access: ConstructionAccess }, input: unknown) {
  const data = constructionMessageSchema.parse(input);
  const external = "identityId" in actor;
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
  const scope = external ? constructionPortalCaseWhere(actor.identityId) : constructionCaseWhere(actor.access);
  const item = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, scope] }, select: { id: true, process: { select: { completedAt: true, status: true } } } });
  if (!item) throw new Error("Solicitação indisponível para este participante.");
  const existing = await tx.constructionMessage.findUnique({ where: { requestKey: data.requestKey }, select: { id: true, caseId: true, identityId: true, employeeId: true } });
  if (existing) {
    if (existing.caseId !== item.id || (external ? existing.identityId !== actor.identityId : existing.employeeId !== actor.employeeId)) throw new Error("Referência de mensagem indisponível.");
    return existing.id;
  }
  if (item.process.completedAt || ["Arquivado", "Cancelado"].includes(item.process.status)) throw new Error("Este processo está encerrado para novas mensagens.");
  const term = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true, version: true } });
  if (external && (!term || !await tx.constructionTermAcceptance.findUnique({ where: { caseId_identityId_termId: { caseId: item.id, identityId: actor.identityId, termId: term.id } }, select: { id: true } }))) throw new Error("Aceite o termo de responsabilidade vigente antes de enviar.");
  const record = await tx.constructionMessage.create({ data: { ...data, ...(external ? { identityId: actor.identityId } : { employeeId: actor.employeeId }), evidenceSnapshot: external && term ? { termId: term.id, termVersion: term.version } : {} }, select: { id: true } });
  return record.id;
}
