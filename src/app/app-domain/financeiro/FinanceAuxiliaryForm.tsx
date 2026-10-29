"use client";

import type { ReactNode } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";

/** Keep the complete auxiliary form mounted, including its unsaved distribution rows. */
export default function FinanceAuxiliaryForm({ title, children }: { title: string; children: ReactNode }) {
  return <Dialog>
    <OperationalHeaderActions><DialogTrigger className={styles.dialogButton}>{title}</DialogTrigger></OperationalHeaderActions>
    <DialogPortal keepMounted><DialogOverlay />
    <DialogPrimitive.Popup className="fixed inset-0 z-50 m-auto max-h-[90dvh] w-[min(70rem,95vw)] overflow-auto rounded-lg border bg-white p-3 data-closed:hidden">
      <div className="flex items-center justify-between gap-3"><DialogTitle>{title}</DialogTitle><DialogClose className={styles.dialogButton}>Fechar</DialogClose></div>
      {children}
    </DialogPrimitive.Popup></DialogPortal>
  </Dialog>;
}
