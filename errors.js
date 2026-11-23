// One error shape for the whole API: { message, code } with a plain-language message.
export class AppError extends Error {
  constructor(code, userMessage, status = 400) { super(userMessage); this.code = code; this.userMessage = userMessage; this.status = status; }
}
