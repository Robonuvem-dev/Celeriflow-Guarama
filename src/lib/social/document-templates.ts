export type SocialTemplateField = { key: string; label: string; multiline?: boolean; type?: "date" | "number" | "text" };
export type SocialDocumentTemplate = { code: string; title: string; version: string; source: string; sections: { title: string; fields: SocialTemplateField[] }[]; signatures: string[] };

const identification = { title: "Identificação", fields: [
  { key: "person", label: "Pessoa / responsável familiar" },
  { key: "socialName", label: "Nome social" },
  { key: "cpf", label: "CPF" }, { key: "nis", label: "NIS / código familiar" },
  { key: "birthDate", label: "Data de nascimento", type: "date" as const },
  { key: "address", label: "Endereço / bairro / município" }, { key: "phone", label: "Contato" },
] };
const registration = { title: "Registro do equipamento", fields: [
  { key: "protocol", label: "Protocolo / referência" }, { key: "unit", label: "Equipamento social" },
  { key: "date", label: "Data", type: "date" as const }, { key: "professional", label: "Profissional responsável / registro profissional" },
] };
const joinville = "https://wwwold.joinville.sc.gov.br/public/portaladm/pdf/jornal/a14a373d1fc952c06d3eeeb2e9a022c8.pdf";
const referral = "https://www.campinadalagoa.pr.gov.br/documentos/arquivos/FICHA%20ENCAMINHAMENTO%20CRAS.pdf";
const manual = "https://aplicacoes.mds.gov.br/sagi/dicivip_datain/ckfinder/userfiles/files/Manual_Prontuario_SUAS_VERSAO_PRELIMINAR.pdf";

export const socialDocumentTemplates: SocialDocumentTemplate[] = [
  { code: "BENEFIT_REQUEST", title: "Requerimento de benefício eventual", version: "POC-1.0", source: joinville, sections: [registration, identification,
    { title: "Solicitação", fields: [{ key: "benefit", label: "Benefício / classificação" }, { key: "quantity", label: "Quantidade ou valor solicitado" }, { key: "applicant", label: "Requerente, caso diferente do beneficiário / parentesco" }, { key: "event", label: "Nascimento, falecimento, calamidade ou situação de vulnerabilidade" }, { key: "documents", label: "Documentos apresentados", multiline: true }, { key: "reason", label: "Motivo / circunstâncias da solicitação", multiline: true }] },
  ], signatures: ["Requerente", "Profissional responsável"] },
  { code: "BENEFIT_ASSESSMENT", title: "Parecer técnico de benefício eventual", version: "POC-1.0", source: joinville, sections: [registration, identification,
    { title: "Avaliação", fields: [{ key: "request", label: "Referência da requisição / benefício" }, { key: "composition", label: "Composição familiar", multiline: true }, { key: "income", label: "Renda familiar / renda por pessoa" }, { key: "housing", label: "Situação habitacional" }, { key: "analysis", label: "Análise técnica e condições verificadas", multiline: true }, { key: "decision", label: "Conclusão / benefício e quantidade ou valor autorizado", multiline: true }] },
  ], signatures: ["Profissional avaliador / registro", "Responsável autorizador"] },
  { code: "BENEFIT_DELIVERY", title: "Comprovante de entrega de benefício", version: "POC-1.0", source: joinville, sections: [registration, identification,
    { title: "Entrega", fields: [{ key: "request", label: "Requisição / autorização de referência" }, { key: "benefit", label: "Benefício entregue" }, { key: "quantity", label: "Quantidade / valor" }, { key: "deliveryPlace", label: "Local da entrega" }, { key: "recipient", label: "Recebedor / vínculo com beneficiário" }, { key: "observations", label: "Observações", multiline: true }] },
  ], signatures: ["Recebedor", "Profissional responsável pela entrega"] },
  { code: "REFERRAL", title: "Encaminhamento socioassistencial", version: "POC-1.0", source: referral, sections: [registration, identification,
    { title: "Referência à rede", fields: [{ key: "destination", label: "Equipamento / órgão de destino" }, { key: "referenceProfessional", label: "Profissional de referência no destino" }, { key: "priority", label: "Público prioritário / urgência" }, { key: "objective", label: "Objetivo do encaminhamento", multiline: true }, { key: "difficulty", label: "Dificuldades identificadas", multiline: true }, { key: "observations", label: "Observações pertinentes ao atendimento", multiline: true }] },
  ], signatures: ["Profissional responsável pelo encaminhamento"] },
  { code: "COUNTER_REFERRAL", title: "Contrarreferência socioassistencial", version: "POC-1.0", source: referral, sections: [registration, identification,
    { title: "Retorno à unidade de origem", fields: [{ key: "referral", label: "Encaminhamento de referência" }, { key: "origin", label: "Equipamento de origem" }, { key: "destination", label: "Órgão que realizou o atendimento" }, { key: "attendedAt", label: "Data do atendimento", type: "date" }, { key: "result", label: "Descrição do atendimento e providências", multiline: true }, { key: "recommendations", label: "Orientações / continuidade do acompanhamento", multiline: true }] },
  ], signatures: ["Profissional que realizou o atendimento no destino"] },
  { code: "PAF", title: "Plano de Acompanhamento Familiar — PAF", version: "POC-1.0", source: manual, sections: [registration, identification,
    { title: "Planejamento e evolução", fields: [{ key: "offer", label: "Programa / serviço / projeto" }, { key: "composition", label: "Composição familiar e pessoa de referência", multiline: true }, { key: "diagnosis", label: "Diagnóstico inicial / vulnerabilidades e potencialidades", multiline: true }, { key: "objectives", label: "Objetivos do acompanhamento", multiline: true }, { key: "actions", label: "Ações, responsáveis e prazos", multiline: true }, { key: "referrals", label: "Encaminhamentos previstos", multiline: true }, { key: "commitments", label: "Compromissos assumidos pela família", multiline: true }, { key: "evolution", label: "Evolução / avaliação / próxima revisão", multiline: true }] },
  ], signatures: ["Responsável familiar", "Profissional de referência"] },
  { code: "PIA", title: "Plano Individual de Atendimento — PIA", version: "POC-1.0", source: manual, sections: [registration, identification,
    { title: "Plano individual", fields: [{ key: "guardian", label: "Responsável legal, quando aplicável" }, { key: "offer", label: "Programa / serviço / projeto" }, { key: "diagnosis", label: "Diagnóstico inicial", multiline: true }, { key: "objectives", label: "Objetivos e metas", multiline: true }, { key: "actions", label: "Plano de atendimento / responsáveis / prazos", multiline: true }, { key: "referrals", label: "Encaminhamentos", multiline: true }, { key: "commitments", label: "Compromissos assumidos pela pessoa", multiline: true }, { key: "evolution", label: "Evolução e avaliação", multiline: true }] },
  ], signatures: ["Pessoa / responsável legal", "Profissional responsável"] },
  { code: "APPOINTMENT", title: "Comprovante de agendamento", version: "POC-1.0", source: manual, sections: [registration, identification,
    { title: "Agendamento", fields: [{ key: "scheduledAt", label: "Data do agendamento", type: "date" }, { key: "time", label: "Horário / duração" }, { key: "location", label: "Endereço do atendimento" }, { key: "purpose", label: "Finalidade" }, { key: "instructions", label: "Orientações para comparecimento", multiline: true }] },
  ], signatures: ["Responsável pelo agendamento"] },
  { code: "WAITING_LIST", title: "Comprovante de inscrição em demanda reprimida", version: "POC-1.0", source: manual, sections: [registration, identification,
    { title: "Solicitação em espera", fields: [{ key: "offer", label: "Benefício / programa / serviço / projeto" }, { key: "group", label: "Grupo, quando aplicável" }, { key: "origin", label: "Unidade de origem" }, { key: "priority", label: "Prioridade / critérios" }, { key: "reason", label: "Motivo da espera e observações", multiline: true }] },
  ], signatures: ["Pessoa / responsável familiar", "Profissional responsável"] },
];
