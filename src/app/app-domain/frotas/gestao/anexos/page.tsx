import Link from "next/link";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { FleetAttachmentForm } from "./AttachmentForm";

export default async function FleetAttachmentsPage() { await getTenantContextForModuleOperation("FROTAS", "create"); return <main className="mx-auto max-w-3xl space-y-5 p-5"><Link href="/frotas/gestao?area=anexos" className="text-sm font-semibold text-teal-800">← Anexos da Frota</Link><h1 className="text-2xl font-bold">Arquivos do veículo, condutor, multa, sinistro e autorização</h1><FleetAttachmentForm /></main>; }
