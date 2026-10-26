export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message || code);
  }
}

export const unauthorized = (msg = "Authentication required") => new ApiError(401, "UNAUTHORIZED", msg);
export const forbidden = (msg = "Not authorized") => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (msg = "Not found") => new ApiError(404, "NOT_FOUND", msg);
export const badRequest = (msg = "Invalid request", extra?: Record<string, unknown>) =>
  new ApiError(400, "BAD_REQUEST", msg, extra);
