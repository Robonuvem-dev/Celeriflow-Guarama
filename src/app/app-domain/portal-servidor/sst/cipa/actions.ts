"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { registerCipaCandidate, voteCipa } from "@/lib/sst/prevention-service";
import { AccessError } from "@/lib/platform/tenant-context";
import { SstValidationError } from "@/lib/sst/errors";
function message(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message || "Confira a eleição." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível concluir a operação CIPA."; }
export async function selfRegisterCipa(form: FormData) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Servidor autenticado sem vínculo ativo.", 403);
    const id = await registerCipaCandidate(access.context, z.string().min(1).max(100).parse(form.get("electionId")));
    revalidatePath("/portal-servidor/sst/cipa"); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
export async function selfVoteCipa(form: FormData) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Servidor autenticado sem vínculo ativo.", 403);
    const id = await voteCipa(access.context, { electionId: form.get("electionId"), candidateId: form.get("candidateId") || null });
    revalidatePath("/portal-servidor/sst/cipa"); revalidatePath(`/sst/prevencao/${id}`); return { error: null, id };
  } catch (error) { return { error: message(error) }; }
}
