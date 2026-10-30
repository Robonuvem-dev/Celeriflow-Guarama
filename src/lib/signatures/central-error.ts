export class CentralError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export class CentralCredentialError extends CentralError {
  readonly code = "CENTRAL_INVALID_PASSWORD";
  constructor() { super("Senha pessoal inválida.", 403); }
}
