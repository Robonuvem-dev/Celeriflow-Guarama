import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_QUOTA_LIMIT_BYTES,
  EDITAL_COVERED_SYSTEMS,
  calculateBackupQuota,
  decryptBackupPayloadAes256,
  encryptBackupPayloadAes256,
  getWindowsBackupServiceDescriptor,
  listBackupSnapshots,
  triggerWebBackupExecution,
  verifyAndTestRestoreSnapshot,
} from "../src/lib/platform/backup-service";

test("CF31 (31.1 a 31.11): cobertura de sistemas, retenção 7d/12m/1h, criptografia militar AES-256, RunAsService e cota de 3 TB", () => {
  const catalog = listBackupSnapshots();

  // 31.1: Todos os sistemas descritos no edital cobertos
  assert.equal(EDITAL_COVERED_SYSTEMS.length, 33);
  assert.equal(catalog.coveredSystems.length, 33);

  // 31.5: Backup full diário armazenando os 7 últimos dias
  assert.equal(catalog.countsByTier.FULL_DAILY, 7);

  // 31.6: Backup full no primeiro dia de cada mês durante 12 meses
  assert.equal(catalog.countsByTier.FULL_MONTHLY, 12);
  const monthlySnapshots = catalog.snapshots.filter((s) => s.tier === "FULL_MONTHLY");
  for (const snap of monthlySnapshots) {
    const dayOfMonth = new Date(snap.referenceAt).getUTCDate();
    assert.equal(dayOfMonth, 1, `Snapshot mensal ${snap.id} deve ser referente ao dia 1º do mês`);
  }

  // 31.7: Backup diferencial dos arquivos de log de 1 em 1 hora
  assert.equal(catalog.countsByTier.DIFFERENTIAL_HOURLY_LOG, 24);

  // 31.2, 31.3 e 31.4: Automático sem intervenção humana e executável via Tecnologia Web
  for (const schedule of catalog.schedules) {
    assert.equal(schedule.automatedWithoutHumanIntervention, true);
    assert.equal(schedule.webTechnologyExecution, true);
  }

  // 31.9: Criptografia Padrão Militar AES 256 bits (AES-256-GCM)
  const samplePayload = JSON.stringify({ module: "CF31", test: "AES-256-GCM-MILITARY-GRADE" });
  const encrypted = encryptBackupPayloadAes256(samplePayload, "secret-key-test");
  assert.equal(encrypted.algorithm, "aes-256-gcm");
  assert.equal(encrypted.keyBits, 256);
  const decrypted = decryptBackupPayloadAes256(encrypted, "secret-key-test");
  assert.equal(decrypted.verified, true);
  assert.equal(decrypted.plaintext, samplePayload);

  // 31.10: Serviço do Windows instalável no servidor de banco de dados (RunAsService)
  const winService = getWindowsBackupServiceDescriptor();
  assert.equal(winService.executionMode, "RunAsService");
  assert.ok(winService.windowsServiceScriptContent.includes("sc.exe create"));

  // 31.11: Espaço disponibilizado limitado a 3 Terabytes (3.298.534.883.328 bytes)
  assert.equal(BACKUP_QUOTA_LIMIT_BYTES, 3 * 1024 * 1024 * 1024 * 1024);
  assert.equal(catalog.quota.limitBytes, BACKUP_QUOTA_LIMIT_BYTES);
  assert.equal(catalog.quota.withinQuota, true);

  // Execução via Web (31.4) + rotação mantendo exatamente 7 dias no Full Diário (31.5)
  const execution = triggerWebBackupExecution({
    tier: "FULL_DAILY",
    triggeredBy: "Teste Automatizado CF31",
  });
  assert.equal(execution.retainedCountForTier, 7);

  // Teste de restauração (Restore Drill)
  const restore = verifyAndTestRestoreSnapshot(execution.snapshot.id);
  assert.equal(restore.decryptionVerified, true);
  assert.equal(restore.restoredSystemsCount, 33);
  assert.equal(restore.snapshot.status, "RESTORE_TESTED");

  // Rejeição caso ultrapasse o limite contratual de 3 TB (31.11)
  assert.throws(
    () =>
      triggerWebBackupExecution({
        tier: "FULL_DAILY",
        requestedSizeBytes: BACKUP_QUOTA_LIMIT_BYTES + 1024,
      }),
    /Limite contratual de 3 Terabytes/,
  );

  // Verifica cálculo direto de cota
  const quotaCheck = calculateBackupQuota(catalog.snapshots);
  assert.equal(quotaCheck.limitBytes, BACKUP_QUOTA_LIMIT_BYTES);
});
