import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Truck } from "lucide-react";
import { db } from "@/db/client";
import { findSupplierRowById } from "@/db/repositories/registry/suppliers";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { dateInputValue } from "../supplier-utils";
import type { SupplierListItem } from "../supplier-types";
import FornecedorDetailEditClient from "./FornecedorDetailEditClient";

export const dynamic = "force-dynamic";

export default async function FornecedorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const context = await getTenantContextForModule("CADASTROS");
  const canUpdate = canPerformModuleOperation(context.user, "CADASTROS", "update");
  const database = context.database ?? db;

  const row = await findSupplierRowById(database, id);
  if (!row) notFound();

  const serializeDoc = (item: {
    title: string;
    documentType: string;
    status: string;
    validUntil: Date | null;
  }) => ({
    title: item.title,
    documentType: item.documentType,
    status: item.status,
    validUntil: dateInputValue(item.validUntil) || null,
  });

  const supplier: SupplierListItem = {
    id: row.id,
    category: row.category,
    businessBranch: row.businessBranch,
    bankData: row.bankData,
    certificationsValidUntil: dateInputValue(row.certificationsValidUntil) || null,
    notes: row.notes,
    status: row.status,
    person: row.person
      ? {
          fullName: row.person.fullName,
          cpf: row.person.cpf,
          documents: (row.person.documents || []).map(serializeDoc),
        }
      : null,
    company: row.company
      ? {
          corporateName: row.company.corporateName,
          tradeName: row.company.tradeName,
          cnpj: row.company.cnpj,
          companyType: row.company.companyType,
          primaryCnae: row.company.primaryCnae,
          secondaryCnaes: row.company.secondaryCnaes,
          documents: (row.company.documents || []).map(serializeDoc),
        }
      : null,
  };

  const supplierName = supplier.person
    ? supplier.person.fullName
    : supplier.company
      ? supplier.company.corporateName
      : "Fornecedor";
  const referenceDate = dateInputValue(new Date()) || new Date().toISOString().slice(0, 10);

  return (
    <PageFrame className="flex h-[calc(100vh-4rem)] max-w-5xl min-h-0 flex-col gap-2 overflow-hidden">
      <PageHeader
        title={`Cadastro do Fornecedor — ${supplierName}`}
        className="mb-0 shrink-0"
        icon={<Truck className="size-4 shrink-0 text-fuchsia-600" />}
        action={
          <Link
            href="/cadastros/fornecedores"
            className="inline-flex min-h-9 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:h-7 sm:min-h-0"
          >
            <ArrowLeft className="size-3.5" />
            Voltar
          </Link>
        }
      />
      <FornecedorDetailEditClient
        supplier={supplier}
        canUpdate={canUpdate}
        referenceDate={referenceDate}
      />
    </PageFrame>
  );
}
