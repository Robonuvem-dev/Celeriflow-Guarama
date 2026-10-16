import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { getInstitutionalContact } from "@/lib/portal-institucional/public-content";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";

export const metadata: Metadata = {
  title: `Contato | ${MUNICIPALITY_INSTITUTION_NAME}`,
  description: `Canais de contato de ${MUNICIPALITY_INSTITUTION_NAME}.`,
};

export const dynamic = "force-dynamic";

export default async function ContatoPage() {
  const institution = await getInstitutionalContact();
  const location = [institution.address, [institution.city, institution.state].filter(Boolean).join("/")].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto max-w-4xl px-4 py-9 sm:px-6">
      <PortalBreadcrumb current="Contato" />
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900">Contato institucional</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Canais oficiais de {institution.name}.</p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-bold text-slate-900">{institution.name}</h2>
        <dl className="mt-4 space-y-3 text-sm text-slate-700">
          {location && <div className="flex gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-[#00843d]" aria-hidden="true" /><dd>{location}</dd></div>}
          {institution.phone && <div className="flex gap-3"><Phone className="mt-0.5 size-4 shrink-0 text-[#00843d]" aria-hidden="true" /><dd>{institution.phone}</dd></div>}
          {institution.email && <div className="flex gap-3">
            <Mail className="mt-0.5 size-4 shrink-0 text-[#00843d]" aria-hidden="true" />
            <dd><a href={`mailto:${institution.email}`} className="font-semibold text-[#0e4c7e] hover:underline">{institution.email}</a></dd>
          </div>}
        </dl>
        <p className="mt-5 text-sm text-slate-600">
          Para manifestações, solicitações e denúncias, utilize a <Link href="/portal/ouvidoria" className="font-bold text-[#0e4c7e] hover:underline">Ouvidoria</Link> ou o{" "}
          <Link href="/portal/acesso-informacao" className="font-bold text-[#0e4c7e] hover:underline">Acesso à Informação</Link>.
        </p>
      </div>
    </main>
  );
}
