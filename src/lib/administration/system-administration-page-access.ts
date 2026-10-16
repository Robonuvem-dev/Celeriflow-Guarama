import { AccessError, getTenantContextForModule, type AppContext } from "@/lib/platform/tenant-context";

type AdministrationPageAccess =
  | { allowed: true; context: AppContext }
  | { allowed: false; message: string };

// Expected access denials must be rendered before crossing the production RSC boundary,
// which deliberately hides Error messages and exposes only a digest to the browser.
export async function getSystemAdministrationPageAccess(
  authorize: () => Promise<AppContext> = () => getTenantContextForModule("CONFIGURACOES"),
): Promise<AdministrationPageAccess> {
  try { return { allowed: true, context: await authorize() }; }
  catch (error) {
    if (error instanceof AccessError) return { allowed: false, message: error.message };
    throw error;
  }
}
