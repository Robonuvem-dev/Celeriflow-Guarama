import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { saveDigitalService } from "../src/lib/portal-cidadao/catalog";
import { digitalServiceSchema, pointInMunicipalPolygon, validateMunicipalLocation } from "../src/lib/portal-cidadao/services-policy";
import { submitPortalService, operatePortalRequest, readOwnPortalRequest, ratePortalRequest } from "../src/lib/portal-cidadao/requests";
import { programPortalRequests, finishPortalSchedule, portalRequestCosts } from "../src/lib/portal-cidadao/scheduling";
import { createCitizenRequest, consultCitizenRequest } from "../src/lib/transparencia/citizen-service";
import { requestCitizenAccess, decideCitizenAccess } from "../src/lib/portal-cidadao/registration";
import { type ProtocolContext } from "../src/lib/protocols/access";
import { syntheticCpf } from "../src/lib/poc/fixture-catalog";
import { canViewModule } from "../src/lib/platform/tenant-context";
import { serviceReportPdf } from "../src/lib/portal-cidadao/report";
import { PDFDocument } from "pdf-lib";
import { ingestGedDocument } from "../src/lib/documents/document-flow-service";
import { validPortalBlobUrl, validPortalUploadPath } from "../src/lib/portal-cidadao/evidence-policy";

test("perímetro real rejeita ponto fora do polígono mesmo dentro do retângulo", () => {
  const polygon: [number, number][] = [[0, 0], [2, 0], [0, 2]];
  assert.equal(pointInMunicipalPolygon(0.5, 0.5, polygon), true);
  assert.equal(pointInMunicipalPolygon(1.5, 1.5, polygon), false);
  assert.equal(pointInMunicipalPolygon(1, 1, polygon), true);
  const definition = digitalServiceSchema.parse({ municipalBounds: { south: 0, north: 2, west: 0, east: 2 }, municipalPolygon: polygon });
  assert.throws(() => validateMunicipalLocation(definition, 1.5, 1.5), /perímetro/);
  assert.throws(() => validateMunicipalLocation(definition, null, null), /limites/);
});

test("upload privado rejeita outra conta, traversal e origem externa antes da leitura", () => {
  const prefix = "instances/test/documents/autoatendimento/owner/", nonce = randomUUID();
  assert.equal(validPortalUploadPath(`${prefix}${nonce}-prova.pdf`, prefix), true);
  assert.equal(validPortalUploadPath(`${prefix}../other/prova.pdf`, prefix), false);
  assert.equal(validPortalBlobUrl(`https://store.private.blob.vercel-storage.com/${prefix}${nonce}-prova.pdf`, prefix), true);
  assert.equal(validPortalBlobUrl(`https://evil.test/${prefix}prova.pdf`, prefix), false);
  assert.equal(validPortalBlobUrl("https://store.private.blob.vercel-storage.com/instances/test/documents/autoatendimento/other/prova.pdf", prefix), false);
  assert.equal(validPortalBlobUrl(`https://store.private.blob.vercel-storage.com/${prefix}%2e%2e%2fother/prova.pdf`, prefix), false);
});

test("PostgreSQL: serviço versionado, protocolo único, isolamento, complemento, execução e acesso restrito", { timeout: 240000 }, async () => {
  const memory = new PGlite(), socket = new PGLiteSocketServer({ db: memory, port: 0, host: "127.0.0.1" });
  let db: PrismaClient | undefined;
  try {
    for (const dir of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()) await memory.exec(readFileSync(`prisma/migrations-ibema/${dir}/migration.sql`, "utf8"));
    await socket.start();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }), transactionOptions: { timeout: 60000, maxWait: 60000 } });
    const profile = await db.configuracaoPerfil.findFirstOrThrow();
    await db.usuario.createMany({ data: ["portal-owner", "portal-other", "portal-staff"].map((id) => ({ id, nome: id, email: `${id}@example.test`, firebaseUid: id, perfilId: profile.id })) });
    const secretariat = await db.secretariat.create({ data: { name: "Secretaria de teste" } });
    const sector = await db.department.create({ data: { name: "Atendimento teste", secretariatId: secretariat.id } });
    const otherSector = await db.department.create({ data: { name: "Outro setor teste", secretariatId: secretariat.id } });
    const type = await db.processType.create({ data: { name: "Solicitações externas teste", initialDepartmentId: sector.id } });
    const subject = await db.subject.create({ data: { name: "Solicitação teste", processTypeId: type.id } });
    const employee = await db.employee.create({ data: { name: "Executor teste", departmentId: sector.id } });
    const context = { prisma: db, user: { id: "portal-staff", name: "Operador", profileCode: "SYSTEM_ADMINISTRATOR", employeeId: employee.id, departmentId: sector.id, modulePermissions: [], allowedBudgetUnitIds: [] }, protocolAccess: { isAdmin: true, canView: true, canEdit: true, canCreate: true, canUpdate: true } } as unknown as ProtocolContext;
    const base = { name: "Manutenção de teste", description: "Serviço operacional de manutenção para teste integrado", group: "Serviços públicos", audience: "CIDADAO", provider: "MANUTENCAO", slug: "manutencao-teste", published: true, configuration: { processTypeId: type.id, subjectId: subject.id, fields: [], documents: [], acceptance: "Confirmo os dados declarados." } };
    const service = await saveDigitalService(db, context.user.id, base);
    const input = { serviceId: service.id, version: 1, requestKey: randomUUID(), description: "Solicito manutenção no local informado para teste.", values: {}, uploadIds: [], accepted: true, location: "Rua de teste, número 10" };
    const result = await submitPortalService(db, "portal-owner", input);
    const repeat = await submitPortalService(db, "portal-owner", input);
    assert.equal(repeat.id, result.id); assert.match(result.protocolNumber, /^PROC-\d{4}-\d{6}$/);
    assert.equal(await db.portalServiceRequest.count(), 1); assert.equal(await db.obrasServico.count(), 1);
    await assert.rejects(submitPortalService(db, "portal-owner", { ...input, description: "Outro conteúdo usando a mesma chave de solicitação." }), /chave/);
    const owned = await readOwnPortalRequest(db, "portal-owner", result.id);
    assert.equal(owned.process.currentDepartment?.name, sector.name);
    assert.equal((await db.process.findUniqueOrThrow({ where: { id: owned.processId } })).portalOrigin, "AUTOATENDIMENTO");
    assert.equal(await db.employee.count(), 1, "Cidadão não vira Employee");
    await assert.rejects(readOwnPortalRequest(db, "portal-other", result.id), /não encontrada/);
    await assert.rejects(operatePortalRequest(db, context.user.id, { requestId: result.id, revision: 1, requestKey: randomUUID(), operation: "EXIGENCIA", text: "Informe os dados adicionais solicitados." }, context), /Receba/);
    await db.process.update({ where: { id: owned.processId }, data: { status: "Recebido", receivedAt: new Date() } });
    const wrongContext = { ...context, user: { ...context.user, departmentId: otherSector.id }, protocolAccess: { ...context.protocolAccess, isAdmin: false } };
    await assert.rejects(operatePortalRequest(db, context.user.id, { requestId: result.id, revision: 1, requestKey: randomUUID(), operation: "EXIGENCIA", text: "Solicitação fora do setor." }, wrongContext), /setor/);
    await operatePortalRequest(db, context.user.id, { requestId: result.id, revision: 1, requestKey: randomUUID(), operation: "NOTA", text: "NOTA INTERNA PRIVADA" }, context);
    assert.ok(!(await readOwnPortalRequest(db, "portal-owner", result.id)).events.some((item) => item.text.includes("PRIVADA")));
    await operatePortalRequest(db, context.user.id, { requestId: result.id, revision: 2, requestKey: randomUUID(), operation: "EXIGENCIA", text: "Informe referência adicional para localização." }, context);
    const complement = { requestId: result.id, revision: 3, requestKey: randomUUID(), operation: "COMPLEMENTAR", text: "A referência adicional foi informada pelo titular." };
    await operatePortalRequest(db, "portal-owner", complement); await operatePortalRequest(db, "portal-owner", complement);
    assert.equal((await readOwnPortalRequest(db, "portal-owner", result.id)).revision, 4);
    await assert.rejects(operatePortalRequest(db, "portal-owner", { ...complement, text: "Outra complementação com a mesma chave." }), /Chave/);
    await assert.rejects(memory.query('UPDATE "PortalServiceVersion" SET "snapshot" = \'{}\' WHERE "serviceId" = $1 AND "version" = 1', [service.id]), /alterado/);
    await saveDigitalService(db, context.user.id, { ...base, id: service.id, name: "Novo título de manutenção" });
    assert.equal((await readOwnPortalRequest(db, "portal-owner", result.id)).serviceVersion, 1);
    await assert.rejects(submitPortalService(db, "portal-owner", { ...input, requestKey: randomUUID() }), /versão/);
    const startsAt = new Date(Date.now() + 86400000).toISOString(), endsAt = new Date(Date.now() + 90000000).toISOString();
    const schedule = await programPortalRequests(context, { requestIds: [result.id], resourceKey: "EQ-TEST", startsAt, endsAt, type: "EXECUCAO", reason: "Execução programada para o local informado.", employeeId: employee.id, laborQuantity: "2", laborUnitCost: "25" });
    await assert.rejects(programPortalRequests(context, { requestIds: [result.id], resourceKey: "EQ-TEST", startsAt, endsAt, type: "VISTORIA", reason: "Sobreposição de recurso não permitida." }), /reservado/);
    await finishPortalSchedule(context, schedule.id, { status: "CONCLUIDO", reason: "Execução realizada e confirmada pelo setor.", realizedQuantity: "1.5" });
    const costs = await portalRequestCosts(context, result.id); assert.equal(costs.planned, "50.00"); assert.equal(costs.realized, "37.50");
    const current = await readOwnPortalRequest(db, "portal-owner", result.id);
    await operatePortalRequest(db, context.user.id, { requestId: result.id, revision: current.revision, requestKey: randomUUID(), operation: "CONCLUIR", text: "Serviço executado e conclusão comunicada ao requerente." }, context);
    await ratePortalRequest(db, "portal-owner", result.id, { serviceScore: 5, qualityScore: 4, deadlineScore: 3, comment: "Avaliação do serviço recebido." });
    assert.equal(await db.portalServiceRating.count(), 1);
    await db.processCitizenAccess.updateMany({ where: { processId: owned.processId }, data: { revokedAt: new Date() } });
    await assert.rejects(readOwnPortalRequest(db, "portal-owner", result.id), /não encontrada/);

    const documentClass = await db.documentClass.create({ data: { code: "PORTAL_TEST_EVIDENCE", label: "Comprovação de teste", signaturePolicy: "INTERNAL_ALLOWED" } });
    const documentService = await saveDigitalService(db, context.user.id, { ...base, slug: "servico-documental-teste", provider: "ADMINISTRATIVO", configuration: { processTypeId: type.id, subjectId: subject.id, documents: [{ code: "PROVA", label: "Comprovação", documentClassCode: documentClass.code, required: true }] } });
    const documentaryInput = { ...input, serviceId: documentService.id, requestKey: randomUUID(), accepted: false };
    const beforeDocuments = await db.process.count();
    await assert.rejects(submitPortalService(db, "portal-owner", documentaryInput), /documentos obrigatórios/);
    assert.equal(await db.process.count(), beforeDocuments, "Falha de evidência faz rollback do processo e do pedido");
    async function upload(ownerId: string, targetRequestId: string | null = null) {
      const ged = await ingestGedDocument(db!, { title: "Prova de teste", documentType: "Comprovação", documentClassCode: documentClass.code, fileUrl: "https://fixture.invalid/private.pdf", content: new Uint8Array([1, 2, 3]), actorUsuarioId: ownerId });
      return db!.portalServiceUpload.create({ data: { ownerId, serviceId: documentService.id, serviceVersion: 1, code: "PROVA", documentId: ged.documentId, documentVersionId: ged.version.id, filename: "prova.pdf", pathname: `fixture/${randomUUID()}.pdf`, targetRequestId } });
    }
    const foreignUpload = await upload("portal-other");
    await assert.rejects(submitPortalService(db, "portal-owner", { ...documentaryInput, uploadIds: [foreignUpload.id] }), /alheio/);
    const ownUpload = await upload("portal-owner");
    const documentaryReceipt = await submitPortalService(db, "portal-owner", { ...documentaryInput, uploadIds: [ownUpload.id] });
    await assert.rejects(submitPortalService(db, "portal-owner", { ...documentaryInput, requestKey: randomUUID(), uploadIds: [ownUpload.id] }), /consumido/);
    const documentaryRequest = await readOwnPortalRequest(db, "portal-owner", documentaryReceipt.id);
    await db.process.update({ where: { id: documentaryRequest.processId }, data: { status: "Recebido" } });
    await operatePortalRequest(db, context.user.id, { requestId: documentaryReceipt.id, revision: 1, requestKey: randomUUID(), operation: "EXIGENCIA", text: "Reenvie a comprovação com a correção solicitada.", requiredCodes: ["PROVA"] }, context);
    await assert.rejects(operatePortalRequest(db, "portal-owner", { requestId: documentaryReceipt.id, revision: 2, requestKey: randomUUID(), operation: "COMPLEMENTAR", text: "Resposta sem o documento obrigatório nesta pendência." }), /documentos exigidos/);
    const complementaryUpload = await upload("portal-owner", documentaryReceipt.id);
    await operatePortalRequest(db, "portal-owner", { requestId: documentaryReceipt.id, revision: 2, requestKey: randomUUID(), operation: "COMPLEMENTAR", text: "Comprovação corrigida enviada pelo requerente.", uploadIds: [complementaryUpload.id] });
    assert.equal((await readOwnPortalRequest(db, "portal-owner", documentaryReceipt.id)).uploads.length, 2, "Complemento preserva o arquivo anterior");

    const slot = new Date(Date.now() + 172800000).toISOString();
    const space = await db.culturaEspaco.create({ data: { nome: "Espaço de teste", tipo: "Sala", status: "Disponível" } });
    for (const [index, owner] of ["portal-owner", "portal-other"].entries()) {
      const person = await db.person.create({ data: { fullName: owner, cpf: syntheticCpf(180 + index) } });
      await db.citizenRegistryIdentity.create({ data: { usuarioId: owner, personId: person.id, grantedById: context.user.id, evidence: "Vínculo pessoal conferido na fixture isolada." } });
    }
    const reservationService = await saveDigitalService(db, context.user.id, { ...base, slug: "reserva-teste", provider: "RESERVA", configuration: { processTypeId: type.id, subjectId: subject.id, resourceKey: "ESPACO-TESTE", spaceId: space.id, availableSlots: [slot], slotMinutes: 30 } });
    const reservation = { ...input, serviceId: reservationService.id, accepted: false, startsAt: slot };
    const competitors = await Promise.allSettled([submitPortalService(db, "portal-owner", { ...reservation, requestKey: randomUUID() }), submitPortalService(db, "portal-other", { ...reservation, requestKey: randomUUID() })]);
    assert.equal(competitors.filter((item) => item.status === "fulfilled").length, 1, "Última vaga não pode ser reservada duas vezes");

    const channelInput = { requestKey: randomUUID(), type: "DENUNCIA", subject: "Manifestação reservada teste", message: "RELATO PRIVADO que deve permanecer no canal de Ouvidoria." };
    const receipt = await createCitizenRequest(db, channelInput), retried = await createCitizenRequest(db, channelInput);
    assert.equal(receipt.protocol, retried.protocol); assert.equal(receipt.token, retried.token);
    const native = await db.transparencyCitizenRequest.findUniqueOrThrow({ where: { protocol: receipt.protocol }, include: { process: true } });
    assert.ok(native.processId); assert.ok(!native.process?.description?.includes("RELATO PRIVADO"));
    assert.equal(native.process?.status, "Aguardando Distribuição");
    assert.ok(!JSON.stringify(await consultCitizenRequest(db, receipt.protocol, receipt.token)).includes("RELATO PRIVADO"));
    await assert.rejects(createCitizenRequest(db, { ...channelInput, message: "Conteúdo diferente com a mesma chave privada de envio." }), /Chave/);

    const cpf = syntheticCpf(170);
    const applicant = { firebaseUid: "new-citizen", email: "new-citizen@example.test", name: "Novo cidadão", authTime: Math.floor(Date.now() / 1000) };
    const applicationReceipt = await requestCitizenAccess(db, applicant, cpf);
    assert.match(applicationReceipt.protocolNumber, /^PROC-/);
    const application = await db.citizenAccessApplication.findUniqueOrThrow({ where: { firebaseUid: applicant.firebaseUid } });
    await decideCitizenAccess(db, context.user.id, { id: application.id, approved: true, taxpayerId: "", scopes: [], reason: "Identidade e vínculo de acesso geral conferidos pelo operador." });
    const newUser = await db.usuario.findUniqueOrThrow({ where: { firebaseUid: applicant.firebaseUid }, include: { perfil: true } });
    assert.equal(newUser.employeeId, null);
    const externalUser = { ...context.user, profileCode: newUser.perfil.codigo, permissions: newUser.perfil.permissoes, modulePermissions: [] };
    assert.equal(canViewModule(externalUser, "TRIBUTACAO"), false); assert.equal(canViewModule(externalUser, "PROCESSOS"), false);
    const pdf = await serviceReportPdf("Relatório integral", Array.from({ length: 100 }, (_, index) => `Registro ${index} ${"texto longo ".repeat(30)}`));
    assert.ok((await PDFDocument.load(pdf)).getPageCount() > 2);
  } finally { await db?.$disconnect(); await socket.stop(); await memory.close(); }
});
