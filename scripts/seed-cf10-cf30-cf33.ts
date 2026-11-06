import { config } from "dotenv";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { systemInstances, instanceParameters } from "../src/db/schema/instance-configuration";
import { recyclingMaterialBindings, recyclingStocks, recyclingMovements } from "../src/db/schema/environment-recycling";
import { legalTexts, legalTextVersions } from "../src/db/schema/master-data";
import { legalTextDatabaseDocuments, legalTextDatabaseDocumentBlobs, legacyLegalTextSources } from "../src/db/schema/legal-documents";
import { purchasePlannings, purchasePlanningDocumentVersions } from "../src/db/schema/procurement-requests";
import { users } from "../src/db/schema/identity";
import { secretariats, departments } from "../src/db/schema/administration";
import { recyclingEntryKey, type RecyclingEntry } from "../src/lib/environment/recycling-catalog";

config({ path: ".env.production.local", quiet: true });
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export const DATASET_ID = "poc-guarama-cf10-cf30-cf33-v1";

export const cf10CatalogData = {
  types: [
    { code: "TYP-RECICLAVEL", name: "Materiais Recicláveis Secos", description: "Resíduos sólidos secos triados em coleta seletiva municipal", active: true },
    { code: "TYP-METAIS", name: "Metais Ferrosos e Não-Ferrosos", description: "Sucata metálica, latinhas de alumínio e ligas", active: true },
    { code: "TYP-PLASTICOS", name: "Polímeros e Termoplásticos", description: "Embalagens plásticas pós-consumo (PET, PEAD, PP)", active: true },
    { code: "TYP-PAPEL", name: "Papéis e Celulose", description: "Papelão ondulado, aparas brancas e jornais", active: true },
    { code: "TYP-VIDRO", name: "Vidros e Frascos", description: "Cacos de vidro verde, âmbar e transparente para logística reversa", active: true },
  ],
  units: [
    { code: "KG", name: "Quilograma", description: "Unidade padrão de pesagem (kg)", active: true },
    { code: "TON", name: "Tonelada", description: "Carga pesada em balança rodoviária (t)", active: true },
    { code: "FARDO", name: "Fardo Prensado", description: "Unidade de volume prensado para armazenagem", active: true },
  ],
  materials: [
    { code: "MAT-PAPELAO", name: "Papelão Ondulado Prensado (Tipo I)", description: "Caixas de papelão limpas, triadas e enfardadas", typeCode: "TYP-PAPEL", unitCode: "KG", active: true },
    { code: "MAT-PET-TRANSP", name: "Garrafa PET Cristal Prensada", description: "Polietileno tereftalato transparente prensado em fardos", typeCode: "TYP-PLASTICOS", unitCode: "KG", active: true },
    { code: "MAT-ALUMINIO", name: "Latinhas de Alumínio Prensadas", description: "Latas de bebidas prensadas com pureza > 98%", typeCode: "TYP-METAIS", unitCode: "KG", active: true },
    { code: "MAT-PEAD", name: "Plástico PEAD Rígido", description: "Frascos de produtos de limpeza e bombonas moídas", typeCode: "TYP-PLASTICOS", unitCode: "KG", active: true },
    { code: "MAT-PAPEL-BRANCO", name: "Papel Branco Tipo Sulfite / Arquivo", description: "Aparas de papel de escritório e arquivos descartados", typeCode: "TYP-PAPEL", unitCode: "KG", active: true },
    { code: "MAT-VIDRO-TRIT", name: "Vidro Moído Misto", description: "Cacos de vidro de garrafas e potes pós-consumo", typeCode: "TYP-VIDRO", unitCode: "KG", active: true },
  ],
  depots: [
    { code: "DEP-CENTRAL", name: "Ecoponto Central - Bairro das Veredas", address: "Rua das Palmeiras, 450, Bairro Central", active: true },
    { code: "DEP-TRIAGEM", name: "Galpão Municipal de Triagem - Distrito Industrial", address: "Avenida dos Pioneiros, 1200, Distrito Industrial", active: true },
    { code: "DEP-NORTE", name: "Ponto de Entrega Voluntária (PEV) Norte", address: "Rua das Acácias, 85, Jardim das Acácias", active: true },
  ],
  centers: [
    { code: "COOP-VEREDAS", name: "COOPVER - Cooperativa de Catadores Unidos das Veredas", address: "Rua da Esperança, 180, Bairro Boa Vista", active: true },
    { code: "DEST-RECICLAMINA", name: "Recicla Minas Soluções Ambientais Ltda.", address: "Rodovia MG-427, Km 12, Zona Rural", active: true },
    { code: "DEST-SIDERURGICA", name: "Siderúrgica e Fundição Vale Verde S/A", address: "Avenida Central, 3500, Distrito Industrial", active: true },
  ],
};

export const cf10MovementsData = [
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "4500.000", amount: "0.00", occurredOn: "2026-09-08", origin: "Coleta Seletiva Semanal - Setor Central e Bairro Veredas", notes: "Pesagem bruta no galpão com balança rodoviária calibrada." },
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "3850.500", amount: "0.00", occurredOn: "2026-09-15", origin: "Coleta Seletiva Semanal - Setor Comercial e Bancário", notes: "Triagem concluída em esteira mecanizada." },
  { materialCode: "MAT-PAPELAO", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "6000.000", amount: "3600.00", occurredOn: "2026-09-22", destinationCode: "COOP-VEREDAS", notes: "Venda de 12 fardos prensados com repasse direto aos cooperados." },
  { materialCode: "MAT-ALUMINIO", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "820.000", amount: "0.00", occurredOn: "2026-09-10", origin: "Ponto de Entrega Voluntária (PEV) e Campanhas Escolares", notes: "Lote de latinhas pós-eventos municipais." },
  { materialCode: "MAT-ALUMINIO", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "640.200", amount: "0.00", occurredOn: "2026-09-25", origin: "Campanha Conscientização Ambiental das Escolas", notes: "Entrega voluntária triada." },
  { materialCode: "MAT-ALUMINIO", depotCode: "DEP-CENTRAL", kind: "EXIT" as const, quantity: "1200.000", amount: "8400.00", occurredOn: "2026-10-02", destinationCode: "DEST-SIDERURGICA", notes: "Destinação para reciclagem industrial com valorização do metal a R$ 7,00/kg." },
  { materialCode: "MAT-PET-TRANSP", depotCode: "DEP-TRIAGEM", kind: "ENTRY" as const, quantity: "2950.000", amount: "0.00", occurredOn: "2026-09-12", origin: "Coleta Seletiva Domiciliar de Bairros Residenciais", notes: "Garrafas PET transparentes desrotuladas." },
  { materialCode: "MAT-PET-TRANSP", depotCode: "DEP-TRIAGEM", kind: "EXIT" as const, quantity: "2500.000", amount: "4250.00", occurredOn: "2026-09-28", destinationCode: "DEST-RECICLAMINA", notes: "Venda para processamento de fibra têxtil sustentável a R$ 1,70/kg." },
  { materialCode: "MAT-PEAD", depotCode: "DEP-NORTE", kind: "ENTRY" as const, quantity: "1400.000", amount: "0.00", occurredOn: "2026-09-18", origin: "Coleta Seletiva Setor Norte e UBSs", notes: "Frascos plásticos rígidos e bombonas limpas." },
  { materialCode: "MAT-VIDRO-TRIT", depotCode: "DEP-CENTRAL", kind: "ENTRY" as const, quantity: "3200.000", amount: "0.00", occurredOn: "2026-09-20", origin: "Pontos de Entrega em Bares e Restaurantes Municipais", notes: "Cacos triturados em caçamba metálica estanque." },
];

export const cf30PlanningData = [
  {
    id: "cf30-plan-combustiveis-2026",
    description: "Aquisição continuada de combustíveis (Gasolina Comum e Óleo Diesel S10) para abastecimento e manutenção da frota de veículos oficiais das Secretarias de Saúde, Obras e Serviços Públicos, Educação e Segurança.",
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
];

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

O PREFEITO MUNICIPAL DE CAMPO FLORIDO, ESTADO DE MINAS GERAIS, faço saber que a Câmara Municipal aprovou e eu sanciono a seguinte Lei:

CAPÍTULO I - DAS DISPOSIÇÕES GERAIS E OBJETIVOS

Art. 1º Fica instituído o Plano Municipal de Gestão Integrada de Resíduos Sólidos (PMGIRS), com fundamento na Lei Federal nº 12.305/2010 (Política Nacional de Resíduos Sólidos), destinado a ordenar a gestão, gerenciamento, redução, reutilização, reciclagem e destinação ambientalmente adequada dos resíduos gerados no território municipal.

Art. 2º São princípios orientadores do PMGIRS:
I - A prevenção e a não geração de resíduos sólidos;
II - A redução, reutilização, reciclagem e tratamento dos resíduos antes da destinação final;
III - A responsabilidade compartilhada pelo ciclo de vida dos produtos;
IV - A inclusão socioprodutiva dos catadores de materiais recicláveis organizados em cooperativas e associações;
V - O direito da sociedade à informação e ao controle social da gestão dos resíduos.

CAPÍTULO II - DA COLETA SELETIVA E DOS ECOPONTOS

Art. 3º O Poder Executivo Municipal implantará o Programa Municipal de Coleta Seletiva em todo o perímetro urbano e distritos, com rotas setoriais pré-divulgadas à população.
§ 1º Fica autorizada a celebração de termos de colaboração ou contratos com cooperativas e associações de catadores de materiais recicláveis, com dispensa de licitação fundamentada na Lei Federal nº 14.133/2021.
§ 2º O Município disponibilizará Ecopontos e Pontos de Entrega Voluntária (PEVs) para descarte segregado de resíduos secos, entulhos da construção civil e volumosos.

Art. 4º Fica proibido o descarte de resíduos recicláveis em vias públicas, terrenos baldios, cursos d'água ou áreas de preservação permanente, sujeitando o infrator às penalidades previstas no Código de Posturas Municipal.

CAPÍTULO III - DAS DISPOSIÇÕES FINAIS

Art. 5º As despesas decorrentes da execução desta Lei correrão por conta das dotações orçamentárias próprias consignadas na Secretaria Municipal de Meio Ambiente e Desenvolvimento Sustentável.

Art. 6º Esta Lei entra em vigor na data de sua publicação, revogadas as disposições em contrário.

Prefeitura Municipal, 15 de março de 2026.
Prefeito Municipal`,
    documentFilename: "Lei_Municipal_1482_2026_PMGIRS.odt",
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

O PREFEITO MUNICIPAL DE CAMPO FLORIDO, ESTADO DE MINAS GERAIS, faço saber que a Câmara Municipal aprovou e eu sanciono a seguinte Lei:

Art. 1º Esta Lei regulamenta as normas gerais de licitação e contratação pública previstas na Lei Federal nº 14.133/2021 no âmbito dos órgãos da Administração Direta, Autárquica e Fundacional do Município.

Art. 2º A fase preparatória dos processos de contratação observará o planejamento governamental consignado no Plano de Contratações Anual (PCA), com a elaboração obrigatória de:
I - Documento de Formalização de Demanda (DFD);
II - Estudo Técnico Preliminar (ETP);
III - Termo de Referência (TR) ou Projeto Básico;
IV - Pesquisa de preços em conformidade com as regras municipais de balizamento.

Art. 3º Esta Lei entra em vigor na data de sua publicação.

Prefeitura Municipal, 02 de abril de 2026.
Prefeito Municipal`,
    documentFilename: "Lei_Municipal_1483_2026_Regulamentacao_14133.docx",
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

"Regulamenta a elaboração, consolidação e publicação do Plano de Contratações Anual (PCA) no âmbito do Poder Executivo Municipal e estabelece o cronograma de envio das demandas setoriais para o exercício subsequente."

O PREFEITO MUNICIPAL, no uso das atribuições legais que lhe confere a Lei Orgânica Municipal, DECRETA:

Art. 1º Fica aprovado o regulamento para elaboração do Plano de Contratações Anual (PCA) da Administração Municipal.
Art. 2º As Secretarias Municipais enviarão suas demandas formalizadas até 15 de setembro de cada exercício.
Art. 3º O PCA consolidado será publicado no Portal Nacional de Contratações Públicas (PNCP) e no Diário Oficial do Município.

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

"Estabelece o regulamento operacional do Ecoponto Central e dos Pontos de Entrega Voluntária (PEV), disciplinando os horários de recebimento, triagem e pesagem de materiais recicláveis."

O PREFEITO MUNICIPAL, no uso de suas atribuições, DECRETA:

Art. 1º O Ecoponto Central funcionará de segunda a sexta-feira, das 07h00 às 17h00, e aos sábados das 08h00 às 12h00.
Art. 2º Todos os lotes de materiais recebidos serão pesados e registrados no sistema de controle de estoque municipal.

Prefeitura Municipal, 01 de junho de 2026.`,
    documentFilename: "Decreto_3125_2026_Ecopontos.odt",
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

"Designa os servidores integrantes da Comissão de Contratação e os Agentes de Contratação do Município para o exercício de 2026, nos termos da Lei Federal nº 14.133/2021."

A SECRETÁRIA MUNICIPAL DE ADMINISTRAÇÃO, no uso de suas atribuições:

RESOLVE:
Art. 1º Designar os agentes de contratação e equipe de apoio para condução dos certames licitatórios do exercício de 2026.
Art. 2º Esta Portaria entra em vigor na data de sua publicação.`,
    documentFilename: "Portaria_089_2026_Agentes_Contratacao.docx",
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
];

async function main() {
  const isApply = process.argv.includes("--apply");
  console.log(`\n======================================================`);
  console.log(`  CARGA DE DADOS SEMISINTÉTICOS (CF10, CF30, CF33)   `);
  console.log(`  Modo: ${isApply ? "APPLY (Gravação real)" : "PREVIEW (Simulação / Dry-Run)"}`);
  console.log(`======================================================\n`);

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

  console.log("Plano da Carga:");
  console.log(JSON.stringify(previewStats, null, 2));

  if (!isApply) {
    console.log(`\n[AVISO] Para aplicar a carga no banco de dados, execute:`);
    console.log(`  npx tsx scripts/seed-cf10-cf30-cf33.ts --apply\n`);
    return;
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Variável DATABASE_URL ou DATABASE_URL_UNPOOLED não configurada no ambiente.");
  }

  const connection = createDatabaseConnection(connectionString);
  const { db } = connection;

  try {
    // Buscar ou resolver a instância municipal padrão
    const [instance] = await db.select().from(systemInstances).limit(1);
    const instanceId = instance?.id || "one";

    // Buscar um usuário administrador ativo para autoria das movimentações
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
      const allCatalogEntries: [RecyclingEntry["kind"], RecyclingEntry][] = [
        ...cf10CatalogData.types.map(t => ["types" as const, { ...t, kind: "types" as const }]),
        ...cf10CatalogData.units.map(u => ["units" as const, { ...u, kind: "units" as const }]),
        ...cf10CatalogData.materials.map(m => ["materials" as const, { ...m, kind: "materials" as const }]),
        ...cf10CatalogData.depots.map(d => ["depots" as const, { ...d, kind: "depots" as const }]),
        ...cf10CatalogData.centers.map(c => ["centers" as const, { ...c, kind: "centers" as const }]),
      ];

      for (const [kind, entry] of allCatalogEntries) {
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

        // Binding material x tipo x unidade
        await tx.insert(recyclingMaterialBindings).values({
          instanceId, materialKey, typeKey, unitKey,
        }).onConflictDoNothing();

        // Posição de estoque
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
          estimatedValueDecimal: plan.estimatedValueDecimal,
          status: plan.status,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: purchasePlannings.id,
          set: {
            description: plan.description,
            unit: plan.unit,
            quantity: plan.quantity,
            estimatedValueDecimal: plan.estimatedValueDecimal,
            status: plan.status,
            updatedAt: new Date(),
          },
        });
        insertedPlannings++;

        // Documentos da fase interna (PCA, ETP, TR)
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

        // 3.1 Documento Word/ODT gravado no banco de dados (requisito 33.11)
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

      // 3.2 Fontes legadas prontas para importação (requisito 33.15)
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

    console.log(`\n======================================================`);
    console.log(`  CARGA EXECUTADA COM SUCESSO!                       `);
    console.log(`======================================================`);
    console.log(JSON.stringify(result, null, 2));

  } finally {
    await connection.pool.end();
  }
}

main().catch((error) => {
  console.error("\n[ERRO NA CARGA]:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
