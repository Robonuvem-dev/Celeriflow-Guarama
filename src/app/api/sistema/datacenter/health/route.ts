import { NextResponse } from "next/server";
import {
  getDataCenterGovernanceOverview,
  verifyCleanSubdomainSslUrl,
} from "@/lib/platform/datacenter-governance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const probeUrl = searchParams.get("url") || "https://guarama.celeriflow.com.br";
  const overview = getDataCenterGovernanceOverview();
  const urlValidation = verifyCleanSubdomainSslUrl(probeUrl);

  return NextResponse.json({
    ok: true,
    module: "CF32 — Serviço Data Center Certificado",
    urlValidation,
    ...overview,
  });
}

