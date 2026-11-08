import { sendEmailNotification } from "./ses-email-engine";

export interface SystemNotificationPayloads {
  // 1 & 2. CF07 — 7.1 & 7.9: Portal do Servidor
  portalServidorPasswordReset: {
    to: string;
    nome: string;
    link: string;
  };
  portalServidorAccountCreated: {
    to: string;
    nome: string;
    link: string;
  };

  // 3 & 4. CF28 — 28.39 & 28.41: Informações dos Bancos
  bancosUserCreated: {
    to: string;
    nome: string;
    usuario: string;
    link: string;
  };

  // 5. CF28 — 28.78: Recuperação de Senha Bancos
  bancosPasswordReset: {
    to: string;
    nome: string;
    link: string;
  };

  // 6, 7, 8, 9. CF04 — Ouvidoria
  ouvidoriaManifestacaoRegistrada: {
    to: string;
    nome: string;
    protocolo: string;
    link: string;
  };
  // CF17 — 17.18: Notificação ao responsável pelo e-SIC
  esicNovaSolicitacaoResponsavel: {
    to: string;
    nomeResponsavel: string;
    cargoResponsavel?: string;
    protocolo: string;
    solicitante: string;
    assunto: string;
    prazoDias: number;
    link: string;
  };
  ouvidoriaManifestacaoEncaminhada: {
    to: string;
    nome: string;
    protocolo: string;
    link: string;
  };
  ouvidoriaSituacaoAlterada: {
    to: string;
    nome: string;
    protocolo: string;
    situacao: string;
    link: string;
  };
  ouvidoriaCadastroRealizado: {
    to: string;
    nome: string;
    link: string;
  };

  // 10. CF07 — 7.2: Portal do Servidor Bloqueio
  portalServidorAccountLocked: {
    to: string;
    nome: string;
  };

  // 11, 12, 13, 14. CF11 — Licitações
  licitacaoConvocacaoSegundoColocado: {
    to: string;
    fornecedor: string;
    processo: string;
    item: string;
    link: string;
  };
  licitacaoConvocacaoFornecedor: {
    to: string;
    fornecedor: string;
    processo: string;
    itens: string;
    link: string;
  };
  licitacaoMapaCotacao: {
    to: string;
    fornecedor: string;
    processo: string;
    link: string;
  };
  licitacaoCartaConvite: {
    to: string;
    fornecedor: string;
    processo: string;
    link: string;
  };

  // 15. CF13 — 13.36: Patrimônio Garantia
  patrimonioGarantiaVencimento: {
    to: string;
    responsavel: string;
    patrimonio: string;
    descricao: string;
    data: string;
  };

  // 16, 17, 18, 19, 20, 21, 22. CF27 — Simples Nacional / DTE-SN
  simplesNotificacaoTributaria: {
    to: string;
    cnpj: string;
    link: string;
  };
  simplesAvisoTributario: {
    to: string;
    exercicio: string;
    link: string;
  };
  simplesAvisoCobranca: {
    to: string;
    cnpj: string;
    link: string;
  };
  simplesPrazoEntregaDeclaracao: {
    to: string;
    declaracao: string;
    periodo: string;
    link: string;
  };
  simplesNotificacaoPrevia: {
    to: string;
    periodo: string;
    link: string;
  };
  simplesDecisaoProcesso: {
    to: string;
    processo: string;
    link: string;
  };
  simplesComunicacaoFiscal: {
    to: string;
    cnpj: string;
    link: string;
  };

  // CF19 — 19.113, 19.114, 19.117: Protocolo e Controle de Processos
  protocoloPendencia: {
    to: string;
    nome: string;
    protocolo: string;
    servico: string;
    motivo: string;
    exigencias?: string[];
    link: string;
  };
  protocoloAprovado: {
    to: string;
    nome: string;
    protocolo: string;
    servico: string;
    despacho?: string;
    link: string;
  };
  protocoloReprovado: {
    to: string;
    nome: string;
    protocolo: string;
    servico: string;
    motivo: string;
    link: string;
  };
  protocoloTramitacao: {
    to: string;
    nome: string;
    protocolo: string;
    setorOrigem?: string;
    setorDestino: string;
    motivo?: string;
    dataHora: string;
    link: string;
  };
  protocoloPendenciaAtualizada: {
    to: string;
    responsavel: string;
    protocolo: string;
    solicitante: string;
    servico: string;
    link: string;
  };
}

export const NotificationDispatcher = {
  // 1. CF07 — 7.1
  async sendPortalServidorPasswordReset(data: SystemNotificationPayloads["portalServidorPasswordReset"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Portal do Servidor — Recursos Humanos",
      fromEmail: "rh@celeriflow.com.br",
      subject: "Redefinição de senha — Portal do Servidor",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Recuperação de Senha</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Recebemos uma solicitação para redefinir sua senha de acesso ao Portal do Servidor.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Redefinir Senha</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Ou copie e cole o link a seguir no seu navegador:<br><a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
        <p style="font-size: 13px; color: #64748b; margin-top: 20px;">Caso não tenha realizado esta solicitação, desconsidere esta mensagem. Sua conta permanece segura.</p>
      `,
      textContent: `Olá, ${data.nome}. Recebemos uma solicitação para redefinir sua senha de acesso ao Portal do Servidor. Para continuar, acesse o link: ${data.link}. Caso não tenha realizado esta solicitação, desconsidere esta mensagem.`,
    });
  },

  // 2. CF07 — 7.9
  async sendPortalServidorAccountCreated(data: SystemNotificationPayloads["portalServidorAccountCreated"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Portal do Servidor — Cadastro",
      fromEmail: "rh@celeriflow.com.br",
      subject: "Criação de acesso — Portal do Servidor",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Criação de Acesso ao Portal</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Sua solicitação de acesso ao Portal do Servidor foi validada com sucesso pelo Recursos Humanos.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Ativar Conta e Criar Senha</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Ou acesse: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
        <p style="font-size: 13px; color: #e11d48; font-weight: 600; margin-top: 16px;">Atenção: Este link é válido por 24 horas a partir do envio.</p>
      `,
      textContent: `Olá, ${data.nome}. Sua solicitação de acesso ao Portal do Servidor foi validada. Para criar seu usuário e definir sua senha, acesse: ${data.link}. Este link é válido por 24 horas a partir do envio.`,
    });
  },

  // 3 & 4. CF28 — 28.39 & 28.41
  async sendBancosUserCreated(data: SystemNotificationPayloads["bancosUserCreated"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Declaração Bancária (DES-IF) — Fazenda",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Seu acesso ao sistema foi criado",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Acesso ao Sistema Bancário / Fiscal</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Seu cadastro no sistema de Declaração das Informações dos Bancos foi realizado com sucesso.</p>
        <p style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 6px; font-size: 14px;">
          <strong>Usuário cadastrado:</strong> <code>${data.usuario}</code>
        </p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Ativar Acesso e Definir Senha</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Link de acesso: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. Seu cadastro no sistema de Declaração das Informações dos Bancos foi realizado. Usuário: ${data.usuario}. Para ativar seu acesso e definir sua senha, utilize: ${data.link}.`,
    });
  },

  // 5. CF28 — 28.78
  async sendBancosPasswordReset(data: SystemNotificationPayloads["bancosPasswordReset"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Declaração Bancária (DES-IF) — Suporte",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Recuperação de senha",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Recuperação de Senha</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Recebemos uma solicitação de recuperação de senha para sua conta no sistema de Declaração Bancária.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Cadastrar Nova Senha</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Caso não tenha solicitado esta alteração, desconsidere este e-mail.</p>
      `,
      textContent: `Olá, ${data.nome}. Recebemos uma solicitação de recuperação de senha para sua conta. Utilize o link ${data.link} para cadastrar uma nova senha. Se você não solicitou essa alteração, desconsidere este e-mail.`,
    });
  },

  // 6. CF04 — 4.9
  async sendOuvidoriaManifestacaoRegistrada(data: SystemNotificationPayloads["ouvidoriaManifestacaoRegistrada"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Ouvidoria Municipal",
      fromEmail: "ouvidoria@celeriflow.com.br",
      subject: `Manifestação recebida — Protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Manifestação Registrada</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Sua manifestação foi registrada com sucesso sob o protocolo <strong>${data.protocolo}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Acompanhar Manifestação</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. Sua manifestação foi registrada com sucesso sob o protocolo ${data.protocolo}. Você pode acompanhar o andamento pelo endereço ${data.link}.`,
    });
  },

  // CF17 — 17.18: Notificação por e-mail ao responsável pelo e-SIC quando nova solicitação for registrada
  async sendEsicNovaSolicitacaoResponsavel(data: SystemNotificationPayloads["esicNovaSolicitacaoResponsavel"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Portal da Transparência — e-SIC",
      fromEmail: "esic@celeriflow.com.br",
      subject: `[e-SIC] Nova Solicitação de Informação — Protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Nova Solicitação e-SIC Registrada</h2>
        <p>Prezado(a) <strong>${data.nomeResponsavel}</strong>${data.cargoResponsavel ? ` (${data.cargoResponsavel})` : ""},</p>
        <p>Uma nova solicitação de acesso à informação foi registrada no e-SIC e requer providências.</p>
        <ul style="line-height: 1.8; color: #334155;">
          <li><strong>Protocolo:</strong> ${data.protocolo}</li>
          <li><strong>Solicitante:</strong> ${data.solicitante}</li>
          <li><strong>Assunto:</strong> ${data.assunto}</li>
          <li><strong>Prazo regulamentar:</strong> ${data.prazoDias} dias corridos</li>
        </ul>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Atender Solicitação no Painel</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acesse diretamente: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) ${data.nomeResponsavel}, uma nova solicitação de acesso à informação (Protocolo ${data.protocolo}) foi registrada no e-SIC pelo solicitante ${data.solicitante}. Assunto: ${data.assunto}. Prazo regulamentar: ${data.prazoDias} dias. Acesse o painel de atendimento em ${data.link}.`,
    });
  },

  // 7. CF04 — 4.11
  async sendOuvidoriaManifestacaoEncaminhada(data: SystemNotificationPayloads["ouvidoriaManifestacaoEncaminhada"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Ouvidoria Municipal",
      fromEmail: "ouvidoria@celeriflow.com.br",
      subject: `Atualização da manifestação ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Encaminhamento de Manifestação</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Sua manifestação de protocolo <strong>${data.protocolo}</strong> foi encaminhada para análise do setor responsável.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Consultar Andamento</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acompanhe as próximas atualizações em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. Sua manifestação foi encaminhada para análise do setor responsável. Acompanhe as próximas atualizações em ${data.link}.`,
    });
  },

  // 8. CF04 — 4.18
  async sendOuvidoriaSituacaoAlterada(data: SystemNotificationPayloads["ouvidoriaSituacaoAlterada"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Ouvidoria Municipal",
      fromEmail: "ouvidoria@celeriflow.com.br",
      subject: `Atualização do protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Atualização de Situação</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>A situação da sua manifestação de protocolo <strong>${data.protocolo}</strong> foi atualizada para: <strong style="color: #0e4c7e;">${data.situacao}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Ver Detalhes do Protocolo</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Para consultar os detalhes, acesse: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. A situação da sua manifestação foi atualizada para ${data.situacao}. Para consultar os detalhes, acesse ${data.link}.`,
    });
  },

  // 9. CF04 — 4.19
  async sendOuvidoriaCadastroRealizado(data: SystemNotificationPayloads["ouvidoriaCadastroRealizado"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Portal da Ouvidoria e Cidadão",
      fromEmail: "ouvidoria@celeriflow.com.br",
      subject: "Cadastro realizado com sucesso",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Bem-vindo ao Portal da Ouvidoria</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Seu cadastro no Portal da Ouvidoria foi realizado com sucesso.</p>
        <p>Agora você pode registrar manifestações (elogios, reclamações, denúncias e pedidos e-SIC) e acompanhar suas solicitações com facilidade.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Acessar Portal da Ouvidoria</a>
        </p>
      `,
      textContent: `Olá, ${data.nome}. Seu cadastro no Portal da Ouvidoria foi realizado. Agora você pode registrar manifestações e acompanhar suas solicitações em ${data.link}.`,
    });
  },

  // 10. CF07 — 7.2
  async sendPortalServidorAccountLocked(data: SystemNotificationPayloads["portalServidorAccountLocked"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Segurança — Portal do Servidor",
      fromEmail: "seguranca@celeriflow.com.br",
      subject: "Alerta de segurança — Acesso bloqueado",
      htmlContent: `
        <h2 style="font-size: 18px; color: #e11d48; margin-top: 0;">Alerta de Segurança</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Identificamos 5 tentativas consecutivas de acesso sem sucesso à sua conta no Portal do Servidor. Por razões de segurança, o acesso foi <strong>temporariamente bloqueado por 15 minutos</strong>.</p>
        <p>Caso tenha esquecido sua senha, você pode solicitar a recuperação cadastrada na página de entrada.</p>
        <p style="font-size: 13px; color: #64748b; margin-top: 16px;">Caso necessite de ajuda adicional, entre em contato com o suporte de Recursos Humanos.</p>
      `,
      textContent: `Olá, ${data.nome}. Identificamos tentativas consecutivas de acesso sem sucesso e sua conta foi bloqueada por segurança. Caso necessite de ajuda, entre em contato com o suporte responsável.`,
    });
  },

  // 11. CF11 — 11.28
  async sendLicitacaoConvocacaoSegundoColocado(data: SystemNotificationPayloads["licitacaoConvocacaoSegundoColocado"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Setor de Licitações e Contratos",
      fromEmail: "compras@celeriflow.com.br",
      subject: `Convocação — Processo ${data.processo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Convocação de Classificado</h2>
        <p>Prezado(a) <strong>${data.fornecedor}</strong>,</p>
        <p>Informamos que sua empresa está sendo convocada para dar continuidade ao <strong>Processo ${data.processo}</strong>, referente ao item: <strong>${data.item}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Acessar Documento Oficial</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte as condições e os prazos estabelecidos no documento oficial disponível em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) ${data.fornecedor}, informamos que sua empresa está sendo convocada para dar continuidade ao processo ${data.processo}, referente ao item ${data.item}. Consulte as condições e os prazos estabelecidos no documento oficial disponível em ${data.link}.`,
    });
  },

  // 12. CF11 — 11.111
  async sendLicitacaoConvocacaoFornecedor(data: SystemNotificationPayloads["licitacaoConvocacaoFornecedor"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Setor de Licitações e Contratos",
      fromEmail: "compras@celeriflow.com.br",
      subject: `Convocação de fornecedor — Processo ${data.processo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Convocação de Fornecedor</h2>
        <p>Prezado(a) <strong>${data.fornecedor}</strong>,</p>
        <p>Comunicamos sua convocação para atendimento dos itens <strong>${data.itens}</strong>, vinculados ao <strong>Processo ${data.processo}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Ver Orientações e Prazos</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) ${data.fornecedor}, comunicamos sua convocação para atendimento dos itens ${data.itens}, vinculados ao processo ${data.processo}. Consulte as orientações e os prazos em ${data.link}.`,
    });
  },

  // 13. CF11 — 11.182
  async sendLicitacaoMapaCotacao(data: SystemNotificationPayloads["licitacaoMapaCotacao"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Pesquisa de Preços e Cotações",
      fromEmail: "cotacoes@celeriflow.com.br",
      subject: `Solicitação de cotação — Processo ${data.processo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Solicitação de Cotação de Preços</h2>
        <p>Prezado(a) <strong>${data.fornecedor}</strong>,</p>
        <p>Encaminhamos o mapa de cotação referente ao <strong>Processo ${data.processo}</strong>.</p>
        <p>Solicitamos a análise dos itens e o encaminhamento de sua proposta conforme as orientações e prazo estabelecidos.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Acessar Cotação / Enviar Proposta</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Documento: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) ${data.fornecedor}, encaminhamos o mapa de cotação referente ao processo ${data.processo}. Solicitamos a análise dos itens e o encaminhamento da proposta conforme as orientações e o prazo estabelecidos. Documento: ${data.link}.`,
    });
  },

  // 14. CF11 — 11.183
  async sendLicitacaoCartaConvite(data: SystemNotificationPayloads["licitacaoCartaConvite"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Comissão de Licitação",
      fromEmail: "licitacoes@celeriflow.com.br",
      subject: `Convite para participação — Processo ${data.processo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Carta-Convite para Procedimento Licitatório</h2>
        <p>Prezado(a) <strong>${data.fornecedor}</strong>,</p>
        <p>Convidamos sua empresa a participar do procedimento licitatório referente ao <strong>Processo ${data.processo}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Consultar Carta-Convite</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte a carta-convite e as condições de participação em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) ${data.fornecedor}, convidamos sua empresa a participar do procedimento licitatório ${data.processo}. Consulte a carta-convite e as condições de participação em ${data.link}.`,
    });
  },

  // 15. CF13 — 13.36
  async sendPatrimonioGarantiaVencimento(data: SystemNotificationPayloads["patrimonioGarantiaVencimento"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Gestão do Patrimônio Público",
      fromEmail: "patrimonio@celeriflow.com.br",
      subject: `Alerta de vencimento de garantia — Bem ${data.patrimonio}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #b45309; margin-top: 0;">Alerta de Vencimento de Garantia</h2>
        <p>Prezado(a) <strong>${data.responsavel}</strong>,</p>
        <p>Informamos que a garantia do bem patrimonial <strong>${data.patrimonio}</strong>, descrição: <em>${data.descricao}</em>, vencerá em <strong>${data.data}</strong>.</p>
        <p>Solicitamos verificar a necessidade de manutenção, vistoria ou providências cabíveis antes da data de expiração.</p>
      `,
      textContent: `Prezado(a) ${data.responsavel}, informamos que a garantia do bem patrimonial ${data.patrimonio}, descrição ${data.descricao}, vencerá em ${data.data}. Solicitamos verificar a necessidade de providências antes do vencimento.`,
    });
  },

  // 16. CF27 — 27.62
  async sendSimplesNotificacaoTributaria(data: SystemNotificationPayloads["simplesNotificacaoTributaria"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Domicílio Tributário Eletrônico (DTE-SN)",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Nova notificação tributária disponível",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Nova Notificação Tributária</h2>
        <p>Prezado(a) contribuinte,</p>
        <p>Informamos que existe uma nova notificação tributária relacionada ao CNPJ <strong>${data.cnpj}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Acessar Domicílio Tributário</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acesse o canal oficial <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a> para consultar o documento e verificar eventuais prazos.</p>
      `,
      textContent: `Prezado(a) contribuinte, informamos que existe uma nova notificação tributária relacionada ao CNPJ ${data.cnpj}. Acesse o canal oficial ${data.link} para consultar o documento e verificar eventuais prazos.`,
    });
  },

  // 17. CF27 — 27.63
  async sendSimplesAvisoTributario(data: SystemNotificationPayloads["simplesAvisoTributario"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Domicílio Tributário Eletrônico (DTE-SN)",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Novo aviso tributário",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Aviso Tributário Disponível</h2>
        <p>Prezado(a) contribuinte,</p>
        <p>Foi disponibilizado um aviso referente ao exercício <strong>${data.exercicio}</strong> no seu Domicílio Tributário Eletrônico.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Consultar Informações</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte as informações e eventuais providências necessárias no canal oficial: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) contribuinte, foi disponibilizado um aviso referente ao exercício ${data.exercicio}. Consulte as informações e eventuais providências necessárias no canal oficial: ${data.link}.`,
    });
  },

  // 18. CF27 — 27.74
  async sendSimplesAvisoCobranca(data: SystemNotificationPayloads["simplesAvisoCobranca"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Arrecadação e Dívida Ativa",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Aviso de cobrança disponível",
      htmlContent: `
        <h2 style="font-size: 18px; color: #b45309; margin-top: 0;">Aviso de Cobrança</h2>
        <p>Prezado(a) contribuinte,</p>
        <p>Há um aviso de cobrança disponível referente ao CNPJ <strong>${data.cnpj}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Ver Detalhes do Débito</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte os detalhes, valores e orientações no canal oficial: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) contribuinte, há um aviso de cobrança referente ao CNPJ ${data.cnpj}. Consulte os detalhes, valores e orientações no canal oficial ${data.link}.`,
    });
  },

  // 19. CF27 — 27.86
  async sendSimplesPrazoEntregaDeclaracao(data: SystemNotificationPayloads["simplesPrazoEntregaDeclaracao"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Gestão do Simples Nacional",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Prazo para entrega de declaração",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Prazo de Entrega de Declaração</h2>
        <p>Prezado(a) contribuinte,</p>
        <p>Informamos que há uma comunicação referente ao prazo de entrega da declaração <strong>${data.declaracao}</strong>, relativa ao período <strong>${data.periodo}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Consultar Prazos e Orientações</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte o prazo aplicável e as orientações no portal oficial: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) contribuinte, informamos que há uma comunicação referente ao prazo de entrega da declaração ${data.declaracao}, relativa ao período ${data.periodo}. Consulte o prazo aplicável e as orientações no portal oficial ${data.link}.`,
    });
  },

  // 20. CF27 — 27.90
  async sendSimplesNotificacaoPrevia(data: SystemNotificationPayloads["simplesNotificacaoPrevia"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Fiscalização Tributária / Simples Nacional",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Notificação prévia — Regularização tributária",
      htmlContent: `
        <h2 style="font-size: 18px; color: #b45309; margin-top: 0;">Notificação Prévia de Divergência</h2>
        <p>Prezado(a) contribuinte,</p>
        <p>Foi identificada uma situação que requer sua atenção em relação às informações tributárias do período <strong>${data.periodo}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Consultar Notificação Oficial</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte a notificação oficial em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) contribuinte, foi identificada uma situação que requer sua atenção em relação às informações tributárias do período ${data.periodo}. Consulte a notificação oficial em ${data.link}.`,
    });
  },

  // 21. CF27 — 27.100
  async sendSimplesDecisaoProcesso(data: SystemNotificationPayloads["simplesDecisaoProcesso"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Contencioso Administrativo Tributário",
      fromEmail: "tributario@celeriflow.com.br",
      subject: "Decisão em processo administrativo",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Decisão Administrativa</h2>
        <p>Prezado(a) contribuinte,</p>
        <p>Há uma comunicação referente à decisão proferida no processo administrativo <strong>${data.processo}</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Acessar Decisão no DTE</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte a decisão e as orientações aplicáveis no canal oficial: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) contribuinte, há uma comunicação referente ao processo administrativo ${data.processo}. Consulte a decisão e as orientações aplicáveis no canal oficial ${data.link}.`,
    });
  },

  // 22. CF27 — 27.149
  async sendSimplesComunicacaoFiscal(data: SystemNotificationPayloads["simplesComunicacaoFiscal"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Fiscalização Tributária Municipal",
      fromEmail: "fiscalizacao@celeriflow.com.br",
      subject: "Comunicação fiscal disponível",
      htmlContent: `
        <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">Comunicação Fiscal</h2>
        <p>Prezado(a) contribuinte,</p>
        <p>Existe uma nova comunicação fiscal vinculada ao CNPJ <strong>${data.cnpj}</strong> disponibilizada no Domicílio Tributário Eletrônico.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Visualizar Documento Fiscal</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acesse o canal oficial <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a> para consultar o documento e os prazos eventualmente aplicáveis.</p>
      `,
      textContent: `Prezado(a) contribuinte, existe uma comunicação fiscal vinculada ao CNPJ ${data.cnpj}. Acesse o canal oficial ${data.link} para consultar o documento e os prazos eventualmente aplicáveis.`,
    });
  },

  // CF19 — 19.113: Notificar requerente por e-mail quando gestão inserir pendência
  async sendProtocoloPendencia(data: SystemNotificationPayloads["protocoloPendencia"]) {
    const exigenciasHtml = data.exigencias && data.exigencias.length > 0
      ? `<div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 16px 0;">
          <strong style="color: #92400e;">Documentos/itens exigidos:</strong>
          <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #78350f;">
            ${data.exigencias.map(ex => `<li>${ex}</li>`).join("")}
          </ul>
        </div>`
      : "";

    return sendEmailNotification({
      to: data.to,
      fromName: "Protocolo e Processos Digitais",
      fromEmail: "protocolo@celeriflow.com.br",
      subject: `Pendência cadastrada - Protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #b45309; margin-top: 0;">Pendência na sua Solicitação</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Foi registrada uma exigência/pendência no atendimento do seu processo <strong>${data.protocolo}</strong> (${data.servico}).</p>
        <p><strong>Motivo/Fundamentação:</strong></p>
        <blockquote style="margin: 12px 0; padding: 10px 16px; background-color: #f8fafc; border-left: 3px solid #cbd5e1; color: #334155; font-style: italic;">
          ${data.motivo}
        </blockquote>
        ${exigenciasHtml}
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #f59e0b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Responder à Pendência / Anexar Documentos</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acesse sua área do cidadão para atender à solicitação: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. Foi registrada uma pendência no processo ${data.protocolo} (${data.servico}): ${data.motivo}. Acesse ${data.link} para responder e regularizar seu pedido.`,
    });
  },

  // CF19 — 19.113: Notificar requerente por e-mail quando gestão aprovar solicitação
  async sendProtocoloAprovado(data: SystemNotificationPayloads["protocoloAprovado"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Protocolo e Processos Digitais",
      fromEmail: "protocolo@celeriflow.com.br",
      subject: `Solicitação Aprovada - Protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #047857; margin-top: 0;">Solicitação Concluída e Deferida</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Temos a satisfação de informar que seu processo <strong>${data.protocolo}</strong> (${data.servico}) foi <strong>aprovado e concluído com sucesso</strong> pela administração municipal.</p>
        ${data.despacho ? `<blockquote style="margin: 12px 0; padding: 10px 16px; background-color: #ecfdf5; border-left: 3px solid #10b981; color: #065f46;">${data.despacho}</blockquote>` : ""}
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Ver Detalhes e Documentos Emitidos</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acompanhe ou baixe o resultado oficial em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. Sua solicitação de processo ${data.protocolo} (${data.servico}) foi aprovada e concluída com sucesso. Acesse ${data.link} para conferir os detalhes e documentos emitidos.`,
    });
  },

  // CF19 — 19.113: Notificar requerente por e-mail quando gestão reprovar solicitação
  async sendProtocoloReprovado(data: SystemNotificationPayloads["protocoloReprovado"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Protocolo e Processos Digitais",
      fromEmail: "protocolo@celeriflow.com.br",
      subject: `Solicitação Indeferida - Protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #b91c1c; margin-top: 0;">Solicitação Não Aprovada / Indeferida</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Comunicamos que seu processo <strong>${data.protocolo}</strong> (${data.servico}) foi indeferido/cancelado pelo setor competente.</p>
        <p><strong>Justificativa da Decisão:</strong></p>
        <blockquote style="margin: 12px 0; padding: 10px 16px; background-color: #fef2f2; border-left: 3px solid #ef4444; color: #991b1b;">
          ${data.motivo}
        </blockquote>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #64748b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Consultar Histórico do Processo</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Consulte o teor completo da decisão em: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. Seu processo ${data.protocolo} (${data.servico}) foi indeferido. Motivo: ${data.motivo}. Consulte mais detalhes em ${data.link}.`,
    });
  },

  // CF19 — 19.114: Notificar requerente por e-mail a cada tramitação efetuada
  async sendProtocoloTramitacao(data: SystemNotificationPayloads["protocoloTramitacao"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Protocolo e Processos Digitais",
      fromEmail: "protocolo@celeriflow.com.br",
      subject: `Tramitação de Processo - Protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0e4c7e; margin-top: 0;">Movimentação de Processo</h2>
        <p>Olá, <strong>${data.nome}</strong>.</p>
        <p>Informamos que houve uma nova movimentação no processo <strong>${data.protocolo}</strong>.</p>
        <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 12px; margin: 16px 0; color: #0369a1;">
          <p style="margin: 0 0 6px 0;"><strong>Destino:</strong> ${data.setorDestino}</p>
          ${data.setorOrigem ? `<p style="margin: 0 0 6px 0;"><strong>Origem:</strong> ${data.setorOrigem}</p>` : ""}
          <p style="margin: 0 0 6px 0;"><strong>Data/Hora:</strong> ${data.dataHora}</p>
          ${data.motivo ? `<p style="margin: 0;"><strong>Motivo do Encaminhamento:</strong> ${data.motivo}</p>` : ""}
        </div>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Acompanhar Roteiro do Processo</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acesse seu processo online pelo endereço: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Olá, ${data.nome}. O processo ${data.protocolo} foi tramitado para ${data.setorDestino} em ${data.dataHora}. Acompanhe em ${data.link}.`,
    });
  },

  // CF19 — 19.117: Informar a gestão caso o solicitante atualize pendência solicitada
  async sendProtocoloPendenciaAtualizada(data: SystemNotificationPayloads["protocoloPendenciaAtualizada"]) {
    return sendEmailNotification({
      to: data.to,
      fromName: "Portal de Serviços — Gestão",
      fromEmail: "protocolo@celeriflow.com.br",
      subject: `Pendência Atendida - Protocolo ${data.protocolo}`,
      htmlContent: `
        <h2 style="font-size: 18px; color: #0e4c7e; margin-top: 0;">Pendência Atendida pelo Solicitante</h2>
        <p>Prezado(a) <strong>${data.responsavel}</strong>,</p>
        <p>O solicitante <strong>${data.solicitante}</strong> atualizou e atendeu à pendência solicitada para o processo <strong>${data.protocolo}</strong> (${data.servico}).</p>
        <p>O processo retornou à fila de análise do setor para continuidade da tramitação.</p>
        <p style="margin: 24px 0;">
          <a href="${data.link}" style="background-color: #0e4c7e; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Analisar Solicitação Atualizada</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Acesse diretamente: <a href="${data.link}" style="color: #0e4c7e; word-break: break-all;">${data.link}</a></p>
      `,
      textContent: `Prezado(a) ${data.responsavel}, o solicitante ${data.solicitante} atendeu à pendência do processo ${data.protocolo}. Acesse ${data.link} para analisar.`,
    });
  },
};
