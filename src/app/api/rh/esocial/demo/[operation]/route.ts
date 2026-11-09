import { AccessError } from "@/lib/platform/access-error";
import { executeAuthorizedDemoCommand } from "@/lib/rh/esocial/service";
import { ZodError } from "zod";
export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request, { params }: { params: Promise<{ operation: string }> }) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Origem da requisição inválida." }, { status: 403 });
    if (Number(request.headers.get("content-length") ?? 0) > 2_000_000) return Response.json({ error: "Envie até 2 MB por importação." }, { status: 413 });
    const text = await request.text();
    if (Buffer.byteLength(text) > 2_000_000) return Response.json({ error: "Envie até 2 MB por importação." }, { status: 413 });
    const raw = JSON.parse(text);
    const operation = (await params).operation;
    const actions: Record<string, string> = { "simular-recebimento": "COMPLETE", "consultar-retorno": "CONSULT", "reset-cenario": "RESET" };
    if (operation !== "command" && !actions[operation]) return Response.json({ error: "Comando inexistente." }, { status: 404 });
    const state = await executeAuthorizedDemoCommand({ ...raw, ...(actions[operation] ? { action: actions[operation] } : {}) });
    return Response.json({ state, message: "Operação DEMO persistida." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof AccessError ? error.status : 400;
    return Response.json({ error: error instanceof ZodError ? "Parâmetros inválidos." : error instanceof Error ? error.message : "Não foi possível executar o comando." }, { status });
  }
}
