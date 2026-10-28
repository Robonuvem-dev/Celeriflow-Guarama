import { asc, ilike } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { people } from "@/db/schema/people";

export async function searchSstPeople(database: DatabaseExecutor, term: string) {
  return database.select({ id: people.id, fullName: people.fullName }).from(people).where(ilike(people.fullName, `%${term}%`)).orderBy(asc(people.fullName), asc(people.id)).limit(20);
}
