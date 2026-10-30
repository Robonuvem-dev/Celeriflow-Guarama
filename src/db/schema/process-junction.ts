import { pgTable,text,timestamp } from "drizzle-orm/pg-core";
import { createId } from "../ids";
export const processJunctions=pgTable("ProcessJunction",{
 id:text("id").primaryKey().$defaultFn(createId),parentProcessId:text("parentProcessId").notNull(),childProcessId:text("childProcessId").notNull(),reason:text("reason").notNull(),createdByUsuarioId:text("createdByUsuarioId").notNull(),createdAt:timestamp("createdAt",{precision:3}).notNull().defaultNow(),endedByUsuarioId:text("endedByUsuarioId"),endedAt:timestamp("endedAt",{precision:3}),endReason:text("endReason"),
});
