import { planningReportResponse, planningReportSnapshotResponse } from "@/lib/planejamento/report-response";
export const runtime = "nodejs";
export async function GET(request: Request) { return planningReportResponse(request, "LEGISLATIVE"); }
export async function POST(request: Request) { return planningReportSnapshotResponse(request, "LEGISLATIVE"); }
