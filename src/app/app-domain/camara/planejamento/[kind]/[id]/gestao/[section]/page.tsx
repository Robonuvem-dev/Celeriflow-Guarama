import { PlanningManagementPage } from "@/components/app-ui/planejamento/PlanningManagementPage";
export default async function Page({ params, searchParams }: { params: Promise<{ kind: string; id: string; section: string }>; searchParams: Promise<{ page?: string; linePage?: string; quotaPage?: string; legacyPage?: string; targetId?: string; year?: string; creditId?: string }> }) {
  const { kind, id, section } = await params;
  return <PlanningManagementPage jurisdiction="LEGISLATIVE" kind={kind} id={decodeURIComponent(id)} section={section} filters={await searchParams} />;
}
