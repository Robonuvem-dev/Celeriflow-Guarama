"use server";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { submitRecertificationProposal } from "@/lib/rh/recertification";
import { revalidatePath } from "next/cache";

export async function submitMyRecertification(values: Record<string, string>) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return { error: "Cadastro funcional indisponível." };
  const { campaignRuleId, detailsJson, ...proposal } = values;
  try {
    const result = await submitRecertificationProposal(access.context.prisma, access.context.user.id, access.employee.id, { campaignRuleId, proposal, ...(detailsJson ? { details: JSON.parse(detailsJson) } : {}) });
    revalidatePath("/portal-servidor/recadastramento"); revalidatePath("/rh/solicitacoes");
    return { id: result.id };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a proposta." }; }
}
