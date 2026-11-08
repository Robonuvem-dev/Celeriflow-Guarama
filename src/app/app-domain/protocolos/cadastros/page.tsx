import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "@/db/client";
import { processReferenceCatalog } from "@/db/schema/process-reference-catalog";
import { processSubjects } from "@/db/schema/processes";
import { getProtocolContext } from "@/lib/protocols/access";
import { processReferenceKinds } from "@/lib/protocols/reference-catalog";
import ProcessReferenceClient from "./ProcessReferenceClient";

export const dynamic = "force-dynamic";

export default async function ProcessReferencePage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const context = await getProtocolContext();
  const database = context.database ?? db;
  const query = await searchParams;
  const kind = query.kind && Object.hasOwn(processReferenceKinds, query.kind)
    ? (query.kind as keyof typeof processReferenceKinds)
    : "SUBJECT_CHILD";
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";

  const [records, subjects] = await Promise.all([
    database
      .select()
      .from(processReferenceCatalog)
      .where(
        and(
          eq(processReferenceCatalog.kind, kind),
          q ? ilike(processReferenceCatalog.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
        ),
      )
      .orderBy(asc(processReferenceCatalog.name)),
    database
      .select({ id: processSubjects.id, name: processSubjects.name })
      .from(processSubjects)
      .orderBy(asc(processSubjects.name)),
  ]);

  return (
    <ProcessReferenceClient
      records={records}
      subjects={subjects}
      currentKind={kind}
      searchQuery={q}
      canCreate={context.protocolAccess.canCreate}
      canUpdate={context.protocolAccess.canUpdate}
    />
  );
}
