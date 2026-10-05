/** Shared domain errors so API/MCP layers can map to status codes. */
export class PloError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400
  ) {
    super(message);
    this.name = "PloError";
  }
}

export class NotFoundError extends PloError {
  constructor(what = "resource") {
    super(`${what} not found`, "not_found", 404);
  }
}

export class ForbiddenError extends PloError {
  constructor(msg = "forbidden") {
    super(msg, "forbidden", 403);
  }
}

export class ImmutableError extends PloError {
  constructor(msg = "resource is immutable") {
    super(msg, "immutable", 409);
  }
}

export class ValidationError extends PloError {
  constructor(msg: string) {
    super(msg, "validation", 422);
  }
}
