import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";

export function LegislativeRecordMenu({ label, children }: { label: string; children: ReactNode }) {
  return <Dialog><DialogTrigger className={styles.iconButton} aria-label={`Ver registro ${label}`}><Ellipsis /></DialogTrigger><DialogContent className={styles.dialog}><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>Dados do registro legislativo</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
