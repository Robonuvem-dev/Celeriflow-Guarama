import { PlanningCatalogPage } from "@/components/app-ui/planejamento/PlanningCatalogPage";

export default async function Page({ params, searchParams }: {
  params: Promise<{ catalog: string }>; searchParams: Promise<{ page?: string; q?: string }>;
}) {
  return <PlanningCatalogPage jurisdiction="EXECUTIVE" catalog={(await params).catalog} filters={await searchParams} />;
}
