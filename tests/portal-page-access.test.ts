import assert from "node:assert/strict";
import test from "node:test";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";

// Standalone Node does not apply Next's server navigation export transform.
// Use Next's actual redirect implementation without loading client hooks.
const bundled = buildSync({ stdin: { contents: 'export {getPortalPageAccess} from "./src/lib/platform/page-access"; export {AccessError} from "./src/lib/platform/access-error";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", alias: { "next/navigation": "next/dist/client/components/redirect" } });
const compiled = { exports: {} };
new Function("module", "exports", "require", bundled.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { getPortalPageAccess, AccessError } = compiled.exports as {
  getPortalPageAccess: typeof import("../src/lib/platform/page-access").getPortalPageAccess;
  AccessError: typeof import("../src/lib/platform/access-error").AccessError;
};

test("unauthenticated pages redirect to the proper login and preserve their destination", async () => {
  for (const loginPath of ["/login", "/portal/construcao-civil/entrar"]) {
    await assert.rejects(getPortalPageAccess(async () => { throw new AccessError("Entre", 401); }, "/portal/construcao-civil/nova?application=123", loginPath), error => {
      const digest = (error as Error & { digest?: string }).digest ?? "";
      assert.ok(digest.startsWith("NEXT_REDIRECT;"));
      assert.ok(digest.includes(`${loginPath}?returnTo=%2Fportal%2Fconstrucao-civil%2Fnova%3Fapplication%3D123`));
      return true;
    });
  }
});

test("denied access is handled while infrastructure errors remain visible", async () => {
  for (const status of [403, 423] as const) assert.equal(await getPortalPageAccess(async () => { throw new AccessError("Sem acesso", status); }, "/portal/convenentes"), null);
  const failure = new Error("Database unavailable");
  await assert.rejects(getPortalPageAccess(async () => { throw failure; }, "/portal/convenentes"), error => error === failure);
  const context = { user: "authorized" };
  assert.equal(await getPortalPageAccess(async () => context, "/portal/convenentes"), context);
});
