"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerHealthPlan, registerBenefitBeneficiary, registerBenefitEntry, generateBenefitMonthly } from "@/lib/sst/benefit-service";
import { ZodError } from "zod";
import { postBenefitEntry, cancelBenefitCharge, registerBenefitPayrollMapping, registerBenefitPayrollScope } from "@/lib/sst/benefit-posting";

const fields = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((key) => [key, String(form.get(key) ?? "")]));
async function save(operation: (context: Awaited<ReturnType<typeof getTenantContextForModuleOperation>>) => Promise<string>) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await operation(context);
    revalidatePath("/sst/planos");
    revalidatePath("/portal-servidor/sst/planos");
    revalidatePath("/rh/folha");
    revalidatePath("/portal-servidor/folha");
    return { error: null, id };
  } catch (error) {
    return { error: error instanceof ZodError ? error.issues.map((issue) => issue.message).join(" ") : error instanceof Error ? error.message : "Não foi possível registrar o benefício." };
  }
}
export async function saveHealthPlan(form: FormData) {
  return save((context) => registerHealthPlan(context, fields(form, ["budgetUnitId", "benefitConfigId", "ansPlanNumber", "ansOperatorNumber", "monthlyRubricId", "extraordinaryRubricId", "monthlyEventId", "extraordinaryEventId", "contractReference"])));
}
export async function saveBenefitBeneficiary(form: FormData) {
  return save((context) => registerBenefitBeneficiary(context, fields(form, ["planId", "payrollBenefitId", "dependentId", "admissionDate", "startsAt", "endsAt", "cardNumber", "monthlyAmount", "contractReference"])));
}
export async function saveBenefitEntry(form: FormData) {
  return save((context) => registerBenefitEntry(context, fields(form, ["beneficiaryId", "competence", "kind", "amount", "sourceReference", "reason", "refundOfId"])));
}
export async function generateMonthly(form: FormData) {
  return save((context) => generateBenefitMonthly(context, String(form.get("beneficiaryId") ?? ""), String(form.get("competence") ?? "")));
}

export async function approveBenefitPosting(form: FormData) {
  return save(async (context) => {
    await getTenantContextForModuleOperation("RH", "update");
    const result = await postBenefitEntry(context, String(form.get("entryId") ?? ""), String(form.get("payrollId") ?? ""));
    if (result.status === "BLOCKED") throw new Error(`Postagem bloqueada: ${result.blockers.join(" · ")}`);
    return result.entryId!;
  });
}
export async function saveBenefitPayrollScope(form: FormData) {
  return save(async (context) => {
    await getTenantContextForModuleOperation("RH", "update");
    return registerBenefitPayrollScope(context, String(form.get("planId") ?? ""), String(form.get("payrollId") ?? ""));
  });
}
export async function saveBenefitPayrollMapping(form: FormData) {
  return save(async (context) => {
    await getTenantContextForModuleOperation("RH", "update");
    return registerBenefitPayrollMapping(context, fields(form, ["planId", "startsAt", "endsAt", "monthlyRubricId", "monthlyEventId", "extraordinaryRubricId", "extraordinaryEventId", "refundRubricId", "refundEventId", "contractReference"]));
  });
}
export async function compensateBenefitCharge(form: FormData) {
  return save(async (context) => {
    await getTenantContextForModuleOperation("RH", "update");
    const result = await cancelBenefitCharge(context, fields(form, ["entryId", "payrollId", "competence", "reason"]));
    if (result.status === "BLOCKED") throw new Error(`Compensação bloqueada: ${result.blockers.join(" · ")}`);
    return result.entryId!;
  });
}
