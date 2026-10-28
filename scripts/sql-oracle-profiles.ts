import type { AccessProfileRecord, ProfileWithLegacyUsers } from "../src/lib/contracts/system-administration";
import type { SqlOracle } from "./sql-oracle";

/** Physical grants have no temporal/NUMERIC columns; keep nested rows typed. */
export async function expectedProfiles(oracle: SqlOracle, excludedCode: string): Promise<ProfileWithLegacyUsers[]> {
  const profiles = await oracle.rows<AccessProfileRecord>('SELECT * FROM "ConfiguracaoPerfil" WHERE codigo<>$1 ORDER BY "createdAt" ASC', [excludedCode]);
  const members = await oracle.rows<{ id: string; perfilId: string }>('SELECT id,"perfilId" FROM "Usuario" WHERE "perfilId"=ANY($1::text[])', [profiles.map(row => row.id)]);
  type Grant = ProfileWithLegacyUsers["usuarios"][number]["permissoesModulo"][number];
  const grantRows = await oracle.rows<Omit<Grant, "modulo"> & { moduleCode: string | null }>('SELECT g.*,m.codigo AS "moduleCode" FROM "UsuarioModulo" g LEFT JOIN "ConfiguracaoModulo" m ON m.id=g."moduloId" WHERE g."usuarioId"=ANY($1::text[])', [members.map(row => row.id)]);
  const grants: Grant[] = grantRows.map(({ moduleCode, ...grant }) => {
    if (moduleCode === null) throw new Error("Field modulo is required: configuração de módulo ausente.");
    return { ...grant, modulo: { codigo: moduleCode } };
  });
  return profiles.map(profile => ({ ...profile, usuarios: members.filter(user => user.perfilId === profile.id).map(user => ({ permissoesModulo: grants.filter(grant => grant.usuarioId === user.id) })) }));
}
