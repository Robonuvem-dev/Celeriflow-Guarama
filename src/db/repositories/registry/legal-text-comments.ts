import { desc, eq } from "drizzle-orm";
import { users } from "../../schema/identity";
import { legalTextComments } from "../../schema/master-data";
import type { DatabaseExecutor } from "../../transaction";

export function listLegalTextComments(db: DatabaseExecutor, legalTextId: string) {
  return db.select({ body: legalTextComments.body, author: users.nome, createdAt: legalTextComments.createdAt })
    .from(legalTextComments)
    .innerJoin(users, eq(legalTextComments.authorId, users.id))
    .where(eq(legalTextComments.legalTextId, legalTextId))
    .orderBy(desc(legalTextComments.createdAt), desc(legalTextComments.id))
    .limit(100);
}

export async function insertLegalTextComment(db: DatabaseExecutor, legalTextId: string, authorId: string, body: string) {
  const [comment] = await db.insert(legalTextComments).values({ legalTextId, authorId, body })
    .returning({ id: legalTextComments.id });
  return comment.id;
}
