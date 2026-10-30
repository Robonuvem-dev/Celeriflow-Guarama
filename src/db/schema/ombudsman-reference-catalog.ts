import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createId } from "../ids";
export const ombudsmanReferenceCatalog=pgTable("OmbudsmanReferenceCatalog",{
 id:text("id").primaryKey().$defaultFn(createId),kind:text("kind").notNull(),requestType:text("requestType").notNull(),name:text("name").notNull(),subjectId:text("subjectId"),subsubjectId:text("subsubjectId"),isActive:boolean("isActive").notNull().default(true),
});
