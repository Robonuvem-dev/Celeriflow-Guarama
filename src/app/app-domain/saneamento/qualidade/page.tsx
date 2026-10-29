import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { QualityClient } from "../components/QualityClient";
import { db } from "@/db/client";
import { listWaterQualityAnalyses } from "@/db/repositories/sanitation/queries";

export default async function QualidadePage() {
  const context = await getTenantContextForModule("SANEAMENTO");
  const analyses = await listWaterQualityAnalyses(context.database ?? db);

  const serializedAnalyses = analyses.map((analysis) => ({
    ...analysis,
    collectedAt: analysis.collectedAt.toISOString().slice(0, 10),
  }));

  return <QualityClient analyses={serializedAnalyses} />;
}
