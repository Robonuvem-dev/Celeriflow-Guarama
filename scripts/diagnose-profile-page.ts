import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const profiles = await prisma.configuracaoPerfil.findMany({
      where: { codigo: { not: "SYSTEM_ADMINISTRATOR" } }, orderBy: { createdAt: "asc" },
      include: { usuarios: { select: { permissoesModulo: { include: { modulo: { select: { codigo: true } } } } } } },
    });
    const names = new Map<string, typeof profiles[0]>();
    for (const profile of profiles) {
      const key = profile.nome.trim().toLowerCase();
      const previous = names.get(key);
      if (!previous || (!previous.descricao && profile.descricao)) names.set(key, profile);
    }
    const projected = [...names.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map(({ usuarios, ...profile }) => ({ ...profile, legacyModuleCodes: [...new Set(usuarios.flatMap((user) => user.permissoesModulo.filter((permission) => permission.canView || permission.canEdit).map((permission) => permission.modulo.codigo.toUpperCase())))] }));
    const integrity = await prisma.$queryRaw<{ missingModule: bigint; missingProfile: bigint }[]>`
      SELECT (SELECT count(*) FROM "UsuarioModulo" um LEFT JOIN "ConfiguracaoModulo" m ON m.id = um."moduloId" WHERE m.id IS NULL) AS "missingModule",
             (SELECT count(*) FROM "Usuario" u LEFT JOIN "ConfiguracaoPerfil" p ON p.id = u."perfilId" WHERE p.id IS NULL) AS "missingProfile"`;
    const administrator = await prisma.configuracaoPerfil.findUnique({ where: { codigo: "SYSTEM_ADMINISTRATOR" }, select: { ativo: true } });
    console.log(JSON.stringify({ query: "OK", projection: "OK", profiles: projected.length, missingModule: String(integrity[0].missingModule), missingProfile: String(integrity[0].missingProfile), administratorActive: administrator?.ativo ?? false }));
    if (process.argv[2]) {
      const account = await prisma.usuario.findFirst({ where: { email: { equals: process.argv[2].trim(), mode: "insensitive" } }, select: { ativo: true, perfil: { select: { codigo: true, ativo: true, permissoes: true } }, permissoesModulo: { include: { modulo: { select: { codigo: true } } } } } });
      const { canViewModule, canPerformModuleOperation } = await import("../src/lib/platform/tenant-context");
      const moduleState = await prisma.configuracaoModulo.findUnique({ where: { codigo: "CONFIGURACOES" }, select: { ativo: true } });
      const user = account ? { profileCode: account.perfil.codigo, permissions: account.perfil.permissoes, modulePermissions: account.permissoesModulo.map((item) => ({ code: item.modulo.codigo, canView: item.canView, canEdit: item.canEdit })) } : null;
      const accessUser = user as Parameters<typeof canViewModule>[0] | null;
      console.log(JSON.stringify({ accountFound: Boolean(account), accountActive: account?.ativo ?? false, profileActive: account?.perfil.ativo ?? false, canViewProfiles: Boolean(accessUser && moduleState?.ativo !== false && canViewModule(accessUser, "CONFIGURACOES")), canCreateProfiles: Boolean(accessUser && canPerformModuleOperation(accessUser, "CONFIGURACOES", "create")), canUpdateProfiles: Boolean(accessUser && canPerformModuleOperation(accessUser, "CONFIGURACOES", "update")), canDeleteProfiles: Boolean(accessUser && canPerformModuleOperation(accessUser, "CONFIGURACOES", "delete")) }));
    }
  } catch (error) {
    // Never print database URLs, profile permission content, user identifiers or credentials.
    const detail = error as { name?: string; code?: string; message?: string };
    console.error(JSON.stringify({ query: "FAILED", name: detail.name, code: detail.code, missingColumn: detail.message?.match(/column [`'"]?([A-Za-z0-9_.]+)[`'"]?/i)?.[1], inconsistentRelation: detail.message?.match(/Field ([A-Za-z0-9_]+) is required/)?.[1] }));
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}
void main();
