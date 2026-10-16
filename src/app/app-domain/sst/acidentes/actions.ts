"use server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { registerAccident, addAccidentEvidence, addAccidentLedger } from "@/lib/sst/accident-service";
import { revalidatePath } from "next/cache";
import { accidentActionError } from "@/lib/sst/accident-errors";

async function run(form: FormData, task: "CAT" | "EVIDENCE" | "LEDGER") {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create");
    const fields = Object.fromEntries(form.entries());
    const input = task === "CAT" ? { ...fields, bodyParts: String(fields.bodyParts).split(";").map(s => s.trim()).filter(Boolean), witnesses: JSON.parse(String(fields.witnesses || "[]")) } : task === "EVIDENCE" ? { ...fields, approved: fields.approved === "on", data: JSON.parse(String(fields.data)) } : fields;
    const id = task === "CAT" ? await registerAccident(context, input) : task === "EVIDENCE" ? await addAccidentEvidence(context, input) : await addAccidentLedger(context, input);
    revalidatePath("/sst/acidentes");
    return { error: null, id };
  } catch (error) { return { error: accidentActionError(error) }; }
}
export async function saveAccident(form: FormData) { return run(form, "CAT"); }
export async function saveEvidence(form: FormData) { return run(form, "EVIDENCE"); }
export async function saveLedger(form: FormData) { return run(form, "LEDGER"); }
