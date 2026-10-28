import { config } from "dotenv";
import { openReadOnlySqlOracle, sqlOracleUrl } from "./sql-oracle";
import { expectedProfiles } from "./sql-oracle-profiles";
import { capturedProfileAccess, profileDiagnosticError } from "./sql-oracle-profile-diagnostic";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  try {
    const oracle = openReadOnlySqlOracle(sqlOracleUrl());
    try {
    const profiles = await expectedProfiles(oracle, "SYSTEM_ADMINISTRATOR");
    const names = new Map<string, typeof profiles[0]>();
    for (const profile of profiles) {
      const key = profile.nome.trim().toLowerCase();
      const previous = names.get(key);
      if (!previous || (!previous.descricao && profile.descricao)) names.set(key, profile);
    }
    const projected = [...names.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map(({ usuarios, ...profile }) => ({ ...profile, legacyModuleCodes: [...new Set(usuarios.flatMap((user) => user.permissoesModulo.filter((permission) => permission.canView || permission.canEdit).map((permission) => permission.modulo.codigo.toUpperCase())))] }));
    const integrity = await oracle.rows<{ missingModule: bigint; missingProfile: bigint }>(`
      SELECT (SELECT count(*) FROM "UsuarioModulo" um LEFT JOIN "ConfiguracaoModulo" m ON m.id = um."moduloId" WHERE m.id IS NULL) AS "missingModule",
              (SELECT count(*) FROM "Usuario" u LEFT JOIN "ConfiguracaoPerfil" p ON p.id = u."perfilId" WHERE p.id IS NULL) AS "missingProfile"`);
    const administrator = await oracle.first<{ ativo: boolean }>('SELECT ativo FROM "ConfiguracaoPerfil" WHERE codigo=$1', ["SYSTEM_ADMINISTRATOR"]);
    console.log(JSON.stringify({ mode: "READ ONLY SQL ORACLE", query: "OK", projection: "OK", profiles: projected.length, missingModule: String(integrity[0].missingModule), missingProfile: String(integrity[0].missingProfile), administratorActive: administrator?.ativo ?? false }));
    if (process.argv[2]) {
      const account = await oracle.first<{ id: string; ativo: boolean; codigo: string; profileActive: boolean; permissoes: string }>('SELECT u.id,u.ativo,p.codigo,p.ativo AS "profileActive",p.permissoes FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.email ILIKE $1 LIMIT 1', [process.argv[2].trim()]);
      const moduleState = await oracle.first<{ ativo: boolean }>('SELECT ativo FROM "ConfiguracaoModulo" WHERE codigo=$1', ["CONFIGURACOES"]);
      const grants = account ? await oracle.rows<{ code: string; canView: boolean; canEdit: boolean }>('SELECT m.codigo AS code,g."canView",g."canEdit" FROM "UsuarioModulo" g JOIN "ConfiguracaoModulo" m ON m.id=g."moduloId" WHERE g."usuarioId"=$1', [account.id]) : [];
      const access = account ? capturedProfileAccess({ profileCode: account.codigo, permissions: account.permissoes, modulePermissions: grants }, moduleState?.ativo) : { canViewProfiles: false, canCreateProfiles: false, canUpdateProfiles: false, canDeleteProfiles: false };
      console.log(JSON.stringify({ policy: "CAPTURED PROFILE POLICY", accountFound: Boolean(account), accountActive: account?.ativo ?? false, profileActive: account?.profileActive ?? false, ...access }));
    }
    } finally { await oracle.pool.end(); }
  } catch (error) {
    // Never print database URLs, profile permission content, user identifiers or credentials.
    console.error(JSON.stringify(profileDiagnosticError(error)));
    process.exitCode = 1;
  }
}
void main();
