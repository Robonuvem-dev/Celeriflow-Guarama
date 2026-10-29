import Link from "next/link";
import { Plus } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";

export function RhNewLink({ href, children }: { href: string; children: string }) {
  return <Link href={href} className={styles.newButton} aria-label={children} title={children}><Plus aria-hidden="true" /><span className={styles.newLabel}>{children}</span></Link>;
}
