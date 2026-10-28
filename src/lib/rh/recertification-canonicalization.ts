import { z } from "zod";
import { canPerformModuleOperation, AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { assertRecertificationReviewScope } from "./recertification";
import { recertificationDetailsSchema } from "./recertification-details";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { enqueueHrIntegration } from "./workforce-service";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { people } from "@/db/schema/people";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { requireEmployeeWithPerson, requireHrPortalRequest } from "@/db/repositories/personnel/workforce";

export async function reconcileProposedDependentPerson(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), cpf: z.string().transform(value => requireValidCpf(value)) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "CADASTROS", "create")) throw new AccessError("Saneamento da pessoa física exige inclusão no Cadastro Único.", 403);
  await assertRecertificationReviewScope(context, input.requestId, connection.db);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    if (request.status !== "EM_ANALISE") throw new Error("Saneamento exige proposta em análise.");
    const details = recertificationDetailsSchema.parse((request.payload as { details?: unknown }).details);
    const dependent = details.dependents.find(row => row.cpf === input.cpf);
    if (!dependent || !details.documentVersionIds.length) throw new Error("Dependente e comprovação documental devem constar da proposta enviada pelo titular.");
    const employee = await requireEmployeeWithPerson(tx, request.employeeId);
    if (!employee.personId || !(await tx.select({ id: documentVersions.id }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(inArray(documentVersions.id, details.documentVersionIds), inArray(documentVersions.status, ["FINAL", "SIGNED"]), eq(documents.personId, employee.personId), inArray(documents.status, ["Válido", "Assinado"]))).limit(1)).length) throw new Error("Comprovação pessoal indisponível.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CADASTRO:CPF:${input.cpf}`}))`);
    const birthDate = new Date(`${dependent.birthDate}T00:00:00Z`);
    if (birthDate > new Date()) throw new Error("Nascimento futuro não pode ser conciliado.");
    const [previous] = await tx.select().from(people).where(eq(people.cpf, input.cpf)).limit(1);
    if (previous) {
      if (previous.fullName !== dependent.name || previous.birthDate?.toISOString().slice(0, 10) !== dependent.birthDate || previous.status !== "Ativo") throw new Error("Pessoa já existente com dados divergentes. Corrija pelo fluxo próprio de Cadastro Único, preservando a identidade.");
      return previous.id;
    }
    const [person] = await tx.insert(people).values({ cpf: input.cpf, fullName: dependent.name, birthDate, status: "Ativo" }).returning();
    const event = await enqueueHrIntegration(tx, { sourceKey: `RECADASTRAMENTO:PESSOA:${request.id}:${person.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "DEPENDENTE_PROPOSTO_CONCILIADO_NO_CADASTRO", payload: { requestId: request.id, personId: person.id, actorId: context.user.id, documentVersionIds: details.documentVersionIds, employeeRelationshipApplied: false } });
    await tx.update(hrIntegrationEvents).set({ status: "PROCESSADO" }).where(eq(hrIntegrationEvents.id, event.id));
    return person.id;
  });
}
