import Link from "next/link";
import { Users } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { db } from "@/db/client";
import { listSocialPeoplePage } from "@/db/repositories/social/queries";

export default async function SocialPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 160);
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  const { total, page, persons } = await listSocialPeoplePage(context.database ?? db, access, q, params.page);
  const columns: OperationalColumn[] = [
    { key: "name", label: "Pessoa / nome social", type: "identifier", initialWidth: 260, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
    { key: "cpf", label: "CPF", type: "text", initialWidth: 150, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
    { key: "nis", label: "NIS", type: "text", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
    { key: "status", label: "Situação", type: "status", initialWidth: 110, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
    { key: "actions", label: "Ação", type: "actions", initialWidth: 110, minWidth: 110, maxWidth: 110, resizable: false, sortable: false, details: "none" },
  ];
  return <PageFrame className="flex h-full min-h-0 flex-col gap-1"><PageHeader title="Prontuários individuais" icon={<Users className="size-4" />} />
    <OperationalListFrame toolbar={<form className="flex w-full gap-2"><input aria-label="Buscar nome, CPF ou NIS" type="search" name="q" defaultValue={q} placeholder="Buscar nome, CPF ou NIS..." className="h-8 min-w-0 flex-1 rounded border px-2 text-sm" /><button className="rounded bg-blue-600 px-3 text-xs text-white">Buscar</button></form>} pagination={<OperationalLinkPagination page={page} total={total} pathname="/social/pessoas" values={{ q }} />}>
      <OperationalTable caption="Prontuários individuais" emptyMessage="Nenhuma pessoa disponível. Confirme os cadastros e vínculos profissionais." columns={columns} preferenceId="social-pessoas" rows={persons.map((person) => ({ id: person.id, label: person.socialName || person.fullName, values: { name: person.socialName || person.fullName, cpf: person.cpf || "—", nis: person.socialProfile?.nis || "—", status: person.status }, actions: <Link className="text-blue-700 underline" href={`/social/pessoas/${person.id}`}>Prontuário</Link> }))} />
    </OperationalListFrame>
  </PageFrame>;
}
