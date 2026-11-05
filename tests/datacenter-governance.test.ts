import test from "node:test";
import assert from "node:assert/strict";
import {
  certificateCoversHost,
  getDataCenterGovernanceOverview,
  probeHostSecurity,
  verifyCleanSubdomainSslUrl,
} from "../src/lib/platform/datacenter-governance";

test("CF32: 21 requisitos, cada um classificado como verificável no sistema ou dependente do provedor", () => {
  const overview = getDataCenterGovernanceOverview();
  assert.equal(overview.requirements.length, 21);
  for (let i = 1; i <= 21; i++) assert.ok(overview.requirements.find((r) => r.code === `32.${i}`), `32.${i} ausente`);

  // Nada que dependa de contrato, certificação ou infraestrutura pode ser declarado como comprovado pelo sistema.
  const mustDependOnProvider = ["32.1", "32.2", "32.3", "32.4", "32.6", "32.9", "32.10", "32.11", "32.12", "32.13", "32.18"];
  for (const code of mustDependOnProvider) {
    assert.equal(overview.requirements.find((r) => r.code === code)?.status, "DEPENDE_DO_PROVEDOR", `${code} não pode ser marcado como verificado`);
  }
  assert.equal(overview.summary.verifiedInSystem + overview.summary.dependsOnProvider, 21);
  assert.ok(overview.certifications.every((c) => c.status === "A_COMPROVAR_PELO_PROVEDOR"));

  // Sem números de série, métricas ou percentuais de disponibilidade inventados na matriz.
  const serialized = JSON.stringify(overview);
  assert.ok(!/99,98|99\.98|ISO27001-2022-BR|994821|773190/.test(serialized));
});

test("CF32 32.21: URL precisa de HTTPS, subdomínio e nenhuma porta explícita", () => {
  const ok = verifyCleanSubdomainSslUrl("https://guarama.celeriflow.com.br/configuracoes/datacenter");
  assert.equal(ok.valid, true);
  assert.equal(verifyCleanSubdomainSslUrl("https://guarama.celeriflow.com.br:8443/app").valid, false);
  assert.equal(verifyCleanSubdomainSslUrl("http://guarama.celeriflow.com.br").valid, false);
  assert.equal(verifyCleanSubdomainSslUrl("https://celeriflow.com.br").valid, false);
});

test("CF32 32.20: curinga cobre exatamente um nível de subdomínio", () => {
  const san = "DNS:*.celeriflow.com.br, DNS:celeriflow.com.br";
  assert.deepEqual(
    { covered: certificateCoversHost(san, "guarama.celeriflow.com.br").covered, wildcard: certificateCoversHost(san, "guarama.celeriflow.com.br").hasWildcard },
    { covered: true, wildcard: true },
  );
  assert.equal(certificateCoversHost(san, "a.b.celeriflow.com.br").covered, false);
  assert.equal(certificateCoversHost(san, "outro.com.br").covered, false);
  assert.equal(certificateCoversHost("DNS:guarama.celeriflow.com.br", "guarama.celeriflow.com.br").hasWildcard, false);
  assert.equal(certificateCoversHost(undefined, "x.y.z").covered, false);
});

test("CF32: diagnóstico não tenta verificar localhost nem IP (evita falso positivo e varredura)", async () => {
  for (const host of ["localhost:3000", "127.0.0.1", "intranet.local"]) {
    const probe = await probeHostSecurity(host);
    assert.equal(probe.verifiable, false);
    assert.equal(probe.tls.reached, false);
    assert.equal(probe.dns.resolved, false);
  }
});

