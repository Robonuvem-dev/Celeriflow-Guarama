import { db } from "@/db/client";
import { and, desc, eq, gt, inArray, lte } from "drizzle-orm";
import { portalServiceNotices } from "@/db/schema/portal-services";
import { ServiceNoticePopup } from "./ServiceNoticePopup";

export async function ServiceNotices({ authenticated = false }: { authenticated?: boolean }) {
  const now = new Date(), notices = await db.select({ id: portalServiceNotices.id, title: portalServiceNotices.title, text: portalServiceNotices.text, popup: portalServiceNotices.popup }).from(portalServiceNotices).where(and(eq(portalServiceNotices.active, true), lte(portalServiceNotices.startsAt, now), gt(portalServiceNotices.endsAt, now), inArray(portalServiceNotices.audience, authenticated ? ["PUBLICO", "LOGADO"] : ["PUBLICO"]))).orderBy(desc(portalServiceNotices.startsAt));
  return <>{notices.filter((item) => !item.popup).map((item) => <aside key={item.id} className="rounded-lg border border-sky-200 bg-sky-50 p-4"><h2 className="text-sm font-bold text-sky-900">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-900">{item.text}</p></aside>)}{notices.filter((item) => item.popup).map((item) => <ServiceNoticePopup key={item.id} notice={item} />)}</>;
}
