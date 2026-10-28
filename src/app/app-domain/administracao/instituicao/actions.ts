"use server";

import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import type { InstitutionInput } from "@/lib/contracts/administration";
import { normalizeOptionalInstitutionIdentifiers } from "@/lib/administration/c3-policy";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { findFirstInstitutionId, persistInstitution } from "@/db/repositories/administration/creation";
import { databaseConnection, db } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";

export async function saveInstitution(formData: FormData) {
  try {
    const context = await getTenantContextForSystemAdministration();
    let logoUrl: string | null = null;
    const logoFile = formData.get("logoFile") as File | null;

    if (logoFile && logoFile.size > 0 && logoFile.name) {
      // Limite de segurança para MVP (evitar travar o banco com arquivos gigantes)
      if (logoFile.size > 2 * 1024 * 1024) { 
        return { error: "O arquivo da logo deve ter no máximo 2MB." };
      }
      if (!["image/png", "image/jpeg"].includes(logoFile.type)) {
        return { error: "Selecione uma logo em PNG ou JPG." };
      }
      
      const buffer = Buffer.from(await logoFile.arrayBuffer());
      const base64 = buffer.toString("base64");
      const mimeType = logoFile.type || "image/png";
      
      // Armazenando em Base64 para garantir compatibilidade com servidor Vercel (read-only filesystem)
      logoUrl = `data:${mimeType};base64,${base64}`;
    }

    const identifiers = normalizeOptionalInstitutionIdentifiers({
      cnpj: formData.get("cnpj") as string,
      zipCode: formData.get("zipCode") as string,
    });
    const data: InstitutionInput = {
      name: (formData.get("name") as string).trim(),
      cnpj: identifiers.cnpj,
      legalName: (formData.get("legalName") as string).trim() || null,
      address: (formData.get("address") as string).trim() || null,
      city: (formData.get("city") as string).trim() || null,
      state: (formData.get("state") as string).trim() || null,
      zipCode: identifiers.zipCode,
      phone: (formData.get("phone") as string).trim() || null,
      email: (formData.get("email") as string).trim().toLowerCase() || null,
      website: (formData.get("website") as string).trim() || null,
      mayorName: (formData.get("mayorName") as string).trim() || null,
      managerName: (formData.get("managerName") as string).trim() || null,
    };

    if (logoUrl) {
      data.logoUrl = logoUrl;
    }

    if (!data.name) {
      return { error: "O nome da prefeitura é obrigatório." };
    }

    const existing = await findFirstInstitutionId(context.database ?? db);

    await withDatabaseTransaction(databaseConnection, async tx => {
      const id = await persistInstitution(tx, existing, data);
      await insertAuditEvent(tx, {
        actorUsuarioId: context.user.id,
        eventType: auditEventTypes.administrativeMutation,
        targetType: "INSTITUTION",
        targetId: id,
      });
    });

    revalidatePath("/administracao");
    revalidatePath("/administracao/instituicao");
    
    return { success: true };
  } catch (error: unknown) {
    console.error("Error saving institution:", error);
    return { error: error instanceof Error ? error.message : "Erro desconhecido ao salvar os dados da instituição." };
  }
}
