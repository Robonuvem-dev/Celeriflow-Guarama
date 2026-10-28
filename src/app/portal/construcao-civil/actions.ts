"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, desc, eq, sql } from "drizzle-orm";
import { constructionTerms, constructionTermAcceptances } from "@/db/schema/construction-portal";
import { findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionMessageSchema } from "@/lib/obras/construction-portal-policy";
import { appendConstructionMessage } from "@/lib/obras/construction-conversation";
import { assertConstructionExternalCompany } from "@/lib/obras/construction-external-company";
import { notifyConstructionMessageDepartment } from "@/lib/obras/construction-message-notifications";

function message(error: unknown) { return constructionActionMessage(error, "Não foi possível concluir a operação."); }
export async function acceptConstructionTerm(input: unknown) {
  try {
    const data = z.object({ caseId: z.string().min(1), termId: z.string().min(1) }).parse(input);
    const identity = await getConstructionPortalIdentity();
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
      if (!await findConstructionCaseForPortal(tx, data.caseId, identity.id)) throw new Error("Solicitação indisponível para sua conta.");
      const [term] = await tx.select({ id: constructionTerms.id }).from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
      if (term?.id !== data.termId) throw new Error("O termo mudou. Atualize e leia a versão vigente.");
      await tx.insert(constructionTermAcceptances).values({ ...data, identityId: identity.id }).onConflictDoNothing({ target: [constructionTermAcceptances.caseId, constructionTermAcceptances.identityId, constructionTermAcceptances.termId] });
    });
    revalidatePath(`/portal/construcao-civil/${data.caseId}`); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
export async function sendConstructionPortalMessage(input: unknown) {
  try {
    const data = constructionMessageSchema.parse(input);
    const identity = await getConstructionPortalIdentity();
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const record = await findConstructionCaseForPortal(tx, data.caseId, identity.id);
      if (!record) throw new Error("Solicitação indisponível para sua conta.");
      await assertConstructionExternalCompany(tx, identity.id, record.process.companyId);
      const id = await appendConstructionMessage(tx, { identityId: identity.id }, data);
      await notifyConstructionMessageDepartment(tx, data.caseId, id);
    });
    revalidatePath(`/portal/construcao-civil/${data.caseId}`); revalidatePath(`/obras/construcao-civil/${data.caseId}`); return { success: true };
  } catch (error) { return { error: message(error) }; }
}
