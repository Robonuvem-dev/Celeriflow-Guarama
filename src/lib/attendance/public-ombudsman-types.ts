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
