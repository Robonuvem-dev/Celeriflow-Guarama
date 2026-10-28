"use server";

import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { submitEmployeeHrRequest } from "@/lib/rh/portal-requests";
import { revalidatePath } from "next/cache";
import { submitEmployeeCreditRequest } from "@/lib/rh/credit-requests";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { db, databaseConnection } from "@/db/client";

export async function submitMyHrRequest(values: Record<string, string>) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return { error: "Cadastro funcional indisponível." };
  try {
    const request = await submitEmployeeHrRequest(databaseConnection, access.context.user.id, access.employee.id, values);
    revalidatePath("/portal-servidor/solicitacoes-rh");
    revalidatePath("/rh/solicitacoes");
    return { id: request.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Falha ao registrar solicitação." }; }
}

export async function submitMyCreditRequest(values: Record<string, string>) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return { error: "Cadastro funcional indisponível." };
  try {
    if (!await arePortalPayrollStatementsEnabled(access.context.database ?? db)) return { error: "Demonstrativos desabilitados pelo RH." };
    const request = await submitEmployeeCreditRequest(databaseConnection, access.context.user.id, access.employee.id, values);
    revalidatePath("/portal-servidor/solicitacoes-rh");
    revalidatePath("/rh/solicitacoes");
    return { id: request.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Falha ao registrar pedido de crédito." }; }
}
