import { isIP } from "node:net";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { centralHash } from "./central-evidence";
import { centralNoStore } from "./central-http";

const WINDOW_MS = 60_000;
type Budget = "actor" | "signer" | "password-failure";
type Decision = { allowed: boolean; retryAfterSeconds?: number };

/** Fixed windows, no live-entry eviction: capacity pressure fails closed.
 * Injecting a clock keeps expiry/boundary tests deterministic without timers. */
export function createCentralRateLimiter({ clock = Date.now, maxEntries = 10_000 }: { clock?: () => number; maxEntries?: number } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new Error("Capacidade de rate limit inválida.");
  const entries = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;
  function evaluate(scope: Budget, identity: string, consume: boolean): Decision {
    const now = clock();
    if (now >= nextSweep || entries.size >= maxEntries) {
      for (const [key, entry] of entries) if (now >= entry.resetAt) entries.delete(key);
      nextSweep = now + 1000;
    }
    const key = `${scope}:${centralHash(identity)}`;
    let entry = entries.get(key);
    if (entry && now >= entry.resetAt) { entries.delete(key); entry = undefined; }
    const retry = (resetAt: number): Decision => ({ allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) });
    const limit = scope === "password-failure" ? 10 : 60;
    if (entry && entry.count >= limit) return retry(entry.resetAt);
    if (!consume) return { allowed: true };
    if (!entry) {
      if (entries.size >= maxEntries) {
        let earliest = Infinity;
        for (const value of entries.values()) earliest = Math.min(earliest, value.resetAt);
        return retry(earliest);
      }
      entry = { count: 0, resetAt: now + WINDOW_MS }; entries.set(key, entry);
    }
    entry.count++;
    return scope === "password-failure" && entry.count >= limit ? retry(entry.resetAt) : { allowed: true };
  }
  return {
    attempt: (scope: "actor" | "signer", identity: string) => evaluate(scope, identity, true),
    credentialStatus: (signerId: string) => evaluate("password-failure", signerId, false),
    credentialFailure: (signerId: string) => evaluate("password-failure", signerId, true),
    get size() { return entries.size; },
  };
}

const signingLimiter = createCentralRateLimiter();
function limitedResponse(rate: Decision): Response | null {
  if (rate.allowed) return null;
  return Response.json({ error: "Limite de tentativas atingido. Tente novamente após o prazo indicado." }, {
    status: 429, headers: { ...centralNoStore, "Retry-After": String(Math.max(1, rate.retryAfterSeconds ?? 60)) },
  });
}
export function centralAttemptLimit(scope: "actor" | "signer" | "validation-ip", identity: string): Response | null {
  return limitedResponse(scope === "validation-ip" ? checkRateLimit(`signature-central:validation-ip:${centralHash(identity)}`) : signingLimiter.attempt(scope, identity));
}
export function centralCredentialLimit(signerId: string) { return limitedResponse(signingLimiter.credentialStatus(signerId)); }
export function centralCredentialFailure(signerId: string) { return limitedResponse(signingLimiter.credentialFailure(signerId)); }
export function centralValidationIp(request: Request) {
  const candidate = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}
