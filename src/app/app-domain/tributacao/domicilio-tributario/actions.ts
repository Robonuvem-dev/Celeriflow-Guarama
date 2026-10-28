"use server";

import { revalidatePath } from "next/cache";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { acknowledgeDteMessage, applyDteTacitAcknowledgement, confirmDteMailbox, createDteAccessGrant, createDteMailbox, createDtePowerOfAttorney, deleteDteMessage, registerDteReading, revokeDteAccessGrant, sendDteMessages, transitionDtePowerOfAttorney, validateDteAccessGrant } from "@/lib/tributacao/s3-service";

const path = "/tributacao/domicilio-tributario";
const done = (error?: unknown) => ({ error: error instanceof Error ? error.message : error ? "Não foi possível concluir a operação." : undefined });

async function context(operation: "create" | "update" | "delete") { return taxActionContext(operation); }

export async function createMailboxAction(input: Parameters<typeof createDteMailbox>[1]) {
  try { const ctx = await context("create"); const created = await createDteMailbox(ctx.connection, input); revalidatePath(path); return { ...done(), confirmationToken: created.confirmationToken }; } catch (error) { return { ...done(error), confirmationToken: null }; }
}

export async function confirmMailboxAction(token: string) {
  try { const ctx = await context("update"); await confirmDteMailbox(ctx.connection, token); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function createAccessGrantAction(input: { mailboxId: string; authorizedTaxpayerId: string; validUntil: string }) {
  try { const ctx = await context("create"); const created = await createDteAccessGrant(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, { ...input, validUntil: new Date(`${input.validUntil}T23:59:59.000Z`) }); revalidatePath(path); return { ...done(), accessCode: created.accessCode }; } catch (error) { return { ...done(error), accessCode: null }; }
}

export async function validateAccessGrantAction(input: { accessCode: string; authorizedTaxpayerId: string }) {
  try { const ctx = await context("update"); const mailbox = await validateDteAccessGrant(ctx.database, input); return { ...done(), mailboxId: mailbox.id }; } catch (error) { return { ...done(error), mailboxId: null }; }
}

export async function revokeAccessGrantAction(id: string) {
  try { const ctx = await context("delete"); await revokeDteAccessGrant(ctx.connection, id); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function sendDteAction(input: Omit<Parameters<typeof sendDteMessages>[2], never>) {
  try { const ctx = await context("create"); await sendDteMessages(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, input); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function readDteAction(id: string) {
  try { const ctx = await context("update"); await registerDteReading(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, id); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function acknowledgeDteAction(id: string) {
  try { const ctx = await context("update"); await acknowledgeDteMessage(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, id); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function tacitDteAction(id: string) {
  try { const ctx = await context("update"); await applyDteTacitAcknowledgement(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, id); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function deleteDteAction(id: string) {
  try { const ctx = await context("delete"); await deleteDteMessage(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, id); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function createPowerAction(input: Omit<Parameters<typeof createDtePowerOfAttorney>[2], "validUntil"> & { validUntil?: string }) {
  try { const ctx = await context("create"); await createDtePowerOfAttorney(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, { ...input, validUntil: input.validUntil ? new Date(`${input.validUntil}T12:00:00.000Z`) : undefined }); revalidatePath(path); return done(); } catch (error) { return done(error); }
}

export async function transitionPowerAction(id: string, action: "ACEITAR" | "RECUSAR" | "REVOGAR") {
  try { const ctx = await context("update"); await transitionDtePowerOfAttorney(ctx.connection, { usuarioId: ctx.user.id, employeeId: ctx.user.employeeId }, id, action); revalidatePath(path); return done(); } catch (error) { return done(error); }
}
