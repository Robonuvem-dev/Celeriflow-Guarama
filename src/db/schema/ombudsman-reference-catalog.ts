import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createId } from "../ids";
export const ombudsmanReferenceCatalog=pgTable("OmbudsmanReferenceCatalog",{
 id:text("id").primaryKey().$defaultFn(createId),kind:text("kind").notNull(),requestType:text("requestType").notNull(),name:text("name").notNull(),subjectId:text("subjectId"),subsubjectId:text("subsubjectId"),isActive:boolean("isActive").notNull().default(true),
 isAnonymous:boolean("isAnonymous").notNull().default(true),isOnline:boolean("isOnline").notNull().default(true),serviceInformation:text("serviceInformation"),
});

export type OmbudsmanConfigurationSettings = {
 requestType?:string;subjectId?:string;subsubjectId?:string;routeNumber?:number;sequence?:number;
 secretariatId?:string;unitId?:string;departmentId?:string;dueDays?:number;
 availableToApplicant?:boolean;status?:"Cancelado"|"Encerrado"|"Movimentado";
};
export const ombudsmanConfigurations=pgTable("OmbudsmanConfiguration",{
 id:text("id").primaryKey().$defaultFn(createId),kind:text("kind").notNull(),name:text("name").notNull(),
 settings:jsonb("settings").$type<OmbudsmanConfigurationSettings>().notNull().default({}),
 isActive:boolean("isActive").notNull().default(true),
});
