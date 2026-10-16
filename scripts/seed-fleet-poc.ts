import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { put } from "@vercel/blob";
import { populateFleetPoc, fleetPocVehicles } from "./fleet-poc-dataset";
import { controlSchemas } from "../src/lib/frotas/control-policy";
import { fleetAttachmentPrefix } from "../src/lib/frotas/control-attachments";
import { isSystemAdministrator, type AppContext } from "../src/lib/platform/tenant-context";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
async function main() {
  const ctbFile = JSON.parse(await readFile("data/frotas/ctb-mbft.json", "utf8"));
  const ctb = controlSchemas.catalog.parse({ kind: ctbFile.kind, reference: ctbFile.reference, sourceReference: ctbFile.sourceReference, complete: ctbFile.complete, entries: ctbFile.entries });
  const fipe = controlSchemas.catalog.parse(JSON.parse(await readFile("data/frotas/fipe-hb20s.json", "utf8")));
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "PREVIEW", note: "Carga fictícia plausível de Frota e dependências RH/Cadastros/Patrimônio/Compras/GED. Não altera dados existentes; reexecução recupera as mesmas operações.", ctbEntries: ctb.entries.length, fipeModels: fipe.entries.length, vehicles: fleetPocVehicles.map(vehicle => ({ name: vehicle.name, plate: vehicle.plate, renavam: vehicle.renavam })), includes: ["3 departamentos e operadores", "7 pessoas e 6 condutores", "bens patrimoniais", "combustível próprio e contratado", "agenda/rotas/destinos/guarita", "pneus/baterias e trocas", "manutenção própria e oficina", "apólices/licenciamento", "multas/parcelas e 20 pontos", "ocorrências/sinistro/partes", "PDFs fictícios privados e GED"], applyCommand: "npm run seed:frotas:poc -- --apply" }, null, 2)); return;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Conexão do ambiente não configurada.");
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }), transactionOptions: { timeout: 60000 } });
  try {
    const emailArgument = process.argv.find(argument => argument.startsWith("--actor-email="))?.slice("--actor-email=".length);
    const actor = await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { ativo: true, codigo: "SYSTEM_ADMINISTRATOR" }, ...(emailArgument ? { email: emailArgument } : {}) }, include: { perfil: true, employee: true, permissoesModulo: { include: { modulo: true } } }, orderBy: { createdAt: "asc" } });
    const context = { prisma: db, user: { id: actor.id, name: actor.nome, email: actor.email, firebaseUid: actor.firebaseUid || "", role: actor.perfil.nome, profileCode: actor.perfil.codigo, permissions: actor.perfil.permissoes, modulePermissions: actor.permissoesModulo.map(permission => ({ code: permission.modulo.codigo, canView: permission.canView, canEdit: permission.canEdit })), employeeId: actor.employeeId, departmentId: actor.employee?.departmentId || null, secretariatId: actor.employee?.secretariatId || null, allowedBudgetUnitIds: [] } } satisfies AppContext;
    if (!isSystemAdministrator(context.user)) throw new Error("A carga exige responsável administrador existente.");
    if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.CELERIFLOW_INSTANCE_ID) throw new Error("Blob privado e identificador da instância devem estar configurados para os documentos da POC.");
    const result = await populateFleetPoc(context, { ctb, fipe, storeFile: async (name, bytes) => { const blob = await put(`${fleetAttachmentPrefix(actor.id)}poc/${name}`, Buffer.from(bytes), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/pdf", token: process.env.BLOB_READ_WRITE_TOKEN }); return { url: blob.url, pathname: blob.pathname }; } });
     const marker = await db.financialAuditLog.findFirst({ where: { action: "MUNICIPAL_FLEET_DATASET_POPULATED", entityId: result.dataset } });
     if (!marker) await db.financialAuditLog.create({ data: { action: "MUNICIPAL_FLEET_DATASET_POPULATED", entityType: "DATASET", entityId: result.dataset, authorUsuarioId: actor.id, payload: { fictional: true, source: "OWNER_AUTHORIZED_REFERENCE", units: Object.values(result.units), referenceDate: result.referenceDate, catalogEntries: result.ctbEntries } } });
     console.log(JSON.stringify({ ...result, external: result.external.map(({ code, cnpj, kind }) => ({ code, cnpj, kind })) }, null, 2));
    console.log("As contas operadoras ficam vinculadas ao RH e ao perfil setorial. Para login, use a vinculação Firebase da rotina de usuários; a carga não altera credenciais existentes. Se uma autorização externa foi recuperada sem token, reemita a credencial pela tela de Frota.");
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Carga da POC não concluída."); process.exitCode = 1; });
