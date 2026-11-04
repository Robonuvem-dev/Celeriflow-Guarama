import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { legalTexts, legalTextVersions } from "@/db/schema/master-data";
import { legacyLegalTextSources } from "@/db/schema/legal-documents";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import { normalizeLegalGovernmentLevel } from "@/lib/cadastros/legal-text-policy";

export type LegalTextDatabaseImportResult = {
  imported: number;
  skipped: number;
  importedIds: string[];
};

const recognizedActPatterns: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /^lei\s+org[aâ]nica\b/i, type: "Lei Orgânica" },
  { pattern: /^plano\s+plurianual\b|^ppa\b/i, type: "Plano Plurianual" },
  { pattern: /^ldo\b|^lei\s+de\s+diretrizes\s+or[cç]ament[aá]rias\b/i, type: "LDO" },
  { pattern: /^decreto\b/i, type: "Decreto" },
  { pattern: /^portaria\b/i, type: "Portaria" },
  { pattern: /^resolu[cç][aã]o\b/i, type: "Resolução" },
  { pattern: /^ato\s+normativo\b/i, type: "Ato Normativo" },
  { pattern: /^lei\b/i, type: "Lei" },
];

function parseDocumentActMetadata(title: string, documentType: string, legacyReference: string | null) {
  const combined = `${documentType} ${title}`.trim();
  const matched = recognizedActPatterns.find(item => item.pattern.test(documentType.trim()) || item.pattern.test(title.trim()));
  if (!matched) return null;
  const numberMatch = combined.match(/(?:n[º°.]?\s*)?(\d+(?:[./-]\d+)?)/i) ?? legacyReference?.match(/(\d+(?:[./-]\d+)?)/);
  const number = (numberMatch?.[1] || legacyReference?.trim() || "").slice(0, 100);
  if (!number) return null;
  return {
    type: matched.type,
    number,
    summary: title.trim() || `${matched.type} ${number}`,
  };
}

export async function syncLegalTextsFromExistingDatabase(
  tx: DatabaseTransaction,
  actorUserId: string,
  defaultIssuingBody = "Prefeitura Municipal",
): Promise<LegalTextDatabaseImportResult> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('CF33_LEGAL_TEXT_DATABASE_IMPORT'))`);
  let imported = 0;
  let skipped = 0;
  const importedIds: string[] = [];

  const hasLegacyTable = await tx.execute<{ ready: boolean }>(
    sql`SELECT to_regclass('public."LegacyLegalTextSource"') IS NOT NULL AS ready`,
  );

  if (hasLegacyTable.rows[0]?.ready) {
    const alreadyLinked = await tx.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM "LegacyLegalTextSource" WHERE "importedLegalTextId" IS NOT NULL`,
    );
    skipped += alreadyLinked.rows[0]?.count ?? 0;
    const pendingSources = await tx
      .select()
      .from(legacyLegalTextSources)
      .where(isNull(legacyLegalTextSources.importedLegalTextId))
      .orderBy(asc(legacyLegalTextSources.createdAt), asc(legacyLegalTextSources.id))
      .limit(200);

    for (const source of pendingSources) {
      const type = source.type.trim().slice(0, 120);
      const number = source.number.trim().slice(0, 100);
      const governmentLevel = normalizeLegalGovernmentLevel(source.governmentLevel.trim() || "MUNICIPAL");
      const issuingBody = (source.issuingBody.trim() || defaultIssuingBody).slice(0, 200);
      const summary = source.summary.trim();
      const content = source.content.trim();
      if (!type || !number || !summary || !content) {
        skipped++;
        continue;
      }

      const [existing] = await tx
        .select({ id: legalTexts.id })
        .from(legalTexts)
        .where(
          and(
            eq(legalTexts.type, type),
            eq(legalTexts.number, number),
            eq(legalTexts.governmentLevel, governmentLevel),
            eq(legalTexts.issuingBody, issuingBody),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(legacyLegalTextSources)
          .set({ importedLegalTextId: existing.id })
          .where(eq(legacyLegalTextSources.id, source.id));
        skipped++;
        continue;
      }

      const [created] = await tx
        .insert(legalTexts)
        .values({
          type,
          number,
          summary,
          governmentLevel,
          issuingBody,
          publicationDate: source.publicationDate,
          effectiveFrom: source.effectiveFrom,
          effectiveUntil: source.effectiveUntil,
          status: "VIGENTE",
        })
        .returning({ id: legalTexts.id });

      await tx.insert(legalTextVersions).values({
        legalTextId: created.id,
        versionNumber: 1,
        content,
        summary,
        publicationDate: source.publicationDate,
        effectiveFrom: source.effectiveFrom,
        effectiveUntil: source.effectiveUntil,
        status: "VIGENTE",
      });

      await tx
        .update(legacyLegalTextSources)
        .set({ importedLegalTextId: created.id })
        .where(eq(legacyLegalTextSources.id, source.id));

      await insertAuditEvent(tx, {
        actorUsuarioId: actorUserId,
        eventType: auditEventTypes.administrativeMutation,
        targetType: "LEGAL_TEXT_IMPORT",
        targetId: created.id,
      });

      imported++;
      importedIds.push(created.id);
    }
  }

  const hasGedTables = await tx.execute<{ ready: boolean }>(
    sql`SELECT to_regclass('public."Document"') IS NOT NULL AND to_regclass('public."GedEntry"') IS NOT NULL AS ready`,
  );

  if (hasGedTables.rows[0]?.ready) {
    const hasPageText = await tx.execute<{ ready: boolean }>(
      sql`SELECT to_regclass('public."DocumentPageText"') IS NOT NULL AS ready`,
    );
    const candidates = await tx.execute<{
      documentId: string;
      title: string;
      documentType: string;
      legacyReference: string | null;
      createdAt: Date | string | null;
      extractedText: string | null;
    }>(
      hasPageText.rows[0]?.ready
        ? sql`
            SELECT d.id AS "documentId", d.title, d."documentType", e."legacyReference", d."createdAt",
              (SELECT string_agg(p.content, E'\n' ORDER BY p."pageNumber") FROM "DocumentPageText" p WHERE p."documentId" = d.id) AS "extractedText"
            FROM "Document" d
            JOIN "GedEntry" e ON e."documentId" = d.id
            LEFT JOIN "LegalTextVersion" ltv ON ltv."documentId" = d.id
            WHERE NOT e.archived AND ltv.id IS NULL
            ORDER BY d."createdAt" ASC, d.id ASC
            LIMIT 200
          `
        : sql`
            SELECT d.id AS "documentId", d.title, d."documentType", e."legacyReference", d."createdAt", NULL::text AS "extractedText"
            FROM "Document" d
            JOIN "GedEntry" e ON e."documentId" = d.id
            LEFT JOIN "LegalTextVersion" ltv ON ltv."documentId" = d.id
            WHERE NOT e.archived AND ltv.id IS NULL
            ORDER BY d."createdAt" ASC, d.id ASC
            LIMIT 200
          `,
    );

    for (const candidate of candidates.rows) {
      const parsed = parseDocumentActMetadata(candidate.title, candidate.documentType, candidate.legacyReference);
      if (!parsed) continue;

      const governmentLevel = "MUNICIPAL";
      const issuingBody = defaultIssuingBody;
      const [existing] = await tx
        .select({ id: legalTexts.id })
        .from(legalTexts)
        .where(
          and(
            eq(legalTexts.type, parsed.type),
            eq(legalTexts.number, parsed.number),
            eq(legalTexts.governmentLevel, governmentLevel),
            eq(legalTexts.issuingBody, issuingBody),
          ),
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      const publicationDate = candidate.createdAt ? new Date(candidate.createdAt) : null;
      const content = candidate.extractedText?.trim() || parsed.summary;
      const [created] = await tx
        .insert(legalTexts)
        .values({
          type: parsed.type,
          number: parsed.number,
          summary: parsed.summary,
          governmentLevel,
          issuingBody,
          publicationDate,
          status: "VIGENTE",
        })
        .returning({ id: legalTexts.id });

      await tx.insert(legalTextVersions).values({
        legalTextId: created.id,
        versionNumber: 1,
        content,
        summary: parsed.summary,
        publicationDate,
        status: "VIGENTE",
        documentId: candidate.documentId,
      });

      await insertAuditEvent(tx, {
        actorUsuarioId: actorUserId,
        eventType: auditEventTypes.administrativeMutation,
        targetType: "LEGAL_TEXT_IMPORT",
        targetId: created.id,
      });

      imported++;
      importedIds.push(created.id);
    }
  }

  return { imported, skipped, importedIds };
}
