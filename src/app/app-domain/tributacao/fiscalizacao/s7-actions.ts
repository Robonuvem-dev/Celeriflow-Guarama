"use server";
import { revalidatePath } from "next/cache";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import {
  acknowledgeTiaf,
  cancelTiaf,
  closeFiscalOrder,
  communicateFiscalDocumentDte,
  confirmProductivityPeriod,
  createFiscalAssessmentMap,
  createFiscalPlan,
  createOrderFromMesh,
  createStandaloneFiscalOrder,
  finalizeFiscalMapAndIssueAuto,
  generatePlanOrders,
  issueSeizureTerm,
  issueTiaf,
  markFiscalOrderRead,
  receiveFiscalDocument,
  returnFiscalDocument,
  runFiscalMeshes,
  saveFiscalPenaltyRule,
  saveFiscalTemplate,
} from "@/lib/tributacao/s7-service";
const path = "/tributacao/fiscalizacao";
const done = (error?: unknown) => ({
  error:
    error instanceof Error
      ? error.message
      : error
        ? "Não foi possível concluir a operação."
        : undefined,
});
async function ctx(operation: "create" | "update") {
  return taxActionContext(operation);
}
const actor = (context: Awaited<ReturnType<typeof ctx>>) => ({
  usuarioId: context.user.id,
  employeeId: context.user.employeeId,
});
export async function createFiscalPlanAction(
  input: Parameters<typeof createFiscalPlan>[2],
) {
  try {
    const c = await ctx("create");
    await createFiscalPlan(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function generatePlanOrdersAction(id: string) {
  try {
    const c = await ctx("create");
    const data = await generatePlanOrders(c.connection, actor(c), id);
    revalidatePath(path);
    return { ...done(), ...data };
  } catch (error) {
    return { ...done(error), created: 0, total: 0 };
  }
}
export async function createStandaloneOrderAction(
  input: Parameters<typeof createStandaloneFiscalOrder>[2],
) {
  try {
    const c = await ctx("create");
    await createStandaloneFiscalOrder(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function markOrderReadAction(id: string) {
  try {
    const c = await ctx("update");
    await markFiscalOrderRead(c.connection, actor(c), id);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function issueTiafAction(input: Parameters<typeof issueTiaf>[2]) {
  try {
    const c = await ctx("create");
    await issueTiaf(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function acknowledgeTiafAction(
  documentId: string,
  receivedBy: string,
) {
  try {
    const c = await ctx("update");
    await acknowledgeTiaf(c.connection, actor(c), { documentId, receivedBy });
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function cancelTiafAction(documentId: string, reason: string) {
  try {
    const c = await ctx("update");
    await cancelTiaf(c.connection, actor(c), { documentId, reason });
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function receiveDocumentAction(
  input: Parameters<typeof receiveFiscalDocument>[2],
) {
  try {
    const c = await ctx("create");
    await receiveFiscalDocument(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function returnDocumentAction(
  input: Parameters<typeof returnFiscalDocument>[2],
) {
  try {
    const c = await ctx("create");
    await returnFiscalDocument(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function createAssessmentMapAction(
  input: Parameters<typeof createFiscalAssessmentMap>[2],
) {
  try {
    const c = await ctx("create");
    await createFiscalAssessmentMap(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function finalizeMapAction(id: string) {
  try {
    const c = await ctx("create");
    await finalizeFiscalMapAndIssueAuto(c.connection, actor(c), id);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function issueSeizureAction(
  input: Parameters<typeof issueSeizureTerm>[2],
) {
  try {
    const c = await ctx("create");
    await issueSeizureTerm(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function closeOrderAction(
  input: Parameters<typeof closeFiscalOrder>[2],
) {
  try {
    const c = await ctx("update");
    await closeFiscalOrder(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function communicateDocumentAction(id: string) {
  try {
    const c = await ctx("create");
    await communicateFiscalDocumentDte(c.connection, actor(c), id);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function runMeshesAction(competence: string) {
  try {
    const c = await ctx("create");
    const data = await runFiscalMeshes(c.connection, competence, actor(c));
    revalidatePath(path);
    return { ...done(), ...data };
  } catch (error) {
    return { ...done(error), processed: 0 };
  }
}
export async function createOrderFromMeshAction(
  findingId: string,
  responsibleEmployeeId: string,
) {
  try {
    const c = await ctx("create");
    await createOrderFromMesh(c.connection, actor(c), {
      findingId,
      responsibleEmployeeId,
    });
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function confirmProductivityAction(id: string) {
  try {
    const c = await ctx("update");
    await confirmProductivityPeriod(c.connection, id, actor(c));
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function saveTemplateAction(
  input: Parameters<typeof saveFiscalTemplate>[2],
) {
  try {
    const c = await ctx("create");
    await saveFiscalTemplate(c.connection, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
export async function savePenaltyRuleAction(
  input: Parameters<typeof saveFiscalPenaltyRule>[1],
) {
  try {
    const c = await ctx("create");
    await saveFiscalPenaltyRule(c.connection, input, actor(c));
    revalidatePath(path);
    return done();
  } catch (error) {
    return done(error);
  }
}
