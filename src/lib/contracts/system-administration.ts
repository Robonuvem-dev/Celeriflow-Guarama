import type { DepartmentRecord, EmployeeRecord, SecretariatRecord } from "./administration";

export type AccessProfileRecord = { id: string; codigo: string; nome: string; descricao: string | null; permissoes: string; ativo: boolean; createdAt: Date; updatedAt: Date };
export type ManagedUserRecord = { id: string; nome: string; email: string; senha: string; firebaseUid: string | null; ativo: boolean; perfilId: string; employeeId: string | null; createdAt: Date; updatedAt: Date };
export type SystemModuleRecord = { id: string; nome: string; codigo: string; ativo: boolean; dataAtivacao: Date | null; createdAt: Date; updatedAt: Date };
export type ManagedUserDetails = ManagedUserRecord & { perfil: AccessProfileRecord; employee: (EmployeeRecord & { department: DepartmentRecord | null; secretariat: SecretariatRecord | null }) | null };
export type ManagedUserCandidate = ManagedUserRecord & { perfil: { codigo: string } };
export type ManagedUserInput = { nome: string; email: string; firebaseUid: string; perfilId: string; employeeId: string | null; ativo: boolean };
export type ProfileInput = { codigo?: string; nome: string; descricao: string | null; permissoes: string; ativo: boolean };
export type ProfileWithLegacyUsers = AccessProfileRecord & { usuarios: { permissoesModulo: { id: string; usuarioId: string; moduloId: string; canView: boolean; canEdit: boolean; modulo: { codigo: string } }[] }[] };
export type UserAdministrationData = { usuarios: ManagedUserDetails[]; perfis: AccessProfileRecord[]; servidores: (EmployeeRecord & { department: DepartmentRecord | null; secretariat: SecretariatRecord | null })[] };
export type SystemInstanceRecord = { id: string; nomePrefeitura: string; cnpj: string | null; municipio: string; uf: string; dominio: string | null; status: string; createdAt: Date; updatedAt: Date };
export type SystemInstanceWithParameters = SystemInstanceRecord & { parametros: { chave: string; valor: unknown }[] };
