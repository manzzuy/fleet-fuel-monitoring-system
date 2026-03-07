import type { ErrorResponse } from '@fleet-fuel/shared';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly hint?: string,
  ) {
    super(message);
  }
}

export function toErrorResponse(error: AppError, requestId?: string): ErrorResponse {
  const payload: ErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(error.hint !== undefined ? { hint: error.hint } : {}),
    },
    ...(requestId !== undefined ? { request_id: requestId } : {}),
  };

  return {
    ...payload,
  };
}
