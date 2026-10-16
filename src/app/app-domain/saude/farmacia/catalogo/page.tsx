import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { saveCatmatMappingAction, saveDcbSubstanceAction, savePharmacyCatalogAction } from "./actions";
const field = "min-w-0 rounded border bg-white p-2 text-sm";
const Input = ({ name, label, value, type = "text", required = false }: { name: string; label: string; value?: string | number | null; type?: string; required?: boolean }) => <label className="grid gap-1 text-sm">{label}<input name={name} type={type} step={type === "number" ? "any" : undefined} defaultValue={value ?? ""} required={required} className={field} /></label>;

export default async function PharmacyCatalogPage({ searchParams }: { searchParams: Promise<{ q?: string; list?: string; page?: string }> }) {
  const { q = "", list = "", page: rawPage } = await searchParams;
  const context = await getTenantContextForModule("SAUDE");
  const where: Prisma.MaterialWhereInput = { isActive: true, healthProfile: { isActive: true, ...(list === "RENAME" ? { renameMember: true } : list === "REMUME" ? { remumeMember: true } : {}) }, ...(q.trim() ? { OR: [{ code: { contains: q.trim(), mode: "insensitive" } }, { name: { contains: q.trim(), mode: "insensitive" } }, { healthProfile: { catmatCode: { contains: q.trim(), mode: "insensitive" } } }] } : {}) };
  const total = await context.prisma.material.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(rawPage || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const [products, substances] = await Promise.all([
    context.prisma.material.findMany({ where, include: { medicine: true, healthProfile: { include: { dcbSubstance: true, catmatUnitMappings: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 }),
    context.prisma.healthDcbSubstance.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const query = (next: number) => `/saude/farmacia/catalogo?${new URLSearchParams({ q, list, page: String(next) })}`;
  return <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"><header className="flex flex-wrap justify-between gap-3"><h1 className="font-semibold">Catálogo farmacêutico, relações e unidades CATMAT</h1><Link href="/saude/farmacia" className="text-sm underline">Estoque e dispensação</Link></header>
    <form className="flex flex-wrap items-end gap-3"><Input name="q" label="Nome, código local ou CATMAT" value={q} /><label className="grid gap-1 text-sm">Relação<select name="list" defaultValue={list} className={field}><option value="">Todas</option><option value="RENAME">RENAME</option><option value="REMUME">REMUME</option></select></label><button className={field}>Pesquisar</button></form>
    <details className="rounded border bg-white p-3"><summary className="font-semibold">Denominações DCB e CAS por versão/fonte</summary><form action={saveDcbSubstanceAction} className="mt-3 grid gap-3 sm:grid-cols-2"><Input name="code" label="Código DCB" required /><Input name="name" label="Denominação" required /><Input name="casNumber" label="Número CAS" required /><Input name="version" label="Versão/ano da lista" required /><Input name="sourceReference" label="Documento ou referência da fonte" required /><button className={field}>Registrar denominação e fonte</button></form><div className="mt-3 max-h-64 overflow-y-auto text-sm">{substances.map(substance => <p key={substance.id}>{substance.code} · {substance.name} · CAS {substance.casNumber} · versão {substance.version} · {substance.sourceReference}</p>)}</div></details>
    <p className="text-sm">{total} produto(s) · página {page} de {Math.max(1, Math.ceil(total / 20))}</p>
    {products.map(product => {
      const profile = product.healthProfile!;
      return <details key={product.id} className="rounded border bg-white p-3"><summary className="font-semibold">{product.code} · {product.name} · estoque em {product.unitOfMeasure}{profile.catmatCode ? ` · CATMAT ${profile.catmatCode}` : ""}</summary><p className="mt-2 text-sm">Princípio ativo: {product.medicine?.activePrinciple || "Não informado"} · apresentação: {profile.packaging || product.medicine?.presentation || "Não informada"}</p>
        <form action={savePharmacyCatalogAction} className="mt-3 grid gap-3 sm:grid-cols-2"><input type="hidden" name="materialId" value={product.id} /><Input name="catmatCode" label="Código CATMAT" value={profile.catmatCode} /><Input name="supplyUnitCode" label="Unidade de fornecimento" value={profile.supplyUnitCode} /><Input name="stockUnitsPerSupply" label="Unidades de estoque por unidade fornecida" type="number" required value={profile.stockUnitsPerSupply} />
          <label className="grid gap-1 text-sm">Componente farmacêutico<select name="pharmaceuticalComponent" defaultValue={profile.pharmaceuticalComponent || ""} className={field}><option value="">Não classificado</option><option value="BASIC">Básico</option><option value="SPECIALIZED">Especializado</option><option value="STRATEGIC">Estratégico</option></select></label>
          <label className="flex items-center gap-2 text-sm"><input name="renameMember" type="checkbox" defaultChecked={profile.renameMember} />Integra a RENAME</label><Input name="renameReference" label="Versão/referência RENAME" value={profile.renameReference} />
          <label className="flex items-center gap-2 text-sm"><input name="remumeMember" type="checkbox" defaultChecked={profile.remumeMember} />Integra a REMUME</label><Input name="remumeReference" label="Versão/referência REMUME" value={profile.remumeReference} />
          <label className="grid gap-1 text-sm">Substância DCB/CAS<select name="dcbSubstanceId" defaultValue={profile.dcbSubstanceId || ""} className={field}><option value="">Sem vínculo</option>{substances.map(substance => <option key={substance.id} value={substance.id}>{substance.code} · {substance.name} · {substance.casNumber} · {substance.version}</option>)}</select></label>
          <label className="grid gap-1 text-sm">Recomendação incluída no receituário<textarea name="prescriptionRecommendation" defaultValue={profile.prescriptionRecommendation || ""} className={field} /></label><button className={field}>Salvar classificação do produto</button>
        </form>
        <h2 className="mt-4 text-sm font-semibold">Equivalências de unidade CATMAT</h2>{profile.catmatUnitMappings.filter(mapping => mapping.isActive).map(mapping => <p key={mapping.id} className="text-sm">1 {mapping.officialUnitCode} = {mapping.localUnitsPerOfficial} {mapping.localUnitCode} · {mapping.reference}</p>)}
        <form action={saveCatmatMappingAction} className="mt-2 grid gap-3 sm:grid-cols-2"><input type="hidden" name="materialId" value={product.id} /><input type="hidden" name="localUnitCode" value={product.unitOfMeasure} /><Input name="officialUnitCode" label="Código da unidade oficial CATMAT" required /><Input name="localUnitsPerOfficial" label={`Quantidade em ${product.unitOfMeasure} por unidade oficial`} type="number" required /><Input name="reference" label="Referência da equivalência" required /><button className={field}>Salvar equivalência</button></form>
      </details>;
    })}
    <nav className="flex gap-4 text-sm">{page > 1 && <Link href={query(page - 1)} className="underline">Anterior</Link>}{page * 20 < total && <Link href={query(page + 1)} className="underline">Próxima</Link>}</nav>
  </div>;
}
