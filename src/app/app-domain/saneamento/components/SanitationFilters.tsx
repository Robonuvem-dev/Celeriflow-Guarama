"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { SanitationListQuery } from "@/lib/saneamento/list-query";

export function SanitationFilters({ query, onFilter, placeholder, filters = [], children }: {
  query: SanitationListQuery;
  onFilter: (values: Record<string, string>) => void;
  placeholder: string;
  filters?: { name: "status" | "category" | "type" | "year" | "month"; label: string; options: (string | { value: string; label: string })[]; required?: boolean }[];
  children?: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/50">
    <form className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" onSubmit={(event) => {
      event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      const data = new FormData(event.currentTarget);
      onFilter(Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)])));
    }}>
      <div className="relative min-w-36 flex-1 sm:max-w-64">
        <Search className="absolute left-2 top-2.5 size-3.5 text-gray-400" />
        <input key={query.q} name="q" type="search" aria-label={placeholder} placeholder={placeholder} defaultValue={query.q}
          className="h-8 w-full min-w-0 rounded-md border bg-white pl-7 pr-2 text-xs dark:bg-gray-900"
          onChange={(event) => {
            if (timer.current) clearTimeout(timer.current);
            const form = event.currentTarget.form;
            timer.current = setTimeout(() => form?.requestSubmit(), 350);
          }} />
      </div>
      {filters.map((filter) => <select key={`${filter.name}:${query[filter.name]}`} name={filter.name} aria-label={filter.label} defaultValue={query[filter.name]}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-8 min-w-0 max-w-40 rounded-md border bg-white px-2 text-xs dark:bg-gray-900">
        {!filter.required && <option value="">{filter.label}</option>}
        {filter.options.map((option) => typeof option === "string" ? <option key={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>)}
    </form>
    <div className="flex shrink-0 items-center gap-2">{children}</div>
  </div>;
}
