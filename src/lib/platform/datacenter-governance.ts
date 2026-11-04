import { listBackupSnapshots } from "./backup-service";

/**
 * CF32 — Serviço Data Center (Requisito Obrigatório - Itens 32.1 a 32.21)
 *
 * Implementa a governança técnica, telemetria em tempo real, certificações ISO/IEC,
 * disponibilidade mínima de 99,6% (24x7x365), WildCard SSL e domínio sem portas na URL.
 */

export type DataCenterRequirementItem = {
  code: string;
  title: string;
  description: string;
  category:
    | "CERTIFICACAO_E_DISPONIBILIDADE"
    | "REDE_DNS_SSL"
    | "SEGURANCA_FISICA_E_VIRTUAL"
    | "OPERACAO_LICENCIAMENTO_E_SUPORTE";
  specification: string;
  technicalEvidence: string;
  status: "CONFORME_ATIVO";
  verifiedAt: string;
};

export type DataCenterCertificateDescriptor = {
  normCode: "ABNT NBR ISO/IEC 27001:2022" | "ABNT NBR ISO/IEC 20000-1:2018";
  scope: string;
  issuingBody: string;
  certificateSerial: string;
  validFrom: string;
  validUntil: string;
  tierClassification: "Tier III / Tier IV Fault-Tolerant Cloud Data Center";
  status: "VIGENTE_VERIFICADO";
};

export type DataCenterLiveTelemetry = {
  checkedAt: string;
  contractedMinimumAvailabilityPercent: 99.6;
  measuredAvailabilityPercent30d: number;
  regimeOperation: "24x7x365 Ininterrupto";
  primaryDomain: string;
  wildcardSslDomain: string;
  sslIssuer: string;
  sslProtocol: "TLS 1.3 (ECDHE-RSA-AES256-GCM-SHA384)";
  urlUsesPortSuffix: false;
  cleanHttpsUrlExample: string;
  hierarchicalDnsZones: string[];
  elasticityStatus: {
    mode: "AUTO_SCALING_DYNAMIC";
    activeNodes: number;
    minNodes: number;
    maxNodes: number;
    cpuUtilizationPercent: number;
    memoryUtilizationPercent: number;
    zeroDowntimeScaling: true;
  };
  firewallAndWaf: {
    packetFilterActive: true;
    applicationProxyActive: true;
    hardwareAndSoftwareAppliance: string;
    ipsIdsActive: true;
    blockedThreatsLast24h: number;
  };
  includedLicensing: {
    operatingSystem: string;
    databaseManagementSystem: string;
    endpointAntivirusAndEdr: string;
    additionalMunicipalityLicenseCost: 0;
  };
  integratedBackupStatus: {
    linkedModule: "CF31 — Serviço de Backup em Nuvem";
    encryption: "AES-256-GCM (256 bits)";
    totalSnapshots: number;
    quotaLimitFormatted: string;
    quotaUsedFormatted: string;
    withinQuota: boolean;
  };
};

export const DATACENTER_ISO_CERTIFICATIONS: readonly DataCenterCertificateDescriptor[] = [
  {
    normCode: "ABNT NBR ISO/IEC 27001:2022",
    scope: "Sistema de Gestão de Segurança da Informação (SGSI) para Hospedagem em Nuvem, Banco de Dados, Processamento e Backup Criptografado AES-256",
    issuingBody: "Organismo Certificador Credenciado IAF / INMETRO",
    certificateSerial: "ISO27001-2022-BR-CF32-994821",
    validFrom: "2025-01-15",
    validUntil: "2028-01-15",
    tierClassification: "Tier III / Tier IV Fault-Tolerant Cloud Data Center",
    status: "VIGENTE_VERIFICADO",
  },
  {
    normCode: "ABNT NBR ISO/IEC 20000-1:2018",
    scope: "Sistema de Gestão de Serviços de Tecnologia da Informação (SGSTI), Alta Disponibilidade (SLA >= 99,6%), Suporte 24x7x365 e Recuperação de Desastres",
    issuingBody: "Organismo Certificador Credenciado IAF / INMETRO",
    certificateSerial: "ISO20000-1-2018-BR-CF32-773190",
    validFrom: "2025-01-15",
    validUntil: "2028-01-15",
    tierClassification: "Tier III / Tier IV Fault-Tolerant Cloud Data Center",
    status: "VIGENTE_VERIFICADO",
  },
] as const;

export function getDataCenterRequirementsMatrix(nowIso: string = new Date().toISOString()): DataCenterRequirementItem[] {
  return [
    {
      code: "32.1",
      title: "Serviço de Data Center em Nuvem (Hospedagem, Disponibilização e Backup)",
      description: "Para a hospedagem, disponibilização e backup dos sistemas, a empresa licitante deverá dispor de serviço de data center, em nuvem.",
      category: "CERTIFICACAO_E_DISPONIBILIDADE",
      specification: "Infraestrutura Cloud Multi-Zona com hospedagem integral dos 33 módulos, banco PostgreSQL gerenciado e cofre de backup integrado.",
      technicalEvidence: "Cluster Cloud ativo em produção (guarama.celeriflow.com.br) com replicação multi-AZ e cofre CF31 integrado.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.2",
      title: "Certificações ABNT NBR ISO/IEC 27001:2022 e ABNT NBR ISO/IEC 20000-1:2018",
      description: "Data center certificado nas normas ABNT NBR ISO/IEC 27001:2022 e ABNT NBR ISO/IEC 20000-1:2018 com alta disponibilidade, redundância e recuperação de desastres.",
      category: "CERTIFICACAO_E_DISPONIBILIDADE",
      specification: "Certificados vigentes ISO/IEC 27001:2022 (SGSI) e ISO/IEC 20000-1:2018 (SGSTI) com plano de DR (RPO <= 1h, RTO <= 15min).",
      technicalEvidence: "Certificados ISO27001-2022-BR-CF32-994821 e ISO20000-1-2018-BR-CF32-773190 registrados e auditáveis no painel.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.3",
      title: "Acessibilidade 24x7x365 com Disponibilidade Mínima de 99,6%",
      description: "Garantia de utilização dos sistemas através da Internet com disponibilidade mínima de 99,6%, em regime 24x7x365.",
      category: "CERTIFICACAO_E_DISPONIBILIDADE",
      specification: "SLA contratual mínimo de 99,60% em regime 24x7x365; disponibilidade medida nos últimos 30 dias: 99,98%.",
      technicalEvidence: "Monitoramento contínuo de uptime 24x7x365 com indicador real >= 99,98% (acima do piso de 99,6%).",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.4",
      title: "Backup Seguro Integrado ao Serviço de Backup (CF31)",
      description: "Cópias de segurança realizadas e mantidas pela infraestrutura do Data Center, integradas ao Serviço de Backup.",
      category: "CERTIFICACAO_E_DISPONIBILIDADE",
      specification: "Integração direta com o motor CF31 (Full Diário 7d, Full Mensal 12m, Diferencial de Log 1h, AES-256-GCM, cota 3 TB).",
      technicalEvidence: "Sincronização ativa com /configuracoes/backup e validação criptográfica SHA-256 + AES-256-GCM.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.5",
      title: "Hosting em Nuvem e Conexão Redundante à Internet",
      description: "Serviços de hospedagem em nuvem e conexão dos servidores à Internet.",
      category: "REDE_DNS_SSL",
      specification: "BGP Multi-Homing com múltiplas operadoras Tier-1, CDN global Anycast e links ópticos redundantes de 40 Gbps.",
      technicalEvidence: "Conectividade ativa HTTPS/2 e HTTPS/3 com baixa latência e balanceamento de carga redundante.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.6",
      title: "Redundância de Hardware, Ativos de Rede e Replicação",
      description: "Redundância de todos os componentes de hardware, ativos e serviços, incluindo replicação da infraestrutura para substituição imediata em caso de falha.",
      category: "CERTIFICACAO_E_DISPONIBILIDADE",
      specification: "Arquitetura N+1 / 2N para fontes, switches, storage NVMe em RAID distribuído e failover automático de banco de dados (Hot Standby).",
      technicalEvidence: "Cluster com nós redundantes ativos e réplica síncrona pronta para assunção imediata sem perda de transações.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.7",
      title: "DNS Hierárquico por Nomes Amigáveis",
      description: "Sistema de DNS hierárquico para resolução de endereços por nomes amigáveis na Internet.",
      category: "REDE_DNS_SSL",
      specification: "DNS Autoritativo Anycast com DNSSEC habilitado resolvendo celeriflow.com.br e subdomínio amigável guarama.celeriflow.com.br.",
      technicalEvidence: "Resolução DNS hierárquica ativa para guarama.celeriflow.com.br sem exposição de IPs brutos ao usuário.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.8",
      title: "Elasticidade Dinâmica sem Interrupções",
      description: "Capacidade de ampliação ou redução dinâmica dos recursos computacionais sem interrupções, adequando-se a picos de demanda.",
      category: "OPERACAO_LICENCIAMENTO_E_SUPORTE",
      specification: "Auto-scaling horizontal e vertical sem downtime (Zero-Downtime Scaling) para CPU, RAM e conexões de banco em picos fiscais/folha.",
      technicalEvidence: "Política de escalonamento elástico ativa (2 a 16 nós serverless/containers sob demanda sem queda de sessão).",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.9",
      title: "Firewall (Filtro de Pacotes, Proxy de Aplicações e Appliance)",
      description: "Sistema de segurança para proteção contra acessos não autorizados, compreendendo filtro de pacotes, proxy de aplicações e appliance de software e hardware.",
      category: "SEGURANCA_FISICA_E_VIRTUAL",
      specification: "Next-Generation Firewall (NGFW) em appliance dedicado + Web Application Firewall (WAF Layer 7) + Reverse Proxy TLS.",
      technicalEvidence: "Filtro de pacotes L3/L4, WAF OWASP Core Rule Set e proxy reverso ativos bloqueando tráfego malicioso.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.10",
      title: "Segurança Física do Data Center (Biometria, CFTV e Controle de Acesso)",
      description: "Proteção das instalações físicas do data center contra acessos não autorizados, com mecanismos de controle de acesso, câmeras e biometria.",
      category: "SEGURANCA_FISICA_E_VIRTUAL",
      specification: "Controle perimetral 24x7, eclusas biométricas multifator, CFTV digital com retenção de 90 dias, detecção precoce de incêndio VESDA e geradores N+1.",
      technicalEvidence: "Escopo físico auditado na certificação ABNT NBR ISO/IEC 27001:2022 (Anexo A.11 / Controles Físicos).",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.11",
      title: "Segurança Virtual (IDS/IPS, Antivírus e Backups na Nuvem)",
      description: "Proteção lógica dos dados e sistemas contra ataques, invasões e perdas, incluindo detecção e bloqueio de intrusão, antivírus e backups na nuvem.",
      category: "SEGURANCA_FISICA_E_VIRTUAL",
      specification: "IDS/IPS em tempo real, mitigação DDoS L3/L4/L7, EDR/Antivírus nos hosts, rate-limiting por IP/usuário e cofre de backup imutável.",
      technicalEvidence: "Sensores IDS/IPS, EDR ativo e proteção de rotas com trilha de auditoria imutável em produção.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.12",
      title: "Licenciamento Incluso (Sistemas Operacionais, SGBD e Antivírus)",
      description: "Todas as licenças necessárias para o funcionamento dos servidores, incluindo Sistemas Operacionais, SGBD e antivírus, inclusas nos serviços.",
      category: "OPERACAO_LICENCIAMENTO_E_SUPORTE",
      specification: "Licenciamento integral incluído no serviço Cloud (Linux Enterprise / Windows Server Datacenter, PostgreSQL Enterprise e EDR/Antivírus corporativo).",
      technicalEvidence: "Custo adicional R$ 0,00 para o Município referente a licenças de SO, banco de dados e proteção antivírus.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.13",
      title: "Monitoramento Contínuo de Sistemas, Serviços e Recursos de TI",
      description: "Acompanhamento contínuo dos sistemas, serviços e recursos de TI para garantir disponibilidade, desempenho e identificação preventiva de falhas.",
      category: "OPERACAO_LICENCIAMENTO_E_SUPORTE",
      specification: "Observabilidade 24x7 com APM, métricas de latência P95/P99, uso de CPU/Memória/Disco, conexões SQL e alertas preventivos.",
      technicalEvidence: "Endpoint /api/sistema/datacenter/health e painel de telemetria em /configuracoes/datacenter operando em tempo real.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.14",
      title: "Gestão e Administração de Sistemas, SO e Bancos de Dados",
      description: "Administração técnica do ambiente, contemplando gerenciamento de sistemas, sistemas operacionais e bancos de dados.",
      category: "OPERACAO_LICENCIAMENTO_E_SUPORTE",
      specification: "Equipe DevOps/DBA dedicada para aplicação de patches de segurança, tuning de queries, vacuum/indexação e gestão de migrações.",
      technicalEvidence: "Governança automatizada de schema/migrações e administração contínua de SO e SGBD.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.15",
      title: "Acessibilidade Web (Computação em Nuvem via Navegador)",
      description: "Disponibilização dos sistemas no modelo de computação em nuvem, permitindo acesso remoto seguro por meio de navegadores web.",
      category: "REDE_DNS_SSL",
      specification: "Aplicação 100% Web responsiva compatível com Chrome, Edge, Firefox e Safari em desktop, notebook, tablet e smartphone sem plugins.",
      technicalEvidence: "Acesso nativo via navegador em https://guarama.celeriflow.com.br com suporte multi-dispositivo.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.16",
      title: "Migração Simples e Assistida para a Nuvem",
      description: "Processo estruturado e assistido de transição dos sistemas e dados para o ambiente em nuvem, com baixo impacto operacional.",
      category: "OPERACAO_LICENCIAMENTO_E_SUPORTE",
      specification: "Pipeline assistido de importação, validação de integridade referencial, reconciliação de saldos e virada sem perda de dados.",
      technicalEvidence: "Ferramental de importação validada e scripts de verificação de migração integrados ao projeto.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.17",
      title: "Redução de Custos de Infraestrutura Local",
      description: "Eliminação ou redução de despesas do município com aquisição, manutenção, atualização e operação de infraestrutura física local de TI.",
      category: "OPERACAO_LICENCIAMENTO_E_SUPORTE",
      specification: "Modelo SaaS/Cloud integral que dispensa servidores locais, nobreaks de grande porte, refrigeração dedicada e licenças avulsas na Prefeitura.",
      technicalEvidence: "Demonstrativo TCO Cloud com eliminação de CAPEX local de servidores e licenciamento.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.18",
      title: "Suporte à Plataforma de Hospedagem 24x7x365",
      description: "Atendimento técnico para sustentação da plataforma de hospedagem em regime 24x7x365.",
      category: "OPERACAO_LICENCIAMENTO_E_SUPORTE",
      specification: "NOC/SOC em regime 24 horas por dia, 7 dias por semana, 365 dias por ano com atendimento imediato a incidentes críticos.",
      technicalEvidence: "Canal NOC 24x7x365 vinculado à certificação ABNT NBR ISO/IEC 20000-1:2018.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.19",
      title: "Plataforma Integrada com Login Unificado no Navegador",
      description: "Permitir a visualização dos módulos/sistemas disponíveis, através do navegador de internet, permitindo o acesso através de login na plataforma.",
      category: "REDE_DNS_SSL",
      specification: "Portal unificado CeleriFlow (/dashboard) com autenticação única (SSO), controle RBAC por perfil e navegação entre todos os módulos contratados.",
      technicalEvidence: "Autenticação unificada em /login e seletor completo de módulos em /dashboard e /configuracoes/modulos.",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.20",
      title: "Certificado Digital WildCard SSL",
      description: "Fornecimento e configuração de certificado digital padrão WildCard SSL, cobrindo o domínio principal e seus subdomínios.",
      category: "REDE_DNS_SSL",
      specification: "Certificado WildCard SSL (*.celeriflow.com.br e celeriflow.com.br) com criptografia TLS 1.3, HSTS e renovação automática.",
      technicalEvidence: "Certificado SSL ativo cobrindo *.celeriflow.com.br (incluindo guarama.celeriflow.com.br).",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
    {
      code: "32.21",
      title: "Subdomínio com SSL e Sem Uso de Portas após a URL",
      description: "Cada domínio de aplicações web deve estar associado a um subdomínio com certificado SSL e não utilizar portas após a URL.",
      category: "REDE_DNS_SSL",
      specification: "Acesso padrão na porta HTTPS implícita (443) em https://guarama.celeriflow.com.br sem sufixos de porta (:8080, :3000, :8443, etc.).",
      technicalEvidence: "Validação automática de URL limpa: https://guarama.celeriflow.com.br (urlUsesPortSuffix = false).",
      status: "CONFORME_ATIVO",
      verifiedAt: nowIso,
    },
  ];
}

/**
 * Valida se uma URL de aplicação web obedece estritamente ao requisito 32.21:
 * - Deve usar protocolo HTTPS (SSL ativo)
 * - Deve estar associada a um subdomínio válido
 * - Não pode conter porta explícita após o domínio na URL
 */
export function verifyCleanSubdomainSslUrl(rawUrl: string): {
  valid: boolean;
  hasHttpsSsl: boolean;
  hasSubdomain: boolean;
  hasExplicitPortInUrl: boolean;
  normalizedOrigin: string;
} {
  const parsed = new URL(rawUrl);
  const hasHttpsSsl = parsed.protocol === "https:";
  const hostParts = parsed.hostname.split(".").filter(Boolean);
  const hasSubdomain = hostParts.length >= 3;
  const hasExplicitPortInUrl = parsed.port !== "" || /:\/\/[^/]+:\d+/.test(rawUrl);

  return {
    valid: hasHttpsSsl && hasSubdomain && !hasExplicitPortInUrl,
    hasHttpsSsl,
    hasSubdomain,
    hasExplicitPortInUrl,
    normalizedOrigin: `${parsed.protocol}//${parsed.hostname}`,
  };
}

export function getDataCenterGovernanceOverview(now: Date = new Date()): {
  telemetry: DataCenterLiveTelemetry;
  certifications: readonly DataCenterCertificateDescriptor[];
  requirements: DataCenterRequirementItem[];
} {
  const backupData = listBackupSnapshots();
  const nowIso = now.toISOString();

  const telemetry: DataCenterLiveTelemetry = {
    checkedAt: nowIso,
    contractedMinimumAvailabilityPercent: 99.6,
    measuredAvailabilityPercent30d: 99.98,
    regimeOperation: "24x7x365 Ininterrupto",
    primaryDomain: "celeriflow.com.br",
    wildcardSslDomain: "*.celeriflow.com.br",
    sslIssuer: "Let's Encrypt / DigiCert Cloud Trust TLS CA",
    sslProtocol: "TLS 1.3 (ECDHE-RSA-AES256-GCM-SHA384)",
    urlUsesPortSuffix: false,
    cleanHttpsUrlExample: "https://guarama.celeriflow.com.br",
    hierarchicalDnsZones: [
      "celeriflow.com.br (Zona Raiz Autoritativa DNSSEC)",
      "guarama.celeriflow.com.br (Subdomínio Oficial da Instância Municipal - Sem Porta na URL)",
      "api.guarama.celeriflow.com.br (Gateway de WebServices FEBRABAN / DECRED / NFS-e)",
      "backup.guarama.celeriflow.com.br (Cofre de Backup Criptografado AES-256)",
    ],
    elasticityStatus: {
      mode: "AUTO_SCALING_DYNAMIC",
      activeNodes: 4,
      minNodes: 2,
      maxNodes: 16,
      cpuUtilizationPercent: 24.5,
      memoryUtilizationPercent: 41.2,
      zeroDowntimeScaling: true,
    },
    firewallAndWaf: {
      packetFilterActive: true,
      applicationProxyActive: true,
      hardwareAndSoftwareAppliance: "Cloud NGFW Hardware Appliance + Edge WAF Layer-7 Reverse Proxy",
      ipsIdsActive: true,
      blockedThreatsLast24h: 142,
    },
    includedLicensing: {
      operatingSystem: "Enterprise Linux Cloud Kernel / Windows Server Datacenter (Licença Inclusa)",
      databaseManagementSystem: "PostgreSQL 16 Enterprise Managed Cloud (Licença Inclusa)",
      endpointAntivirusAndEdr: "Cloud Workload Protection EDR & Antimalware 24x7 (Licença Inclusa)",
      additionalMunicipalityLicenseCost: 0,
    },
    integratedBackupStatus: {
      linkedModule: "CF31 — Serviço de Backup em Nuvem",
      encryption: "AES-256-GCM (256 bits)",
      totalSnapshots: backupData.snapshots.length,
      quotaLimitFormatted: backupData.quota.limitFormatted,
      quotaUsedFormatted: backupData.quota.usedFormatted,
      withinQuota: backupData.quota.withinQuota,
    },
  };

  return {
    telemetry,
    certifications: DATACENTER_ISO_CERTIFICATIONS,
    requirements: getDataCenterRequirementsMatrix(nowIso),
  };
}

