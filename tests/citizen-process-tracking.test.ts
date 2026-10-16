import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { citizenProcessSelect, citizenProcessWhere, citizenReturnTo, hasCitizenProcessScope } from "../src/lib/portal-cidadao/policy";

test("login mantém destino interno e bloqueia redirecionamentos externos", () => {
  assert.equal(citizenReturnTo("/portal/minha-area/processos?q=PROC-1&page=2"), "/portal/minha-area/processos?q=PROC-1&page=2");
  assert.equal(citizenReturnTo("/portal/minha-area/servicos"), "/portal/minha-area/servicos");
  for (const input of ["https://evil.test", "//evil.test/portal/minha-area", "/\\evil.test", "/protocolos/processos", "/portal/minha-area/../../login", ["/portal/minha-area"]]) assert.equal(citizenReturnTo(input), "/portal/minha-area");
  assert.equal(hasCitizenProcessScope(["EXTRATO"]), false);
  assert.equal(hasCitizenProcessScope({ PROCESSOS: true }), false);
  assert.equal(hasCitizenProcessScope(["PROCESSOS"]), true);
});

test("PostgreSQL: proprietário, validade, revogação, isolamento fiscal e projeção privada", { timeout: 180000 }, async () => {
  const memory = new PGlite();
  const server = new PGLiteSocketServer({ db: memory, port: 0, host: "127.0.0.1" });
  let db: PrismaClient | undefined;
  try {
    for (const dir of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) {
      await memory.exec(readFileSync(`prisma/migrations-ibema/${dir}/migration.sql`, "utf8"));
    }
    await server.start();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const profile = await db.configuracaoPerfil.findFirstOrThrow();
    await db.usuario.createMany({ data: ["citizen-one", "citizen-two", "grantor"].map((id) => ({ id, nome: id, email: `${id}@example.test`, perfilId: profile.id })) });
    const type = await db.processType.create({ data: { name: "Serviço teste" } });
    const subject = await db.subject.create({ data: { name: "Cadastro", processTypeId: type.id } });
    const now = new Date("2026-10-13T12:00:00Z");
    for (const id of ["allowed", "other", "expired", "revoked", "future", "tax-one", "tax-two", "confidential"]) {
      await db.process.create({ data: { id, protocolNumber: `PROC-${id}`, processTypeId: type.id, subjectId: subject.id, description: "NOTA PRIVADA: CPF e conta bancária" } });
    }
    for (const id of ["allowed", "expired", "revoked", "future", "confidential"]) {
      await db.processCitizenAccess.create({ data: {
        processId: id, usuarioId: "citizen-one", grantedByUsuarioId: "grantor", reason: "Titularidade validada em teste", grantedAt: id === "future" ? new Date("2026-10-14") : new Date("2026-10-12"),
        expiresAt: id === "expired" ? now : null, revokedAt: id === "revoked" ? now : null,
      } });
    }
    await db.processCitizenAccess.create({ data: { processId: "other", usuarioId: "citizen-two", grantedByUsuarioId: "grantor", reason: "Outro interessado", grantedAt: new Date("2026-10-12") } });
    const channel = await db.supportChannel.create({ data: { name: "Canal teste" } });
    await db.ombudsman.create({ data: { protocolNumber: "OUV-PRIVATE", type: "Denúncia", subject: "Sigiloso", description: "Identidade protegida", isConfidential: true, isAnonymous: true, channelId: channel.id, processId: "confidential" } });
    for (const id of ["taxpayer-one", "taxpayer-two"]) await db.taxpayer.create({ data: { id, taxpayerType: "PF" } });
    await db.taxServiceRequest.create({ data: { taxpayerId: "taxpayer-one", processId: "tax-one", serviceType: "CADASTRO" } });
    await db.taxCaseLink.create({ data: { taxpayerId: "taxpayer-two", processId: "tax-two", entityType: "CADASTRO", entityId: "private-entity" } });
    const scope = citizenProcessWhere("citizen-one", ["taxpayer-one"], now);
    const rows = await db.process.findMany({ where: scope, select: citizenProcessSelect });
    assert.deepEqual(rows.map((row) => row.id).sort(), ["allowed", "tax-one"]);
    assert.ok(!JSON.stringify(rows).includes("NOTA PRIVADA"));
    assert.ok(!JSON.stringify(rows).includes("private-entity"));
    for (const id of ["other", "expired", "revoked", "future", "confidential", "tax-two"]) {
      assert.equal(await db.process.findFirst({ where: { AND: [{ id }, scope] }, select: citizenProcessSelect }), null, `Detalhe isolado: ${id}`);
    }
    await db.processCitizenAccess.update({ where: { processId_usuarioId: { processId: "allowed", usuarioId: "citizen-one" } }, data: { revokedAt: now } });
    assert.equal(await db.process.count({ where: citizenProcessWhere("citizen-one", [], now) }), 0);
    assert.equal(await db.process.count({ where: { AND: [scope, { protocolNumber: { contains: "other" } }] } }), 0, "Busca não contorna o vínculo");
  } finally {
    await db?.$disconnect();
    await server.stop();
    await memory.close();
  }
});
