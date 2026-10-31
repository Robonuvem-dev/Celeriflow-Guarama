import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { biDisplayAssets, biDisplayChannels, biDisplaySnapshots, biDisplayVersions } from "@/db/schema/bi-display";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { loadDisplayChannel, loadDisplayEditorOptions, loadDisplayIdentity, loadDisplayVersion, municipalDisplayChannel, queryDisplayDataset } from "@/db/repositories/administration/bi-display";
import { auditEventTypes } from "@/lib/contracts/audit";
import { AccessError, canPerformModuleOperation, canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { defaultDisplayConfig, displayConfigSchema, displayPeriod, displaySlideIsActive, type DisplayDataset, type DisplayEditorState, type PublicDisplay } from "./display-model";

type DisplayContext = AppContext & { databaseConnection?: DatabaseConnection };
export function assertDisplayAccess(context: AppContext, operation: "read" | "update" | "publish") {
  const allowed = operation === "read" ? canViewModule(context.user, "ADMINISTRACAO") : canPerformModuleOperation(context.user, "ADMINISTRACAO", operation === "publish" ? "issueReports" : "update");
  if (!allowed) throw new AccessError("Acesso negado à programação de Smart TV.", 403);
}
export async function getDisplayEditor(context: DisplayContext): Promise<DisplayEditorState> {
  assertDisplayAccess(context, "read");
  const database = context.database ?? db;
  const [channel, options] = await Promise.all([loadDisplayChannel(database), loadDisplayEditorOptions(database)]);
  return { revision: channel?.revision ?? 0, config: channel?.draft ?? defaultDisplayConfig(randomUUID()), publishedVersionId: channel?.publishedVersionId ?? null, ...options };
}

export async function mutateDisplay(context: DisplayContext, input: { operation: "save" | "publish" | "withdraw" | "restore"; revision: number; config?: unknown; versionId?: string }) {
  assertDisplayAccess(context, input.operation === "publish" || input.operation === "withdraw" ? "publish" : "update");
  if (input.operation === "publish") assertDisplayAccess(context, "update");
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("Revisão inválida. Recarregue a programação.");
  return withDatabaseTransaction(context.databaseConnection ?? databaseConnection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('bi-display-municipal-edit'))`);
    const channel = await loadDisplayChannel(tx);
    if ((channel?.revision ?? 0) !== input.revision) throw new Error("A programação foi alterada por outro servidor. Recarregue antes de salvar.");
    const restored = input.operation === "restore" && input.versionId ? await loadDisplayVersion(tx, input.versionId) : null;
    if (input.operation === "restore" && !restored) throw new Error("Versão não encontrada.");
    const parsed = displayConfigSchema.safeParse(input.operation === "withdraw" ? channel?.draft : restored?.config ?? input.config ?? channel?.draft);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Configuração inválida.");
    const config = parsed.data;
    const options = await loadDisplayEditorOptions(tx);
    for (const slide of input.operation === "withdraw" ? [] : config.slides) {
      if (slide.secretariatId && !options.secretariats.some(option => option.id === slide.secretariatId)) throw new Error("Secretaria não encontrada.");
      if (slide.imageId) {
        const [asset] = await tx.select({ id: biDisplayAssets.id }).from(biDisplayAssets).where(eq(biDisplayAssets.id, slide.imageId));
        if (!asset) throw new Error("Imagem não encontrada. Envie a imagem novamente.");
      }
    }
    const revision = input.revision + 1;
    if (!channel) await tx.insert(biDisplayChannels).values({ id: municipalDisplayChannel, draft: config, revision: 0, updatedBy: context.user.id });
    let publishedVersionId = channel?.publishedVersionId ?? null;
    if (input.operation === "publish") {
      const id = randomUUID();
      await tx.insert(biDisplayVersions).values({ id, channelId: municipalDisplayChannel, number: revision, config, createdBy: context.user.id });
      publishedVersionId = id;
    } else if (input.operation === "withdraw") publishedVersionId = null;
    await tx.update(biDisplayChannels).set({ draft: config, revision, publishedVersionId, updatedBy: context.user.id, updatedAt: new Date() }).where(eq(biDisplayChannels.id, municipalDisplayChannel));
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: input.operation === "publish" ? auditEventTypes.publicNoticePublished : auditEventTypes.administrativeMutation, targetType: `BI_SMARTTV_${input.operation.toUpperCase()}`, targetId: publishedVersionId ?? municipalDisplayChannel });
    return { revision, publishedVersionId, config };
  });
}

export async function getPublicDisplay(connection = databaseConnection, now = new Date()): Promise<PublicDisplay> {
  return withDatabaseTransaction(connection, async tx => {
    const identity = await loadDisplayIdentity(tx);
    // Explicit pointer, read in the same transaction as the version and snapshot.
    const channel = await loadDisplayChannel(tx);
    const version = channel?.publishedVersionId ? await loadDisplayVersion(tx, channel.publishedVersionId) : null;
    const base: PublicDisplay = { status: "empty", version: null, title: "Informações municipais", municipality: identity, footer: "Informações da administração municipal", refreshSeconds: 300, validatedAt: now.toISOString(), validUntil: new Date(now.getTime() + 30 * 60_000).toISOString(), slides: [] };
    if (!version) return base;
    const config = displayConfigSchema.parse(version.config);
    const active = config.slides.filter(slide => displaySlideIsActive(slide, now.getTime()));
    let [snapshot] = await tx.select().from(biDisplaySnapshots).where(eq(biDisplaySnapshots.versionId, version.id));
    const missingActive = () => active.some(slide => slide.kind !== "image" && (!snapshot?.datasets[slide.id] || !snapshot.datasets[slide.id].periodLabel.startsWith(displayPeriod(slide.period, now).label)));
    if (!snapshot || snapshot.expiresAt <= now || missingActive()) {
      const lock = await tx.execute<{ acquired: boolean }>(sql`SELECT pg_try_advisory_xact_lock(hashtext(${`bi-display:${version.id}`})) AS acquired`);
      if (lock.rows[0].acquired) {
        // Recheck after acquiring the lease; a competing reader may have just committed.
        [snapshot] = await tx.select().from(biDisplaySnapshots).where(eq(biDisplaySnapshots.versionId, version.id));
        if (!snapshot || snapshot.expiresAt <= now || missingActive()) {
          const datasets: Record<string, DisplayDataset> = {};
          const reused = new Map<string, DisplayDataset>();
          for (const slide of active) {
            if (slide.kind === "image") continue;
            const key = JSON.stringify([slide.metrics, slide.chart, slide.period, slide.secretariatId]);
            let dataset = reused.get(key);
            if (!dataset) { dataset = await queryDisplayDataset(tx, slide, now); reused.set(key, dataset); }
            datasets[slide.id] = dataset;
          }
          const next = { versionId: version.id, datasets, capturedAt: now, expiresAt: new Date(now.getTime() + config.refreshSeconds * 1000) };
          await tx.insert(biDisplaySnapshots).values(next).onConflictDoUpdate({ target: biDisplaySnapshots.versionId, set: next });
          snapshot = next;
        }
      }
    }
    const usable = snapshot && now.getTime() - snapshot.capturedAt.getTime() < Math.max(1800, config.refreshSeconds * 2) * 1000 ? snapshot : null;
    return {
      ...base, status: "published", version: version.id, title: config.title, footer: config.footer, refreshSeconds: config.refreshSeconds,
      municipality: { name: config.municipalityLabel || identity.name, logoUrl: identity.logoUrl },
      slides: active.map(slide => ({ id: slide.id, title: slide.title, subtitle: slide.subtitle, kind: slide.kind, duration: slide.duration, caption: slide.caption, source: slide.source, imageFit: slide.imageFit, startsAt: slide.startsAt, endsAt: slide.endsAt, chart: slide.chart,
        imageUrl: slide.imageId && (slide.kind === "image" || slide.kind === "mixed") ? `/api/public/bi/smarttv/imagens/${slide.imageId}` : null, metricOrder: slide.kind === "image" ? [] : slide.metrics,
        dataset: usable?.datasets[slide.id] ?? null, capturedAt: usable?.datasets[slide.id] ? usable.capturedAt.toISOString() : null })),
    };
  });
}

export async function previewDisplay(context: DisplayContext, input: unknown): Promise<PublicDisplay> {
  assertDisplayAccess(context, "read");
  const config = displayConfigSchema.parse(input);
  const database = context.database ?? db;
  const now = new Date();
  const identity = await loadDisplayIdentity(database);
  const slides: PublicDisplay["slides"] = [];
  for (const slide of config.slides) {
    if (slide.imageId && !(await readDisplayImage(slide.imageId, context))) throw new Error("Imagem não encontrada.");
    slides.push({ id: slide.id, title: slide.title, subtitle: slide.subtitle, kind: slide.kind, duration: slide.duration, caption: slide.caption, source: slide.source, imageFit: slide.imageFit, startsAt: slide.startsAt, endsAt: slide.endsAt, chart: slide.chart,
      imageUrl: slide.imageId ? `/api/administracao/bi/smarttv/imagens/${slide.imageId}` : null, metricOrder: slide.kind === "image" ? [] : slide.metrics,
      dataset: slide.kind === "image" ? null : await queryDisplayDataset(database, slide, now), capturedAt: now.toISOString() });
  }
  return { status: "published", version: "preview", title: config.title, municipality: { name: config.municipalityLabel || identity.name, logoUrl: identity.logoUrl }, footer: config.footer, refreshSeconds: config.refreshSeconds, validatedAt: now.toISOString(), validUntil: new Date(now.getTime() + 30 * 60_000).toISOString(), slides };
}

export async function readDisplayImage(id: string, context?: AppContext, connection = databaseConnection) {
  const database = context?.database ?? connection.db;
  if (context) assertDisplayAccess(context, "read");
  else {
    const channel = await loadDisplayChannel(database);
    const version = channel?.publishedVersionId ? await loadDisplayVersion(database, channel.publishedVersionId) : null;
    if (!version?.config.slides.some(slide => (slide.kind === "image" || slide.kind === "mixed") && slide.imageId === id && displaySlideIsActive(slide, Date.now()))) return null;
  }
  const [asset] = await database.select({ url: biDisplayAssets.url }).from(biDisplayAssets).where(eq(biDisplayAssets.id, id));
  return asset?.url ?? null;
}

export async function saveDisplayImage(context: DisplayContext, bytes: Uint8Array, name: string) {
  assertDisplayAccess(context, "update");
  const id = randomUUID();
  // Small normalized editorial images are kept in PostgreSQL; no public draft Blob URLs.
  const url = `data:image/webp;base64,${Buffer.from(bytes).toString("base64")}`;
  await withDatabaseTransaction(context.databaseConnection ?? databaseConnection, async tx => {
    await tx.insert(biDisplayAssets).values({ id, url, name: name.slice(0, 160), createdBy: context.user.id });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "BI_SMARTTV_IMAGE", targetId: id });
  });
  return { id, name: name.slice(0, 160), url: `/api/administracao/bi/smarttv/imagens/${id}` };
}
