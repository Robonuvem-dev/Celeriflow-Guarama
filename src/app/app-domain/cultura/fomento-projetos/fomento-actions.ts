"use server";

import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CulturalIncentiveProject } from "@/lib/contracts/culture";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { desc, eq } from "drizzle-orm";
import { culturalIncentiveProjects } from "@/db/schema/culture";

type ActionResult<T = unknown> = { error?: string; data?: T };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const projectSchema = z.object({
  codigoEdital: z.string().min(1, "Informe o código do edital."),
  nomeEdital: z.string().min(1, "Informe o nome do edital."),
  tituloProjeto: z.string().min(1, "Informe o título do projeto."),
  proponenteNome: z.string().min(1, "Informe o nome do proponente."),
  proponenteCpfCnpj: z.string().min(1, "Informe o CPF/CNPJ."),
  categoriaCultural: z.string().min(1, "Selecione a categoria cultural."),
  valorSolicitado: z.number().positive("Informe o valor solicitado."),
});

export async function submitCulturalProjectAction(input: z.infer<typeof projectSchema>): Promise<ActionResult<CulturalIncentiveProject>> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  try {
    await getTenantContextForModuleOperation("CULTURA", "create");
    const [project] = await db.insert(culturalIncentiveProjects).values({
        ...parsed.data,
        valorSolicitado: new Decimal(parsed.data.valorSolicitado),
        valorAprovado: new Decimal(parsed.data.valorSolicitado),
        status: "APROVADO",
    }).returning();

    revalidatePath("/cultura/fomento-projetos");
    return { data: project };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao submeter projeto cultural.") };
  }
}

export async function submitAccountabilityAction(projectId: string, reciboNota: string): Promise<ActionResult<{ project: CulturalIncentiveProject; recibo: string }>> {
  void reciboNota;
  try {
    await getTenantContextForModuleOperation("CULTURA", "update");
    const timestamp = Date.now();
    const recibo = `REC-PREST-${timestamp}`;

    const [updated] = await db.update(culturalIncentiveProjects).set({
        prestacaoContasStatus: "HOMOLOGADA",
        reciboPrestacaoContas: recibo,
        status: "CONCLUIDO",
    }).where(eq(culturalIncentiveProjects.id, projectId)).returning();
    if (!updated) throw new Error("Projeto cultural não encontrado.");

    revalidatePath("/cultura/fomento-projetos");
    return { data: { project: updated, recibo } };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao enviar prestação de contas.") };
  }
}

export async function getCulturalProjectsAction(): Promise<ActionResult<CulturalIncentiveProject[]>> {
  try {
    await getTenantContextForModule("CULTURA");
    const projects = await db.select().from(culturalIncentiveProjects).orderBy(desc(culturalIncentiveProjects.createdAt)).limit(20);
    return { data: projects };
  } catch (error) {
    return { error: getErrorMessage(error, "Erro ao carregar projetos de fomento.") };
  }
}
