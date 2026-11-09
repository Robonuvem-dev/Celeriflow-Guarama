import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { AccessError, getTenantContextForModule, getTenantContextForModuleEdit } from "@/lib/platform/tenant-context";

function tokensMatch(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readToken(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return (request.headers.get("x-api-token") ?? bearer ?? "").trim();
}

/**
 * Autoriza uma chamada de API. Retorna `null` quando autorizada ou a resposta de erro a devolver.
 * - Chamadas máquina-a-máquina (banco, operadora, agente de backup) usam o token do ambiente em `tokenEnv`;
 *   sem a variável configurada, esse caminho fica desabilitado.
 * - Os demais acessos exigem sessão com o módulo (e permissão de edição quando `mutate`).
 */
export async function authorizeApiRequest(
  request: Request,
  options: { moduleCode: string; mutate?: boolean; tokenEnv?: string },
): Promise<NextResponse | null> {
  const expected = options.tokenEnv ? process.env[options.tokenEnv]?.trim() : undefined;
  const received = readToken(request);
  if (expected && received && tokensMatch(received, expected)) return null;
  try {
    if (options.mutate) await getTenantContextForModuleEdit(options.moduleCode);
    else await getTenantContextForModule(options.moduleCode);
    return null;
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

