"use server";

import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { generateEnvironmentalLicense, type EnvironmentalLicenseInput, type EnvironmentalLicenseResult } from "@/lib/meio-ambiente/licenciamento-engine";
import type { IssuedEnvironmentalLicense } from "@/lib/contracts/environment";
import { db } from "@/db/client";
import { listIssuedLicenses } from "@/db/repositories/environment/queries";
import { revalidatePath } from "next/cache";

type ActionResult<T = unknown> = { error?: string; data?: T };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function issueEnvironmentalLicenseAction(input: EnvironmentalLicenseInput): Promise<ActionResult<EnvironmentalLicenseResult>> {
  try {
    const context = await getTenantContextForModuleOperation("MEIO_AMBIENTE", "create");
    const result = await generateEnvironmentalLicense(context.database ?? db, input);

    revalidatePath("/meio-ambiente/licenciamento");
    return { data: result };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao emitir Licença Ambiental.") };
  }
}

export async function getIssuedLicensesAction(): Promise<ActionResult<IssuedEnvironmentalLicense[]>> {
  try {
    const context = await getTenantContextForModule("MEIO_AMBIENTE");
    const licenses = await listIssuedLicenses(context.database ?? db);
    return { data: licenses };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao listar licenças emitidas.") };
  }
}
