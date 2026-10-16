import { FleetProviderForm } from "./FleetProviderForm";

export default function FleetProviderPage() { return <main className="mx-auto max-w-2xl space-y-5 px-4 py-10"><h1 className="text-3xl font-bold">Frota — atendimento do posto e oficina</h1><p className="text-sm leading-6 text-slate-600">Área específica da Frota. Informe a autorização, seu CNPJ credenciado e o código privado entregue pelo responsável. O acesso não permite consultar outros veículos, dados de condutores ou ordens.</p><FleetProviderForm /></main>; }
