import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { instanceParameters } from "@/db/schema/instance-configuration";
import {
  getFebrabanArrecadacaoState,
  hydrateFebrabanState,
  type FebrabanOnlineDebtItem,
  type FebrabanWebServiceAuditLog,
} from "@/lib/tributacao/febraban-arrecadacao-service";
import {
  getDecredOverviewState,
  hydrateDecredStore,
  type CardAdministratorDam,
  type CardAdministratorDeclaration,
  type CardEquipmentRecord,
  type ResponsibilityTermAcceptance,
} from "@/lib/tributacao/card-administrators-decred-service";
import {
  listBackupSnapshots,
  hydrateBackupStore,
  type BackupSnapshotRecord,
  type BackupTier,
} from "@/lib/platform/backup-service";

export async function loadFebrabanStateFromDb() {
  try {
    const rows = await db
      .select({ chave: instanceParameters.chave, valor: instanceParameters.valor })
      .from(instanceParameters)
      .where(inArray(instanceParameters.chave, ["CF26:ONLINE_DEBTS", "CF26:AUDIT_LOGS"]));

    if (rows.length > 0) {
      const debtsRow = rows.find((r) => r.chave === "CF26:ONLINE_DEBTS");
      const logsRow = rows.find((r) => r.chave === "CF26:AUDIT_LOGS");

      hydrateFebrabanState({
        debts: Array.isArray(debtsRow?.valor) ? (debtsRow.valor as FebrabanOnlineDebtItem[]) : undefined,
        auditLogs: Array.isArray(logsRow?.valor) ? (logsRow.valor as FebrabanWebServiceAuditLog[]) : undefined,
      });
    }
  } catch (error) {
    console.warn("[tributacao-infra-persistence] Fallback in-memory para CF26:", error instanceof Error ? error.message : error);
  }
  return getFebrabanArrecadacaoState();
}

export async function loadDecredStateFromDb() {
  try {
    const rows = await db
      .select({ chave: instanceParameters.chave, valor: instanceParameters.valor })
      .from(instanceParameters)
      .where(
        inArray(instanceParameters.chave, [
          "CF29:EQUIPMENTS",
          "CF29:TERMS",
          "CF29:DECLARATIONS",
          "CF29:DAMS",
        ])
      );

    if (rows.length > 0) {
      const eqRow = rows.find((r) => r.chave === "CF29:EQUIPMENTS");
      const termsRow = rows.find((r) => r.chave === "CF29:TERMS");
      const declRow = rows.find((r) => r.chave === "CF29:DECLARATIONS");
      const damsRow = rows.find((r) => r.chave === "CF29:DAMS");

      hydrateDecredStore({
        equipments: Array.isArray(eqRow?.valor) ? (eqRow.valor as CardEquipmentRecord[]) : undefined,
        terms: Array.isArray(termsRow?.valor) ? (termsRow.valor as ResponsibilityTermAcceptance[]) : undefined,
        declarations: Array.isArray(declRow?.valor) ? (declRow.valor as CardAdministratorDeclaration[]) : undefined,
        dams: Array.isArray(damsRow?.valor) ? (damsRow.valor as CardAdministratorDam[]) : undefined,
      });
    }
  } catch (error) {
    console.warn("[tributacao-infra-persistence] Fallback in-memory para CF29:", error instanceof Error ? error.message : error);
  }
  return getDecredOverviewState();
}

export async function loadBackupSnapshotsFromDb(filter?: { tier?: BackupTier | "ALL"; search?: string }) {
  try {
    const rows = await db
      .select({ chave: instanceParameters.chave, valor: instanceParameters.valor })
      .from(instanceParameters)
      .where(eq(instanceParameters.chave, "CF31:BACKUP_LOGS"))
      .limit(1);

    if (rows.length > 0 && Array.isArray(rows[0].valor)) {
      hydrateBackupStore(rows[0].valor as BackupSnapshotRecord[]);
    }
  } catch (error) {
    console.warn("[tributacao-infra-persistence] Fallback in-memory para CF31:", error instanceof Error ? error.message : error);
  }
  return listBackupSnapshots(filter);
}
