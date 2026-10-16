import { Prisma } from "@prisma/client";
import { currentPresentationEntries } from "../planejamento/catalog-presentation";

type ClassificationScope = { governmentEntityId: string; budgetUnitId: string };

function attributesOf(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

/** Freeze the edition actually applicable to the posting date and entity. */
export async function resolveAccountClassificationSnapshots(tx: Prisma.TransactionClient, accounts: { id: string }[], date: Date, scope?: ClassificationScope) {
  if (!Number.isFinite(date.getTime())) throw new Error("Data da classificação contábil inválida.");
  const day = date.toISOString().slice(0, 10);
  const bindings = await tx.planningCatalogEntry.findMany({ where: { kind: "ACCOUNT", canonicalId: { in: accounts.map((account) => account.id) }, version: { status: "PUBLISHED" } }, include: { version: { select: { year: true, sourceHash: true, normativeReference: true } } } });
  const snapshots = new Map<string, Prisma.InputJsonObject>();
  for (const account of accounts) {
    const versions = bindings.filter((entry) => entry.canonicalId === account.id);
    if (!versions.length) {
      if (process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") throw new Error("Conta contábil sem classificação publicada; conclua o de-para municipal antes da postagem.");
      continue;
    }
    const current = currentPresentationEntries(versions.filter((entry) => {
      const attributes = attributesOf(entry.attributes);
      return entry.version.year === date.getUTCFullYear()
        && typeof attributes.effectiveFrom === "string" && typeof attributes.effectiveUntil === "string"
        && attributes.effectiveFrom <= day && attributes.effectiveUntil >= day
        && (!attributes.governmentEntityId || attributes.governmentEntityId === scope?.governmentEntityId)
        && (!attributes.budgetUnitId || attributes.budgetUnitId === scope?.budgetUnitId);
    }), day);
    // A municipal adoption supersedes its explicitly linked reference, preserving both immutable editions.
    const replaced = new Set(current.flatMap((entry) => {
      const attributes = attributesOf(entry.attributes);
      return attributes.operational === true && attributes.pocOnly === false && typeof attributes.predecessorEntryId === "string" ? [attributes.predecessorEntryId] : [];
    }));
    const candidates = current.filter((entry) => !replaced.has(entry.id));
    if (candidates.length !== 1) throw new Error("Conta contábil sem versão vigente única; concilie o catálogo antes da postagem.");
    const attributes = attributesOf(candidates[0].attributes);
    if (attributes.pocOnly === true && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") throw new Error("Classificação de ensaio disponível somente no modo POC; homologação municipal pendente.");
    if (attributes.postingAllowed !== true) throw new Error("Conta sintética ou sem autorização de escrituração na versão vigente.");
    if (!attributes.effectiveFrom || !attributes.effectiveUntil || date.toISOString().slice(0, 10) < String(attributes.effectiveFrom) || date.toISOString().slice(0, 10) > String(attributes.effectiveUntil)) throw new Error("Conta contábil fora da vigência da classificação.");
    if (!["D", "C", "X", "DC", "D/C"].includes(String(attributes.balanceNature))) throw new Error("Natureza D/C da conta não está conciliada.");
    const selected = candidates[0];
    snapshots.set(account.id, { entryId: selected.id, versionId: selected.versionId, externalCode: selected.code, canonicalId: account.id, sourceHash: selected.version.sourceHash ?? null, normativeReference: selected.version.normativeReference ?? null, postingDate: day, attributes: attributes as Prisma.InputJsonObject });
  }
  return snapshots;
}

/** Kept for existing validation-only consumers. */
export async function assertPublishedAccountClassification(tx: Prisma.TransactionClient, accounts: { id: string }[], date: Date) {
  await resolveAccountClassificationSnapshots(tx, accounts, date);
}
