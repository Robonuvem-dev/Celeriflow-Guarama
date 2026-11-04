import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readWorkflowDeceased, readWorkflowTaxpayer } from "@/db/repositories/cemeteries/workflow-pages";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import CemeteryPrintButton from "@/components/cemeteries/CemeteryPrintButton";

export const dynamic = "force-dynamic";
export default async function DeathRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("CEMITERIOS", "issueReports"), database = context.database ?? db;
  const row = await readWorkflowDeceased(database, (await params).id);
  if (!row) notFound();
  const declarant = row.declarantTaxpayerId ? await readWorkflowTaxpayer(database, row.declarantTaxpayerId) : null;
  const groups = row.groups && typeof row.groups === "object" && !Array.isArray(row.groups) ? row.groups : {};
  return <main className="mx-auto max-w-4xl space-y-5 p-6"><Link className="print:hidden" href="/cemiterios/complementos">← Relatórios</Link><CemeteryPrintButton/><h1 className="text-2xl font-bold">Registro municipal de óbito — reemissão</h1><p>Registro administrativo funerário; não substitui certidão do Registro Civil nem a declaração médica oficial.</p>
    <dl className="grid gap-3 md:grid-cols-2">{Object.entries({ Identificador: row.id, Falecido: row.fullName, Nascimento: row.birthDate?.toISOString().slice(0, 10), Óbito: row.deathDate.toISOString().slice(0, 10), Hora: row.deathTime, Documento: row.document, Sexo: row.gender, "Estado civil": row.maritalStatus, Pai: row.fatherName, Mãe: row.motherName, Endereço: row.address, Médico: row.doctorName, CRM: row.doctorCrm, "Causa mortis": row.cause?.description ?? row.causeText, "Local de sepultamento": row.grave ? `${row.grave.cemetery.name} / ${row.grave.code}` : row.status, "Responsável declarante": declarant?.person?.fullName ?? declarant?.company?.corporateName ?? row.declarantTaxpayerId }).map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd>{value ?? "Não informado"}</dd></div>)}</dl>
    <h2 className="font-semibold">Informações complementares registradas</h2><dl className="space-y-3">{Object.entries(groups).filter(([key]) => !key.startsWith("_")).map(([key, value]) => <div key={key}><dt className="font-semibold">{key}</dt><dd className="whitespace-pre-wrap">{value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value).filter(([, item]) => item !== "" && item !== null).map(([name, item]) => `${name}: ${typeof item === "string" ? item : JSON.stringify(item)}`).join("\n") : String(value ?? "Não informado")}</dd></div>)}</dl>
  </main>;
}
