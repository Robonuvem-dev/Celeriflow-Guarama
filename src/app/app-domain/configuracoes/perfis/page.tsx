import { getSystemAdministrationPageAccess } from "@/lib/administration/system-administration-page-access";
import { SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import PerfisClient from "./PerfisClient";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listProfilesWithLegacyUsers } from "@/db/repositories/platform/system-administration";

export const dynamic = "force-dynamic";

export default async function PerfisPage() {
  const access = await getSystemAdministrationPageAccess();
  if (!access.allowed) {
    return <PageFrame className="space-y-4 p-4">
      <PageHeader title="Perfis de acesso" icon={<ShieldCheck className="size-4"/>}/>
      <section role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h2 className="mb-2 font-semibold">Acesso restrito</h2>
        <p>{access.message}</p>
        <p className="mt-2">O acesso a Perfis exige liberação do módulo Configurações no seu perfil.</p>
      </section>
      <Link href="/dashboard" className="inline-flex rounded-md border px-3 py-2 text-sm">Voltar ao painel</Link>
    </PageFrame>;
  }
  const { user } = access.context;

  // Fetch profiles ordered by name
  const allPerfis = await listProfilesWithLegacyUsers(access.context.database ?? db, SYSTEM_ADMIN_PROFILE_CODE);

  // Display duplicates without mutating authorization configuration during a page read.
  const seenNames = new Map<string, typeof allPerfis[0]>();

  for (const perfil of allPerfis) {
    const key = perfil.nome.trim().toLowerCase();
    if (!seenNames.has(key)) {
      seenNames.set(key, perfil);
    } else {
      // Keep the one that has description or valid permissions json
      const existing = seenNames.get(key)!;
      if (!existing.descricao && perfil.descricao) {
        seenNames.set(key, perfil);
      }
    }
  }

  const perfisDeduplicados = Array.from(seenNames.values())
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .map(({ usuarios, ...perfil }) => ({
      ...perfil,
      legacyModuleCodes: [...new Set(usuarios.flatMap((user) => user.permissoesModulo
        .filter((permission) => permission.canView || permission.canEdit)
        .map((permission) => permission.modulo.codigo.toUpperCase())))],
    }));

  return <PerfisClient perfis={perfisDeduplicados} capabilities={{
    create: canPerformModuleOperation(user, "CONFIGURACOES", "create"),
    update: canPerformModuleOperation(user, "CONFIGURACOES", "update"),
    delete: canPerformModuleOperation(user, "CONFIGURACOES", "delete"),
  }} />;
}
