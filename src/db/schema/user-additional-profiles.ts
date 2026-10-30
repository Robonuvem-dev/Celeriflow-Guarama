import { pgTable, primaryKey, text } from "drizzle-orm/pg-core";
export const userAdditionalProfiles=pgTable("UsuarioPerfilAdicional",{
 usuarioId:text("usuarioId").notNull(),perfilId:text("perfilId").notNull(),
},table=>[primaryKey({columns:[table.usuarioId,table.perfilId]})]);
