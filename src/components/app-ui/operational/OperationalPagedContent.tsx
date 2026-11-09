"use client";

import { useId, type ReactNode } from "react";
import type { OperationalDevice } from "@/lib/operational-devices";
import styles from "./operational.module.css";

const gutter = 4;

/** Standard vertical scrolling container for operational pages and dialogs across all devices. */
export function OperationalPagedContent({ children, device, label = "Conteúdo", footer }: {
  children: ReactNode; device?: OperationalDevice; label?: string; footer?: ReactNode;
}) {
  const id = useId();

  return <div data-operational-paged-content data-reading-mode="scroll" data-device={device}
    style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0, gap: 12 }}>
    <div id={id} data-operational-content-viewport role="region" aria-label={label}
      style={{ flex: "1 1 auto", minHeight: 0, minWidth: 0, overflowX: "auto", overflowY: "auto", overscrollBehavior: "contain" }}>
      <div className={styles.filterContent} data-operational-content-body style={{ display: "flow-root", padding: gutter, minWidth: 0 }}>{children}</div>
    </div>
    {footer && <footer className={styles.dialogFooter} data-operational-content-footer style={{ flex: "0 0 auto" }}>
      {footer}
    </footer>}
  </div>;
}
