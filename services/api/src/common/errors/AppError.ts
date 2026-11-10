export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, errorCode: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'RESOURCE_NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'INVALID_STATE_TRANSITION', details);
  }
}

export class CircularDependencyError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'CIRCULAR_DEPENDENCY_DETECTED', details);
  }
}

export class ReferentialIntegrityError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'ORPHAN_REFERENCE_PREVENTED', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_SERVER_ERROR');
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string = 'An external service could not complete the request.', details?: unknown) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message: string = 'The operation is temporarily rate limited.', details?: unknown) {
    super(message, 429, 'RATE_LIMITED', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, errorCode = 'SERVICE_UNAVAILABLE') {
    super(message, 503, errorCode);
  }
}

export class DuplicateError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'DUPLICATE_ERROR', details);
  }
}

export class InsufficientStockError extends AppError {
  constructor(message: string = 'Insufficient available stock for this movement.', details?: unknown) {
    super(message, 409, 'INSUFFICIENT_STOCK', details);
  }
}

export class MaxBomDepthExceededError extends AppError {
  constructor(message: string = 'BOM component depth exceeds the maximum allowed depth.', details?: unknown) {
    super(message, 422, 'MAX_BOM_DEPTH_EXCEEDED', details);
  }
}
