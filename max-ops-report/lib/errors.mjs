export class ConnectorError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.details = details;
  }
}

export class ConfigurationError extends ConnectorError {
  constructor(message, details) {
    super("NOT_CONNECTED", message, details);
    this.name = "ConfigurationError";
  }
}

export class IdentityError extends ConnectorError {
  constructor(message, details) {
    super("TASK_IDENTITY_MISMATCH", message, details);
    this.name = "IdentityError";
  }
}

export class ConflictError extends ConnectorError {
  constructor(message, details) {
    super("IDEMPOTENCY_CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

export class UnsupportedOperationError extends ConnectorError {
  constructor(adapter, operation) {
    super("UNSUPPORTED_OPERATION", `${adapter} does not support ${operation}.`);
    this.name = "UnsupportedOperationError";
  }
}
