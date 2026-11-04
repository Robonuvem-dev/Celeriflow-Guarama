import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { socialWorkflowRevisions } from "@/db/schema/social-workflows";
import { readSocialWorkflow } from "@/db/repositories/social/workflow-queries";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { socialWorkflowAreas, type SocialWorkflowArea } from "@/lib/social/workflow-contract";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { SocialHistoryTable } from "./SocialHistoryTable";
import { PageFrame } from "@/components/app-ui/PageFrame";
export default async function SocialHistoryPage({ params }: { params: Promise<{ area: string; id: string }> }) {
  const { area, id } = await params;
  if (!Object.hasOwn(socialWorkflowAreas, area)) notFound();
  const context = await getTenantContextForModule("SOCIAL"), access = await resolveSocialAccess(context), database = context.database ?? db;
  const current = (await readSocialWorkflow(database, access, area as SocialWorkflowArea)).rows.find(row => row.id === id);
  if (!current) notFound();
  const rows = await database.select().from(socialWorkflowRevisions).where(and(eq(socialWorkflowRevisions.area, area), eq(socialWorkflowRevisions.recordId, id))).orderBy(desc(socialWorkflowRevisions.createdAt));
  return <PageFrame className="space-y-3 p-3"><h1 className="text-xl font-semibold">Histórico — {current.title}</h1><Link href={`/social/gestao/${area}`}>Voltar</Link><p className="text-sm">Revisões preservadas a partir da implantação deste histórico. Dados anteriores permanecem no cadastro e na auditoria existente.</p><OperationalTablePanel title="Revisões do registro"><SocialHistoryTable rows={rows.map(row => ({ id: row.id, date: row.createdAt.toISOString(), actor: row.actorId, values: Object.entries(row.values).map(([key, value]) => `${key}: ${value}`).join("\n") }))} /></OperationalTablePanel></PageFrame>;
}
