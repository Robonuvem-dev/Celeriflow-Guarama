"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionMessageSchema, constructionPortalCaseWhere } from "@/lib/obras/construction-portal-policy";
import { appendConstructionMessage } from "@/lib/obras/construction-conversation";
import { assertConstructionExternalCompany } from "@/lib/obras/construction-external-company";
import { notifyConstructionMessageDepartment } from "@/lib/obras/construction-message-notifications";

function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação."; }
export async function acceptConstructionTerm(input: unknown) {
  try {
    const data = z.object({ caseId: z.string().min(1), termId: z.string().min(1) }).parse(input);
    const identity = await getConstructionPortalIdentity();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
      if (!await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionPortalCaseWhere(identity.id)] }, select: { id: true } })) throw new Error("Solicitação indisponível para sua conta.");
      const term = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true } });
      if (term?.id !== data.termId) throw new Error("O termo mudou. Atualize e leia a versão vigente.");
      await tx.constructionTermAcceptance.upsert({ where: { caseId_identityId_termId: { ...data, identityId: identity.id } }, create: { ...data, identityId: identity.id }, update: {}, select: { id: true } });
    });
    revalidatePath(`/portal/construcao-civil/${data.caseId}`); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function sendConstructionPortalMessage(input: unknown) {
  try {
    const data = constructionMessageSchema.parse(input);
    const identity = await getConstructionPortalIdentity();
    await prisma.$transaction(async (tx) => {
      const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionPortalCaseWhere(identity.id)] }, select: { process: { select: { companyId: true } } } });
      if (!record) throw new Error("Solicitação indisponível para sua conta.");
      await assertConstructionExternalCompany(tx, identity.id, record.process.companyId);
      const id = await appendConstructionMessage(tx, { identityId: identity.id }, data);
      await notifyConstructionMessageDepartment(tx, data.caseId, id);
    });
    revalidatePath(`/portal/construcao-civil/${data.caseId}`); revalidatePath(`/obras/construcao-civil/${data.caseId}`); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
