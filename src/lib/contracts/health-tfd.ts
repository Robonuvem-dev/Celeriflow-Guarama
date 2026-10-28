import type { PermissionUser } from "./identity";

/** TFD only consumes authenticated identity. Persistence is passed explicitly. */
export type HealthTfdContext = { user: PermissionUser };
