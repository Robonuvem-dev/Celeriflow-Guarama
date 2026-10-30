import { authorizeCentralCron, runCentralRetention } from "@/lib/signatures/central-retention";
import { centralHttpError, centralNoStore } from "@/lib/signatures/central-http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!authorizeCentralCron(request.headers.get("authorization"))) return Response.json({ error: "Não autorizado." }, { status: 401, headers: centralNoStore });
  try {
    const result = await runCentralRetention();
    return Response.json(result, { status: result.failures.length ? 503 : 200, headers: centralNoStore });
  } catch (error) { return centralHttpError(error); }
}
