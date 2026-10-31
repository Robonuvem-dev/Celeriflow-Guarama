import { z } from "zod";
export const ombudsmanRequestTypes=["Denúncia","Reclamação","Sugestão","Elogio","Solicitação","Ocorrência"] as const;
export const ombudsmanReferenceKinds={SUBJECT:"Assuntos",SUBSUBJECT:"Subassuntos",JUSTIFICATION:"Justificativas"} as const;
export const ombudsmanReferenceSchema=z.object({kind:z.enum(["SUBJECT","SUBSUBJECT","JUSTIFICATION"]),requestType:z.enum(ombudsmanRequestTypes),name:z.string().trim().min(1).max(200),subjectId:z.string().min(1).nullable(),subsubjectId:z.string().min(1).nullable(),isActive:z.boolean()}).superRefine((value,context)=>{
 if(value.kind!=="SUBJECT"&&!value.subjectId)context.addIssue({code:"custom",path:["subjectId"],message:"Selecione o assunto."});
 if(value.kind==="JUSTIFICATION"&&!value.subsubjectId)context.addIssue({code:"custom",path:["subsubjectId"],message:"Selecione o subassunto."});
 if(value.kind==="SUBJECT"&&(value.subjectId||value.subsubjectId))context.addIssue({code:"custom",path:["subjectId"],message:"Assunto principal não possui pai."});
 if(value.kind==="SUBSUBJECT"&&value.subsubjectId)context.addIssue({code:"custom",path:["subsubjectId"],message:"Subassunto deve vincular somente o assunto pai."});
});
