import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { eq, desc } from "drizzle-orm";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { PontoNav } from "../PontoNav";
import { LayoutsClient } from "./LayoutsClient";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";

export default async function PontoLayoutsPage() {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;

  const records = await database
    .select()
    .from(hrReferenceRecords)
    .where(eq(hrReferenceRecords.kind, "LAYOUT_IMPORTACAO_PONTO"))
    .orderBy(desc(hrReferenceRecords.updatedAt));

  const layouts = records.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    details: (r.details as Record<string, string>) || {},
  }));

  return (
    <div className="flex flex-col h-full w-full">
      <PontoNav />
      <OperationalListFrame
        pagination={null}
        label="Mapeamento e Criação de Layouts Customizados de Ponto (Requisito 20.10)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/rh/ponto/importacao"
              className={styles.filterButton}
              title="Ir para tela de importação de arquivo com layouts"
            >
              Importar com Layout
            </Link>
          </div>
        }
      >
        <LayoutsClient initialLayouts={layouts} />
      </OperationalListFrame>
    </div>
  );
}
