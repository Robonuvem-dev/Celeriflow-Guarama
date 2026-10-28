import { desc } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { itbiRegistryPosition, readItbiRegistryEntries } from "@/db/repositories/tax-itbi/records";
import { fiscalFieldSchema } from "./configurable-cadastres";
import { taxScopeSnapshot } from "./scope";

/** Callers authorize the declaration before exposing its frozen form values. */
export async function readItbiAdditionalForms(db: DatabaseExecutor, declarationId: string, scope: { governmentEntityId: string; budgetUnitId: string }) {
  const entries = await readItbiRegistryEntries(db, itbiRegistryPosition("ITBI_DECLARATION", declarationId, "TYPED_FISCAL_RECORD"), [desc(taxRegistryEntries.version)]);
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.title)) latest.set(entry.title, entry);
  return [...latest.values()].flatMap(entry => {
    if (entry.status !== "ATIVO") return [];
    const data = taxScopeSnapshot(entry.data);
    if (data.governmentEntityId !== scope.governmentEntityId || data.budgetUnitId !== scope.budgetUnitId || data.kind !== "FORMULARIO_ITBI") throw new Error("Formulário de ITBI com origem divergente.");
    const values = taxScopeSnapshot(data.values);
    const fields = Array.isArray(data.fields) ? data.fields.map(field => fiscalFieldSchema.parse(field)) : [];
    return [{ id: entry.id, title: String(data.name), version: entry.version, catalogVersion: Number(data.catalogVersion), fields: fields.map(field => ({ label: field.label, value: values[field.key] === null || values[field.key] === undefined ? "Não informado" : typeof values[field.key] === "boolean" ? values[field.key] ? "Sim" : "Não" : String(values[field.key]) })) }];
  });
}
