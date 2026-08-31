import { assertEventIdentity, requireIdempotencyKey, semanticEventDigest } from "../lib/contract.mjs";
import { ConnectorError, UnsupportedOperationError } from "../lib/errors.mjs";

export class WebhookWriteAdapter {
  constructor(config, { fetchImpl = globalThis.fetch } = {}) {
    this.name = "webhook_write";
    this.config = config;
    this.fetch = fetchImpl;
  }

  async writeEvent(event, key) {
    const idempotencyKey = requireIdempotencyKey(key);
    const serializedEvent = JSON.stringify(event);
    if ([this.config.webhookToken, this.config.webhookUrl].some((value) => value && serializedEvent.includes(value))) {
      throw new ConnectorError("SECRET_EGRESS", "Refusing to place a connection value in the webhook event.");
    }
    const body = {
      schema_version: "maxops-webhook-write/1",
      instance_id: this.config.instanceId,
      idempotency_key: idempotencyKey,
      payload_digest: semanticEventDigest(event),
      event,
    };
    let response;
    try {
      response = await this.fetch(this.config.webhookUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.webhookToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-MAXOPS-Instance-ID": this.config.instanceId,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new ConnectorError(
        "NETWORK_OUTCOME_UNKNOWN",
        "Webhook outcome is unknown. Retry the same logical event with the same idempotency key.",
      );
    }

    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const retry = response.status >= 500 ? " Retry with the same idempotency key." : "";
      throw new ConnectorError("WEBHOOK_REJECTED", `Webhook rejected the event with HTTP ${response.status}.${retry}`);
    }

    if (payload.event) assertEventIdentity(payload.event, event);
    if (payload.instance_id && payload.instance_id !== event.instance_id) {
      throw new ConnectorError("WEBHOOK_IDENTITY_MISMATCH", "Webhook response instance identity does not match the request.");
    }
    return {
      ok: true,
      adapter: this.name,
      delivery: "accepted_by_webhook",
      duplicate: payload.duplicate === true,
      receipt_id: typeof payload.receipt_id === "string" ? payload.receipt_id : null,
      idempotency_key: idempotencyKey,
    };
  }

  unsupported(operation) {
    throw new UnsupportedOperationError(this.name, operation);
  }

  readTask() { return this.unsupported("task reads"); }
  inbox() { return this.unsupported("feedback inbox"); }
  acknowledge() { return this.unsupported("acknowledgements and receipts"); }
  readReceipt() { return this.unsupported("receipt reads"); }
}
