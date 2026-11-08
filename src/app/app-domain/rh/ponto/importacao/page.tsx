import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { eq, desc } from "drizzle-orm";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { PontoNav } from "../PontoNav";
import { ImportacaoRelogioClient } from "./ImportacaoRelogioClient";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";

export default async function PontoImportacaoPage() {
  const context = await getTenantContextForModule("RH");
  const database = context.database ?? db;

  const customLayoutsRecords = await database
    .select()
    .from(hrReferenceRecords)
    .where(eq(hrReferenceRecords.kind, "LAYOUT_IMPORTACAO_PONTO"))
    .orderBy(desc(hrReferenceRecords.updatedAt));

  const customLayouts = customLayoutsRecords.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    details: (r.details as Record<string, string>) || {},
  }));

  return (
    <div className="flex flex-col h-full w-full">
      <PontoNav />
      <OperationalListFrame
        label="Importação de Dados do Relógio de Ponto (AFD, AFDT, ACJEF e Layouts Customizados) — Requisito 20.15"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/rh/ponto/layouts"
              className={styles.filterButton}
              title="Criar ou editar layouts customizados de importação"
            >
              Criar Novo Layout (20.10)
            </Link>
            <Link
              href="/rh/ponto"
              className={styles.filterButton}
              title="Voltar para marcações de ponto"
            >
              Ver Espelho de Ponto
            </Link>
          </div>
        }
      >
        <ImportacaoRelogioClient customLayouts={customLayouts} />
      </OperationalListFrame>
    </div>
  );
}
