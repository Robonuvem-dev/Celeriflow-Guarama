import Link from "next/link";
import { Lightbulb, ClipboardCheck } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export default function LightingPage() {
  return <PageFrame className="space-y-2 px-1 py-1 md:px-2">
    <PageHeader title="Iluminação Pública (Iluminaflow)" icon={<Lightbulb className="size-4 text-yellow-600" />} />
    <div className="grid gap-3 md:grid-cols-2">
      <Link href="/iluminacao-publica/iluminacao-energia" className="rounded-lg border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"><Lightbulb className="mb-3 h-7 w-7 text-yellow-600" /><h2 className="font-semibold">Iluminação Pública</h2><p className="mt-1 text-xs text-slate-500">Serviços de iluminação e vínculos operacionais.</p></Link>
      <Link href="/iluminacao-publica/ordens-servico" className="rounded-lg border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800"><ClipboardCheck className="mb-3 h-7 w-7 text-indigo-600" /><h2 className="font-semibold">Ordens de Serviço</h2><p className="mt-1 text-xs text-slate-500">Execução, equipes, materiais e documentos vinculados.</p></Link>
    </div>
  </PageFrame>;
}
