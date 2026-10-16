import Link from "next/link";
import { planningNavigation } from "@/lib/planejamento/navigation";
import { getPlanningContext } from "@/lib/planejamento/access";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await getPlanningContext("LEGISLATIVE");
  return <div className="space-y-2">
    <nav aria-label="Áreas do Planejamento da Câmara" className="flex flex-wrap gap-1 rounded-lg border bg-card p-2 text-xs">
      <Link href="/camara" className="rounded px-2 py-1 text-purple-700 hover:bg-accent">Câmara Municipal</Link>
      {planningNavigation("LEGISLATIVE").flatMap((group) => group.items).map((item) => <Link key={item.href} href={item.href} className="rounded px-2 py-1 hover:bg-accent">{item.title}</Link>)}
    </nav>
    {children}
  </div>;
}
