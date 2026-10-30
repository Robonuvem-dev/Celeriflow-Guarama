import { z } from "zod";
export const processReferenceKinds = {
  OTHER_APPLICANT: "Outros requerentes", SUBJECT_CHILD: "Subassuntos", PHYSICAL_LOCATION: "Localizações físicas", REQUIRED_DOCUMENT: "Documentos necessários", JUSTIFICATION: "Justificativas", REQUEST_METHOD: "Formas de solicitação",
} as const;
export const processReferenceSchema = z.object({
  kind: z.enum(["SUBJECT_CHILD", "PHYSICAL_LOCATION", "REQUIRED_DOCUMENT", "JUSTIFICATION", "REQUEST_METHOD", "OTHER_APPLICANT"]),
  name: z.string().trim().min(1, "Informe a descrição.").max(200),
  description: z.string().trim().max(2000).nullable(),
  subjectId: z.string().trim().min(1).nullable(),
  isActive: z.boolean(),
}).superRefine((value, context) => {
  if (value.kind === "SUBJECT_CHILD" && !value.subjectId) context.addIssue({ code: "custom", path: ["subjectId"], message: "Subassunto exige assunto pai." });
});
