import Link from "next/link";
import { ArrowLeft, MessageSquareWarning } from "lucide-react";
import { getOmbudsmanContextForProtocols } from "@/lib/attendance/access";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { asc, eq } from "drizzle-orm";
import { supportChannels } from "@/db/schema/attendance-portals";
import { ombudsmanReferenceCatalog } from "@/db/schema/ombudsman-reference-catalog";
import { departments as departmentTable } from "@/db/schema/administration";
import NovaManifestacaoForm from "@/components/app-ui/ombudsman/NovaManifestacaoForm";

export const dynamic = "force-dynamic";

export default async function NovaManifestacaoProtocolosPage() {
  const context = await getOmbudsmanContextForProtocols();
  if (!context.attendanceAccess.isOmbudsman || !context.attendanceAccess.canCreate) {
    throw new Error("Abertura de manifestações restrita à Ouvidoria com permissão de edição em Processos.");
  }

  const [subjectSuggestions, channels, departments] = await Promise.all([
    db
      .select()
      .from(ombudsmanReferenceCatalog)
      .where(eq(ombudsmanReferenceCatalog.isActive, true))
      .orderBy(asc(ombudsmanReferenceCatalog.name))
      .catch(() => []),
    db
      .select({ id: supportChannels.id, name: supportChannels.name })
      .from(supportChannels)
      .where(eq(supportChannels.isActive, true))
      .orderBy(asc(supportChannels.sortOrder), asc(supportChannels.name))
      .catch(() => []),
    db
      .select({ id: departmentTable.id, name: departmentTable.name })
      .from(departmentTable)
      .where(eq(departmentTable.isActive, true))
      .orderBy(asc(departmentTable.name))
      .catch(() => []),
  ]);

  return (
    <PageFrame className="max-w-4xl space-y-4">
      <PageHeader
        title="Nova Manifestação"
        icon={<MessageSquareWarning className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <Link
            href="/protocolos/ouvidoria"
            className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="size-3.5" />
            Voltar para Ouvidoria
          </Link>
        }
      />
      <NovaManifestacaoForm
        originModule="PROCESSOS"
        backHref="/protocolos/ouvidoria"
        channels={channels}
        departments={departments}
        catalog={subjectSuggestions}
      />
    </PageFrame>
  );
}
