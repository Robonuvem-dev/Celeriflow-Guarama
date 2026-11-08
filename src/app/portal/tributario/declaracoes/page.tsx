import Link from "next/link";
import { db } from "@/db/client";
import { readCitizenDeclarations } from "@/db/repositories/portal-content/declarations";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { portalTaxpayerGrants, portalTaxpayerOptions } from "@/db/repositories/portal-content/taxpayer";
import { citizenDeclarationQuery } from "@/lib/portal-cidadao/declaration-query";
import PortalDeclaracoesClient from "./PortalDeclaracoesClient";

export const dynamic = "force-dynamic";

export default async function CitizenDeclarationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const account = await getCitizenAccount("/portal/tributario/declaracoes");
  const raw = await searchParams;
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string"));
  const parsed = citizenDeclarationQuery.safeParse(input);

  const grants = await portalTaxpayerGrants(db, account.id);
  const rawTaxpayers = await portalTaxpayerOptions(db, grants.map((item) => item.taxpayerId));

  const taxpayers = rawTaxpayers.map((t) => ({
    id: t.id,
    name: t.company?.corporateName || t.person?.fullName || "Contribuinte Autônomo",
    document: t.id,
  }));

  const queryParams = parsed.success ? parsed.data : { kind: "DMS" as const, competence: "", protocol: "", status: "", direction: "", page: 1 };
  const result = await readCitizenDeclarations(db, account.id, queryParams);

  const initialRows = result.rows.map((row) => ({
    id: row.id,
    protocol: row.protocol,
    competence: row.competence,
    direction: row.direction,
    channel: row.channel,
    status: row.status,
    noMovement: row.noMovement,
    serviceValue: row.serviceValue ? Number(row.serviceValue) : null,
    ownIss: row.ownIss ? Number(row.ownIss) : null,
    retainedIss: row.retainedIss ? Number(row.retainedIss) : null,
  }));

  return (
    <main className="min-h-screen bg-slate-50/50">
      <PortalDeclaracoesClient
        accountName={account.nome || "Contribuinte Celeriflow"}
        taxpayers={taxpayers.length > 0 ? taxpayers : [{ id: account.id, name: account.nome, document: account.email }]}
        initialRows={initialRows}
        initialKind={queryParams.kind}
        initialCompetence={queryParams.competence}
      />
    </main>
  );
}
