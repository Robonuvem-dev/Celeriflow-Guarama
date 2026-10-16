export class SstValidationError extends Error {
  constructor(message: string) { super(message); this.name = "SstValidationError"; }
}
