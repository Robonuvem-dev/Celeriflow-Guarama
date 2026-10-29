import { getPlanningContext } from "@/lib/planejamento/access";
import { CamaraPlanningLayoutShell } from "./CamaraPlanningLayoutShell";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await getPlanningContext("LEGISLATIVE");
  return <CamaraPlanningLayoutShell>{children}</CamaraPlanningLayoutShell>;
}
