import assert from "node:assert/strict";
import test from "node:test";
import { and, count, eq, ilike, sql } from "drizzle-orm";
import { createProcessesPortalsDatabase } from "./helpers/processes-portals-database";
import { citizenProcessWhere, citizenReturnTo, hasCitizenProcessScope } from "../src/lib/portal-cidadao/policy";
import { listCitizenProcesses, readCitizenProcess } from "../src/db/repositories/processes/citizen";
import { accessProfiles, users } from "../src/db/schema/identity";
import { processTypes, processSubjects, processes } from "../src/db/schema/processes";
import { processCitizenAccesses } from "../src/db/schema/citizen-access";
import { supportChannels, ombudsmans } from "../src/db/schema/attendance-portals";
import { taxpayers } from "../src/db/schema/registry";
import { portalTaxServiceRequests } from "../src/db/schema/portal-services";

test("login mantém destino interno e bloqueia redirecionamentos externos", () => {
  assert.equal(citizenReturnTo("/portal/minha-area/processos?q=PROC-1&page=2"), "/portal/minha-area/processos?q=PROC-1&page=2");
  assert.equal(citizenReturnTo("/portal/minha-area/servicos"), "/portal/minha-area/servicos");
  for (const input of ["https://evil.test", "//evil.test/portal/minha-area", "/\\evil.test", "/protocolos/processos", "/portal/minha-area/../../login", ["/portal/minha-area"]]) assert.equal(citizenReturnTo(input), "/portal/minha-area");
  assert.equal(hasCitizenProcessScope(["EXTRATO"]), false);
  assert.equal(hasCitizenProcessScope({ PROCESSOS: true }), false);
  assert.equal(hasCitizenProcessScope(["PROCESSOS"]), true);
});

test("PostgreSQL: proprietário, validade, revogação, isolamento fiscal e projeção privada", { timeout: 180000 }, async () => {
  const { connection, close } = await createProcessesPortalsDatabase();
  const db = connection.db;
  try {
    const [profile] = await db.insert(accessProfiles).values({ codigo: "CITIZEN_TRACKING_TEST", nome: "Teste", permissoes: "{}" }).returning();
    await db.insert(users).values(["citizen-one", "citizen-two", "grantor"].map(id => ({ id, nome: id, email: `${id}@example.test`, perfilId: profile.id })));
    const [type] = await db.insert(processTypes).values({ name: "Serviço teste" }).returning();
    const [subject] = await db.insert(processSubjects).values({ name: "Cadastro", processTypeId: type.id }).returning();
    const now = new Date("2026-10-13T12:00:00Z");
    for (const id of ["allowed", "other", "expired", "revoked", "future", "tax-one", "tax-two", "confidential"]) {
      await db.insert(processes).values({ id, protocolNumber: `PROC-${id}`, processTypeId: type.id, subjectId: subject.id, description: "NOTA PRIVADA: CPF e conta bancária" });
    }
    for (const id of ["allowed", "expired", "revoked", "future", "confidential"]) {
      await db.insert(processCitizenAccesses).values({
        processId: id, usuarioId: "citizen-one", grantedByUsuarioId: "grantor", reason: "Titularidade validada em teste", grantedAt: id === "future" ? new Date("2026-10-14") : new Date("2026-10-12"),
        expiresAt: id === "expired" ? now : null, revokedAt: id === "revoked" ? now : null,
      });
    }
    await db.insert(processCitizenAccesses).values({ processId: "other", usuarioId: "citizen-two", grantedByUsuarioId: "grantor", reason: "Outro interessado", grantedAt: new Date("2026-10-12") });
    const [channel] = await db.insert(supportChannels).values({ name: "Canal teste" }).returning();
    await db.insert(ombudsmans).values({ protocolNumber: "OUV-PRIVATE", type: "Denúncia", subject: "Sigiloso", description: "Identidade protegida", isConfidential: true, isAnonymous: true, channelId: channel.id, processId: "confidential" });
    for (const id of ["taxpayer-one", "taxpayer-two"]) await db.insert(taxpayers).values({ id, taxpayerType: "PF" });
    await db.insert(portalTaxServiceRequests).values({ taxpayerId: "taxpayer-one", processId: "tax-one", serviceType: "CADASTRO" });
    await db.execute(sql`INSERT INTO "TaxCaseLink" (id,"taxpayerId","processId","entityType","entityId") VALUES ('private-link','taxpayer-two','tax-two','CADASTRO','private-entity')`);
    const scope = citizenProcessWhere("citizen-one", ["taxpayer-one"], now);
    const rows = await listCitizenProcesses(db, scope, { limit: 50, offset: 0 });
    assert.deepEqual(rows.map((row) => row.id).sort(), ["allowed", "tax-one"]);
    assert.ok(!JSON.stringify(rows).includes("NOTA PRIVADA"));
    assert.ok(!JSON.stringify(rows).includes("private-entity"));
    for (const id of ["other", "expired", "revoked", "future", "confidential", "tax-two"]) {
      assert.equal(await readCitizenProcess(db, id, scope), null, `Detalhe isolado: ${id}`);
    }
    await db.update(processCitizenAccesses).set({ revokedAt: now }).where(and(eq(processCitizenAccesses.processId, "allowed"), eq(processCitizenAccesses.usuarioId, "citizen-one")));
    assert.equal((await db.select({ total: count() }).from(processes).where(citizenProcessWhere("citizen-one", [], now)))[0].total, 0);
    assert.equal((await db.select({ total: count() }).from(processes).where(and(scope, ilike(processes.protocolNumber, "%other%"))))[0].total, 0, "Busca não contorna o vínculo");
  } finally {
    await close();
  }
});
