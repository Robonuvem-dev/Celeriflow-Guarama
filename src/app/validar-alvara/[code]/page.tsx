import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import LicenseDocumentActions from "./LicenseDocumentActions";

export const dynamic="force-dynamic";
export default async function LicenseValidationPage({params}:{params:Promise<{code:string}>}) {
  const {code}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code)) notFound();
  const license=await prisma.license.findFirst({where:{qrCode:code}});if(!license) notFound();
  const entry=await prisma.taxRegistryEntry.findFirst({where:{entityType:"LICENSE",entityId:license.id,category:"LICENSE_ISSUANCE"}});if(!entry) notFound();
  const data=taxScopeSnapshot(entry.data);
  if(data.authCode!==code) notFound();
  const valid=license.status==="Emitido" && license.validUntil!==null && license.validUntil>=new Date();
  const signature = await prisma.taxRegistryEntry.findFirst({ where: { entityType: "LICENSE", entityId: license.id, category: "LICENSE_SIGNATURE" }, select: { id: true } });
  return <main className="mx-auto max-w-3xl space-y-5 p-8">
    <LicenseDocumentActions code={code} signed={!!signature}/>
    <header><h1 className="text-2xl font-bold">{String(data.layoutTitle)}</h1><p className={`mt-3 rounded border p-3 font-semibold ${valid ? "text-emerald-800" : "text-red-800"}`}>{valid ? "Emissão registrada e vigente" : `Emissão sem vigência: ${license.status === "Emitido" ? "Vencido" : license.status}`}</p></header>
    {signature && <p className="text-sm">Original com assinatura A1 registrado. O download confere o hash do arquivo e a assinatura destacada. A situação atual do alvará é a indicada nesta consulta.</p>}
    <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs">Titular</dt><dd>{String(data.taxpayerName)}</dd></div><div><dt className="text-xs">Inscrição municipal</dt><dd>{String(data.inscription)}</dd></div><div><dt className="text-xs">Tipo / exercício</dt><dd>{license.licenseType} · {String(data.year)}</dd></div><div><dt className="text-xs">Emissão / validade</dt><dd>{license.issueDate?.toLocaleDateString("pt-BR",{timeZone:"UTC"})} — {license.validUntil?.toLocaleDateString("pt-BR",{timeZone:"UTC"})}</dd></div></dl>
    <p className="whitespace-pre-wrap">{String(data.layoutText)}</p><p className="whitespace-pre-wrap text-sm">Fundamento: {String(data.legalBasis)}</p>
    <footer className="border-t pt-3 text-xs"><p className="break-all">Código de autenticidade: {code}</p><p>Documento gerado pelo sistema. Esta consulta verifica a emissão e sua situação atual.</p></footer>
  </main>;
}
