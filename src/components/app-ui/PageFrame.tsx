"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { useOptionalOperationalWorkspace } from "./operational/OperationalContext";

export function PageFrame({ className, ...props }: ComponentProps<"div">) {
  const operational = useOptionalOperationalWorkspace();
  return (
    <div
      className={cn(operational ? "flex min-h-0 min-w-0 w-full flex-1 flex-col" : "mx-auto w-full max-w-[1600px] animate-in fade-in slide-in-from-bottom-4 duration-500", className, operational && "m-0! max-w-none! gap-0! space-y-0! overflow-visible! p-0!")}
      {...props}
    />
  );
}
