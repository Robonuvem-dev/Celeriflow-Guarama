"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { registerOccupationalProgram } from "@/lib/sst/program-service";
import { examOccasions } from "@/lib/sst/program-policy";
import { SstValidationError } from "@/lib/sst/errors";

export async function saveSstProgram(form: FormData) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const get = (name: string) => String(form.get(name) || "");
    const id = await registerOccupationalProgram(context, {
      ...Object.fromEntries(form),
      content: Object.fromEntries(["objectives", "responsibilities", "procedures", "records", "firstAid", "campaigns"].map((name) => [name, get(name)])),
      groups: form.getAll("groupId").map(String).map((groupId) => ({
        groupId, conditions: get(`${groupId}.conditions`),
        risks: get("kind") === "PCMSO" ? [] : Array.from({ length: 10 }, (_, index) => {
          const key = `${groupId}.risk.${index}`;
          return { description: get(`${key}.description`), danger: get(`${key}.danger`), possibleDamage: get(`${key}.possibleDamage`), propagation: get(`${key}.propagation`), controls: get(`${key}.controls`), sources: get(`${key}.sources`), exposureMinutes: get(`${key}.exposureMinutes`), epiApplicable: form.get(`${key}.epiApplicable`) === "on", epis: get(`${key}.epis`).split(";").map((item) => item.trim()).filter(Boolean), probability: get(`${key}.probability`), severity: get(`${key}.severity`) };
        }).filter((risk) => risk.description),
        exams: examOccasions.flatMap((occasion) => get(`${groupId}.exam.${occasion}`).split(";").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, occasion }))),
      })),
    });
    revalidatePath("/sst/programas"); revalidatePath("/app-domain/sst/programas");
    return { error: null, id };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Confira os campos do programa." : error instanceof AccessError || error instanceof SstValidationError ? error.message : "Não foi possível registrar o programa." }; }
}
