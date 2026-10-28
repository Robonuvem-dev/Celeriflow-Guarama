export type PersonMergePageData = {
  people: { id: string; fullName: string; cpf: string | null }[];
  requests: { id: string; status: string; sourcePerson: { fullName: string }; targetPerson: { fullName: string }; proposedByUsuario: { nome: string } }[];
};
