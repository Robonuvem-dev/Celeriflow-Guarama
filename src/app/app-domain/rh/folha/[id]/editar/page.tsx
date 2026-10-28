import { FolhaForm } from "../../FolhaForm";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readPayroll } from "@/db/repositories/personnel-pages/records";

export default async function EditarFolhaPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("RH");
  const { id } = await params;
  const folha = await readPayroll(context.database ?? db, id);

  if (!folha) {
    notFound();
  }

  return (
    <FolhaForm data={folha} />
  );
}
