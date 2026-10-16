"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import {
  communicateDesifFiscalCase,
  createDesifAgency,
  createDesifInstitution,
  issueDesifGuide,
  openDesifFiscalCase,
  processDesifImport,
  receiveDesifImport,
  validateDesifImport,
} from "@/lib/tributacao/s6-service";

const path = "/tributacao/iss-bancario";
const result = (error?: unknown) => ({
  error:
    error instanceof Error
      ? error.message
      : error
        ? "Não foi possível concluir a operação."
        : undefined,
});
async function ctx(operation: "create" | "update") {
  return getTenantContextForModuleOperation("TRIBUTACAO", operation);
}
const actor = (context: Awaited<ReturnType<typeof ctx>>) => ({
  usuarioId: context.user.id,
  employeeId: context.user.employeeId,
});

export async function createInstitutionAction(
  input: Parameters<typeof createDesifInstitution>[1],
) {
  try {
    const context = await ctx("create");
    await createDesifInstitution(context.prisma, input);
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
export async function createAgencyAction(
  input: Parameters<typeof createDesifAgency>[1],
) {
  try {
    const context = await ctx("create");
    await createDesifAgency(context.prisma, input);
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
export async function validateImportAction(id: string) {
  try {
    const context = await ctx("update");
    await validateDesifImport(context.prisma, actor(context), id);
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
export async function processImportAction(id: string) {
  try {
    const context = await ctx("update");
    await processDesifImport(context.prisma, actor(context), id);
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
export async function receiveImportAction(
  input: Parameters<typeof receiveDesifImport>[2],
) {
  try {
    const context = await ctx("create");
    await receiveDesifImport(context.prisma, actor(context), input);
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
export async function issueGuideAction(id: string) {
  try {
    const context = await ctx("create");
    await issueDesifGuide(context.prisma, id);
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
export async function openFiscalCaseAction(
  id: string,
  findingType: "OMISSAO" | "DIFERENCA" | "SEM_MOVIMENTO",
  processId?: string,
) {
  try {
    const context = await ctx("create");
    await openDesifFiscalCase(context.prisma, actor(context), {
      assessmentId: id,
      findingType,
      processId,
    });
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
export async function communicateFiscalCaseAction(id: string) {
  try {
    const context = await ctx("update");
    await communicateDesifFiscalCase(context.prisma, actor(context), id);
    revalidatePath(path);
    return result();
  } catch (error) {
    return result(error);
  }
}
