import assert from "node:assert/strict";
import { config } from "dotenv";
import { countProfileUsers, countSystemAdministrators, findAccessProfile, findActiveUserEmployee, findDuplicateProfileName, findManagedUser, findManagedUserLink, listProfilesWithLegacyUsers, listSystemModules, loadUserAdministration } from "../src/db/repositories/platform/system-administration";
import { findOperationalInstance, loadConfigurationTotals } from "../src/db/repositories/platform/instance-configuration";
import { getSystemAdministratorEmail, SYSTEM_ADMIN_PROFILE_CODE } from "../src/lib/administration/c3-policy";
import { findReportTemplate } from "../src/db/repositories/platform/report-template";
import type { AccessProfileRecord, ManagedUserRecord, SystemInstanceRecord } from "../src/lib/contracts/system-administration";
import type { DepartmentRecord, EmployeeRecord, SecretariatRecord } from "../src/lib/contracts/administration";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";
import { expectedProfiles } from "./sql-oracle-profiles";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  const connection = openReadOnlySqlOracle(sqlOracleUrl());
  let comparisons = 0;
  const equal = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); comparisons++; };
  try {
    const excludedEmail = getSystemAdministratorEmail(), administratorCode = SYSTEM_ADMIN_PROFILE_CODE;
    const allProfiles = await connection.rows<AccessProfileRecord>('SELECT * FROM "ConfiguracaoPerfil"');
    const employees = await connection.rows<EmployeeRecord>('SELECT * FROM "Employee" ORDER BY name ASC');
    const departments = await connection.rows<DepartmentRecord>('SELECT * FROM "Department"'), secretariats = await connection.rows<SecretariatRecord>('SELECT * FROM "Secretariat"');
    const employeeDetails = employees.map(row => ({ ...row, department: departments.find(item => item.id === row.departmentId) ?? null, secretariat: secretariats.find(item => item.id === row.secretariatId) ?? null }));
    const userRows = await connection.rows<ManagedUserRecord>('SELECT u.* FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.email<>$1 AND p.codigo<>$2 ORDER BY u.nome ASC', [excludedEmail, administratorCode]);
    const usuarios = userRows.map(row => ({ ...row, perfil: allProfiles.find(item => item.id === row.perfilId), employee: employeeDetails.find(item => item.id === row.employeeId) ?? null }));
    const perfis = await connection.rows<AccessProfileRecord>('SELECT * FROM "ConfiguracaoPerfil" WHERE ativo AND codigo<>$1 ORDER BY nome ASC', [administratorCode]);
    const servidores = employeeDetails.filter(row => row.isActive);
    equal(await loadUserAdministration(connection.db, excludedEmail, administratorCode), { usuarios, perfis, servidores });
    const normalize = (profiles: Awaited<ReturnType<typeof listProfilesWithLegacyUsers>>) => profiles.map(profile => ({ ...profile, usuarios: profile.usuarios.map(user => ({ permissoesModulo: user.permissoesModulo.toSorted((a, b) => a.id.localeCompare(b.id)) })).toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) }));
    equal(normalize(await listProfilesWithLegacyUsers(connection.db, administratorCode)), normalize(await expectedProfiles(connection, administratorCode)));
    equal(await listSystemModules(connection.db), await connection.rows('SELECT * FROM "ConfiguracaoModulo" WHERE codigo<>$1 ORDER BY nome ASC', ["DOCUMENTOS"]));
    equal(await loadConfigurationTotals(connection.db), { instancias: await connection.scalarCount('SELECT count(*)::int AS count FROM "ConfiguracaoInstancia"'), totalModulosAtivos: await connection.scalarCount('SELECT count(*)::int AS count FROM "ConfiguracaoModulo" WHERE ativo AND codigo<>$1', ["DOCUMENTOS"]), totalPerfis: allProfiles.length });
    const record = await connection.first<SystemInstanceRecord>('SELECT * FROM "ConfiguracaoInstancia" ORDER BY "createdAt" ASC LIMIT 1');
    const instance = record ? { ...record, parametros: await connection.rows<{ chave: string; valor: unknown }>('SELECT chave,valor FROM "ConfiguracaoParametroInstancia" WHERE "configuracaoInstanciaId"=$1', [record.id]) } : null;
    const actualInstance = await findOperationalInstance(connection.db);
    if (instance) instance.parametros.sort((a, b) => a.chave.localeCompare(b.chave));
    if (actualInstance) actualInstance.parametros.sort((a, b) => a.chave.localeCompare(b.chave));
    equal(actualInstance, instance);
    for (const scope of ["GLOBAL", "missing-migration-template"]) equal(await findReportTemplate(connection.db, scope), await connection.first('SELECT * FROM "ReportTemplate" WHERE scope=$1', [scope]));
    for (const id of [...allProfiles.map(row => row.id), "missing-migration-profile"]) {
      for (const activeOnly of [false, true]) equal(await findAccessProfile(connection.db, id, activeOnly), await connection.first('SELECT * FROM "ConfiguracaoPerfil" WHERE id=$1 AND (NOT $2::boolean OR ativo)', [id, activeOnly]));
      equal(await countProfileUsers(connection.db, id), await connection.scalarCount('SELECT count(*)::int AS count FROM "Usuario" WHERE "perfilId"=$1', [id]));
    }
    for (const name of [...allProfiles.map(row => row.nome.toUpperCase()), "%", "_", "literal' OR 1=1 --", "absent-migration-name"]) {
      for (const exceptId of [undefined, allProfiles[0]?.id]) {
        // findFirst has no tie order; compare membership for duplicate names.
        // Captured insensitive-equals used ILIKE without wrapping or escaping.
        // Keep the historical %/_ scenarios and findFirst membership semantics.
        const expected = await connection.rows<{ id: string }>('SELECT id FROM "ConfiguracaoPerfil" WHERE nome ILIKE $1 AND ($2::text IS NULL OR id<>$2)', [name, exceptId || null]);
        const actual = await findDuplicateProfileName(connection.db, name, exceptId);
        equal(actual === null, expected.length === 0);
        if (actual) assert.ok(expected.some(row => row.id === actual.id));
      }
    }
    const allUsers = await connection.rows<ManagedUserRecord>('SELECT * FROM "Usuario"');
    for (const user of [...allUsers, { id: "missing-migration-user", email: "missing@example.invalid", employeeId: "missing-migration-employee" }]) {
      const record = await connection.first<ManagedUserRecord>('SELECT * FROM "Usuario" WHERE id=$1', [user.id]);
      equal(await findManagedUser(connection.db, user.id), record ? { ...record, perfil: { codigo: allProfiles.find(row => row.id === record.perfilId)?.codigo } } : null);
      equal(await findManagedUserLink(connection.db, "email", user.email), await connection.first('SELECT id FROM "Usuario" WHERE email=$1', [user.email]));
      if (user.employeeId) equal(await findManagedUserLink(connection.db, "employeeId", user.employeeId), await connection.first('SELECT id FROM "Usuario" WHERE "employeeId"=$1', [user.employeeId]));
    }
    for (const code of [administratorCode, "missing-migration-code"]) equal(await countSystemAdministrators(connection.db, code), await connection.scalarCount('SELECT count(*)::int AS count FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo AND p.codigo=$1', [code]));
    for (const employee of [...servidores.slice(0, 20), { id: "missing-migration-employee" }]) equal(await findActiveUserEmployee(connection.db, employee.id), await connection.first('SELECT id,"secretariatId" FROM "Employee" WHERE id=$1 AND "isActive"', [employee.id]));
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY SQL ORACLE", comparisons, scope: "Users, profiles, historical ACLs, modules, operational instance/JSON parameters, case-insensitive duplicate lookup and hierarchy selectors" }, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
