export class AccessError extends Error {
  constructor(message: string, readonly status: 401 | 403 | 404 | 423) {
    super(message);
  }
}
