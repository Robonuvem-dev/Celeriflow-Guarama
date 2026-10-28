"use client";

import { useEffect } from "react";
import { UnitsListState } from "./UnitsListState";

export default function UnitsError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  useEffect(() => { console.error("Falha na listagem de unidades consumidoras:", error); }, [error]);
  return <UnitsListState state="error" onRetry={unstable_retry} />;
}
