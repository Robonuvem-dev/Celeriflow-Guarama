import { z } from "zod";
import { canPerformModuleOperation, AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { assertRecertificationReviewScope } from "./recertification";
import { recertificationDetailsSchema } from "./recertification-details";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { enqueueHrIntegration } from "./workforce-service";

export async function reconcileProposedDependentPerson(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), cpf: z.string().transform(value => requireValidCpf(value)) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "CADASTROS", "create")) throw new AccessError("Saneamento da pessoa física exige inclusão no Cadastro Único.", 403);
  await assertRecertificationReviewScope(context, input.requestId);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (request.status !== "EM_ANALISE") throw new Error("Saneamento exige proposta em análise.");
    const details = recertificationDetailsSchema.parse((request.payload as { details?: unknown }).details);
    const dependent = details.dependents.find(row => row.cpf === input.cpf);
    if (!dependent || !details.documentVersionIds.length) throw new Error("Dependente e comprovação documental devem constar da proposta enviada pelo titular.");
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: request.employeeId } });
    if (!employee.personId || !await tx.documentVersion.findFirst({ where: { id: { in: details.documentVersionIds }, status: { in: ["FINAL", "SIGNED"] }, document: { personId: employee.personId, status: { in: ["Válido", "Assinado"] } } }, select: { id: true } })) throw new Error("Comprovação pessoal indisponível.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CADASTRO:CPF:${input.cpf}`}))`;
    const birthDate = new Date(`${dependent.birthDate}T00:00:00Z`);
    if (birthDate > new Date()) throw new Error("Nascimento futuro não pode ser conciliado.");
    const previous = await tx.person.findUnique({ where: { cpf: input.cpf } });
    if (previous) {
      if (previous.fullName !== dependent.name || previous.birthDate?.toISOString().slice(0, 10) !== dependent.birthDate || previous.status !== "Ativo") throw new Error("Pessoa já existente com dados divergentes. Corrija pelo fluxo próprio de Cadastro Único, preservando a identidade.");
      return previous.id;
    }
    const person = await tx.person.create({ data: { cpf: input.cpf, fullName: dependent.name, birthDate, status: "Ativo" } });
    const event = await enqueueHrIntegration(tx, { sourceKey: `RECADASTRAMENTO:PESSOA:${request.id}:${person.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "DEPENDENTE_PROPOSTO_CONCILIADO_NO_CADASTRO", payload: { requestId: request.id, personId: person.id, actorId: context.user.id, documentVersionIds: details.documentVersionIds, employeeRelationshipApplied: false } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    return person.id;
  });
}
