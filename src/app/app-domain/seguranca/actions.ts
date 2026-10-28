"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { z } from "zod";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { saveSecurityItem, setSecurityItemActive } from "@/db/repositories/security-mobility/commands";
import type { SegMobFormData, SegMobKind } from "./types";

const kindSchema = z.enum(["guarda", "ocorrencia", "infracao", "registro"]);
const formSchema = z.object({
  code: z.string().trim().max(80), title: z.string().trim().min(1).max(500), type: z.string().trim().min(1).max(120),
  status: z.string().trim().min(1).max(80), isActive: z.boolean(), date: z.string().optional(), value: z.number().finite().nonnegative().optional(),
});
const modulePaths = ["/app-domain/seguranca", "/app-domain/seguranca/guardas", "/app-domain/seguranca/ocorrencias", "/app-domain/seguranca/infracoes", "/app-domain/seguranca/rondas", "/app-domain/seguranca/defesa-civil", "/app-domain/seguranca/transito", "/app-domain/seguranca/mobilidade", "/app-domain/seguranca/ordens", "/app-domain/seguranca/documentos"];
function revalidateSegMob() { for (const path of modulePaths) revalidatePath(path); }
function validateInput(kind: SegMobKind, data: SegMobFormData, id?: string) {
  if (!kindSchema.safeParse(kind).success) return "Tipo de registro invalido.";
  if (id && !z.string().cuid().safeParse(id).success) return "Identificador invalido.";
  if (!formSchema.safeParse(data).success || (id && !data.code.trim())) return "Preencha os campos obrigatorios com valores validos.";
  if (data.date && Number.isNaN(new Date(data.date).getTime())) return "Data invalida.";
  return null;
}
export async function createSegMobItem(kind: SegMobKind, data: SegMobFormData) {
  await getTenantContextForModuleOperation("SEGURANCA", "create");
  const error = validateInput(kind, data);
  if (error) return { error };
  try {
    await withDatabaseTransaction(databaseConnection, tx => saveSecurityItem(tx, kind, data));
    revalidateSegMob();
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: "Nao foi possivel criar o registro. Verifique se o codigo ja existe." };
  }
}
export async function updateSegMobItem(kind: SegMobKind, id: string, data: SegMobFormData) {
  await getTenantContextForModuleOperation("SEGURANCA", "update");
  const error = validateInput(kind, data, id);
  if (error) return { error };
  try {
    await withDatabaseTransaction(databaseConnection, tx => saveSecurityItem(tx, kind, data, id));
    revalidateSegMob();
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: "Nao foi possivel salvar o registro. Verifique os dados informados." };
  }
}
export async function toggleSegMobItemStatus(kind: SegMobKind, id: string, isActive: boolean) {
  await getTenantContextForModuleOperation("SEGURANCA", "update");
  if (!kindSchema.safeParse(kind).success || !z.string().cuid().safeParse(id).success || typeof isActive !== "boolean") return { error: "Dados invalidos para alterar o status." };
  try {
    await withDatabaseTransaction(databaseConnection, tx => setSecurityItemActive(tx, kind, id, isActive));
    revalidateSegMob();
    return { error: null };
  } catch (error) {
    console.error(error);
    return { error: "Nao foi possivel alterar o status do registro." };
  }
}
