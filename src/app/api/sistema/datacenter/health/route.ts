import { NextResponse } from "next/server";
import { authorizeApiRequest } from "@/lib/platform/api-access";
import {
  getDataCenterGovernanceOverview,
  probeHostSecurity,
  verifyCleanSubdomainSslUrl,
} from "@/lib/platform/datacenter-governance";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico do host que atende esta requisição (DNS, certificado TLS, URL limpa).
 * Não aceita host informado pelo cliente, para não servir de proxy de varredura.
 */
export async function GET(request: Request) {
  const denied = await authorizeApiRequest(request, { moduleCode: "CONFIGURACOES" });
  if (denied) return denied;
  const requestUrl = new URL(request.url);
  const publicHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || requestUrl.host;
  const publicProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || requestUrl.protocol.replace(":", "");
  const publicUrl = `${publicProtocol}://${publicHost}`;

  const [probe] = await Promise.all([probeHostSecurity(publicHost)]);
  return NextResponse.json({
    ok: true,
    module: "CF32 — Serviço Data Center",
    publicUrl,
    urlValidation: verifyCleanSubdomainSslUrl(publicUrl),
    probe,
    ...getDataCenterGovernanceOverview(),
  });
}
