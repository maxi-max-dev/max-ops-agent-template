import { FeishuBaseDirectAdapter } from "./feishu-base-direct.mjs";
import { WebhookWriteAdapter } from "./webhook-write.mjs";

export function createAdapter(config, options) {
  if (config.adapter === "webhook_write") return new WebhookWriteAdapter(config, options);
  if (config.adapter === "feishu_base_direct") return new FeishuBaseDirectAdapter(config, options);
  throw new Error(`Unsupported adapter: ${config.adapter}`);
}
