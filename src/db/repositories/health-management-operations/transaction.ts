import { databaseConnection } from "../../client";
import { withDatabaseTransaction, type DatabaseTransaction } from "../../transaction";
import type { HealthManagementContext } from "@/lib/contracts/health-management-operations";

export function runManagementTransaction<T>(context: HealthManagementContext, transaction: DatabaseTransaction | undefined, operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
  if (transaction) return operation(transaction);
  const connection = context.connection ?? databaseConnection;
  if (context.database && context.database !== connection.db) throw new Error("Informe a conexão de origem do banco e reutilize explicitamente a transação da operação de Saúde.");
  return withDatabaseTransaction(connection, operation);
}
