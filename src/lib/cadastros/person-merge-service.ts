import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { approveAndExecutePersonMergeInTransaction, proposePersonMergeInTransaction, reversePersonMergeInTransaction } from "@/db/repositories/registry/person-merge";

export { getPersonMergeCandidates } from "@/db/repositories/registry/person-merge";

export async function proposePersonMerge(connection: DatabaseConnection, actor: { id: string }, sourcePersonId: string, targetPersonId: string): Promise<string> {
  return withDatabaseTransaction(connection, tx => proposePersonMergeInTransaction(tx, actor, sourcePersonId, targetPersonId));
}

export async function approveAndExecutePersonMerge(connection: DatabaseConnection, actor: { id: string }, requestId: string): Promise<string> {
  return withDatabaseTransaction(connection, tx => approveAndExecutePersonMergeInTransaction(tx, actor, requestId), { isolationLevel: "serializable" });
}

export async function reversePersonMerge(connection: DatabaseConnection, actor: { id: string }, requestId: string): Promise<string> {
  return withDatabaseTransaction(connection, tx => reversePersonMergeInTransaction(tx, actor, requestId), { isolationLevel: "serializable" });
}
