import dns from "node:dns/promises";
import tls from "node:tls";

/**
 * CF32 — Serviço Data Center (32.1 a 32.21).
 *
 * Muitos itens deste módulo são requisitos do PROVEDOR de infraestrutura (certificações, SLA, segurança física,
 * redundância, licenças, suporte). O sistema não gera nem mede essas evidências: aqui elas aparecem como
 * "DEPENDE_DO_PROVEDOR" até que o provedor/VPS seja definido e apresente a documentação.
 * O que o sistema consegue verificar de verdade — URL limpa com HTTPS e subdomínio, DNS e certificado TLS do
 * host que atende a requisição — é verificado em tempo real por `probeHostSecurity`.
 */

export type DataCenterRequirementStatus = "VERIFICADO_NO_SISTEMA" | "DEPENDE_DO_PROVEDOR";

export type DataCenterRequirementCategory =
  | "CERTIFICACAO_E_DISPONIBILIDADE"
  | "REDE_DNS_SSL"
  | "SEGURANCA_FISICA_E_VIRTUAL"
  | "OPERACAO_LICENCIAMENTO_E_SUPORTE";

export type DataCenterRequirementItem = {
  code: string;
  title: string;
  description: string;
  category: DataCenterRequirementCategory;
  /** O que o edital exige comprovar. */
  specification: string;
  /** O que existe hoje, sem inventar: evidência do sistema ou pendência do provedor. */
  technicalEvidence: string;
  status: DataCenterRequirementStatus;
};

export type DataCenterCertificateDescriptor = {
  normCode: "ABNT NBR ISO/IEC 27001:2022" | "ABNT NBR ISO/IEC 20000-1:2018";
  scope: string;
  status: "A_COMPROVAR_PELO_PROVEDOR";
  requiredEvidence: string;
};

export const DATACENTER_ISO_CERTIFICATIONS: readonly DataCenterCertificateDescriptor[] = [
  {
    normCode: "ABNT NBR ISO/IEC 27001:2022",
    scope: "Sistema de Gestão de Segurança da Informação do data center que hospedará a aplicação.",
    status: "A_COMPROVAR_PELO_PROVEDOR",
    requiredEvidence: "Certificado vigente emitido por organismo certificador acreditado, com escopo que cubra a hospedagem contratada.",
  },
  {
    normCode: "ABNT NBR ISO/IEC 20000-1:2018",
    scope: "Sistema de Gestão de Serviços de TI do data center (alta disponibilidade, suporte e recuperação de desastres).",
    status: "A_COMPROVAR_PELO_PROVEDOR",
    requiredEvidence: "Certificado vigente emitido por organismo certificador acreditado, mais o plano de recuperação de desastres.",
  },
] as const;

const PROVIDER = (what: string) => `Depende do provedor/VPS (ainda não definido): ${what}`;

export function getDataCenterRequirementsMatrix(): DataCenterRequirementItem[] {
  const item = (
    code: string,
    title: string,
    description: string,
    category: DataCenterRequirementCategory,
    specification: string,
    technicalEvidence: string,
    status: DataCenterRequirementStatus,
  ): DataCenterRequirementItem => ({ code, title, description, category, specification, technicalEvidence, status });

  return [
    item("32.1", "Data center em nuvem (hospedagem, disponibilização e backup)",
      "Para a hospedagem, disponibilização e backup dos sistemas, a licitante deverá dispor de serviço de data center, em nuvem.",
      "CERTIFICACAO_E_DISPONIBILIDADE", "Contrato de hospedagem em nuvem cobrindo aplicação, banco e backup.",
      PROVIDER("contrato e infraestrutura de hospedagem."), "DEPENDE_DO_PROVEDOR"),
    item("32.2", "Certificações ABNT NBR ISO/IEC 27001:2022 e 20000-1:2018",
      "Certificações e acreditações de segurança e conformidade emitidas pela ABNT NBR ISO/IEC 27001:2022 e 20000-1:2018, com alta disponibilidade, redundância e recuperação de desastres.",
      "CERTIFICACAO_E_DISPONIBILIDADE", "Certificados vigentes e plano de recuperação de desastres do provedor.",
      PROVIDER("certificados emitidos por organismo certificador e plano de DR. O sistema não emite nem comprova certificações."), "DEPENDE_DO_PROVEDOR"),
    item("32.3", "Disponibilidade mínima de 99,6% (24x7x365)",
      "Garantia de utilização dos sistemas pela Internet com disponibilidade mínima de 99,6%, em regime 24x7x365.",
      "CERTIFICACAO_E_DISPONIBILIDADE", "SLA contratual e medição contínua de disponibilidade.",
      PROVIDER("SLA contratual e ferramenta de monitoramento de uptime. Nenhuma disponibilidade é medida por este sistema."), "DEPENDE_DO_PROVEDOR"),
    item("32.4", "Backup seguro integrado ao serviço de backup (CF31)",
      "Cópias de segurança realizadas e mantidas pela infraestrutura do data center, integradas ao Serviço de Backup.",
      "CERTIFICACAO_E_DISPONIBILIDADE", "Backup real do banco e dos arquivos, cifrado e armazenado fora da aplicação.",
      PROVIDER("destino de armazenamento e agendador do backup (CF31 hoje é protótipo)."), "DEPENDE_DO_PROVEDOR"),
    item("32.5", "Hospedagem em nuvem e conexão à Internet",
      "Serviços de hospedagem em nuvem e conexão dos servidores à Internet.",
      "REDE_DNS_SSL", "Servidores conectados à Internet com links redundantes.",
      PROVIDER("links e rede do provedor."), "DEPENDE_DO_PROVEDOR"),
    item("32.6", "Redundância de hardware, ativos e replicação",
      "Redundância de todos os componentes de hardware, ativos e serviços, incluindo replicação da infraestrutura.",
      "CERTIFICACAO_E_DISPONIBILIDADE", "Arquitetura redundante e replicação com failover.",
      PROVIDER("arquitetura de redundância e replicação."), "DEPENDE_DO_PROVEDOR"),
    item("32.7", "DNS hierárquico com nomes amigáveis",
      "Sistema de DNS hierárquico para resolução de endereços por nomes amigáveis na Internet.",
      "REDE_DNS_SSL", "Subdomínio da aplicação resolvendo por DNS.",
      "Verificado em tempo real pelo botão de diagnóstico: resolução DNS do host que atende a requisição.", "VERIFICADO_NO_SISTEMA"),
    item("32.8", "Elasticidade dinâmica sem interrupções",
      "Ampliação ou redução dinâmica dos recursos computacionais sem interrupções.",
      "OPERACAO_LICENCIAMENTO_E_SUPORTE", "Escalonamento automático sem queda de sessão.",
      PROVIDER("capacidade de escalonamento da hospedagem escolhida."), "DEPENDE_DO_PROVEDOR"),
    item("32.9", "Firewall (filtro de pacotes, proxy de aplicações, appliance)",
      "Sistema de segurança contra acessos não autorizados: filtro de pacotes, proxy de aplicações e appliance de software e hardware.",
      "SEGURANCA_FISICA_E_VIRTUAL", "Firewall/WAF documentado e ativo.",
      PROVIDER("firewall e WAF da hospedagem."), "DEPENDE_DO_PROVEDOR"),
    item("32.10", "Segurança física do data center",
      "Proteção das instalações físicas, com controle de acesso, câmeras e biometria.",
      "SEGURANCA_FISICA_E_VIRTUAL", "Descrição e auditoria da segurança física do data center.",
      PROVIDER("documentação do data center."), "DEPENDE_DO_PROVEDOR"),
    item("32.11", "Segurança virtual (IDS/IPS, antivírus, backups)",
      "Proteção lógica contra ataques e invasões, com detecção e bloqueio de intrusão, antivírus e backups na nuvem.",
      "SEGURANCA_FISICA_E_VIRTUAL", "IDS/IPS e antivírus ativos nos servidores.",
      PROVIDER("ferramentas de segurança dos servidores."), "DEPENDE_DO_PROVEDOR"),
    item("32.12", "Licenciamento incluso (SO, SGBD e antivírus)",
      "Todas as licenças necessárias, incluindo sistemas operacionais, SGBD e antivírus, inclusas nos serviços.",
      "OPERACAO_LICENCIAMENTO_E_SUPORTE", "Relação de licenças cobertas no contrato.",
      PROVIDER("licenças da VPS/servidores escolhidos."), "DEPENDE_DO_PROVEDOR"),
    item("32.13", "Monitoramento contínuo",
      "Acompanhamento contínuo dos sistemas, serviços e recursos de TI.",
      "OPERACAO_LICENCIAMENTO_E_SUPORTE", "Ferramenta de monitoramento com alertas.",
      PROVIDER("ferramenta de monitoramento. O diagnóstico desta tela é pontual, não é monitoramento contínuo."), "DEPENDE_DO_PROVEDOR"),
    item("32.14", "Gestão e administração de sistemas, SO e bancos",
      "Administração técnica do ambiente: sistemas, sistemas operacionais e bancos de dados.",
      "OPERACAO_LICENCIAMENTO_E_SUPORTE", "Responsável e rotina de administração do ambiente.",
      PROVIDER("equipe e processo de administração da infraestrutura."), "DEPENDE_DO_PROVEDOR"),
    item("32.15", "Acesso via navegador (computação em nuvem)",
      "Sistemas em nuvem, com acesso remoto seguro por navegadores web.",
      "REDE_DNS_SSL", "Aplicação web acessível por navegador.",
      "A aplicação é web e acessada por navegador; o HTTPS depende do certificado do host (ver diagnóstico).", "VERIFICADO_NO_SISTEMA"),
    item("32.16", "Migração simples e assistida para a nuvem",
      "Processo assistido de transição dos sistemas e dados para a nuvem.",
      "OPERACAO_LICENCIAMENTO_E_SUPORTE", "Plano de migração.",
      PROVIDER("plano de migração para a infraestrutura escolhida."), "DEPENDE_DO_PROVEDOR"),
    item("32.17", "Redução de custos de infraestrutura",
      "Redução de despesas do município com infraestrutura física local de TI.",
      "OPERACAO_LICENCIAMENTO_E_SUPORTE", "Demonstrativo de custo.",
      PROVIDER("proposta comercial da hospedagem."), "DEPENDE_DO_PROVEDOR"),
    item("32.18", "Suporte 24x7x365 à plataforma de hospedagem",
      "Atendimento técnico para sustentação da plataforma de hospedagem em regime 24x7x365.",
      "OPERACAO_LICENCIAMENTO_E_SUPORTE", "Canal e SLA de suporte do provedor.",
      PROVIDER("contrato de suporte."), "DEPENDE_DO_PROVEDOR"),
    item("32.19", "Plataforma integrada com login unificado",
      "Visualização dos módulos disponíveis pelo navegador, com acesso por login na plataforma.",
      "REDE_DNS_SSL", "Login único e navegação entre módulos conforme perfil.",
      "Existe: login da plataforma (/login) e painel de módulos (/dashboard) com controle de acesso por perfil.", "VERIFICADO_NO_SISTEMA"),
    item("32.20", "Certificado WildCard SSL",
      "Certificado digital WildCard SSL cobrindo o domínio principal e seus subdomínios.",
      "REDE_DNS_SSL", "Certificado cujo SAN contém *.dominio.",
      "Verificado em tempo real pelo botão de diagnóstico: lê o certificado TLS do host e confere se há curinga cobrindo-o.", "VERIFICADO_NO_SISTEMA"),
    item("32.21", "Subdomínio com SSL e sem porta na URL",
      "Cada domínio de aplicação associado a subdomínio com SSL, sem portas após a URL.",
      "REDE_DNS_SSL", "URL com HTTPS, subdomínio e sem porta explícita.",
      "Verificado em tempo real pelo botão de diagnóstico: valida a URL que atende a requisição.", "VERIFICADO_NO_SISTEMA"),
  ];
}

/** Sufixos de segundo nível comuns no Brasil: o domínio registrável tem um rótulo a mais. */
const SECOND_LEVEL_SUFFIXES = new Set(["com.br", "gov.br", "org.br", "net.br", "edu.br", "mil.br", "leg.br", "jus.br"]);

function hasSubdomainLabel(hostname: string) {
  const labels = hostname.split(".").filter(Boolean);
  const suffixLabels = SECOND_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 2 : 1;
  return labels.length > suffixLabels + 1;
}

/** 32.21: HTTPS, subdomínio de um domínio registrável e sem porta explícita. */
export function verifyCleanSubdomainSslUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const hasHttpsSsl = parsed.protocol === "https:";
  const hasSubdomain = hasSubdomainLabel(parsed.hostname);
  const hasExplicitPortInUrl = parsed.port !== "" || /:\/\/[^/]+:\d+/.test(rawUrl);
  return {
    valid: hasHttpsSsl && hasSubdomain && !hasExplicitPortInUrl,
    hasHttpsSsl,
    hasSubdomain,
    hasExplicitPortInUrl,
    normalizedOrigin: `${parsed.protocol}//${parsed.hostname}`,
  };
}

/** 32.20: algum nome do SAN cobre o host (curinga cobre exatamente um nível de subdomínio). */
export function certificateCoversHost(subjectAltName: string | undefined, hostname: string) {
  const host = hostname.toLowerCase();
  const names = (subjectAltName ?? "").split(",").map((part) => part.trim()).filter((part) => part.startsWith("DNS:")).map((part) => part.slice(4).toLowerCase());
  const exact = names.includes(host);
  const wildcard = names.some((name) => name.startsWith("*.") && host.endsWith(name.slice(1)) && host.slice(0, host.length - name.length + 1).split(".").length === 1);
  return { covered: exact || wildcard, hasWildcard: names.some((name) => name.startsWith("*.")), names };
}

export type HostSecurityProbe = {
  hostname: string;
  checkedAt: string;
  verifiable: boolean;
  reason: string | null;
  dns: { resolved: boolean; addresses: string[]; error: string | null };
  tls: { reached: boolean; protocol: string | null; validTo: string | null; issuer: string | null; subjectAltNames: string[]; hasWildcard: boolean; coversHost: boolean; error: string | null };
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: tempo esgotado`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/** Verificação real de DNS e certificado TLS (32.7, 32.20, 32.21) do host informado, na porta 443. */
export async function probeHostSecurity(hostname: string): Promise<HostSecurityProbe> {
  const host = hostname.split(":")[0].toLowerCase();
  const base: HostSecurityProbe = {
    hostname: host,
    checkedAt: new Date().toISOString(),
    verifiable: true,
    reason: null,
    dns: { resolved: false, addresses: [], error: null },
    tls: { reached: false, protocol: null, validTo: null, issuer: null, subjectAltNames: [], hasWildcard: false, coversHost: false, error: null },
  };
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".local")) {
    return { ...base, verifiable: false, reason: "Host local ou por IP: DNS e certificado só podem ser verificados em um domínio público." };
  }
  try {
    base.dns.addresses = await withTimeout(dns.resolve4(host), 4000, "DNS");
    base.dns.resolved = base.dns.addresses.length > 0;
  } catch (error) {
    base.dns.error = error instanceof Error ? error.message : "Falha de DNS";
  }
  try {
    const details = await withTimeout(new Promise<{ protocol: string | null; validTo: string; issuer: string; san: string | undefined }>((resolve, reject) => {
      const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate();
        const result = { protocol: socket.getProtocol(), validTo: cert.valid_to, issuer: String(cert.issuer?.O ?? cert.issuer?.CN ?? ""), san: cert.subjectaltname };
        socket.end();
        resolve(result);
      });
      socket.on("error", reject);
    }), 5000, "TLS");
    const coverage = certificateCoversHost(details.san, host);
    base.tls = { reached: true, protocol: details.protocol, validTo: details.validTo, issuer: details.issuer, subjectAltNames: coverage.names, hasWildcard: coverage.hasWildcard, coversHost: coverage.covered, error: null };
  } catch (error) {
    base.tls.error = error instanceof Error ? error.message : "Falha de TLS";
  }
  return base;
}

export function getDataCenterGovernanceOverview() {
  const requirements = getDataCenterRequirementsMatrix();
  return {
    certifications: DATACENTER_ISO_CERTIFICATIONS,
    requirements,
    summary: {
      total: requirements.length,
      verifiedInSystem: requirements.filter((r) => r.status === "VERIFICADO_NO_SISTEMA").length,
      dependsOnProvider: requirements.filter((r) => r.status === "DEPENDE_DO_PROVEDOR").length,
      contractedMinimumAvailabilityPercent: 99.6,
    },
  };
}
