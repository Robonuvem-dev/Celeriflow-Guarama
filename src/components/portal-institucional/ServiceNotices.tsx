import { prisma } from "@/lib/prisma";
import { ServiceNoticePopup } from "./ServiceNoticePopup";

export async function ServiceNotices({ authenticated = false }: { authenticated?: boolean }) {
  const now = new Date(), notices = await prisma.portalServiceNotice.findMany({ where: { active: true, startsAt: { lte: now }, endsAt: { gt: now }, audience: { in: authenticated ? ["PUBLICO", "LOGADO"] : ["PUBLICO"] } }, orderBy: { startsAt: "desc" }, select: { id: true, title: true, text: true, popup: true } });
  return <>{notices.filter((item) => !item.popup).map((item) => <aside key={item.id} className="rounded-lg border border-sky-200 bg-sky-50 p-4"><h2 className="text-sm font-bold text-sky-900">{item.title}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-sky-900">{item.text}</p></aside>)}{notices.filter((item) => item.popup).map((item) => <ServiceNoticePopup key={item.id} notice={item} />)}</>;
}
