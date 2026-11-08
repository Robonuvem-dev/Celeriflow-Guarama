import { getTenantContextForModule, canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { listProcurementAuxiliaryRecords } from "@/db/repositories/procurement/auxiliary-catalogs";
import { suppliers as supplierTable, companies, people } from "@/db/schema/registry";
import { eq, desc } from "drizzle-orm";
import { formatCnpj, formatCpf } from "@/app/app-domain/cadastros/fornecedores/supplier-utils";
import { ConsorciosClient, type ConsorcioItem, type SupplierChoice } from "./ConsorciosClient";

export const dynamic = "force-dynamic";

export default async function ConsorciosPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const canManage = canPerformModuleOperation(context.user, "COMPRAS", "update");

  const [rawConsorcios, rawSuppliers] = await Promise.all([
    listProcurementAuxiliaryRecords(databaseConnection.db, "consorcios-empresas"),
    databaseConnection.db
      .select({
        supplier: supplierTable,
        company: companies,
        person: people,
      })
      .from(supplierTable)
      .leftJoin(companies, eq(companies.id, supplierTable.companyId))
      .leftJoin(people, eq(people.id, supplierTable.personId))
      .where(eq(supplierTable.status, "Ativo"))
      .orderBy(desc(supplierTable.createdAt)),
  ]);

  const supplierList: SupplierChoice[] = rawSuppliers.map((row) => {
    const name = row.company?.corporateName || row.person?.fullName || "Fornecedor";
    const document = row.company?.cnpj
      ? formatCnpj(row.company.cnpj)
      : row.person?.cpf
        ? formatCpf(row.person.cpf)
        : "—";
    return {
      id: row.supplier.id,
      name,
      document,
    };
  });

  const supplierMap = new Map(supplierList.map((s) => [s.id, s.name]));

  const consorcios: ConsorcioItem[] = rawConsorcios.map((record) => {
    const fields = record.fields;
    const fornecedoresIds = (fields.fornecedores || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const fornecedoresNomes = fornecedoresIds.map((id) => supplierMap.get(id) || id);
    const liderConsorcioId = fields.liderConsorcioId || fornecedoresIds[0] || "";
    const liderNome = supplierMap.get(liderConsorcioId) || liderConsorcioId;

    return {
      id: record.id,
      code: record.code,
      name: record.name,
      exercicio: fields.exercicio || fields.anoNumero?.split("/")[0] || "",
      numeroConsorcio: fields.numeroConsorcio || fields.anoNumero?.split("/")[1] || record.code,
      cnpj: fields.cnpj || "",
      dataCadastro: fields.dataCadastro || fields.dataRegistro || "",
      dataEncerramento: fields.dataEncerramento || "",
      ramo: fields.ramo || fields.ramoAtividade || "",
      liderConsorcioId,
      liderNome,
      percentualLider: fields.percentualLider || "",
      fornecedoresIds,
      fornecedoresNomes,
      emailTelefone: fields.emailTelefone || "",
      registroOrgao: fields.registroOrgao || "",
    };
  });

  return <ConsorciosClient consorcios={consorcios} suppliers={supplierList} canManage={canManage} />;
}
