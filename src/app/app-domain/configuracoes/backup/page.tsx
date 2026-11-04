import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listBackupSnapshots, type BackupTier } from "@/lib/platform/backup-service";
import { BackupClient } from "./BackupClient";

export const dynamic = "force-dynamic";

export default async function BackupConfigPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getTenantContextForModule("CONFIGURACOES");
  const resolved = await searchParams;
  const rawView = typeof resolved.visao === "string" ? resolved.visao : "snapshots";
  const activeView: "snapshots" | "sistemas" | "politicas" =
    rawView === "sistemas" || rawView === "politicas" ? rawView : "snapshots";

  const rawTier = typeof resolved.camada === "string" ? resolved.camada : "ALL";
  const activeTier: "ALL" | BackupTier =
    rawTier === "FULL_DAILY" || rawTier === "FULL_MONTHLY" || rawTier === "DIFFERENTIAL_HOURLY_LOG"
      ? rawTier
      : "ALL";

  const page = Math.max(1, Number(resolved.page ?? 1) || 1);
  const data = listBackupSnapshots();

  return (
    <BackupClient
      initialSnapshots={data.snapshots}
      countsByTier={data.countsByTier}
      initialQuota={data.quota}
      schedules={data.schedules}
      coveredSystems={data.coveredSystems}
      windowsService={data.windowsService}
      activeTier={activeTier}
      activeView={activeView}
      page={page}
    />
  );
}

