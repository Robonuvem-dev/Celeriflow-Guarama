import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type StatementAccountLabel = { bankName: string; agency: string; accountNumber: string };
export type ImportedBankStatement = {
  id: string; bankAccountId: string; format: string; fileName: string | null;
  checksum: string; status: string; importedAt: Date; originalBytes: Uint8Array | null;
  originalEncoding: string | null; processingSnapshot: JsonValue | null;
};
export type ImportedBankStatementItem = {
  id: string; bankAccountId: string | null; statementImportId: string | null;
  date: Date; description: string | null; reference: string | null; direction: string;
  valueDecimal: Decimal; status: string; treasuryMovementId: string | null;
  downloadId: string | null; banco: string | null; agencia: string | null;
  contaNumero: string | null; tipoConta: string | null; codigoTransacao: string | null;
  sinal: string | null; saldoResultanteDecimal: Decimal | null;
  categoriaClassificada: string | null; reciboMunicipal: string | null;
  lancamentoContabilId: string | null; bankTransactionId: string | null;
  integrationEventId: string | null; transactionType: string | null;
  clientReference: string | null; collectionReference: string | null;
  reversalOfBankTransactionId: string | null;
};
export type AutomatedStatementDownload = {
  id: string; banco: string; agencia: string; contaNumero: string; tipoConta: string;
  periodoInicio: Date; periodoFim: Date; nomeArquivo: string; caminhoDestino: string;
  formato: string; hashSHA256: string; tamanhoBytes: number; status: string;
  logsExecucao: string; auditLogId: string | null; createdAt: Date;
};
