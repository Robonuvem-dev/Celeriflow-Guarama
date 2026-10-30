"use server";
import { redirect } from "next/navigation";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { issueEmployeeDocument } from "@/lib/rh/employee-document";
export async function createEmployeeDocument(data: FormData): Promise<void> {
 await getTenantContextForModuleOperation("RH","create");
 const document = await withDatabaseTransaction(databaseConnection,tx=>issueEmployeeDocument(tx,String(data.get("employeeId") || ""),String(data.get("templateId") || "")));
 redirect(`/rh/documentos?employeeId=${encodeURIComponent(document.employeeId)}&id=${encodeURIComponent(document.id)}`);
}
