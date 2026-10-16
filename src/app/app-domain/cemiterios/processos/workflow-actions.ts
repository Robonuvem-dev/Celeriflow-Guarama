"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { advanceCemeteryProcess, createCemeteryProcess, declarantDebtSnapshot, registerDeceased, registerMovement } from "@/lib/tributacao/s9-service";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string) => text(form, key) || undefined;

export async function readWorkflowReference(kind: "taxpayer" | "deceased", id: string) {
  try {
    const { prisma } = await getTenantContextForModule("CEMITERIOS");
    if (kind === "taxpayer") {
      const taxpayer = await prisma.taxpayer.findUnique({ where: { id }, include: { person: true } });
      if (!taxpayer?.person || taxpayer.status !== "Ativo") return { error: "Pessoa física ativa não encontrada." };
      return { reference: { name: taxpayer.person.fullName, deathDate: taxpayer.person.deathDate?.toISOString().slice(0, 10), birthDate: taxpayer.person.birthDate?.toISOString().slice(0, 10), cause: undefined, funeralHome: undefined, status: undefined, graveId: undefined, graveLabel: undefined, occupied: undefined, capacity: undefined } };
    }
    if (kind !== "deceased") return { error: "Referência inválida." };
    const deceased = await prisma.taxDeceased.findUnique({ where: { id }, include: { cause: true, funeralHome: true, grave: { include: { cemetery: true } } } });
    if (!deceased) return { error: "Registro funerário não encontrado." };
    return { reference: { name: deceased.fullName, deathDate: deceased.deathDate.toISOString().slice(0, 10), birthDate: deceased.birthDate?.toISOString().slice(0, 10), cause: deceased.cause?.description, funeralHome: deceased.funeralHome?.name, status: deceased.status, graveId: deceased.graveId ?? undefined, graveLabel: deceased.grave ? `${deceased.grave.code} · ${deceased.grave.cemetery.name}` : undefined, occupied: deceased.grave?.occupantCount, capacity: deceased.grave?.capacity } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Consulta indisponível." }; }
}

export async function checkWorkflowDebt(taxpayerId: string) {
  try {
    const { prisma } = await getTenantContextForModule("CEMITERIOS");
    if (!taxpayerId) return { error: "Selecione o declarante." };
    const snapshot = await declarantDebtSnapshot(prisma, taxpayerId);
    return { snapshot: { total: snapshot.total, hasDebt: snapshot.hasDebt, assessmentCount: snapshot.assessmentCount, activeDebtCount: snapshot.activeDebtCount } };
  } catch (error) { return { error: error instanceof Error ? error.message : "Consulta indisponível." }; }
}

export async function saveWorkflow(form: FormData) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("CEMITERIOS", "create");
    const actor = { usuarioId: user.id };
    const processType = text(form, "processType");
    const requestKey = text(form, "requestKey");
    if (!requestKey) throw new Error("Chave da solicitação obrigatória.");
    const declarantTaxpayerId = text(form, "declarantTaxpayerId");
    if (text(form, "debtConfirmed") !== declarantTaxpayerId) throw new Error("Consulte os débitos do declarante antes de confirmar.");
    if (processType === "SEPULTAMENTO") {
      await registerDeceased(prisma, actor, {
        fullName: text(form, "fullName"), birthDate: optional(form, "birthDate") ? new Date(text(form, "birthDate")) : undefined,
        deathDate: new Date(text(form, "deathDate")), deathTime: optional(form, "deathTime"), gender: optional(form, "gender"), document: optional(form, "document"),
        maritalStatus: optional(form, "maritalStatus"), fatherName: optional(form, "fatherName"), motherName: optional(form, "motherName"), address: optional(form, "address"),
        cemeteryId: text(form, "cemeteryId"), graveId: text(form, "graveId"), deceasedTaxpayerId: optional(form, "deceasedTaxpayerId"), declarantTaxpayerId,
        funeralHomeId: optional(form, "funeralHomeId"), causeId: optional(form, "causeId"), chapelId: optional(form, "chapelId"),
        doctorName: text(form, "doctorName"), doctorCrm: text(form, "doctorCrm"), scheduledAt: new Date(text(form, "scheduledAt")),
        burialType: text(form, "burialType") as "NORMAL" | "MEMBRO" | "NAO_RECLAMADO", unidentified: form.get("unidentified") === "on",
        memberOwnerDeceased: form.get("memberOwnerDeceased") === "on", exceptionReason: optional(form, "exceptionReason"), finalizeNow: false, requestKey,
        groups: Object.fromEntries(["falecido", "nascimento", "documentos", "endereco", "obito", "local", "medico", "causas", "funeraria", "sepultamento", "observacoes"].map(key => [key, { observacao: text(form, `group_${key}`) }])),
      });
    } else {
      await createCemeteryProcess(prisma, actor, { processType: processType as "VELORIO" | "CREMACAO", deceasedId: text(form, "deceasedId"), cemeteryId: optional(form, "cemeteryId"), chapelId: optional(form, "chapelId"), funeralHomeId: optional(form, "funeralHomeId"), declarantTaxpayerId, scheduledAt: new Date(text(form, "scheduledAt")), notes: optional(form, "notes"), requestKey, deceasedTaxpayerId: optional(form, "deceasedTaxpayerId"), deathDate: optional(form, "deathDate") ? new Date(text(form, "deathDate")) : undefined, causeId: optional(form, "causeId"), doctorName: optional(form, "doctorName"), doctorCrm: optional(form, "doctorCrm") });
    }
    revalidatePath("/cemiterios/processos"); revalidatePath("/cemiterios");
    return { error: undefined };
  } catch (error) { return { error: error instanceof Error ? error.message : "Operação indisponível." }; }
}

export async function advanceWorkflow(processId: string, status: Parameters<typeof advanceCemeteryProcess>[2]["status"], requestKey: string) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("CEMITERIOS", "update");
    await advanceCemeteryProcess(prisma, { usuarioId: user.id }, { processId, status, requestKey });
    revalidatePath("/cemiterios/processos"); revalidatePath("/cemiterios");
    return { error: undefined };
  } catch (error) { return { error: error instanceof Error ? error.message : "Operação indisponível." }; }
}

export async function saveWorkflowTransfer(form: FormData) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("CEMITERIOS", "create");
    const requestKey = text(form, "requestKey");
    if (!requestKey) throw new Error("Chave da solicitação obrigatória.");
    await registerMovement(prisma, { usuarioId: user.id }, { deceasedId: text(form, "deceasedId"), graveId: text(form, "graveId"), toGraveId: optional(form, "toGraveId"), ossuaryId: optional(form, "ossuaryId"), movementType: text(form, "movementType") as Parameters<typeof registerMovement>[2]["movementType"], destinationDescription: optional(form, "destinationDescription"), notes: optional(form, "notes"), requestKey });
    revalidatePath("/cemiterios/transferencias"); revalidatePath("/cemiterios/processos"); revalidatePath("/cemiterios");
    return { error: undefined };
  } catch (error) { return { error: error instanceof Error ? error.message : "Operação indisponível." }; }
}
