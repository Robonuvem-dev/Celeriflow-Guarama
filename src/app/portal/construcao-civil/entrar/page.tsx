import { PortalLoginCard } from "@/components/auth/PortalLoginCard";
export default async function ConstructionLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const { returnTo } = await searchParams;
  let destination = "/portal/construcao-civil";
  if (returnTo?.startsWith("/") && !returnTo.includes("\\") && URL.canParse(returnTo, "https://portal.invalid")) {
    const url = new URL(returnTo, "https://portal.invalid");
    const reserved = ["/portal/construcao-civil/entrar", "/portal/construcao-civil/autorizacoes", "/portal/construcao-civil/pedidos-administrativos"];
    if (url.origin === "https://portal.invalid" && (url.pathname === "/portal/construcao-civil" || url.pathname.startsWith("/portal/construcao-civil/")) && !reserved.includes(url.pathname)) destination = url.pathname + url.search;
  }
  return <main className="flex justify-center bg-slate-50 px-4 py-12"><PortalLoginCard audience="citizen" destination={destination} sessionEndpoint="/api/auth/construcao-civil/session" /></main>;
}
