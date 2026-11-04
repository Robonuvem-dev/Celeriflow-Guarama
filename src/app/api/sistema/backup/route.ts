import { NextResponse } from "next/server";
import {
  listBackupSnapshots,
  triggerWebBackupExecution,
  verifyAndTestRestoreSnapshot,
  type BackupTier,
} from "@/lib/platform/backup-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tierParam = (searchParams.get("tier") ?? "ALL") as BackupTier | "ALL";
  const search = searchParams.get("q") ?? "";

  const payload = listBackupSnapshots({
    tier: tierParam,
    search,
  });

  return NextResponse.json({
    ok: true,
    module: "CF31 — Serviço de Backup em Nuvem",
    ...payload,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: "TRIGGER_BACKUP" | "TEST_RESTORE";
      tier?: BackupTier;
      snapshotId?: string;
      triggeredBy?: string;
    };

    if (body.action === "TEST_RESTORE") {
      if (!body.snapshotId) {
        return NextResponse.json({ error: "Informe o snapshotId para testar a restauração." }, { status: 400 });
      }
      const result = verifyAndTestRestoreSnapshot(body.snapshotId);
      return NextResponse.json({
        ok: true,
        action: "TEST_RESTORE",
        ...result,
      });
    }

    const tier: BackupTier =
      body.tier === "FULL_MONTHLY" || body.tier === "DIFFERENTIAL_HOURLY_LOG" ? body.tier : "FULL_DAILY";
    const result = triggerWebBackupExecution({
      tier,
      triggeredBy: body.triggeredBy ?? "Execução Manual via Console Web (/configuracoes/backup)",
    });

    return NextResponse.json({
      ok: true,
      action: "TRIGGER_BACKUP",
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao processar operação de backup." },
      { status: 400 },
    );
  }
}

