import { validateCentralSignature } from "@/lib/signatures/central-service";
import { centralFile, centralHttpError, centralMultipart, centralNoStore, centralText } from "@/lib/signatures/central-http";
import { centralAttemptLimit, centralValidationIp } from "@/lib/signatures/central-rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const limit = centralAttemptLimit("validation-ip", centralValidationIp(request));
    if (limit) return limit;
    const data = await centralMultipart(request);
    return Response.json(await validateCentralSignature({ code: centralText(data, "code"), file: centralFile(data, false) }), { headers: centralNoStore });
  } catch (error) { return centralHttpError(error); }
}
