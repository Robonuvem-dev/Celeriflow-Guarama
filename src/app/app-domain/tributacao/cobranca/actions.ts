"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import {
  completeCollectionAction,
  createBenefitRule,
  createCollectionPortfolio,
  createPrizeDraw,
  executePrizeDraw,
  grantPortalAccess,
  issuePrizeCoupon,
  scheduleCollectionAction,
} from "@/lib/tributacao/s8-service";
const path = "/tributacao/cobranca";
const done = (error?: unknown) => ({
  error:
    error instanceof Error
      ? error.message
      : error
        ? "Não foi possível concluir a operação."
        : undefined,
});
async function ctx(operation: "create" | "update") {
  return getTenantContextForModuleOperation("TRIBUTACAO", operation);
}
const actor = (c: Awaited<ReturnType<typeof ctx>>) => ({
  usuarioId: c.user.id,
});
export async function createPortfolioAction(
  input: Parameters<typeof createCollectionPortfolio>[2],
) {
  try {
    const c = await ctx("create");
    await createCollectionPortfolio(c.prisma, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function scheduleCollectionActionAction(
  input: Parameters<typeof scheduleCollectionAction>[2],
) {
  try {
    const c = await ctx("create");
    await scheduleCollectionAction(c.prisma, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function completeCollectionActionAction(
  input: Parameters<typeof completeCollectionAction>[2],
) {
  try {
    const c = await ctx("update");
    await completeCollectionAction(c.prisma, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function grantPortalAccessAction(taxpayerId: string) {
  try {
    const c = await ctx("update");
    await grantPortalAccess(c.prisma, actor(c), taxpayerId);
    revalidatePath(path);
    revalidatePath("/portal/tributario");
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function createBenefitRuleAction(
  input: Parameters<typeof createBenefitRule>[2],
) {
  try {
    const c = await ctx("create");
    await createBenefitRule(c.prisma, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function createPrizeDrawAction(
  input: Parameters<typeof createPrizeDraw>[2],
) {
  try {
    const c = await ctx("create");
    await createPrizeDraw(c.prisma, actor(c), input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function issuePrizeCouponAction(
  input: Parameters<typeof issuePrizeCoupon>[1],
) {
  try {
    const c = await ctx("create");
    await issuePrizeCoupon(c.prisma, input);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
export async function executePrizeDrawAction(drawId: string) {
  try {
    const c = await ctx("create");
    await executePrizeDraw(c.prisma, actor(c), drawId);
    revalidatePath(path);
    return done();
  } catch (e) {
    return done(e);
  }
}
