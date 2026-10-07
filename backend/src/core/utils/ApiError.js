/**
 * Errors carry a stable machine `code` the apps map to UX.
 * Messages here are developer-facing; apps localise by code.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, message, details) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(code = 'UNAUTHORIZED', message = 'Authentication required') {
    return new ApiError(401, code, message);
  }
  static forbidden(code = 'FORBIDDEN', message = 'Not allowed') {
    return new ApiError(403, code, message);
  }
  static notFound(code = 'NOT_FOUND', message = 'Not found') {
    return new ApiError(404, code, message);
  }
  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }
  static tooMany(code = 'RATE_LIMITED', message = 'Too many requests', details) {
    return new ApiError(429, code, message, details);
  }
  static unavailable(code, message, details) {
    return new ApiError(503, code, message, details);
  }
}
