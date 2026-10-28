"use server";
import { revalidatePath } from "next/cache";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import {
  createEstimate,
  importIndices,
  importMovements,
  importRepasse,
  linkCompanyAccountant,
  markNotificationRead,
  notifyCorrection,
  processCompetency,
  resolveCrossCheck,
  upsertAccountant,
  upsertCompany,
  upsertRule,
} from "@/lib/tributacao/s10-service";
const path = "/tributacao/vaf";
const done = (error?: unknown) => ({
  error:
    error instanceof Error
      ? error.message
      : error
        ? "Não foi possível concluir a operação."
        : undefined,
});
async function ctx(op: "create" | "update") {
  return taxActionContext(op);
}
const actor = (c: Awaited<ReturnType<typeof ctx>>) => ({
  usuarioId: c.user.id,
});
export async function upsertAccountantAction(
  input: Parameters<typeof upsertAccountant>[1],
) {
  try {
    const c = await ctx("create");
    await upsertAccountant(c.connection, input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function upsertCompanyAction(
  input: Parameters<typeof upsertCompany>[1],
) {
  try {
    const c = await ctx("create");
    await upsertCompany(c.connection, input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function linkAccountantAction(
  companyId: string,
  accountantId: string | null,
) {
  try {
    const c = await ctx("update");
    await linkCompanyAccountant(c.connection, companyId, accountantId);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function upsertRuleAction(input: {
  exerciseId: string;
  cfop: string;
  cfopDescription?: string;
  composesVaf?: boolean;
  formula: string;
  contrapartidaCfop?: string;
  effectiveFrom: string;
}) {
  try {
    const c = await ctx("create");
    await upsertRule(c.connection, {
      ...input,
      effectiveFrom: new Date(input.effectiveFrom),
    });
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function importMovementsAction(
  kind: "EFD" | "GIA",
  input: {
    companyId: string;
    exerciseId: string;
    competency: string;
    fileName: string;
    movements: {
      cfop: string;
      operationType: "ENTRADA" | "SAIDA";
      value: number;
    }[];
  },
) {
  try {
    const c = await ctx("create");
    await importMovements(c.connection, actor(c), kind, input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function processCompetencyAction(input: {
  exerciseId: string;
  competency: string;
}): Promise<{ error?: string; summary?: string }> {
  try {
    const c = await ctx("update");
    const r = await processCompetency(c.connection, actor(c), input);
    revalidatePath(path);
    return {
      ...done(),
      summary: `Apurado VAF ${r.total} (${r.companies} empresas).`,
    };
  } catch (e) {
    return { ...done(e), summary: undefined };
  }
}
export async function importRepasseAction(input: {
  exerciseId: string;
  competency: string;
  weekNumber?: number;
  municipalValue: number;
  stateTotalValue: number;
}) {
  try {
    const c = await ctx("create");
    await importRepasse(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function importIndicesAction(
  input: Parameters<typeof importIndices>[1],
) {
  try {
    const c = await ctx("create");
    await importIndices(c.connection, input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function notifyCorrectionAction(
  input: Parameters<typeof notifyCorrection>[1],
) {
  try {
    const c = await ctx("create");
    await notifyCorrection(c.connection, input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function markNotificationReadAction(id: string) {
  try {
    const c = await ctx("update");
    await markNotificationRead(c.connection, id);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function resolveCrossCheckAction(
  id: string,
  status: "CORRIGIDA" | "IGNORADA",
) {
  try {
    const c = await ctx("update");
    await resolveCrossCheck(c.connection, actor(c), id, status);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function createEstimateAction(input: {
  exerciseId: string;
  competency: string;
  method: "LINEAR" | "MEDIA_MOVEL";
  realizedMonths: number;
  realizedValue: number;
}) {
  try {
    const c = await ctx("create");
    await createEstimate(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
