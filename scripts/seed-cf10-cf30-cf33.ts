import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { systemInstances, instanceParameters } from "../src/db/schema/instance-configuration";
import { recyclingMaterialBindings, recyclingStocks, recyclingMovements } from "../src/db/schema/environment-recycling";
import { legalTexts, legalTextVersions } from "../src/db/schema/master-data";
import { legalTextDatabaseDocuments, legalTextDatabaseDocumentBlobs, legacyLegalTextSources } from "../src/db/schema/legal-documents";
import { purchasePlannings, purchasePlanningDocumentVersions } from "../src/db/schema/procurement-requests";
import { users } from "../src/db/schema/identity";
import { recyclingEntryKey, type RecyclingEntry } from "../src/lib/environment/recycling-catalog";

config({ path: ".env.production.local", quiet: true });
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export const DATASET_ID = "poc-guarama-cf10-cf30-cf33-v2-full";

// ============================================================================
// CF10 — GESTÃO DE RESÍDUOS SÓLIDOS E RECICLAGEM (EXPANDIDO)
// ============================================================================
export const cf10CatalogData = {
  types: [
    { code: "TYP-RECICLAVEL", name: "Materiais Recicláveis Secos", description: "Resíduos sólidos secos triados em coleta seletiva municipal", active: true },
    { code: "TYP-METAIS", name: "Metais Ferrosos e Não-Ferrosos", description: "Sucata metálica, latinhas de alumínio, cobre e ligas industriais", active: true },
    { code: "TYP-PLASTICOS", name: "Polímeros e Termoplásticos", description: "Embalagens plásticas pós-consumo (PET, PEAD, PP, PEBD)", active: true },
    { code: "TYP-PAPEL", name: "Papéis e Celulose", description: "Papelão ondulado, aparas brancas, jornais e revistas", active: true },
    { code: "TYP-VIDRO", name: "Vidros e Cerâmicas", description: "Cacos de vidro verde, âmbar e transparente para logística reversa", active: true },
    { code: "TYP-ESPECIAIS", name: "Resíduos Especiais e Logística Reversa", description: "Pneus inservíveis, óleo vegetal usado e resíduos eletroeletrônicos", active: true },
  ],
  units: [
    { code: "KG", name: "Quilograma", description: "Unidade padrão de pesagem (kg)", active: true },
    { code: "TON", name: "Tonelada", description: "Carga pesada em balança rodoviária (t)", active: true },
    { code: "FARDO", name: "Fardo Prensado", description: "Unidade de volume prensado para armazenagem", active: true },
    { code: "L", name: "Litro", description: "Medida volumétrica para líquidos como óleo usado", active: true },
    { code: "UN", name: "Unidade", description: "Contagem unitária (pneus, carcaças, etc.)", active: true },
  ],
  materials: [
    { code: "MAT-PAPELAO", name: "Papelão Ondulado Prensado (Tipo I)", description: "Caixas de papelão limpas, triadas e enfardadas", typeCode: "TYP-PAPEL", unitCode: "KG", active: true },
    { code: "MAT-PAPEL-BRANCO", name: "Papel Branco Tipo Sulfite / Arquivo", description: "Aparas de papel de escritório e arquivos descartados", typeCode: "TYP-PAPEL", unitCode: "KG", active: true },
    { code: "MAT-PAPEL-MISTO", name: "Papel Misto / Encartes e Revistas", description: "Papel impresso colorido, revistas e folhetos comerciais", typeCode: "TYP-PAPEL", unitCode: "KG", active: true },
    { code: "MAT-PET-TRANSP", name: "Garrafa PET Cristal Transparente Prensada", description: "Polietileno tereftalato transparente prensado em fardos", typeCode: "TYP-PLASTICOS", unitCode: "KG", active: true },
    { code: "MAT-PET-VERDE", name: "Garrafa PET Verde / Âmbar Prensada", description: "Garrafas PET coloridas separadas por tonalidade", typeCode: "TYP-PLASTICOS", unitCode: "KG", active: true },
    { code: "MAT-PEAD-RIGIDO", name: "Plástico PEAD Rígido (Frascos e Bombonas)", description: "Frascos de produtos de limpeza, detergentes e bombonas moídas", typeCode: "TYP-PLASTICOS", unitCode: "KG", active: true },
    { code: "MAT-PP-COPO", name: "Polipropileno (PP) Copos e Potes", description: "Copos descartáveis, potes de margarina e tampinhas plásticas", typeCode: "TYP-PLASTICOS", unitCode: "KG", active: true },
    { code: "MAT-FILME-PEBD", name: "Plástico Filme PEBD / Sacarias", description: "Filme stretch, sacolas plásticas limpas e embalagens flexíveis", typeCode: "TYP-PLASTICOS", unitCode: "KG", active: true },
    { code: "MAT-ALUMINIO-LATA", name: "Latinhas de Alumínio Prensadas", description: "Latas de bebidas prensadas com pureza > 98%", typeCode: "TYP-METAIS", unitCode: "KG", active: true },
    { code: "MAT-ALUMINIO-PERFIL", name: "Alumínio Perfil e Esquadrias", description: "Sobras de esquadrias, janelas e perfis estruturais limpos", typeCode: "TYP-METAIS", unitCode: "KG", active: true },
    { code: "MAT-SUCATA-FERRO", name: "Sucata de Ferro Leve / Chaparia", description: "Eletrodomésticos linha branca, chapas e ferragens descaracterizadas", typeCode: "TYP-METAIS", unitCode: "KG", active: true },
    { code: "MAT-COBRE-FIO", name: "Cobre Limpo Desencapado (Mel)", description: "Fios e condutores elétricos desencapados para reciclagem nobre", typeCode: "TYP-METAIS", unitCode: "KG", active: true },
    { code: "MAT-VIDRO-INCOLOR", name: "Cacos de Vidro Incolor Triturado", description: "Garrafas e frascos transparentes triturados em caçamba estanque", typeCode: "TYP-VIDRO", unitCode: "KG", active: true },
    { code: "MAT-VIDRO-AMBAR", name: "Cacos de Vidro Âmbar / Garrafas de Cerveja", description: "Vidro âmbar pós-consumo destinado à indústria cervejeira", typeCode: "TYP-VIDRO", unitCode: "KG", active: true },
    { code: "MAT-OLEO-USADO", name: "Óleo Vegetal de Cozinha Usado", description: "Óleo comestível residual recolhido em escolas e restaurantes", typeCode: "TYP-ESPECIAIS", unitCode: "L", active: true },
    { code: "MAT-PNEUS-INSERV", name: "Pneus Automotivos Inservíveis", description: "Pneus de veículos de passeio e utilitários para trituração / coprocessamento", typeCode: "TYP-ESPECIAIS", unitCode: "UN", active: true },
  ],
  depots: [
    { code: "DEP-CENTRAL", name: "Ecoponto Central - Bairro das Veredas", address: "Rua das Palmeiras, 450, Bairro Central", active: true },
    { code: "DEP-TRIAGEM", name: "Galpão Municipal de Triagem e Prensa - Distrito Industrial", address: "Avenida dos Pioneiros, 1200, Distrito Industrial", active: true },
    { code: "DEP-NORTE", name: "Ponto de Entrega Voluntária (PEV) Norte - Jardim das Acácias", address: "Rua das Acácias, 85, Jardim das Acácias", active: true },
    { code: "DEP-SUL", name: "Ponto de Entrega Voluntária (PEV) Sul - Bairro Boa Vista", address: "Avenida Vale Verde, 730, Bairro Boa Vista", active: true },
    { code: "DEP-LESTE", name: "Ecoponto Regional Leste - Vila Esperança", address: "Rua Serra Clara, 310, Vila Esperança", active: true },
  ],
  centers: [
    { code: "COOP-VEREDAS", name: "COOPVER - Cooperativa de Catadores Unidos das Veredas", address: "Rua da Esperança, 180, Bairro Boa Vista (CNPJ: 28.451.980/0001-44)", active: true },
    { code: "DEST-RECICLAMINA", name: "Recicla Minas Soluções Ambientais Ltda.", address: "Rodovia MG-427, Km 12, Zona Rural (CNPJ: 14.892.301/0001-85)", active: true },
    { code: "DEST-SIDERURGICA", name: "Siderúrgica e Fundição Vale Verde S/A", address: "Avenida Central, 3500, Distrito Industrial (CNPJ: 03.112.987/0001-12)", active: true },
    { code: "DEST-CELULOSE-RIO", name: "Papel e Celulose Rio Grande Indústria Ltda.", address: "Avenida das Indústrias, 890, Uberaba/MG (CNPJ: 07.234.561/0001-90)", active: true },
    { code: "DEST-ECO-BIODIESEL", name: "EcoVerde Biocombustíveis e Óleos Vegetais Ltda.", address: "Estrada Municipal das Palmeiras, S/N (CNPJ: 19.340.112/0001-63)", active: true },
    { code: "DEST-RECICLANIP", name: "Associação Reciclanip de Destinação de Pneus", address: "Posto Consorciado Rodoviário, Km 48 (CNPJ: 08.411.230/0001-09)", active: true },
  ],
};

export const cf10MovementsData = [
  // Mês 1 - Junho 2026
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "5200.000", amount: "0.00", occurredOn: "2026-06-05", origin: "Coleta Seletiva Rota Comercial Centro", notes: "Lote de papelão limpo enfardado." },
  { materialCode: "MAT-ALUMINIO-LATA", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "650.000", amount: "0.00", occurredOn: "2026-06-08", origin: "Coleta em Pontos de Entrega Voluntária", notes: "Latinhas recolhidas nos PEVs." },
  { materialCode: "MAT-PET-TRANSP", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "2800.000", amount: "0.00", occurredOn: "2026-06-12", origin: "Coleta Seletiva Domiciliar Bairros Sul", notes: "Garrafas PET triadas e desrotuladas." },
  { materialCode: "MAT-VIDRO-INCOLOR", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "3400.000", amount: "0.00", occurredOn: "2026-06-15", origin: "Coleta Noturna em Bares e Restaurantes", notes: "Vidro incolor acondicionado em caçamba estanque." },
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "4500.000", amount: "3150.00", occurredOn: "2026-06-25", destinationCode: "DEST-CELULOSE-RIO", notes: "Venda direta para indústria recicladora a R$ 0,70/kg." },
  { materialCode: "MAT-ALUMINIO-LATA", depotCode: "DEP-CENTRAL", kind: "EXIT" as const, quantity: "500.000", amount: "3750.00", occurredOn: "2026-06-28", destinationCode: "DEST-SIDERURGICA", notes: "Destinação a R$ 7,50/kg com nota fiscal avulsa emitida." },

  // Mês 2 - Julho 2026
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "4800.000", amount: "0.00", occurredOn: "2026-07-03", origin: "Coleta Seletiva Bairro das Veredas e Acácias", notes: "Papelão ondulado pós-consumo." },
  { materialCode: "MAT-PET-TRANSP", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "3100.000", amount: "0.00", occurredOn: "2026-07-07", origin: "Campanha Coleta de Férias nos Parques", notes: "PET prensado em fardos de 150kg." },
  { materialCode: "MAT-PEAD-RIGIDO", depotCode: "DEP-NORTE", kind: "ENTRY" as const, quantity: "1850.000", amount: "0.00", occurredOn: "2026-07-10", origin: "PEV Norte e Coleta nas Secretarias Municipais", notes: "Frascos de limpeza e bombonas plásticas." },
  { materialCode: "MAT-SUCATA-FERRO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "4200.000", amount: "0.00", occurredOn: "2026-07-14", origin: "Mutirão Bota-Fora e Limpeza Urbana", notes: "Sucata metálica ferrosa limpa." },
  { materialCode: "MAT-PAPEL-BRANCO", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "1950.000", amount: "0.00", occurredOn: "2026-07-18", origin: "Descarte Arquivo Morto da Prefeitura", notes: "Papel sulfite branco descaracterizado e triturado." },
  { materialCode: "MAT-OLEO-USADO", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "850.000", amount: "0.00", occurredOn: "2026-07-22", origin: "Programa Óleo Sustentável nas Escolas", notes: "Bombonas de 50L devidamente vedadas." },
  { materialCode: "MAT-PET-TRANSP", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "4000.000", amount: "7600.00", occurredOn: "2026-07-28", destinationCode: "DEST-RECICLAMINA", notes: "Venda para processamento de poliéster a R$ 1,90/kg." },
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "4000.000", amount: "2880.00", occurredOn: "2026-07-30", destinationCode: "COOP-VEREDAS", notes: "Repasse solidário para comercialização da cooperativa parceira." },

  // Mês 3 - Agosto 2026
  { materialCode: "MAT-ALUMINIO-LATA", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "920.000", amount: "0.00", occurredOn: "2026-08-04", origin: "Coleta nos Eventos da Festa da Cidade", notes: "Latinhas recolhidas por equipe de catadores." },
  { materialCode: "MAT-VIDRO-AMBAR", depotCode: "DEP-SUL", kind: "ENTRY" as const, quantity: "2700.000", amount: "0.00", occurredOn: "2026-08-08", origin: "Pontos de Entrega Setor de Gastronomia", notes: "Garrafas âmbar triadas por cor." },
  { materialCode: "MAT-FILME-PEBD", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "1600.000", amount: "0.00", occurredOn: "2026-08-12", origin: "Descarte Limpo do Distrito Industrial", notes: "Filme plástico limpo prensado." },
  { materialCode: "MAT-PNEUS-INSERV", depotCode: "DEP-LESTE", kind: "ENTRY" as const, quantity: "420.000", amount: "0.00", occurredOn: "2026-08-16", origin: "Borracharias Cadastradas e Coleta Seletiva", notes: "Pneus armazenados em galpão coberto anti-dengue." },
  { materialCode: "MAT-COBRE-FIO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "280.000", amount: "0.00", occurredOn: "2026-08-19", origin: "Descarte de Fiações Obras de Reformas", notes: "Cobre limpo pesado em balança de precisão." },
  { materialCode: "MAT-SUCATA-FERRO", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "3500.000", amount: "3150.00", occurredOn: "2026-08-25", destinationCode: "DEST-SIDERURGICA", notes: "Destinação para reciclagem siderúrgica a R$ 0,90/kg." },
  { materialCode: "MAT-OLEO-USADO", depotCode: "DEP-CENTRAL", kind: "EXIT" as const, quantity: "700.000", amount: "1820.00", occurredOn: "2026-08-29", destinationCode: "DEST-ECO-BIODIESEL", notes: "Venda para produção de biodiesel certificado a R$ 2,60/L." },

  // Mês 4 - Setembro 2026
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "5600.000", amount: "0.00", occurredOn: "2026-09-02", origin: "Coleta Seletiva Semanal Bairro Centro", notes: "Prensa vertical operando em dois turnos." },
  { materialCode: "MAT-ALUMINIO-LATA", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "780.000", amount: "0.00", occurredOn: "2026-09-06", origin: "Entrega Voluntária Escolar e PEV Norte", notes: "Lote com pureza de 99%." },
  { materialCode: "MAT-PEAD-RIGIDO", depotCode: "DEP-NORTE", kind: "ENTRY" as const, quantity: "2100.000", amount: "0.00", occurredOn: "2026-09-11", origin: "Coleta Seletiva Setor Saúde e Educação", notes: "Bombonas limpas de polietileno de alta densidade." },
  { materialCode: "MAT-PET-VERDE", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "1750.000", amount: "0.00", occurredOn: "2026-09-15", origin: "Triagem Seletiva no Galpão Municipal", notes: "PET verde enfardado separadamente." },
  { materialCode: "MAT-ALUMINIO-LATA", depotCode: "DEP-CENTRAL", kind: "EXIT" as const, quantity: "1100.000", amount: "8800.00", occurredOn: "2026-09-22", destinationCode: "DEST-SIDERURGICA", notes: "Venda valorizada a R$ 8,00/kg com recursos destinados ao fundo municipal." },
  { materialCode: "MAT-PAPEL-BRANCO", depotCode: "DEP-CENTRAL", kind: "EXIT" as const, quantity: "1500.000", amount: "1500.00", occurredOn: "2026-09-26", destinationCode: "DEST-CELULOSE-RIO", notes: "Aparas brancas vendidas a R$ 1,00/kg." },
  { materialCode: "MAT-PNEUS-INSERV", depotCode: "DEP-LESTE", kind: "EXIT" as const, quantity: "380.000", amount: "0.00", occurredOn: "2026-09-29", destinationCode: "DEST-RECICLANIP", notes: "Destinação ambiental gratuita para trituração e coprocessamento em cimenteira." },

  // Mês 5 - Outubro 2026
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "6100.000", amount: "0.00", occurredOn: "2026-10-04", origin: "Coleta Seletiva Comércio e Bairros", notes: "Volume recorde de papelão pós-Dia das Crianças." },
  { materialCode: "MAT-PET-TRANSP", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "3400.000", amount: "0.00", occurredOn: "2026-10-09", origin: "Coleta Seletiva Residencial Geral", notes: "PET cristal prensado." },
  { materialCode: "MAT-COBRE-FIO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "190.000", amount: "0.00", occurredOn: "2026-10-14", origin: "Manutenção Predial de Prédios Públicos", notes: "Sobras de cabos elétricos inservíveis." },
  { materialCode: "MAT-PP-COPO", depotCode: "DEP-SUL", kind: "ENTRY" as const, quantity: "880.000", amount: "0.00", occurredOn: "2026-10-18", origin: "Campanha Zero Descartável nas Repartições", notes: "Copos plásticos higienizados e enfardados." },
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "5500.000", amount: "4125.00", occurredOn: "2026-10-24", destinationCode: "DEST-CELULOSE-RIO", notes: "Venda a R$ 0,75/kg com entrega FOB no pátio." },
  { materialCode: "MAT-PEAD-RIGIDO", depotCode: "DEP-NORTE", kind: "EXIT" as const, quantity: "2500.000", amount: "5250.00", occurredOn: "2026-10-28", destinationCode: "DEST-RECICLAMINA", notes: "Venda de PEAD a R$ 2,10/kg para injeção de utilidades plásticas." },
  { materialCode: "MAT-COBRE-FIO", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "350.000", amount: "12600.00", occurredOn: "2026-10-30", destinationCode: "DEST-SIDERURGICA", notes: "Venda de cobre limpo de alta pureza a R$ 36,00/kg." },
];

// ============================================================================
// CF30 — PLANEJAMENTO DE COMPRAS (PCA) E FASE INTERNA (EXPANDIDO)
// ============================================================================
export const cf30PlanningData = [
  {
    id: "cf30-plan-combustiveis-2026",
    description: "Aquisição continuada de combustíveis (Gasolina Comum e Óleo Diesel S10) para abastecimento e manutenção da frota de veículos oficiais das Secretarias de Saúde, Obras e Serviços Públicos, Educação e Segurança Pública.",
    unit: "L",
    quantity: 65000,
    expectedPeriodStart: new Date("2026-01-01"),
    expectedPeriodEnd: new Date("2026-12-31"),
    estimatedValueDecimal: "386750.00",
    status: "Aprovado",
    etp: {
      objeto: "Fornecimento parcelado de combustíveis automotivos (Gasolina Comum e Óleo Diesel S10) por meio de postos credenciados na sede e distritos do Município.",
      necessidade: "Garantir a operação ininterrupta de ambulâncias do SAMU, transporte escolar rural, caminhões de coleta de lixo e maquinário pesado da Secretaria de Obras.",
      solucoesMercado: "Foram analisadas as opções de instalação de tanque próprio e abastecimento direto em rede credenciada com cartão magnético. A contratação via rede credenciada mostrou-se economicamente mais vantajosa (Art. 18, § 1º, da Lei 14.133/2021).",
      estimativaValor: "Pesquisa de preços balizada pela média da tabela ANP regional e contratações similares de municípios vizinhos.",
      viabilidade: "A contratação é viável e necessária para a continuidade dos serviços essenciais municipais.",
    },
    tr: {
      objeto: "Registro de Preços para fornecimento parcelado de combustíveis automotivos para o exercício de 2026.",
      justificativa: "Atendimento às diretrizes do Art. 82 da Lei Federal nº 14.133/2021 e do Plano de Contratações Anual (PCA).",
      criterioJulgamento: "Menor Preço por Item (maior desconto sobre a tabela ANP).",
      fiscalizacao: "A fiscalização será exercida por comissão designada da Secretaria de Transportes e Frotas.",
      condicoesPagamento: "Pagamento em até 15 (quinze) dias corridos após a apresentação de nota fiscal atestada e relatórios de abastecimento por placa.",
    },
  },
  {
    id: "cf30-plan-merenda-2026",
    description: "Registro de Preços para fornecimento parcelado de gêneros alimentícios perecíveis e não perecíveis destinados à composição dos cardápios da merenda escolar das Escolas Municipais e Centros de Educação Infantil (CMEIs).",
    unit: "KG",
    quantity: 18500,
    expectedPeriodStart: new Date("2026-02-01"),
    expectedPeriodEnd: new Date("2026-12-15"),
    estimatedValueDecimal: "248900.00",
    status: "Aprovado",
    etp: {
      objeto: "Aquisição parcelada de alimentos para o atendimento do Programa Nacional de Alimentação Escolar (PNAE).",
      necessidade: "Suprir as necessidades nutricionais dos alunos da rede pública municipal de ensino com cardápios balanceados elaborados por nutricionistas habilitadas.",
      solucoesMercado: "Registro de Preços com ampla concorrência e cota reservada de até 25% para microempresas e produtores rurais locais (Lei Complementar 123/2006 e Lei 14.133/2021).",
      estimativaValor: "Cesta de preços públicos extraída do Painel de Preços do Governo Federal e cotações com fornecedores da região.",
      viabilidade: "Totalmente viável e aderente às metas do PPA da Educação Municipal.",
    },
    tr: {
      objeto: "Fornecimento parcelado de gêneros alimentícios perecíveis e estocáveis para a merenda escolar.",
      justificativa: "Garantia da segurança alimentar dos estudantes matriculados nas unidades escolares municipais.",
      criterioJulgamento: "Menor preço por lote/item com exigência de laudos sanitários e controle de qualidade na entrega.",
      fiscalizacao: "Supervisão da Divisão de Nutrição Escolar e do Conselho de Alimentação Escolar (CAE).",
      condicoesPagamento: "Até 30 dias após cada entrega confirmada pelo setor de recebimento e almoxarifado escolar.",
    },
  },
  {
    id: "cf30-plan-manutencao-predial-2026",
    description: "Contratação de empresa especializada em serviços continuados de manutenção predial preventiva e corretiva (alvenaria, hidráulica, elétrica e pintura) para conservação dos prédios públicos municipais.",
    unit: "MES",
    quantity: 12,
    expectedPeriodStart: new Date("2026-03-01"),
    expectedPeriodEnd: new Date("2027-02-28"),
    estimatedValueDecimal: "315000.00",
    status: "Aprovado",
    etp: {
      objeto: "Serviços continuados de conservação e manutenção predial das unidades da administração pública municipal.",
      necessidade: "Preservação do patrimônio público municipal e atendimento das condições de segurança e acessibilidade para servidores e munícipes.",
      solucoesMercado: "Tabela referencial SINAPI/SEINFRA com aplicação de BDI e desconto sobre a tabela oficial.",
      estimativaValor: "Valor apurado com base no histórico de manutenções e orçamentos SINAPI desonerado.",
      viabilidade: "A contratação atende integralmente às exigências do Art. 18 da Lei 14.133/2021.",
    },
    tr: {
      objeto: "Prestação de serviços de engenharia para manutenção preventiva e corretiva predial dos prédios municipais.",
      justificativa: "Manter a integridade física de postos de saúde, escolas e edifícios públicos da Prefeitura.",
      criterioJulgamento: "Maior Desconto Linear sobre a tabela SINAPI.",
      fiscalizacao: "Departamento de Obras e Engenharia Municipal com emissão de Ordens de Serviço (OS).",
      condicoesPagamento: "Medições mensais acompanhadas de ART (Anotação de Responsabilidade Técnica) e comprovação dos encargos trabalhistas.",
    },
  },
  {
    id: "cf30-plan-medicamentos-2026",
    description: "Aquisição de medicamentos essenciais da Relação Municipal de Medicamentos (REMUME) para suprimento e abastecimento contínuo da Farmácia Básica Municipal e Unidades Básicas de Saúde.",
    unit: "UN",
    quantity: 95000,
    expectedPeriodStart: new Date("2026-01-15"),
    expectedPeriodEnd: new Date("2026-12-31"),
    estimatedValueDecimal: "468200.00",
    status: "Aprovado",
    etp: {
      objeto: "Suprimento contínuo de fármacos para a rede pública de saúde da atenção básica.",
      necessidade: "Garantir a assistência farmacêutica integral e gratuita aos cidadãos em tratamento ambulatorial.",
      solucoesMercado: "Pregão eletrônico com base na tabela CMED/ANVISA com preço máximo ao consumidor.",
      estimativaValor: "Banco de Preços em Saúde (BPS) do Ministério da Saúde.",
      viabilidade: "Contratação essencial e prioritária no Plano Municipal de Saúde.",
    },
    tr: {
      objeto: "Fornecimento parcelado de medicamentos da atenção básica de saúde.",
      justificativa: "Direito fundamental à saúde e cumprimento das metas do SUS Municipal.",
      criterioJulgamento: "Menor preço por item com exigência de registro ativo na ANVISA e prazo de validade mínimo de 18 meses na entrega.",
      fiscalizacao: "Coordenação da Assistência Farmacêutica Municipal.",
      condicoesPagamento: "Até 30 dias após o ateste de recebimento definitivo pelo farmacêutico responsável.",
    },
  },
  {
    id: "cf30-plan-ti-computadores-2026",
    description: "Aquisição de equipamentos de tecnologia da informação (microcomputadores corporativos, monitores e nobreaks senoidais) para modernização dos setores de atendimento ao cidadão e unidades de saúde.",
    unit: "UN",
    quantity: 45,
    expectedPeriodStart: new Date("2026-04-01"),
    expectedPeriodEnd: new Date("2026-08-31"),
    estimatedValueDecimal: "189450.00",
    status: "Aprovado",
    etp: {
      objeto: "Modernização do parque computacional das Secretarias Municipais.",
      necessidade: "Substituir máquinas obsoletas com mais de 7 anos de uso que geram lentidão no atendimento à população.",
      solucoesMercado: "Computadores com processador de 12ª geração, 16GB RAM, SSD NVMe e garantia on-site de 36 meses.",
      estimativaValor: "Painel de Preços Federal e atas de registro de preços vigentes de órgãos públicos estaduais.",
      viabilidade: "A modernização tecnológica atende ao Plano de Transformação Digital do Município.",
    },
    tr: {
      objeto: "Fornecimento de equipamentos de microinformática com suporte técnico e garantia de 3 anos.",
      justificativa: "Aumento da produtividade dos serviços públicos digitais e segurança da informação.",
      criterioJulgamento: "Menor preço por item.",
      fiscalizacao: "Divisão de Tecnologia da Informação (DTI).",
      condicoesPagamento: "Pagamento único após recebimento definitivo, testes de bancada e tombamento patrimonial.",
    },
  },
  {
    id: "cf30-plan-limpeza-urbana-2026",
    description: "Contratação de empresa especializada para prestação de serviços continuados de limpeza urbana, capina manual e mecanizada, roçada e pintura de meio-fio nas vias e logradouros públicos municipais.",
    unit: "MES",
    quantity: 12,
    expectedPeriodStart: new Date("2026-05-01"),
    expectedPeriodEnd: new Date("2027-04-30"),
    estimatedValueDecimal: "528000.00",
    status: "Aprovado",
    etp: {
      objeto: "Serviços continuados de conservação urbana e limpeza de logradouros.",
      necessidade: "Preservação da saúde pública, drenagem urbana e embelezamento dos espaços de convivência comunitária.",
      solucoesMercado: "Planilha de composição de custos e formação de preços conforme Instrução Normativa SEGES nº 05/2017 e Lei 14.133/2021.",
      estimativaValor: "Estudo detalhado de produtividade por m² de capina e equipe padrão de limpeza.",
      viabilidade: "Serviço essencial com regime de execução por empreitada por preço unitário.",
    },
    tr: {
      objeto: "Prestação de serviços de limpeza urbana, roçada e conservação de vias públicas.",
      justificativa: "Zelo pelo meio ambiente urbano e mitigação de vetores de endemias.",
      criterioJulgamento: "Menor Preço Global.",
      fiscalizacao: "Secretaria de Meio Ambiente e Serviços Urbanos.",
      condicoesPagamento: "Medição mensal condicionada à comprovação da quitação da folha e recolhimento de FGTS e INSS.",
    },
  },
  {
    id: "cf30-plan-pneus-frota-2026",
    description: "Registro de Preços para fornecimento parcelado de pneus novos (primeira vida), câmaras de ar e protetores para manutenção dos veículos leves, caminhões e máquinas pesadas da frota municipal.",
    unit: "UN",
    quantity: 210,
    expectedPeriodStart: new Date("2026-03-15"),
    expectedPeriodEnd: new Date("2026-12-31"),
    estimatedValueDecimal: "172400.00",
    status: "Aprovado",
    etp: {
      objeto: "Aquisição de pneumáticos homologados pelo INMETRO para a frota municipal.",
      necessidade: "Garantir a segurança no tráfego dos ônibus escolares, ambulâncias e veículos operacionais.",
      solucoesMercado: "Exigência de selo INMETRO, fabricação não superior a 6 meses na data de entrega e proibição de pneus remodelados/recauchutados.",
      estimativaValor: "Pesquisa ampla no mercado local e atas de registro de preços de consórcios intermunicipais.",
      viabilidade: "Indispensável para a manutenção preventiva e segurança viária municipal.",
    },
    tr: {
      objeto: "Registro de Preços para aquisição parcelada de pneus novos para a frota oficial.",
      justificativa: "Prevenção de acidentes e conservação mecânica dos veículos da frota.",
      criterioJulgamento: "Menor Preço por Item.",
      fiscalizacao: "Diretoria de Frotas e Almoxarifado Central.",
      condicoesPagamento: "Até 20 dias após cada entrega confirmada pelo setor de transportes.",
    },
  },
  {
    id: "cf30-plan-material-didatico-2026",
    description: "Aquisição de conjuntos de materiais didáticos, pedagógicos e kits escolares individuais para distribuição gratuita aos estudantes do Ensino Fundamental e da Educação Infantil da rede pública.",
    unit: "KIT",
    quantity: 2800,
    expectedPeriodStart: new Date("2026-01-10"),
    expectedPeriodEnd: new Date("2026-03-31"),
    estimatedValueDecimal: "196000.00",
    status: "Aprovado",
    etp: {
      objeto: "Fornecimento de kits escolares completos para os estudantes matriculados.",
      necessidade: "Assegurar condições de igualdade e permanência escolar para famílias de baixa renda do Município.",
      solucoesMercado: "Composição de kits por faixa etária (Mochila, cadernos, lápis de cor, réguas, tesouras e estojos atóxicos).",
      estimativaValor: "Cotações com fabricantes nacionais e atas do FNDE (Fundo Nacional de Desenvolvimento da Educação).",
      viabilidade: "Ação estruturante de combate à evasão escolar alinhada ao Plano Municipal de Educação.",
    },
    tr: {
      objeto: "Aquisição de kits escolares para o início do ano letivo de 2026.",
      justificativa: "Garantia de insumos materiais adequados para a prática pedagógica infantil.",
      criterioJulgamento: "Menor Preço por Lote com aprovação prévia de amostras físicas dos materiais.",
      fiscalizacao: "Comissão Pedagógica da Secretaria Municipal de Educação.",
      condicoesPagamento: "Pagamento único após entrega e conferência quantitativa e qualitativa nas escolas polo.",
    },
  },
  {
    id: "cf30-plan-link-internet-2026",
    description: "Contratação de serviços de telecomunicações para provimento de acesso dedicado à internet via fibra óptica com redundância e interligação de rede WAN entre todos os prédios públicos municipais.",
    unit: "MES",
    quantity: 12,
    expectedPeriodStart: new Date("2026-06-01"),
    expectedPeriodEnd: new Date("2027-05-31"),
    estimatedValueDecimal: "144000.00",
    status: "Aprovado",
    etp: {
      objeto: "Conectividade corporativa de alta disponibilidade e baixa latência para os órgãos municipais.",
      necessidade: "Sustentar os sistemas de prontuário eletrônico na Saúde, emissão de NFS-e na Fazenda e atendimento digital ao cidadão.",
      solucoesMercado: "Links simétricos de fibra óptica com SLA de 99,5% e suporte técnico 24/7.",
      estimativaValor: "Média de mercado da região com operadoras autorizadas pela ANATEL.",
      viabilidade: "Infraestrutura essencial para a continuidade das operações digitais municipais.",
    },
    tr: {
      objeto: "Prestação de serviços de internet dedicada e enlace de dados para as unidades municipais.",
      justificativa: "Estabilidade dos sistemas de gestão pública e transparência administrativa.",
      criterioJulgamento: "Menor Preço Global.",
      fiscalizacao: "Departamento de Tecnologia da Informação.",
      condicoesPagamento: "Faturamento mensal mediante relatório de disponibilidade e cumprimento do SLA.",
    },
  },
  {
    id: "cf30-plan-drenagem-tubos-2026",
    description: "Registro de Preços para fornecimento parcelado de tubos de concreto armado e simples (diâmetros de 400mm a 1000mm) para canalização de galerias pluviais e combate a alagamentos nos bairros.",
    unit: "M",
    quantity: 1800,
    expectedPeriodStart: new Date("2026-04-15"),
    expectedPeriodEnd: new Date("2026-12-31"),
    estimatedValueDecimal: "228600.00",
    status: "Aprovado",
    etp: {
      objeto: "Aquisição de peças pré-moldadas de concreto para drenagem pluvial.",
      necessidade: "Execução de obras de escoamento de águas pluviais para evitar erosões e enchentes no período chuvoso.",
      solucoesMercado: "Tubos de concreto em conformidade com as normas ABNT NBR 8890.",
      estimativaValor: "Tabela SINAPI Minas Gerais desonerada.",
      viabilidade: "Ação de infraestrutura preventiva indispensável para a Defesa Civil Municipal.",
    },
    tr: {
      objeto: "Aquisição parcelada de tubos de concreto para drenagem urbana.",
      justificativa: "Manutenção e expansão das redes de drenagem pluvial do Município.",
      criterioJulgamento: "Menor Preço por Item.",
      fiscalizacao: "Secretaria Municipal de Obras e Serviços Públicos.",
      condicoesPagamento: "Até 30 dias após cada carregamento entregue e atestado na obra.",
    },
  },
];

// ============================================================================
// CF33 — ATOS ADMINISTRATIVOS E TEXTOS LEGAIS WEB (EXPANDIDO)
// ============================================================================
export const cf33LegalData = [
  {
    id: "cf33-lei-1482-2026",
    type: "LEI_ORDINARIA",
    number: "1.482/2026",
    summary: "Dispõe sobre a instituição do Plano Municipal de Gestão Integrada de Resíduos Sólidos (PMGIRS) do Município, estabelece diretrizes para a coleta seletiva, a destinação ambientalmente adequada e a inclusão socioprodutiva dos catadores de materiais recicláveis, e dá outras providências.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-03-15"),
    effectiveFrom: new Date("2026-03-15"),
    content: `LEI MUNICIPAL Nº 1.482, DE 15 DE MARÇO DE 2026

"Dispõe sobre a instituição do Plano Municipal de Gestão Integrada de Resíduos Sólidos (PMGIRS) do Município, estabelece diretrizes para a coleta seletiva, a destinação ambientalmente adequada e a inclusão socioprodutiva dos catadores de materiais recicláveis, e dá outras providências."

O PREFEITO MUNICIPAL, faço saber que a Câmara Municipal aprovou e eu sanciono a seguinte Lei:

CAPÍTULO I - DOS PRINCÍPIOS E OBJETIVOS
Art. 1º Fica instituído o Plano Municipal de Gestão Integrada de Resíduos Sólidos (PMGIRS), em consonância com a Lei Federal nº 12.305/2010.
Art. 2º São objetivos fundamentais:
I - Não geração, redução, reutilização, reciclagem e tratamento dos resíduos;
II - Estímulo à coleta seletiva e apoio prioritário a cooperativas e associações de catadores de baixa renda;
III - Fomento à logística reversa e valorização econômica de matérias-primas secundárias.

CAPÍTULO II - DOS ECOPONTOS E DESTINAÇÃO
Art. 3º O Município implantará Ecopontos e Pontos de Entrega Voluntária (PEVs) nos bairros urbanos e distritos.
Art. 4º Fica proibido o descarte de resíduos recicláveis ou contaminantes em vias públicas ou mananciais.

Prefeitura Municipal, 15 de março de 2026.`,
    documentFilename: "Lei_1482_2026_PMGIRS.odt",
  },
  {
    id: "cf33-lei-1483-2026",
    type: "LEI_ORDINARIA",
    number: "1.483/2026",
    summary: "Regulamenta a aplicação da Lei Federal nº 14.133, de 1º de abril de 2021, no âmbito da Administração Pública Municipal direta, autárquica e fundacional, dispondo sobre o Plano de Contratações Anual (PCA), a fase preparatória das licitações e procedimentos auxiliares.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-04-02"),
    effectiveFrom: new Date("2026-04-02"),
    content: `LEI MUNICIPAL Nº 1.483, DE 02 DE ABRIL DE 2026

"Regulamenta a aplicação da Lei Federal nº 14.133, de 1º de abril de 2021, no âmbito da Administração Pública Municipal direta, autárquica e fundacional, dispondo sobre o Plano de Contratações Anual (PCA), a fase preparatória das licitações e procedimentos auxiliares."

O PREFEITO MUNICIPAL, no uso de suas prerrogativas legais:

Art. 1º Esta Lei disciplina as contratações públicas regidas pela Lei Federal nº 14.133/2021 no Município.
Art. 2º O planejamento de compras será formalizado no Plano de Contratações Anual (PCA), contemplando:
I - Documento de Formalização de Demanda (DFD);
II - Estudo Técnico Preliminar (ETP);
III - Termo de Referência (TR);
IV - Matriz de riscos e pesquisa de preços fundamentada.

Prefeitura Municipal, 02 de abril de 2026.`,
    documentFilename: "Lei_1483_2026_Regulamentacao_14133.docx",
  },
  {
    id: "cf33-lc-098-2026",
    type: "LEI_COMPLEMENTAR",
    number: "098/2026",
    summary: "Altera a Lei Complementar nº 042/2013 (Código Tributário Municipal), para modernizar os procedimentos de lançamento, notificação eletrônica (DTE), parcelamento administrativo de créditos tributários e arrecadação via PIX/FEBRABAN.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-02-20"),
    effectiveFrom: new Date("2026-02-20"),
    content: `LEI COMPLEMENTAR Nº 098, DE 20 DE FEVEREIRO DE 2026

"Altera a Lei Complementar nº 042/2013 (Código Tributário Municipal), para modernizar os procedimentos de lançamento, notificação eletrônica (DTE), parcelamento administrativo de créditos tributários e arrecadação via PIX/FEBRABAN."

A CÂMARA MUNICIPAL APROVOU E EU SANCIONO:

Art. 1º Os tributos municipais poderão ser arrecadados mediante código QR PIX dinâmico integrado ao Documento de Arrecadação Municipal (DAM).
Art. 2º Fica instituído o Domicílio Tributário Eletrônico (DTE) como canal oficial de ciência ao contribuinte.

Prefeitura Municipal, 20 de fevereiro de 2026.`,
    documentFilename: "Lei_Complementar_098_2026_Tributaria.odt",
  },
  {
    id: "cf33-lei-1484-2026",
    type: "LEI_ORDINARIA",
    number: "1.484/2026",
    summary: "Dispõe sobre as Diretrizes Orçamentárias para a elaboração e execução da Lei Orçamentária Anual do exercício financeiro de 2027 (LDO 2027), e dá outras providências.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-06-30"),
    effectiveFrom: new Date("2026-06-30"),
    content: `LEI MUNICIPAL Nº 1.484, DE 30 DE JUNHO DE 2026

"Dispõe sobre as Diretrizes Orçamentárias para a elaboração e execução da Lei Orçamentária Anual do exercício financeiro de 2027 (LDO 2027), e dá outras providências."

Art. 1º Ficam estabelecidas as diretrizes gerais para a elaboração do Orçamento do Município referente ao exercício de 2027, em conformidade com o Art. 165, § 2º da Constituição Federal e a Lei Complementar nº 101/2000.

Prefeitura Municipal, 30 de junho de 2026.`,
    documentFilename: "Lei_1484_2026_LDO.docx",
  },
  {
    id: "cf33-lei-1485-2026",
    type: "LEI_ORDINARIA",
    number: "1.485/2026",
    summary: "Institui o Programa Municipal de Incentivo à Agricultura Familiar e à Economia Solidária, autorizando a aquisição direta de gêneros alimentícios para programas sociais e merenda escolar.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-05-18"),
    effectiveFrom: new Date("2026-05-18"),
    content: `LEI MUNICIPAL Nº 1.485, DE 18 DE MAIO DE 2026

"Institui o Programa Municipal de Incentivo à Agricultura Familiar e à Economia Solidária."

Art. 1º O Município destinará no mínimo 30% dos recursos da alimentação escolar para compras diretas de produtores rurais familiares locais.

Prefeitura Municipal, 18 de maio de 2026.`,
    documentFilename: "Lei_1485_2026_Agricultura_Familiar.odt",
  },
  {
    id: "cf33-dec-3120-2026",
    type: "DECRETO",
    number: "3.120/2026",
    summary: "Regulamenta a elaboração, consolidação e publicação do Plano de Contratações Anual (PCA) no âmbito do Poder Executivo Municipal e estabelece o cronograma de envio das demandas setoriais para o exercício subsequente.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-05-10"),
    effectiveFrom: new Date("2026-05-10"),
    content: `DECRETO MUNICIPAL Nº 3.120, DE 10 DE MAIO DE 2026

"Regulamenta a elaboração, consolidação e publicação do Plano de Contratações Anual (PCA) no âmbito do Poder Executivo Municipal."

Art. 1º O Plano de Contratações Anual (PCA) consolidará todas as demandas previsíveis das secretarias municipais.
Art. 2º O envio das demandas dar-se-á através do módulo digital de contratações do sistema Celeriflow.

Prefeitura Municipal, 10 de maio de 2026.`,
    documentFilename: "Decreto_3120_2026_PCA.docx",
  },
  {
    id: "cf33-dec-3125-2026",
    type: "DECRETO",
    number: "3.125/2026",
    summary: "Estabelece o regulamento operacional do Ecoponto Central e dos Pontos de Entrega Voluntária (PEV), disciplinando os horários de recebimento, triagem e pesagem de materiais recicláveis.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-06-01"),
    effectiveFrom: new Date("2026-06-01"),
    content: `DECRETO MUNICIPAL Nº 3.125, DE 01 DE JUNHO DE 2026

"Estabelece o regulamento operacional dos Ecopontos e PEVs municipais."

Art. 1º O Ecoponto Central funcionará de segunda a sábado com registro de entrada e balança calibrada pelo IPEM.

Prefeitura Municipal, 01 de junho de 2026.`,
    documentFilename: "Decreto_3125_2026_Ecopontos.odt",
  },
  {
    id: "cf33-dec-3130-2026",
    type: "DECRETO",
    number: "3.130/2026",
    summary: "Dispõe sobre medidas de contenção de despesas, controle orçamentário e otimização dos gastos públicos no âmbito do Poder Executivo Municipal para o segundo semestre de 2026.",
    issuingBody: "Gabinete do Prefeito",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-07-01"),
    effectiveFrom: new Date("2026-07-01"),
    content: `DECRETO MUNICIPAL Nº 3.130, DE 01 DE JULHO DE 2026

"Dispõe sobre medidas de contenção de despesas e responsabilidade fiscal."

Art. 1º Fica vedada a contratação de despesas sem a prévia autorização da Secretaria de Fazenda e Planejamento.

Prefeitura Municipal, 01 de julho de 2026.`,
    documentFilename: "Decreto_3130_2026_Contencao.docx",
  },
  {
    id: "cf33-por-089-2026",
    type: "PORTARIA",
    number: "089/2026",
    summary: "Designa os servidores integrantes da Comissão de Contratação e os Agentes de Contratação do Município para o exercício de 2026, nos termos da Lei Federal nº 14.133/2021.",
    issuingBody: "Secretaria Municipal de Administração",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-01-05"),
    effectiveFrom: new Date("2026-01-05"),
    content: `PORTARIA Nº 089, DE 05 DE JANEIRO DE 2026

"Designa os Agentes de Contratação e Comissão de Contratação."

Art. 1º Ficam designados os agentes de contratação municipais habilitados com certificação técnica em licitações públicas.

Secretaria de Administração, 05 de janeiro de 2026.`,
    documentFilename: "Portaria_089_2026_Agentes_Contratacao.docx",
  },
  {
    id: "cf33-por-095-2026",
    type: "PORTARIA",
    number: "095/2026",
    summary: "Nomeia os Fiscais Técnicos e Fiscais Administrativos responsáveis pelo acompanhamento dos contratos de fornecimento de merenda escolar, transporte e obras públicas.",
    issuingBody: "Secretaria Municipal de Administração",
    governmentLevel: "MUNICIPAL",
    publicationDate: new Date("2026-02-10"),
    effectiveFrom: new Date("2026-02-10"),
    content: `PORTARIA Nº 095, DE 10 DE FEVEREIRO DE 2026

"Nomeia Fiscais e Gestores de Contratos Municipais."

Art. 1º Designar os servidores responsáveis pela fiscalização técnica de contratos continuados da administração municipal.

Secretaria de Administração, 10 de fevereiro de 2026.`,
    documentFilename: "Portaria_095_2026_Fiscais_Contratos.odt",
  },
];

export const cf33LegacySourcesData = [
  {
    externalId: "LEG-LEI-1240-2021",
    sourceApplication: "SISTEMA_LEGISLATIVO_LEGADO",
    type: "LEI_ORDINARIA",
    number: "1.240/2021",
    summary: "Institui a Semana Municipal do Meio Ambiente e da Coleta Seletiva.",
    content: "Art. 1º Fica instituída a Semana Municipal do Meio Ambiente, a ser comemorada anualmente na primeira semana de junho.",
    issuingBody: "Câmara Municipal",
    publicationDate: new Date("2021-05-20"),
    effectiveFrom: new Date("2021-05-20"),
  },
  {
    externalId: "LEG-DEC-2810-2022",
    sourceApplication: "SISTEMA_LEGISLATIVO_LEGADO",
    type: "DECRETO",
    number: "2.810/2022",
    summary: "Dispõe sobre o descarte e destinação de bens inservíveis e sucatas metálicas da administração municipal.",
    content: "Art. 1º Os bens móveis considerados inservíveis serão desincorporados e destinados prioritariamente para reciclagem ou leilão público.",
    issuingBody: "Gabinete do Prefeito",
    publicationDate: new Date("2022-08-14"),
    effectiveFrom: new Date("2022-08-14"),
  },
  {
    externalId: "LEG-LEI-1315-2023",
    sourceApplication: "SISTEMA_LEGISLATIVO_LEGADO",
    type: "LEI_ORDINARIA",
    number: "1.315/2023",
    summary: "Dispõe sobre a arborização urbana e a preservação de nascentes municipais.",
    content: "Art. 1º É dever do Poder Público e da coletividade proteger a flora e as nascentes de cursos d'água no território municipal.",
    issuingBody: "Câmara Municipal",
    publicationDate: new Date("2023-09-21"),
    effectiveFrom: new Date("2023-09-21"),
  },
  {
    externalId: "LEG-DEC-2940-2024",
    sourceApplication: "SISTEMA_LEGISLATIVO_LEGADO",
    type: "DECRETO",
    number: "2.940/2024",
    summary: "Regulamenta o descarte adequado de óleo vegetal comestível residual no Município.",
    content: "Art. 1º Fica vedado o descarte de óleos e gorduras vegetais na rede pública de esgotamento sanitário.",
    issuingBody: "Gabinete do Prefeito",
    publicationDate: new Date("2024-03-12"),
    effectiveFrom: new Date("2024-03-12"),
  },
];

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log(`\n================================================================`);
  console.log(`  CARGA DE DADOS SEMISINTÉTICOS (CF10, CF30, CF33) - EXPANDIDA `);
  console.log(`  Modo: ${isApply ? "APPLY (Gravação real)" : "PREVIEW (Simulação / Dry-Run)"}`);
  console.log(`================================================================\n`);

  const previewStats = {
    dataset: DATASET_ID,
    cf10_meio_ambiente_reciclagem: {
      types: cf10CatalogData.types.length,
      units: cf10CatalogData.units.length,
      materials: cf10CatalogData.materials.length,
      depots: cf10CatalogData.depots.length,
      centers: cf10CatalogData.centers.length,
      movements: cf10MovementsData.length,
    },
    cf30_planejamento_compras_pca: {
      pca_demands: cf30PlanningData.length,
      document_versions_pca: cf30PlanningData.length,
      document_versions_etp: cf30PlanningData.length,
      document_versions_tr: cf30PlanningData.length,
    },
    cf33_atos_e_textos_legais: {
      laws_decrees_ordinances: cf33LegalData.length,
      legal_versions: cf33LegalData.length,
      database_documents_word_odt: cf33LegalData.length,
      legacy_import_sources: cf33LegacySourcesData.length,
    },
    seguranca: {
      modo: "100% ADITIVO (ON CONFLICT DO NOTHING / UPDATE)",
      altera_outros_modulos: false,
      altera_usuarios_ou_credenciais: false,
      transacao_atomica: true,
    },
  };

  console.log("Plano da Carga Expandida:");
  console.log(JSON.stringify(previewStats, null, 2));

  if (!isApply) {
    console.log(`\n[AVISO] Para aplicar a carga no banco de dados, execute:`);
    console.log(`  npm run seed:mateus -- --apply\n`);
    return;
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Variável DATABASE_URL ou DATABASE_URL_UNPOOLED não configurada no ambiente.");
  }

  const connection = createDatabaseConnection(connectionString);
  const { db } = connection;

  try {
    const [instance] = await db.select().from(systemInstances).limit(1);
    const instanceId = instance?.id || "one";

    const [adminUser] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.ativo, true)).limit(1);
    const actorId = adminUser?.id || "admin";

    console.log(`Executando transação atômica (Instância: ${instanceId}, Autor: ${actorId})...`);

    const result = await withDatabaseTransaction(connection, async (tx) => {
      let insertedCatalogs = 0;
      let insertedMovements = 0;
      let insertedPlannings = 0;
      let insertedPlanningDocs = 0;
      let insertedLegalTexts = 0;
      let insertedLegalDocs = 0;
      let insertedLegacySources = 0;

      // ==========================================
      // 1. CF10 - CATÁLOGOS E PARÂMETROS
      // ==========================================
      const allCatalogEntries: RecyclingEntry[] = [
        ...cf10CatalogData.types.map<RecyclingEntry>(t => ({ ...t, address: "", kind: "types" })),
        ...cf10CatalogData.units.map<RecyclingEntry>(u => ({ ...u, address: "", kind: "units" })),
        ...cf10CatalogData.materials.map<RecyclingEntry>(m => ({ ...m, address: "", kind: "materials" })),
        ...cf10CatalogData.depots.map<RecyclingEntry>(d => ({ ...d, description: "", kind: "depots" })),
        ...cf10CatalogData.centers.map<RecyclingEntry>(c => ({ ...c, description: "", kind: "centers" })),
      ];

      for (const entry of allCatalogEntries) {
        const chave = recyclingEntryKey(entry);
        await tx.insert(instanceParameters).values({
          configuracaoInstanciaId: instanceId,
          chave,
          valor: entry,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave],
          set: { valor: entry, updatedAt: new Date() },
        });
        insertedCatalogs++;
      }

      // 1.1 CF10 - ESTOQUES E MOVIMENTAÇÕES
      for (let i = 0; i < cf10MovementsData.length; i++) {
        const item = cf10MovementsData[i];
        const material = cf10CatalogData.materials.find(m => m.code === item.materialCode)!;
        const depot = cf10CatalogData.depots.find(d => d.code === item.depotCode)!;
        const type = cf10CatalogData.types.find(t => t.code === material.typeCode)!;
        const unit = cf10CatalogData.units.find(u => u.code === material.unitCode)!;
        const center = item.destinationCode ? cf10CatalogData.centers.find(c => c.code === item.destinationCode) : null;

        const materialKey = recyclingEntryKey({ ...material, kind: "materials" });
        const depotKey = recyclingEntryKey({ ...depot, kind: "depots" });
        const typeKey = recyclingEntryKey({ ...type, kind: "types" });
        const unitKey = recyclingEntryKey({ ...unit, kind: "units" });
        const destinationKey = center ? recyclingEntryKey({ ...center, kind: "centers" }) : null;

        await tx.insert(recyclingMaterialBindings).values({
          instanceId, materialKey, typeKey, unitKey,
        }).onConflictDoNothing();

        const [existingStock] = await tx.select().from(recyclingStocks).where(
          and(eq(recyclingStocks.instanceId, instanceId), eq(recyclingStocks.materialKey, materialKey), eq(recyclingStocks.depotKey, depotKey))
        );

        const currentQty = existingStock ? new Decimal(existingStock.quantity) : new Decimal(0);
        const moveQty = new Decimal(item.quantity);
        const newQty = item.kind === "ENTRY" ? currentQty.plus(moveQty) : currentQty.minus(moveQty);
        const sequence = (existingStock?.version || 0) + 1;

        if (!existingStock) {
          await tx.insert(recyclingStocks).values({
            instanceId, materialKey, depotKey, typeKey, unitKey, quantity: newQty, version: sequence, updatedAt: new Date(),
          });
        } else {
          await tx.update(recyclingStocks).set({
            quantity: newQty, version: sequence, updatedAt: new Date(),
          }).where(and(eq(recyclingStocks.instanceId, instanceId), eq(recyclingStocks.materialKey, materialKey), eq(recyclingStocks.depotKey, depotKey)));
        }

        const idempotencyKey = `cf10-seed-mov-${i + 1}`;
        const requestHash = createHash("sha256").update(JSON.stringify({ ...item, sequence })).digest("hex");

        const [already] = await tx.select().from(recyclingMovements).where(and(eq(recyclingMovements.instanceId, instanceId), eq(recyclingMovements.idempotencyKey, idempotencyKey)));
        if (!already) {
          await tx.insert(recyclingMovements).values({
            id: `cf10-mov-${i + 1}`,
            instanceId,
            materialKey,
            depotKey,
            kind: item.kind,
            quantity: moveQty,
            amount: new Decimal(item.amount),
            quantityBefore: currentQty,
            quantityAfter: newQty,
            sequence,
            destinationKey,
            origin: item.origin || "",
            notes: item.notes || "",
            snapshot: {
              material: { code: material.code, name: material.name },
              depot: { code: depot.code, name: depot.name },
              materialType: { code: type.code, name: type.name },
              unit: { code: unit.code, name: unit.name },
              destination: center ? { code: center.code, name: center.name, address: center.address } : null,
            },
            occurredOn: item.occurredOn,
            actorUsuarioId: actorId,
            idempotencyKey,
            requestHash,
            createdAt: new Date(`${item.occurredOn}T14:00:00Z`),
          });
          insertedMovements++;
        }
      }

      // ==========================================
      // 2. CF30 - PLANEJAMENTO DE COMPRAS (PCA)
      // ==========================================
      for (const plan of cf30PlanningData) {
        await tx.insert(purchasePlannings).values({
          id: plan.id,
          description: plan.description,
          unit: plan.unit,
          quantity: plan.quantity,
          expectedPeriodStart: plan.expectedPeriodStart,
          expectedPeriodEnd: plan.expectedPeriodEnd,
          estimatedValueDecimal: new Decimal(plan.estimatedValueDecimal),
          status: plan.status,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: purchasePlannings.id,
          set: {
            description: plan.description,
            unit: plan.unit,
            quantity: plan.quantity,
            estimatedValueDecimal: new Decimal(plan.estimatedValueDecimal),
            status: plan.status,
            updatedAt: new Date(),
          },
        });
        insertedPlannings++;

        const docTypes = [
          { type: "PCA" as const, payload: { plano: plan.description, justificativa: "Alinhado aos objetivos do Plano de Contratações Anual 2026", valorEstimado: plan.estimatedValueDecimal } },
          { type: "ETP" as const, payload: plan.etp },
          { type: "TR" as const, payload: plan.tr },
        ];

        for (const doc of docTypes) {
          const docId = `${plan.id}-${doc.type.toLowerCase()}-v1`;
          await tx.insert(purchasePlanningDocumentVersions).values({
            id: docId,
            purchasePlanningId: plan.id,
            documentType: doc.type,
            version: 1,
            status: "APROVADO",
            payload: doc.payload,
            coherenceReport: {
              coherent: true,
              warnings: [],
              checkedAt: new Date().toISOString(),
            },
            actorId,
            reviewerId: actorId,
            reviewReason: "Aprovado em conformidade com o Art. 18 da Lei Federal nº 14.133/2021",
            createdAt: new Date(),
          }).onConflictDoNothing();
          insertedPlanningDocs++;
        }
      }

      // ==========================================
      // 3. CF33 - ATOS E TEXTOS LEGAIS (WEB)
      // ==========================================
      for (const legal of cf33LegalData) {
        await tx.insert(legalTexts).values({
          id: legal.id,
          type: legal.type,
          number: legal.number,
          summary: legal.summary,
          governmentLevel: legal.governmentLevel,
          issuingBody: legal.issuingBody,
          publicationDate: legal.publicationDate,
          effectiveFrom: legal.effectiveFrom,
          status: "VIGENTE",
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: legalTexts.id,
          set: {
            summary: legal.summary,
            status: "VIGENTE",
            updatedAt: new Date(),
          },
        });
        insertedLegalTexts++;

        const versionId = `${legal.id}-ver-1`;
        await tx.insert(legalTextVersions).values({
          id: versionId,
          legalTextId: legal.id,
          versionNumber: 1,
          content: legal.content,
          summary: legal.summary,
          publicationDate: legal.publicationDate,
          effectiveFrom: legal.effectiveFrom,
          status: "VIGENTE",
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: legalTextVersions.id,
          set: {
            content: legal.content,
            summary: legal.summary,
            status: "VIGENTE",
            updatedAt: new Date(),
          },
        });

        const dummyBinaryContent = Buffer.from(`CONTEUDO_OFICIAL_LEGAL_${legal.number}\n${legal.content}`, "utf8");
        const docSha256 = createHash("sha256").update(dummyBinaryContent).digest("hex");
        const databaseDocId = `${legal.id}-doc-original`;

        await tx.insert(legalTextDatabaseDocuments).values({
          id: databaseDocId,
          legalTextVersionId: versionId,
          role: "ORIGINAL",
          filename: legal.documentFilename,
          mimeType: legal.documentFilename.endsWith(".odt") ? "application/vnd.oasis.opendocument.text" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          byteLength: dummyBinaryContent.length,
          hashSha256: docSha256,
          createdById: actorId,
          createdAt: new Date(),
        }).onConflictDoNothing();

        await tx.insert(legalTextDatabaseDocumentBlobs).values({
          documentId: databaseDocId,
          contentBase64: dummyBinaryContent.toString("base64"),
        }).onConflictDoNothing();

        insertedLegalDocs++;
      }

      for (const legacy of cf33LegacySourcesData) {
        const sourceId = `legacy-source-${legacy.externalId.toLowerCase()}`;
        await tx.insert(legacyLegalTextSources).values({
          id: sourceId,
          sourceApplication: legacy.sourceApplication,
          externalId: legacy.externalId,
          type: legacy.type,
          number: legacy.number,
          summary: legacy.summary,
          content: legacy.content,
          issuingBody: legacy.issuingBody,
          publicationDate: legacy.publicationDate,
          effectiveFrom: legacy.effectiveFrom,
          createdAt: new Date(),
        }).onConflictDoNothing();
        insertedLegacySources++;
      }

      return {
        insertedCatalogs,
        insertedMovements,
        insertedPlannings,
        insertedPlanningDocs,
        insertedLegalTexts,
        insertedLegalDocs,
        insertedLegacySources,
      };
    });

    console.log(`\n================================================================`);
    console.log(`  CARGA EXPANDIDA EXECUTADA COM SUCESSO!                        `);
    console.log(`================================================================`);
    console.log(JSON.stringify(result, null, 2));

  } finally {
    await connection.pool.end();
  }
}

main().catch((error) => {
  console.error("\n[ERRO NA CARGA]:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
