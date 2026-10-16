import { PortalLoginCard } from "@/components/auth/PortalLoginCard";
export default function ConstructionLoginPage() {
  return <main className="flex justify-center bg-slate-50 px-4 py-12"><PortalLoginCard audience="citizen" destination="/portal/construcao-civil" sessionEndpoint="/api/auth/construcao-civil/session" /></main>;
}
