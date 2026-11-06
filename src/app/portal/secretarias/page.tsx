import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Clock, Mail, MapPin, Phone, User, CheckCircle2 } from "lucide-react";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";
import { MUNICIPALITY_INSTITUTION_NAME } from "@/lib/municipality-identity";
import { db } from "@/db/client";
import { listSecretariatDetails, listDepartmentDetails, listUnitDetails } from "@/db/repositories/administration/queries";
import { getInstitutionalContact } from "@/lib/portal-institucional/public-content";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";

export const metadata: Metadata = {
  title: `Secretarias e Estrutura Organizacional | ${MUNICIPALITY_INSTITUTION_NAME}`,
  description: `Estrutura administrativa, secretarias, competências, contatos e horários de atendimento de ${MUNICIPALITY_INSTITUTION_NAME}.`,
};

export const dynamic = "force-dynamic";

const SECRETARIAS_BASE_COMPETENCIAS: Record<string, { competencias: string[]; horario?: string }> = {
  saude: {
    competencias: [
      "Planejar, coordenar e executar a política municipal de saúde pública.",
      "Gestão da atenção primária à saúde, unidades básicas e programas da Estratégia de Saúde da Família (ESF).",
      "Executar ações de vigilância sanitária, epidemiológica, nutricional e saúde do trabalhador.",
      "Gerir a assistência farmacêutica municipal e insumos de saúde.",
      "Articular regulação de consultas especializadas, exames e transferências intermunicipais.",
    ],
    horario: "Segunda a Sexta, das 07h00 às 17h00 (Atendimento contínuo)",
  },
  educacao: {
    competencias: [
      "Planejar, coordenar e executar as diretrizes da educação infantil e ensino fundamental.",
      "Administrar e fiscalizar a rede municipal de ensino, creches e centros de educação infantil.",
      "Coordenar o transporte escolar e a merenda escolar segundo as normas do PNAE.",
      "Promover a formação continuada do corpo docente e suporte psicopedagógico aos estudantes.",
    ],
    horario: "Segunda a Sexta, das 07h30 às 11h30 e das 13h00 às 17h00",
  },
  "assistencia-social": {
    competencias: [
      "Executar a política municipal de assistência e desenvolvimento social segundo o SUAS.",
      "Gerir os serviços do CRAS, CREAS e acolhimento institucional de famílias e indivíduos em vulnerabilidade.",
      "Operacionalizar o Cadastro Único (CadÚnico) e programas municipais e federais de transferência de renda.",
      "Coordenar as ações do Conselho Municipal de Assistência Social e proteção à criança, adolescente e idoso.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  administracao: {
    competencias: [
      "Gerir a política de gestão de pessoas, concursos, admissões, folha de pagamento e capacitação de servidores.",
      "Coordenar o patrimônio imobiliário e mobiliário, almoxarifado central e suprimentos municipais.",
      "Gerir o protocolo geral, arquivos públicos, tramitação de processos e atendimento ao cidadão.",
      "Promover a modernização administrativa, governança e tecnologia da informação municipal.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  financas: {
    competencias: [
      "Gerir a arrecadação tributária municipal, IPTU, ISSQN, taxas e fiscalização tributária.",
      "Executar a contabilidade pública, tesouraria, pagamentos e conciliação bancária.",
      "Controlar a dívida ativa municipal e a execução orçamentária em conformidade com a LRF.",
      "Elaborar balancetes e relatórios da Lei de Responsabilidade Fiscal (RREO e RGF).",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  obras: {
    competencias: [
      "Executar e fiscalizar obras civis públicas, pavimentação e infraestrutura urbana.",
      "Gerir a manutenção e conservação das vias públicas urbanas e estradas rurais do município.",
      "Coordenar os serviços de iluminação pública, trânsito municipal e sinalização viária.",
      "Administrar e prestar manutenção preventiva e corretiva à frota municipal de máquinas e veículos pesados.",
    ],
    horario: "Segunda a Sexta, das 07h00 às 11h00 e das 12h30 às 16h30",
  },
  agricultura: {
    competencias: [
      "Fomentar a agricultura familiar, cafeicultura, bacia leiteira e cadeias produtivas agropecuárias.",
      "Prestar serviços de assistência técnica rural, maquinário agrícola e patrulha mecanizada ao produtor.",
      "Coordenar programas de feiras do produtor, abastecimento alimentar e incentivo ao agroturismo.",
      "Desenvolver projetos de conservação de solos, recursos hídricos e recuperação de pastagens.",
    ],
    horario: "Segunda a Sexta, das 07h30 às 11h30 e das 13h00 às 17h00",
  },
  "meio-ambiente": {
    competencias: [
      "Gerir a política de preservação e licenciamento ambiental no âmbito das competências municipais.",
      "Fiscalizar o cumprimento da legislação ambiental, áreas de preservação permanente (APP) e recursos hídricos.",
      "Coordenar o saneamento básico, gestão e destinação correta dos resíduos sólidos e coleta seletiva.",
      "Promover programas de educação ambiental e arborização urbana.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  cultura: {
    competencias: [
      "Preservar e valorizar o patrimônio histórico, artístico e cultural material e imaterial do município.",
      "Organizar o calendário oficial de eventos culturais, artísticos e festividades tradicionais locais.",
      "Fomentar a produção cultural local, oficinas artísticas e aplicação de leis de incentivo à cultura.",
      "Administrar espaços culturais municipais, bibliotecas, teatros e centros de memória.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  esportes: {
    competencias: [
      "Promover a prática de atividades físicas, esporte educacional e lazer para a população de todas as faixas etárias.",
      "Organizar campeonatos municipais, jogos escolares e eventos esportivos locais e regionais.",
      "Administrar e conservar praças esportivas, ginásios municipais, quadras e campos de futebol comunitários.",
      "Apoiar atletas do município em competições regionais e estaduais.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  turismo: {
    competencias: [
      "Elaborar e implementar o Plano Municipal de Turismo e atração de investimentos para o setor.",
      "Fomentar o ecoturismo, turismo de montanha, gastronômico, rural e de aventura.",
      "Estruturar os pontos turísticos municipais, centros de atendimento ao turista e sinalização turística.",
      "Representar o município em consórcios e circuitos turísticos regionais e estaduais.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  planejamento: {
    competencias: [
      "Coordenar a elaboração, acompanhamento e revisão dos instrumentos de planejamento governamental: PPA, LDO e LOA.",
      "Acompanhar o cumprimento das metas fiscais, projetos estratégicos municipais e captação de recursos externos.",
      "Coordenar a gestão de convênios federais e estaduais e plataformas de transferências de recursos.",
      "Prestar assessoramento técnico ao Chefe do Poder Executivo na tomada de decisões estratégicas.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
  gabinete: {
    competencias: [
      "Assessorar diretamente o(a) Prefeito(a) Municipal em sua representação política, social e administrativa.",
      "Coordenar a agenda oficial, audiências, relações institucionais com os demais poderes e esferas governamentais.",
      "Supervisionar a redação e expedição de correspondências oficiais e mensagens ao Poder Legislativo.",
      "Apoiar a comunicação social oficial e articulação comunitária.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 12h00 e das 13h00 às 17h00",
  },
  "controle-interno": {
    competencias: [
      "Exercer a fiscalização contábil, financeira, orçamentária, operacional e patrimonial quanto à legalidade e legitimidade.",
      "Avaliar o cumprimento das metas previstas no plano plurianual e a execução dos programas de governo.",
      "Apoiar o controle externo do Tribunal de Contas no exercício de sua missão institucional.",
      "Zelar pela transparência pública, integridade administrativa e cumprimento da Lei de Responsabilidade Fiscal.",
    ],
    horario: "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00",
  },
};

const DEFAULT_SECRETARIAS = [
  { id: "gabinete", name: "Gabinete do Prefeito", acronym: "GAPRE", description: "Assessoramento direto ao Chefe do Poder Executivo, relações institucionais e articulação política." },
  { id: "controle-interno", name: "Controladoria e Controle Interno", acronym: "CGM", description: "Auditoria, transparência, integridade administrativa e conformidade legal com os órgãos de controle." },
  { id: "administracao", name: "Secretaria Municipal de Administração", acronym: "SMA", description: "Gestão de pessoas, patrimônio, suprimentos, protocolos, arquivo e atendimento ao cidadão." },
  { id: "financas", name: "Secretaria Municipal de Finanças e Tributação", acronym: "SMF", description: "Tributos, arrecadação, contabilidade pública, tesouraria e execução orçamentária." },
  { id: "planejamento", name: "Secretaria Municipal de Planejamento e Gestão", acronym: "SEPLAN", description: "Planejamento orçamentário (PPA, LDO, LOA), projetos estratégicos e captação de recursos." },
  { id: "saude", name: "Secretaria Municipal de Saúde", acronym: "SMS", description: "Atenção primária, vigilância em saúde, assistência farmacêutica e regulação assistencial." },
  { id: "educacao", name: "Secretaria Municipal de Educação", acronym: "SME", description: "Rede municipal de ensino, magistério, transporte e alimentação escolar." },
  { id: "assistencia-social", name: "Secretaria Municipal de Assistência Social", acronym: "SMAS", description: "Proteção social básica e especial, CRAS, CREAS, CadÚnico e acompanhamento às famílias." },
  { id: "obras", name: "Secretaria Municipal de Obras e Serviços Públicos", acronym: "SMOSP", description: "Obras públicas, manutenção viária urbana e rural, iluminação e serviços públicos." },
  { id: "agricultura", name: "Secretaria Municipal de Agricultura e Abastecimento", acronym: "SEMAGRI", description: "Apoio ao produtor rural, agropecuária familiar, patrulha agrícola e abastecimento." },
  { id: "meio-ambiente", name: "Secretaria Municipal de Meio Ambiente e Recursos Hídricos", acronym: "SMMA", description: "Licenciamento, fiscalização ambiental, saneamento, resíduos sólidos e sustentabilidade." },
  { id: "cultura", name: "Secretaria Municipal de Cultura e Patrimônio", acronym: "SMC", description: "Patrimônio cultural, oficinas artísticas, eventos e ações comunitárias." },
  { id: "esportes", name: "Secretaria Municipal de Esportes e Lazer", acronym: "SMEL", description: "Esporte educacional, lazer comunitário, infraestrutura esportiva e eventos." },
  { id: "turismo", name: "Secretaria Municipal de Turismo e Desenvolvimento", acronym: "SMTUR", description: "Turismo de natureza, desenvolvimento econômico sustentável e valorização do potencial local." },
];

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default async function SecretariasPage() {
  const [dbSecretariats, dbDepartments, dbUnits, institution, transparencySettings] = await Promise.all([
    listSecretariatDetails(db).catch(() => []),
    listDepartmentDetails(db).catch(() => []),
    listUnitDetails(db).catch(() => []),
    getInstitutionalContact().catch(() => null),
    getTransparencySettings(db).catch(() => null),
  ]);

  const defaultPhone = institution?.phone || transparencySettings?.citizenService?.phone || "(28) 3553-1200";
  const defaultEmail = institution?.email || transparencySettings?.citizenService?.email || "atendimento@guarama.es.gov.br";
  const defaultAddress = institution?.address 
    ? `${institution.address}${institution.city ? ` — ${institution.city}/${institution.state || "ES"}` : ""}`
    : "Sede Administrativa Municipal — Centro, Guarama/ES";
  const defaultHours = transparencySettings?.openingHours || transparencySettings?.citizenService?.openingHours || "Segunda a Sexta, das 08h00 às 11h30 e das 13h00 às 17h00";

  // Build merged secretariat list prioritizing live database records
  const activeSecretariats = dbSecretariats.filter(sec => sec.isActive !== false);
  const items = (activeSecretariats.length > 0
    ? activeSecretariats.map((sec) => {
        const slug = generateSlug(sec.name);
        const baseKey = Object.keys(SECRETARIAS_BASE_COMPETENCIAS).find(k => slug.includes(k) || k.includes(slug)) || "administracao";
        const meta = SECRETARIAS_BASE_COMPETENCIAS[baseKey] || SECRETARIAS_BASE_COMPETENCIAS.administracao;
        const depts = dbDepartments.filter(d => d.secretariatId === sec.id);
        const units = dbUnits.filter(u => u.secretariatId === sec.id);
        
        return {
          id: sec.id,
          slug,
          name: sec.name,
          acronym: sec.acronym,
          managerName: sec.manager?.name || sec.managerName || "Secretário(a) / Dirigente Titular",
          managerRole: sec.manager?.role?.name || "Titular do Órgão",
          address: units.find(u => u.address)?.address || defaultAddress,
          phone: defaultPhone,
          email: defaultEmail,
          openingHours: meta.horario || defaultHours,
          competencias: meta.competencias,
          departments: depts.map(d => d.name),
          units: units.map(u => ({ name: u.name, address: u.address })),
        };
      })
    : DEFAULT_SECRETARIAS.map((sec) => {
        const meta = SECRETARIAS_BASE_COMPETENCIAS[sec.id] || SECRETARIAS_BASE_COMPETENCIAS.administracao;
        return {
          id: sec.id,
          slug: sec.id,
          name: sec.name,
          acronym: sec.acronym,
          managerName: "Secretário(a) / Dirigente Titular",
          managerRole: "Titular do Órgão",
          address: defaultAddress,
          phone: defaultPhone,
          email: defaultEmail,
          openingHours: meta.horario || defaultHours,
          competencias: meta.competencias,
          departments: [],
          units: [],
        };
      })
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PortalBreadcrumb current="Secretarias e Estrutura Organizacional" />

      {/* Header institucional */}
      <div className="mt-5 border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Estrutura Organizacional e Secretarias
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
          Informações completas sobre órgãos, secretarias municipais, atribuições e competências legais, endereços, horários de atendimento, telefones e canais oficiais de comunicação de {MUNICIPALITY_INSTITUTION_NAME}.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-[#0e4c7e]">
          <Link href="/portal/contato" className="inline-flex items-center gap-1.5 underline hover:text-[#0b3d66]">
            Canais de Atendimento Geral
          </Link>
          <span>•</span>
          <Link href="/portal/ouvidoria" className="inline-flex items-center gap-1.5 underline hover:text-[#0b3d66]">
            Ouvidoria Municipal
          </Link>
          <span>•</span>
          <Link href="/portal/portaldatransparencia" className="inline-flex items-center gap-1.5 underline hover:text-[#0b3d66]">
            Portal da Transparência
          </Link>
        </div>
      </div>

      {/* Grade de secretarias detalhada */}
      <div className="mt-8 space-y-8">
        {items.map((sec) => (
          <article
            key={sec.id}
            id={sec.slug}
            className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
          >
            {/* Topo do Card */}
            <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-[#0e4c7e]/10 px-2.5 py-0.5 text-xs font-bold text-[#0e4c7e]">
                    {sec.acronym || "Órgão Municipal"}
                  </span>
                  <span className="text-xs text-slate-500">Administração Pública Municipal</span>
                </div>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">
                  {sec.name}
                </h2>
              </div>
              <div className="mt-2 sm:mt-0">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                  Atendimento Ativo
                </span>
              </div>
            </div>

            {/* Conteúdo: Dados de Contato e Competências */}
            <div className="grid gap-6 p-6 lg:grid-cols-12">
              {/* Coluna 1: Informações de Contato, Titular e Horários (5 cols) */}
              <div className="space-y-4 border-b border-slate-100 pb-6 lg:col-span-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Dados Institucionais e Contato
                  </h3>
                  <dl className="mt-3 space-y-2.5 text-xs text-slate-700">
                    {/* Responsável */}
                    <div className="flex items-start gap-2.5">
                      <User className="mt-0.5 size-4 shrink-0 text-[#0e4c7e]" />
                      <div>
                        <dt className="sr-only">Responsável</dt>
                        <dd className="font-bold text-slate-900">{sec.managerName}</dd>
                        <p className="text-[11px] text-slate-500">{sec.managerRole}</p>
                      </div>
                    </div>

                    {/* Endereço */}
                    <div className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-[#0e4c7e]" />
                      <div>
                        <dt className="sr-only">Endereço</dt>
                        <dd className="leading-snug text-slate-700">{sec.address}</dd>
                      </div>
                    </div>

                    {/* Telefone */}
                    <div className="flex items-start gap-2.5">
                      <Phone className="mt-0.5 size-4 shrink-0 text-[#0e4c7e]" />
                      <div>
                        <dt className="sr-only">Telefone</dt>
                        <dd>
                          <a href={`tel:${sec.phone.replace(/[^0-9]/g, "")}`} className="font-semibold text-slate-800 hover:text-[#0e4c7e]">
                            {sec.phone}
                          </a>
                        </dd>
                      </div>
                    </div>

                    {/* E-mail */}
                    <div className="flex items-start gap-2.5">
                      <Mail className="mt-0.5 size-4 shrink-0 text-[#0e4c7e]" />
                      <div>
                        <dt className="sr-only">E-mail</dt>
                        <dd>
                          <a href={`mailto:${sec.email}`} className="font-semibold text-[#0e4c7e] hover:underline">
                            {sec.email}
                          </a>
                        </dd>
                      </div>
                    </div>

                    {/* Horário de Atendimento */}
                    <div className="flex items-start gap-2.5">
                      <Clock className="mt-0.5 size-4 shrink-0 text-[#0e4c7e]" />
                      <div>
                        <dt className="sr-only">Horário de Atendimento</dt>
                        <dd className="font-medium text-slate-800">{sec.openingHours}</dd>
                      </div>
                    </div>
                  </dl>
                </div>

                {/* Estrutura Subordinada / Departamentos */}
                {(sec.departments.length > 0 || sec.units.length > 0) && (
                  <div className="pt-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Departamentos e Unidades Vinculadas
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {sec.departments.map((dep, idx) => (
                        <span key={idx} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {dep}
                        </span>
                      ))}
                      {sec.units.map((u, idx) => (
                        <span key={idx} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700" title={u.address || undefined}>
                          {u.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Coluna 2: Competências e Atribuições do Órgão (7 cols) */}
              <div className="space-y-3 lg:col-span-7">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Competências e Atribuições Legais do Órgão
                </h3>
                <ul className="space-y-2 text-xs text-slate-600">
                  {sec.competencias.map((comp, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#0e4c7e]" />
                      <span className="leading-relaxed">{comp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
