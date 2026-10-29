import type { ReactNode } from "react";
import { Ellipsis } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";

export function ProcessRowMenu({ label, children }: { label: string; children: ReactNode }) {
  return <Dialog><DialogTrigger className={styles.iconButton} aria-label={`Ações de ${label}`}><Ellipsis /></DialogTrigger><DialogContent className={styles.dialog}><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>Acompanhamento do processo funerário</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>;
}
