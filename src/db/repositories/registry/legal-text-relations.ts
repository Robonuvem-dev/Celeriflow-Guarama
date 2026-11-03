import { asc, eq, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { legalTextRelations, legalTexts } from "../../schema/master-data";

export function listLegalTextRelations(db: DatabaseExecutor, legalTextId: string) {
  const relation = legalTextRelations;
  const isOutgoing = eq(relation.sourceLegalTextId, legalTextId);

  return db.select({
    id: relation.id,
    direction: sql<"outgoing" | "incoming">`case when ${isOutgoing} then 'outgoing' else 'incoming' end`,
    relationType: relation.relationType,
    effectiveFrom: relation.effectiveFrom,
    notes: relation.notes,
    relatedText: {
      id: legalTexts.id,
      type: legalTexts.type,
      number: legalTexts.number,
      summary: legalTexts.summary,
    },
  }).from(relation)
    .innerJoin(legalTexts, eq(legalTexts.id, sql`case when ${isOutgoing} then ${relation.targetLegalTextId} else ${relation.sourceLegalTextId} end`))
    .where(or(isOutgoing, eq(relation.targetLegalTextId, legalTextId)))
    .orderBy(asc(relation.relationType), asc(relation.id));
}

export async function registerLegalTextRelation(
  db: DatabaseExecutor,
  input: Pick<typeof legalTextRelations.$inferInsert, "sourceLegalTextId" | "targetLegalTextId" | "relationType" | "effectiveFrom" | "notes">,
) {
  if (input.sourceLegalTextId === input.targetLegalTextId) {
    throw new Error("Selecione dois atos diferentes.");
  }
  const [relation] = await db.insert(legalTextRelations).values(input).onConflictDoNothing({
    target: [legalTextRelations.sourceLegalTextId, legalTextRelations.targetLegalTextId, legalTextRelations.relationType],
  }).returning({ id: legalTextRelations.id });
  return relation ?? null;
}
