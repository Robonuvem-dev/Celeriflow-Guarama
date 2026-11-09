import { sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { AccessError, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { getCeleriFlowInstanceId } from "@/lib/platform/instance";
import { permissions, type Permission } from "./contract";

export function assertDemoPermission(grants: readonly string[], permission: Permission) {
  if (!grants.includes(permission) && !grants.includes("ESOCIAL_ADMIN")) throw new AccessError(`Permissão ${permission} necessária.`, 403);
}

export async function readEsocialPermissions(context: AppContext, employerId: string): Promise<Permission[]> {
  if (isSystemAdministrator(context.user)) return [...permissions];
  const rows = (await (context.database ?? databaseConnection.db).execute<{permission: Permission}>(sql`SELECT permission FROM "HrEsocialDemoGrant" WHERE "tenantId"=${getCeleriFlowInstanceId()} AND "employerId"=${employerId} AND "userId"=${context.user.id}`)).rows;
  return rows.map(r=>r.permission).filter(p => p === 'ESOCIAL_VIEW' || p === 'ESOCIAL_AUDIT' || canPerformModuleOperation(context.user,'RH','update'));
}
