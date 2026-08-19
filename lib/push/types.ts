export type PushProvider = "bark" | "ntfy" | "webhook";
export type PushMessage = { title: string; body: string; url?: string; group?: string; payload?: Record<string, unknown> };
export type DeliveryResult = { ok: boolean; status: number; retryable: boolean; detail?: string };
export const BARK_MESSAGE_FIELDS = ["title", "subtitle", "body", "markdown", "device_key", "device_keys", "level", "volume", "badge", "call", "autoCopy", "copy", "sound", "icon", "image", "group", "ciphertext", "isArchive", "ttl", "url", "action"] as const;
export type BarkMessageField = typeof BARK_MESSAGE_FIELDS[number];
export type FieldMapping = Partial<Record<BarkMessageField, string>>;
export type AdapterConfig = { mapping?: FieldMapping };
export interface PushAdapter { readonly provider: PushProvider; normalizeEndpoint(raw: string): string; send(endpoint: string, message: PushMessage, config?: AdapterConfig): Promise<DeliveryResult>; }
