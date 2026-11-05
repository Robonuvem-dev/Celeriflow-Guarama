export const publicOmbudsmanTypes = {
  DENUNCIA: "Denúncia",
  RECLAMACAO: "Reclamação",
  SUGESTAO: "Sugestão",
  ELOGIO: "Elogio",
  SOLICITACAO: "Solicitação",
  OCORRENCIA: "Ocorrência",
} as const;

export type PublicOmbudsmanReference = {
  id: string;
  kind: string;
  requestType: string;
  name: string;
  subjectId: string | null;
  isAnonymous: boolean;
  serviceInformation: string | null;
};

export const DEFAULT_PUBLIC_OMBUDSMAN_CATALOG: PublicOmbudsmanReference[] = [
  {
    id: "cf04-street",
    kind: "SUBJECT",
    requestType: "Solicitação",
    name: "Rua e Bairro",
    subjectId: null,
    isAnonymous: true,
    serviceInformation: "Solicitações e manifestos sobre pavimentação, zeladoria urbana, drenagem e sossego público.",
  },
  {
    id: "cf04-cleaning",
    kind: "SUBJECT",
    requestType: "Solicitação",
    name: "Lixo e Limpeza",
    subjectId: null,
    isAnonymous: true,
    serviceInformation: "Solicitações e manifestos sobre limpeza urbana, varrição, coleta domiciliar, recicláveis e entulho.",
  },
  {
    id: "cf04-pothole",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Tapa-buraco",
    subjectId: "cf04-street",
    isAnonymous: true,
    serviceInformation: "Informe rua, bairro, ponto de referência e a localização do buraco.",
  },
  {
    id: "cf04-urban-care",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Zeladoria da cidade",
    subjectId: "cf04-street",
    isAnonymous: true,
    serviceInformation: "Descreva a necessidade de manutenção e informe rua e bairro.",
  },
  {
    id: "cf04-drains",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Limpeza de bueiros, boca de lobo e poços de visita",
    subjectId: "cf04-street",
    isAnonymous: true,
    serviceInformation: "Informe o endereço e os pontos que necessitam de limpeza ou desobstrução.",
  },
  {
    id: "cf04-noise",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Reclamação de poluição sonora",
    subjectId: "cf04-street",
    isAnonymous: true,
    serviceInformation: "Informe rua, bairro, origem do ruído e os horários da ocorrência.",
  },
  {
    id: "cf04-sweeping",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Varrição",
    subjectId: "cf04-cleaning",
    isAnonymous: true,
    serviceInformation: "Informe rua, bairro e trecho que necessita de varrição.",
  },
  {
    id: "cf04-household-waste",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Coleta de lixo domiciliar",
    subjectId: "cf04-cleaning",
    isAnonymous: true,
    serviceInformation: "Informe endereço, dias e o problema com a coleta domiciliar.",
  },
  {
    id: "cf04-recycling",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Coleta de lixo reciclável",
    subjectId: "cf04-cleaning",
    isAnonymous: true,
    serviceInformation: "Informe endereço e a necessidade de coleta de materiais recicláveis.",
  },
  {
    id: "cf04-debris",
    kind: "SUBSUBJECT",
    requestType: "Solicitação",
    name: "Remoção de entulho em via pública",
    subjectId: "cf04-cleaning",
    isAnonymous: true,
    serviceInformation: "Informe rua, bairro e o ponto onde se encontra o entulho.",
  },
];

export function mergeWithDefaultPublicCatalog(
  dbCatalog: PublicOmbudsmanReference[],
): PublicOmbudsmanReference[] {
  const existingIds = new Set(dbCatalog.map((item) => item.id));
  const existingKeys = new Set(
    dbCatalog.map((item) => `${item.kind}:${item.requestType}:${item.name.trim().toLowerCase()}`),
  );
  const merged = [...dbCatalog];
  for (const fallback of DEFAULT_PUBLIC_OMBUDSMAN_CATALOG) {
    const key = `${fallback.kind}:${fallback.requestType}:${fallback.name.trim().toLowerCase()}`;
    if (!existingIds.has(fallback.id) && !existingKeys.has(key)) {
      merged.push(fallback);
    }
  }
  return merged;
}
