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
import {
  DATACENTER_ISO_CERTIFICATIONS,
  getDataCenterGovernanceOverview,
  verifyCleanSubdomainSslUrl,
} from "../src/lib/platform/datacenter-governance";

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

test("CF32 (32.1 a 32.21): Data Center Certificado ISO 27001:2022 e ISO 20000-1:2018, SLA >= 99,6% (24x7x365), WildCard SSL e URL sem portas", () => {
  const overview = getDataCenterGovernanceOverview();

  // 21 requisitos obrigatórios atendidos (32.1 a 32.21)
  assert.equal(overview.requirements.length, 21);
  for (let i = 1; i <= 21; i++) {
    const code = `32.${i}`;
    const found = overview.requirements.find((r) => r.code === code);
    assert.ok(found, `Requisito ${code} deve estar presente na matriz do Data Center`);
    assert.equal(found.status, "CONFORME_ATIVO");
  }

  // 32.2: Certificações ABNT NBR ISO/IEC 27001:2022 e ABNT NBR ISO/IEC 20000-1:2018
  const norms = DATACENTER_ISO_CERTIFICATIONS.map((c) => c.normCode);
  assert.ok(norms.includes("ABNT NBR ISO/IEC 27001:2022"));
  assert.ok(norms.includes("ABNT NBR ISO/IEC 20000-1:2018"));

  // 32.3: Disponibilidade mínima de 99,6% em regime 24x7x365
  assert.equal(overview.telemetry.contractedMinimumAvailabilityPercent, 99.6);
  assert.ok(overview.telemetry.measuredAvailabilityPercent30d >= 99.6);
  assert.equal(overview.telemetry.regimeOperation, "24x7x365 Ininterrupto");

  // 32.4: Backup seguro integrado ao CF31
  assert.equal(overview.telemetry.integratedBackupStatus.encryption, "AES-256-GCM (256 bits)");
  assert.equal(overview.telemetry.integratedBackupStatus.withinQuota, true);

  // 32.8, 32.9 e 32.12: Elasticidade sem interrupções, Firewall/WAF e Licenciamento incluso
  assert.equal(overview.telemetry.elasticityStatus.zeroDowntimeScaling, true);
  assert.equal(overview.telemetry.firewallAndWaf.packetFilterActive, true);
  assert.equal(overview.telemetry.firewallAndWaf.applicationProxyActive, true);
  assert.equal(overview.telemetry.includedLicensing.additionalMunicipalityLicenseCost, 0);

  // 32.20 e 32.21: WildCard SSL e domínio associado a subdomínio sem uso de portas após a URL
  assert.equal(overview.telemetry.wildcardSslDomain, "*.celeriflow.com.br");
  assert.equal(overview.telemetry.urlUsesPortSuffix, false);

  const validCleanUrl = verifyCleanSubdomainSslUrl("https://guarama.celeriflow.com.br/configuracoes/datacenter");
  assert.equal(validCleanUrl.valid, true);
  assert.equal(validCleanUrl.hasHttpsSsl, true);
  assert.equal(validCleanUrl.hasSubdomain, true);
  assert.equal(validCleanUrl.hasExplicitPortInUrl, false);

  const invalidPortUrl = verifyCleanSubdomainSslUrl("https://guarama.celeriflow.com.br:8443/app");
  assert.equal(invalidPortUrl.valid, false);
  assert.equal(invalidPortUrl.hasExplicitPortInUrl, true);
});

