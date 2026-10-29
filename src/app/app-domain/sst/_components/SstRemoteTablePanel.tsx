"use client";

import Link from "next/link";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { usePanelPage, type PanelPage, type PanelReply, type PanelRow } from "./usePanelPage";

export function SstRemoteTablePanel({ title, triggerLabel, description, columns, initial, loadPageAction, preferenceId, emptyMessage }: {
  title: string; triggerLabel?: string; description?: string; columns: OperationalColumn[];
  initial: PanelPage<PanelRow>; loadPageAction: (page: number) => Promise<PanelReply<PanelRow>>;
  preferenceId: string; emptyMessage?: string;
}) {
  const { data, pending, error, changePage, retry } = usePanelPage(initial, loadPageAction);
  return <OperationalTablePanel title={title} triggerLabel={triggerLabel} description={description}>
    <OperationalListFrame label={title} pagination={<OperationalPagination page={data.page} total={data.total} pending={pending} onPageChange={page => void changePage(page)} />}>
      <OperationalTable columns={columns} preferenceId={preferenceId} caption={title} emptyMessage={emptyMessage} state={error ? "error" : "ready"} errorMessage={error} onRetry={retry}
        rows={data.rows.map(row => ({ ...row, actions: row.links?.map(link => <Link key={`${link.href}:${link.label}`} href={link.href}>{link.label}</Link>) }))} />
    </OperationalListFrame>
  </OperationalTablePanel>;
}
