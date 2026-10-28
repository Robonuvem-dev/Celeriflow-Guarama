"use server";

import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { queryCadUnicoMds, createSuasRmaRecord } from "@/lib/social/social-engine";
import { revalidatePath } from "next/cache";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import { db } from "@/db/client";
import { socialUnits, suasProntuarioRma } from "@/db/schema/social";
import { and, desc, eq, inArray } from "drizzle-orm";

type ActionResult<T = unknown> = { error?: string; data?: T };

export async function searchCadUnicoAction(nisOrCpf: string): Promise<ActionResult<Awaited<ReturnType<typeof queryCadUnicoMds>>>> {
  if (!nisOrCpf || nisOrCpf.trim().length < 3) {
    return { error: "Informe um NIS ou CPF válido para consulta." };
  }

  try {
    const context = await getTenantContextForModule("SOCIAL");
    const access = await resolveSocialAccess(context);
    if (!access.administrator && !access.links.length) return { error: "É necessário vínculo vigente com um equipamento social." };
    const result = await queryCadUnicoMds(context.database ?? db, nisOrCpf.trim());
    return { data: result };
  } catch (err) {
    return { error: err instanceof Error && err.message ? err.message : "Falha ao consultar CadÚnico (MDS)." };
  }
}

export async function saveRmaRecordAction(data: {
  nis: string;
  nomeCidadao: string;
  unidadeAtendimento: string;
  tipoAtendimento: string;
  detalhesRma: string;
}): Promise<ActionResult<Awaited<ReturnType<typeof createSuasRmaRecord>>>> {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "create");
    const access = await resolveSocialAccess(context);
    const database = context.database ?? db;
    const [unit] = await database.select({ id: socialUnits.id }).from(socialUnits).where(and(eq(socialUnits.name, data.unidadeAtendimento), eq(socialUnits.isActive, true), access.administrator ? undefined : inArray(socialUnits.id, access.links.map(link => link.unitId)))).limit(1);
    if (!unit) return { error: "Equipamento inexistente ou fora do seu vínculo." };
    const record = await createSuasRmaRecord(database, {
      ...data,
      tecnicoResponsavel: context.user.email || context.user.name || "Assistente Social",
    });

    revalidatePath("/social/prontuario");
    return { data: record };
  } catch (err) {
    return { error: err instanceof Error && err.message ? err.message : "Erro ao gravar atendimento no Prontuário SUAS/RMA." };
  }
}

export async function getRmaHistoryAction() {
  try {
    const context = await getTenantContextForModule("SOCIAL");
    if (context.user.profileCode !== SYSTEM_ADMIN_PROFILE_CODE) return { error: "Histórico legado restrito à administração até a vinculação dos registros aos equipamentos." };
    const history = await (context.database ?? db).select().from(suasProntuarioRma).orderBy(desc(suasProntuarioRma.createdAt)).limit(15);
    return { data: history };
  } catch (err) {
    return { error: err instanceof Error && err.message ? err.message : "Erro ao carregar histórico RMA." };
  }
}
