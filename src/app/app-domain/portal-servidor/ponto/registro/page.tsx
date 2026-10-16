import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { getOwnClockPolicy } from "@/lib/portal-servidor/clock-service";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { OwnClockForm } from "./ClockForm";

export const dynamic = "force-dynamic";
export default async function OwnClockPage() {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const configured = await getOwnClockPolicy(access.context);
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Registrar meu ponto" description="Marcação pessoal conforme habilitação individual e política de jornada do RH." action={<Link href="/portal-servidor/ponto">Consultar espelho</Link>} />{configured ? <><p className="rounded border bg-white p-3 text-xs">Fuso: {configured.policy.timeZone} · Jornada configurada: {configured.policy.contractedHours}h · Fundamento: {configured.policy.legalReference}</p><OwnClockForm /></> : <p className="rounded border bg-white p-4 text-sm">Seu cadastro não possui habilitação individual vigente para marcação pelo Portal. A consulta do espelho permanece disponível.</p>}<Link href="/portal-servidor/servicos" className="text-xs underline">Solicitar ajuste ou justificativa ao RH</Link></div>;
}
