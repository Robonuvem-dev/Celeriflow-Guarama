import type { Prisma } from "@prisma/client";

export function citizenReturnTo(value: unknown): string {
  if (typeof value !== "string") return "/portal/minha-area";
  try {
    const url = new URL(value, "https://portal.invalid");
    const allowed = ["/portal/minha-area", "/portal/minha-area/servicos", "/portal/minha-area/processos", "/portal/minha-area/solicitacoes", "/portal/tributario", "/portal/nfse"];
    if (url.origin !== "https://portal.invalid" || !value.startsWith("/") || value.includes("\\")) return "/portal/minha-area";
    if (!allowed.includes(url.pathname) && !/^\/portal\/minha-area\/(?:processos|solicitacoes|servicos)\/[^/]+$/.test(url.pathname)) return "/portal/minha-area";
    return url.pathname + url.search;
  } catch {
    return "/portal/minha-area";
  }
}

export function hasCitizenProcessScope(scopes: unknown): boolean {
  return Array.isArray(scopes) && scopes.includes("PROCESSOS");
}

export function citizenProcessWhere(usuarioId: string, taxpayerIds: string[], now = new Date()): Prisma.ProcessWhereInput {
  return {
    // Confidential attendance and functional/medical requests keep their specialized policies.
    ombudsman: { is: null },
    functionalPortalBinding: { is: null },
    sstCertificates: { none: {} },
    transparencyCitizenRequests: { none: {} },
    citizenAccessApplication: { is: null },
    OR: [
      { citizenAccesses: { some: { usuarioId, revokedAt: null, grantedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
      ...(taxpayerIds.length ? [
        { taxServiceRequests: { some: { taxpayerId: { in: taxpayerIds } } } },
        { taxCaseLinks: { some: { taxpayerId: { in: taxpayerIds } } } },
      ] : []),
    ],
  };
}

export const citizenProcessSelect = {
  id: true, protocolNumber: true, status: true, createdAt: true, updatedAt: true,
  expectedCompletionAt: true, completedAt: true, archivedAt: true,
  processType: { select: { name: true } }, subject: { select: { name: true } },
  currentDepartment: { select: { name: true } },
} satisfies Prisma.ProcessSelect;
