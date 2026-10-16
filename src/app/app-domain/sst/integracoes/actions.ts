"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { configureEsocial, prepareEsocial, transmitEsocial } from "@/lib/sst/esocial-service";

function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return "Confira os campos e as referências externas informadas.";
  if (error instanceof AccessError) return error.message;
  // Never return adapter exceptions, SOAP bodies or credentials to the browser.
  return "Operação indisponível. Confira a origem, a configuração e as pendências da integração.";
}
export async function prepareEventAction(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await prepareEsocial(context, { budgetUnitId: form.get("budgetUnitId"), sourceId: form.get("sourceId"), kind: form.get("kind"), environment: form.get("environment"), submissionKey: form.get("submissionKey") });
    revalidatePath("/sst/integracoes");
    return { error: null, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function configureEventAction(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = await configureEsocial(context, { budgetUnitId: form.get("budgetUnitId"), environment: form.get("environment"), employerRegistration: form.get("employerRegistration"), credentialReference: form.get("credentialReference"), providerReference: form.get("providerReference"), submissionKey: form.get("submissionKey") });
    revalidatePath("/sst/integracoes");
    return { error: null, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
export async function transmitEventAction(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const id = z.string().min(1).parse(form.get("eventId"));
    await transmitEsocial(context, id);
    revalidatePath(`/sst/integracoes/${id}`);
    return { error: null, id };
  } catch (error) { return { error: errorMessage(error) }; }
}
