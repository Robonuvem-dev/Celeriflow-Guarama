import assert from "node:assert/strict";
import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection";
import { countProfileUsers, countSystemAdministrators, findAccessProfile, findActiveUserEmployee, findDuplicateProfileName, findManagedUser, findManagedUserLink, listProfilesWithLegacyUsers, listSystemModules, loadUserAdministration } from "../src/db/repositories/platform/system-administration";
import { findOperationalInstance, loadConfigurationTotals } from "../src/db/repositories/platform/instance-configuration";
import { getSystemAdministratorEmail, SYSTEM_ADMIN_PROFILE_CODE } from "../src/lib/administration/c3-policy";
import { findReportTemplate } from "../src/db/repositories/platform/report-template";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(process.env.DATABASE_URL), connection = createDatabaseConnection(process.env.DATABASE_URL);
  let comparisons = 0;
  const equal = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); comparisons++; };
  try {
    const excludedEmail = getSystemAdministratorEmail(), administratorCode = SYSTEM_ADMIN_PROFILE_CODE;
    const [usuarios, perfis, servidores] = await Promise.all([
      legacy.usuario.findMany({ where: { email: { not: excludedEmail }, perfil: { codigo: { not: administratorCode } } }, include: { perfil: true, employee: { include: { department: true, secretariat: true } } }, orderBy: { nome: "asc" } }),
      legacy.configuracaoPerfil.findMany({ where: { ativo: true, codigo: { not: administratorCode } }, orderBy: { nome: "asc" } }),
      legacy.employee.findMany({ where: { isActive: true }, include: { department: true, secretariat: true }, orderBy: { name: "asc" } }),
    ]);
    equal(await loadUserAdministration(connection.db, excludedEmail, administratorCode), { usuarios, perfis, servidores });
    const normalize = (profiles: Awaited<ReturnType<typeof listProfilesWithLegacyUsers>>) => profiles.map(profile => ({ ...profile, usuarios: profile.usuarios.map(user => ({ permissoesModulo: user.permissoesModulo.toSorted((a, b) => a.id.localeCompare(b.id)) })).toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }));
    equal(normalize(await listProfilesWithLegacyUsers(connection.db, administratorCode)), normalize(await legacy.configuracaoPerfil.findMany({ where: { codigo: { not: administratorCode } }, orderBy: { createdAt: "asc" }, include: { usuarios: { select: { permissoesModulo: { include: { modulo: { select: { codigo: true } } } } } } } })));
    equal(await listSystemModules(connection.db), await legacy.configuracaoModulo.findMany({ where: { codigo: { not: "DOCUMENTOS" } }, orderBy: { nome: "asc" } }));
    equal(await loadConfigurationTotals(connection.db), { instancias: await legacy.configuracaoInstancia.count(), totalModulosAtivos: await legacy.configuracaoModulo.count({ where: { ativo: true, codigo: { not: "DOCUMENTOS" } } }), totalPerfis: await legacy.configuracaoPerfil.count() });
    const instance = await legacy.configuracaoInstancia.findFirst({ orderBy: { createdAt: "asc" }, include: { parametros: { select: { chave: true, valor: true } } } });
    const actualInstance = await findOperationalInstance(connection.db);
    if (instance) instance.parametros.sort((a, b) => a.chave.localeCompare(b.chave));
    if (actualInstance) actualInstance.parametros.sort((a, b) => a.chave.localeCompare(b.chave));
    equal(actualInstance, instance);
    for (const scope of ["GLOBAL", "missing-migration-template"]) equal(await findReportTemplate(connection.db, scope), await legacy.reportTemplate.findUnique({ where: { scope } }));
    const allProfiles = await legacy.configuracaoPerfil.findMany();
    for (const id of [...allProfiles.map(row => row.id), "missing-migration-profile"]) {
      for (const activeOnly of [false, true]) equal(await findAccessProfile(connection.db, id, activeOnly), await legacy.configuracaoPerfil.findFirst({ where: { id, ...(activeOnly ? { ativo: true } : {}) } }));
      equal(await countProfileUsers(connection.db, id), await legacy.usuario.count({ where: { perfilId: id } }));
    }
    for (const name of [...allProfiles.map(row => row.nome.toUpperCase()), "%", "_", "literal' OR 1=1 --", "absent-migration-name"]) {
      for (const exceptId of [undefined, allProfiles[0]?.id]) {
        // findFirst has no tie order; compare membership for duplicate names.
        const expected = await legacy.configuracaoPerfil.findMany({ where: { nome: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
        const actual = await findDuplicateProfileName(connection.db, name, exceptId);
        equal(actual === null, expected.length === 0);
        if (actual) assert.ok(expected.some(row => row.id === actual.id));
      }
    }
    const allUsers = await legacy.usuario.findMany();
    for (const user of [...allUsers, { id: "missing-migration-user", email: "missing@example.invalid", employeeId: "missing-migration-employee" }]) {
      equal(await findManagedUser(connection.db, user.id), await legacy.usuario.findUnique({ where: { id: user.id }, include: { perfil: { select: { codigo: true } } } }));
      equal(await findManagedUserLink(connection.db, "email", user.email), await legacy.usuario.findUnique({ where: { email: user.email }, select: { id: true } }));
      if (user.employeeId) equal(await findManagedUserLink(connection.db, "employeeId", user.employeeId), await legacy.usuario.findUnique({ where: { employeeId: user.employeeId }, select: { id: true } }));
    }
    for (const code of [administratorCode, "missing-migration-code"]) equal(await countSystemAdministrators(connection.db, code), await legacy.usuario.count({ where: { ativo: true, perfil: { codigo: code } } }));
    for (const employee of [...servidores.slice(0, 20), { id: "missing-migration-employee" }]) equal(await findActiveUserEmployee(connection.db, employee.id), await legacy.employee.findFirst({ where: { id: employee.id, isActive: true }, select: { id: true, secretariatId: true } }));
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, scope: "Users, profiles, legacy ACLs, modules, operational instance/JSON parameters, literal duplicate lookup and hierarchy selectors" }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
