import { Prisma } from "@prisma/client";

type Entry = { id: string; kind: string; code: string; canonicalId: string; parentCode: string | null; degree: number; attributes: Prisma.JsonValue; version: { year: number } };
const metadata = new Set(["presentationPredecessorEntryId", "presentationPredecessorVersionId", "presentationEffectiveFrom"]);
function object(value: Prisma.JsonValue): Prisma.JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {}; }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; return JSON.stringify(value); }

/** Name-only revisions cannot change authority, posting permissions, scope or validity. */
export function currentPresentationEntries<T extends Entry>(entries: T[], day: string): T[] {
  const hidden = new Set<string>();
  for (const entry of entries) {
    const attributes = object(entry.attributes);
    if (typeof attributes.presentationPredecessorEntryId !== "string" || typeof attributes.presentationEffectiveFrom !== "string") continue;
    if (attributes.presentationEffectiveFrom > day) { hidden.add(entry.id); continue; }
    const previous = entries.find(row => row.id === attributes.presentationPredecessorEntryId);
    if (!previous) continue;
    const old = object(previous.attributes);
    const strip = (value: Prisma.JsonObject) => Object.fromEntries(Object.entries(value).filter(([key]) => !metadata.has(key)));
    if (entry.kind !== previous.kind || entry.code !== previous.code || entry.canonicalId !== previous.canonicalId || entry.parentCode !== previous.parentCode || entry.degree !== previous.degree || entry.version.year !== previous.version.year || stable(strip(attributes)) !== stable(strip(old))) throw new Error("Revisão de nomes alterou a semântica da classificação; concilie a edição.");
    // A real municipal adoption already superseding this reference also supersedes its name-only copy.
    const adopted = entries.some(row => { const attrs = object(row.attributes); return attrs.operational === true && attrs.pocOnly === false && attrs.predecessorEntryId === previous.id; });
    hidden.add(adopted ? entry.id : previous.id);
  }
  return entries.filter(entry => !hidden.has(entry.id));
}

/** Historical editions remain addressable by ID; ordinary selectors show their current revision. */
export async function supersededPresentationVersionIds(db: Pick<Prisma.TransactionClient, "planningCatalogEntry">, day: string): Promise<string[]> {
  const revisions = await db.planningCatalogEntry.findMany({ where: { version: { status: "PUBLISHED" }, attributes: { path: ["presentationPredecessorVersionId"], not: Prisma.JsonNull } }, select: { attributes: true } });
  return [...new Set(revisions.flatMap(row => {
    const attrs = object(row.attributes);
    return typeof attrs.presentationPredecessorVersionId === "string" && typeof attrs.presentationEffectiveFrom === "string" && attrs.presentationEffectiveFrom <= day ? [attrs.presentationPredecessorVersionId] : [];
  }))];
}
