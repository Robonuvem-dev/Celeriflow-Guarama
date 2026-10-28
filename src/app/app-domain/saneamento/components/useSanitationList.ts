"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SanitationPagination } from "@/lib/saneamento/list-query";

export function useSanitationList({ query, total }: SanitationPagination) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pendingParams = useRef(params.toString());
  const [pending, startTransition] = useTransition();

  useEffect(() => { pendingParams.current = params.toString(); }, [params]);

  const navigate = useCallback((changes: Record<string, string>) => {
    const next = new URLSearchParams(pendingParams.current);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    const serialized = next.toString();
    if (serialized === pendingParams.current) return;
    pendingParams.current = serialized;
    startTransition(() => router.replace(`${pathname}?${serialized}`, { scroll: false }));
  }, [pathname, router]);

  return {
    pending, query, total,
    setPage: (page: number) => navigate({ page: String(page) }),
    filter: (values: Record<string, string>) => navigate({ ...values, page: "1" }),
  };
}
