"use server"

import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { readFinanceDashboardStats } from "@/db/repositories/platform/finance-dashboard";

export async function getFinanceiroDashboardStats(month: string, year: string) {
  const context = await getTenantContextForModule("FINANCEIRO");
  let range: { from: Date; to: Date } | undefined;
  
  if (month && year) {
    const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1)
    const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999)
    range = { from: startOfMonth, to: endOfMonth };
  } else if (year) {
    const startOfYear = new Date(parseInt(year), 0, 1)
    const endOfYear = new Date(parseInt(year), 11, 31, 23, 59, 59, 999)
    range = { from: startOfYear, to: endOfYear };
  } else if (month) {
    // If only month is provided, assume current year
    const currentYear = new Date().getFullYear()
    const startOfMonth = new Date(currentYear, parseInt(month) - 1, 1)
    const endOfMonth = new Date(currentYear, parseInt(month), 0, 23, 59, 59, 999)
    range = { from: startOfMonth, to: endOfMonth };
  }

  return readFinanceDashboardStats(context.database ?? db, range);
}
