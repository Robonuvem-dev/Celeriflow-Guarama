import type { Metadata } from "next";
import DisplayPlayer from "@/components/bi/DisplayPlayer";
import { getPublicDisplay } from "@/lib/bi/display-service";
import type { PublicDisplay } from "@/lib/bi/display-model";
import styles from "@/components/bi/display-player.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Smart TV | Informações municipais", robots: { index: false, follow: false } };
export default async function SmartTvPage() {
  let initial: PublicDisplay;
  try { initial = await getPublicDisplay(); }
  catch {
    const now = new Date();
    initial = { status: "empty", version: null, title: "Informações municipais", municipality: { name: "Prefeitura Municipal", logoUrl: null }, footer: "Aguardando conexão com a programação", refreshSeconds: 300, validatedAt: now.toISOString(), validUntil: now.toISOString(), slides: [] };
  }
  return <div className={styles.viewport}><DisplayPlayer initial={initial} /></div>;
}
