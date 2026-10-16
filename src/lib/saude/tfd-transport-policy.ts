type TfdBoardingPassenger = {
  patientId: string; kind: string; presenceStatus: string;
  tfdRequest?: { status: string; clinicalReport: { companionRequired: boolean } | null } | null;
};

export function assertTfdBoardingReady(passengers: TfdBoardingPassenger[]) {
  if (passengers.some(passenger => passenger.presenceStatus === "PENDING")) throw new Error("Registre embarque ou falta de todos os integrantes antes da saída.");
  const boardedPatients = passengers.filter(passenger => passenger.kind === "PACIENTE" && passenger.presenceStatus === "BOARDED");
  if (!boardedPatients.length) throw new Error("A saída exige ao menos um paciente embarcado.");
  for (const passenger of boardedPatients) {
    if (passenger.tfdRequest && !["AUTORIZADA", "AGENDADA"].includes(passenger.tfdRequest.status)) throw new Error("Tratamento do paciente não está autorizado para transporte.");
    if (passenger.tfdRequest?.clinicalReport?.companionRequired && !passengers.some(companion => companion.patientId === passenger.patientId && companion.kind === "ACOMPANHANTE" && companion.presenceStatus === "BOARDED")) throw new Error("O laudo exige acompanhante embarcado para este paciente.");
  }
  for (const companion of passengers.filter(passenger => passenger.kind === "ACOMPANHANTE" && passenger.presenceStatus === "BOARDED")) {
    if (!boardedPatients.some(patient => patient.patientId === companion.patientId)) throw new Error("Acompanhante embarcado exige o paciente vinculado presente na viagem.");
  }
}
