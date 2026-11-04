import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getGedContext } from "@/lib/documents/ged-access";
import { readGedAdministration, readGedExtras, requireGedConfiguration } from "@/lib/documents/ged-governance";
import { readGedPersonal } from "@/lib/documents/ged-operations";
import { readGedFlows } from "@/lib/documents/ged-workflow";
import { requireGedObject } from "@/lib/documents/ged-access";
import { gedEntryScope } from "@/lib/documents/ged-access";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const context = await getGedContext(); const database = context.database ?? db; const params = new URL(request.url).searchParams;
    const section = params.get("section"); let result: unknown;
    if (section === "administration") result = await readGedAdministration(context);
    else if (section === "access-explanation") {
      const { explainGedObjectAccess } = await import("@/lib/documents/ged-access-explanation");
      result = await explainGedObjectAccess(context, { kind: params.get("kind") ?? "document", id: params.get("id") ?? "", userId: params.get("userId") ?? "", operation: params.get("operation") ?? "read" });
    }
    else if (section === "jobs") {
      requireGedConfiguration(context);
      const status = z.enum(["", "PENDING", "RUNNING", "SUCCEEDED", "FAILED"]).parse(params.get("status") ?? "");
      const from = sql`FROM "GedProcessingJob" j JOIN "DocumentVersion" v ON v.id=j."versionId" JOIN "Document" d ON d.id=v."documentId" JOIN "GedEntry" e ON e."documentId"=d.id WHERE ${gedEntryScope(context)} ${status ? sql`AND j.status=${status}` : sql``}`;
      const count = await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total ${from}`); const total = count.rows[0].total;
      const page = Math.max(1, Math.min(z.coerce.number().int().min(1).parse(params.get("page") || 1), Math.max(1, Math.ceil(total / 20))));
      const rows = await database.execute(sql`SELECT j.id,j.status,j.attempts,j.error,j.steps,j."nextAttemptAt",d.title,v."versionNumber" ${from} ORDER BY j."updatedAt" DESC,j.id LIMIT 20 OFFSET ${(page - 1) * 20}`);
      result = { rows: rows.rows, total, page };
    }
    else if (section === "document") result = await readGedExtras(context, params.get("id") || "");
    else if (section === "personal") result = await readGedPersonal(context, params.get("from") || new Date(Date.now() - 31 * 86400000).toISOString(), params.get("to") || new Date(Date.now() + 31 * 86400000).toISOString());
    else if (section === "flows") result = await readGedFlows(context, params.get("id") || undefined);
    else if (section === "rules") { requireGedConfiguration(context); result = (await database.execute(sql`SELECT * FROM "GedRule" ORDER BY name`)).rows; }
    else if (section === "acl" || section === "acl-state") {
      const kind = params.get("kind") === "folder" ? "folder" : "document"; const id = params.get("id") || "";
      await requireGedObject(context, kind, id, "share");
      if (section === "acl-state") result = (await database.execute<{ inherit: boolean }>(kind === "folder" ? sql`SELECT "inheritAccess" AS inherit FROM "GedFolderAccess" WHERE "folderId"=${id}` : sql`SELECT coalesce(m."inheritAccess",true) AS inherit FROM "GedEntry" e LEFT JOIN "GedMetadata" m ON m."documentId"=e."documentId" WHERE e."documentId"=${id}`)).rows[0];
      else result = (await database.execute(sql`SELECT principal,"principalId",operation,effect FROM "GedAcl" WHERE kind=${kind} AND "objectId"=${id}`)).rows;
    } else throw new Error("Consulta desconhecida.");
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error && !/query|constraint|postgres|https?:\/\//i.test(error.message) ? error.message : "Não foi possível consultar a gestão documental." }, { status: 400 }); }
}
