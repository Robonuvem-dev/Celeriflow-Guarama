import "server-only";
import { redirect } from "next/navigation";
import { AccessError } from "./access-error";

/** Page boundary only: action/service error contracts remain available to their callers. */
export async function getPortalPageAccess<T>(load: () => Promise<T>, returnTo: string, loginPath = "/login"): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (!(error instanceof AccessError)) throw error;
    if (error.status === 401) redirect(`${loginPath}?${new URLSearchParams({ returnTo })}`);
    if (error.status === 403 || error.status === 423) return null;
    throw error;
  }
}
