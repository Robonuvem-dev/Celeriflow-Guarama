import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import { listMscPublishedEntries } from "@/db/repositories/finance/msc-configuration";
import { countMscInformationReferences } from "@/db/repositories/finance/msc-export";

type Scope = { governmentEntityId: string; budgetUnitId: string; date: Date };
const object = (value: JsonValue | undefined): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const string = (value: JsonValue | undefined) => typeof value === "string" ? value : null;

async function currentMapping(tx: DatabaseTransaction, scope: Scope, kind: string, canonicalId: string) {
  const day = scope.date.toISOString().slice(0, 10);
  const lockKey = `MSC_MAPPING:${scope.governmentEntityId}:${scope.budgetUnitId}:${scope.date.getUTCFullYear()}:MSC_MAPPING_${kind}:${canonicalId}`;
  // Share the publisher's key so all lines of one posting keep a stable source edition until commit.
  await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey}, 0))::text`);
  const candidates = await listMscPublishedEntries(tx, { kind: `MSC_MAPPING_${kind}`, canonicalId, year: scope.date.getUTCFullYear(), governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId });
  const applicable = candidates.filter(entry => { const attrs = object(entry.attributes); return attrs.operational === true && typeof attrs.effectiveFrom === "string" && typeof attrs.effectiveUntil === "string" && attrs.effectiveFrom <= day && attrs.effectiveUntil >= day; });
  const replaced = new Set(applicable.map(entry => object(entry.attributes).predecessorEntryId));
  const current = applicable.filter(entry => !replaced.has(entry.id));
  if (current.length > 1) throw new Error(`De-para MSC ${kind} sobreposto para a linha contábil; concilie as edições antes de postar.`);
  return current[0] ?? null;
}

/** Composes documented IC on the posting date, and copies original IC on reversals. */
export async function composeMscLineDimensions(tx: DatabaseTransaction, scope: Scope, accountId: string, dimensions: JsonObject | null): Promise<JsonObject | null> {
  const origin = object(dimensions);
  if (Array.isArray(origin.originalClassificationSnapshots)) {
    const memories = origin.originalClassificationSnapshots.map(snapshot => object(object(object(snapshot).dimensions).msc));
    if (memories.some(memory => Object.keys(memory).length)) {
      if (new Set(memories.map(memory => JSON.stringify(memory))).size !== 1) throw new Error("Contrapartes de estorno possuem composições MSC distintas; identifique a linha original.");
      return memories[0];
    }
    return null;
  }
  const account = await currentMapping(tx, scope, "ACCOUNT", accountId);
  if (!account) return null;
  const config = object(account.attributes), fixed = object(config.fixedInformation), budget = object(origin.budgetDimensions);
  const expected = Array.isArray(config.informationTypes) ? config.informationTypes.filter((type): type is string => typeof type === "string") : [];
  if (!expected.length || expected.length > 6 || new Set(expected).size !== expected.length || config.informationPairs !== 6) throw new Error("Edição MSC da conta sem conjunto de informações complementares válido.");
  const information: Record<string, string> = {};
  const mappings: Array<{ type: string; entryId: string; versionId: string }> = [];
  for (const type of ["PO", "FP", "DC", "CO"]) if (typeof fixed[type] === "string" && expected.includes(type)) information[type] = fixed[type];
  for (const [type, kind, canonicalId] of [["FR", "SOURCE", string(origin.resourceSourceId)], ["NR", "REVENUE", string(budget.revenueNatureId)], ["ND", "EXPENSE", string(budget.expenseNatureId)]] as const) {
    if (!expected.includes(type) || !canonicalId) continue;
    const mapping = await currentMapping(tx, scope, kind, canonicalId);
    if (!mapping) continue;
    if (object(mapping.attributes).referenceHash !== config.referenceHash) throw new Error("Conta e dimensão MSC usam revisões oficiais diferentes.");
    information[type] = mapping.code;
    mappings.push({ type, entryId: mapping.id, versionId: mapping.versionId });
  }
  if (expected.includes("FS")) {
    const functionCode = string(budget.functionCode), subfunctionCode = string(budget.subfunctionCode);
    if (functionCode && subfunctionCode) {
      const references = await countMscInformationReferences(tx, string(config.referenceVersionId) ?? "", "FS", functionCode + subfunctionCode);
      if (references === 2) information.FS = functionCode + subfunctionCode;
    }
  }
  // The carry-forward year must be documented by the origin; transaction year cannot substitute it.
  if (expected.includes("AI") && typeof budget.carryForwardRegistrationYear === "number" && Number.isInteger(budget.carryForwardRegistrationYear)) information.AI = String(budget.carryForwardRegistrationYear);
  const widths: Record<string, number> = { PO: 5, FP: 1, DC: 1, FR: 4, CO: 4, NR: 8, ND: 8, FS: 5, AI: 4 };
  for (const [type, value] of Object.entries(information)) if (!widths[type] || !new RegExp(`^\\d{${widths[type]}}$`).test(value)) throw new Error(`Informação MSC ${type} inválida na edição configurada.`);
  const omitted = Array.isArray(config.omittedInformationTypes) ? config.omittedInformationTypes.filter((type): type is string => typeof type === "string") : [];
  const missing = expected.filter(type => !information[type] && !omitted.includes(type));
  return { status: missing.length ? "NOT_RECONCILED" : "DOCUMENTED", accountCode: account.code, mappingEntryId: account.id, mappingVersionId: account.versionId, referenceVersionId: config.referenceVersionId ?? null, referenceHash: config.referenceHash ?? null, informationPairs: 6, information, pairs: expected.filter(type => information[type]).map(type => ({ type, value: information[type] })), omittedInformationTypes: omitted, missingInformationTypes: missing, decision: config.decision ?? null, dimensionMappings: mappings };
}
