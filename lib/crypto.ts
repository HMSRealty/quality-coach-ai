// AES-GCM helpers for encrypting/decrypting sensitive per-tenant secrets
// (Readymode passwords, etc.) at rest in Supabase. Master key comes from the
// READYMODE_ENC_KEY env var — a base64-encoded 32-byte (256-bit) key.
//
// Generate one with:  openssl rand -base64 32
// then set as a Cloudflare Pages secret.

const TEXT = new TextEncoder();
const TEXT_D = new TextDecoder();

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.READYMODE_ENC_KEY || "";
  if (!raw) throw new Error("READYMODE_ENC_KEY is not set");
  // Accept base64 or hex; auto-detect by length/charset.
  let bytes: Uint8Array;
  if (/^[0-9a-f]+$/i.test(raw) && raw.length === 64) {
    bytes = new Uint8Array(raw.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  } else {
    const bin = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  if (bytes.length !== 32) throw new Error(`READYMODE_ENC_KEY must decode to 32 bytes, got ${bytes.length}`);
  return crypto.subtle.importKey("raw", bytes.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Encrypt → "v1:" + base64(iv || ciphertext_with_tag)
export async function encryptSecret(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    TEXT.encode(plain).buffer as ArrayBuffer,
  ));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return "v1:" + toB64(out);
}

export async function decryptSecret(payload: string): Promise<string> {
  if (!payload.startsWith("v1:")) throw new Error("Unknown ciphertext version");
  const key = await getKey();
  const blob = fromB64(payload.slice(3));
  const iv = blob.slice(0, 12);
  const ct = blob.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, ct.buffer as ArrayBuffer);
  return TEXT_D.decode(pt);
}
