import { EncryptedFileRecordSchema, type EncryptedFileRecord } from "@nada/db";

export function bytesToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encryptFileForBlindUpload(
  file: File
): Promise<EncryptedFileRecord> {
  const key = await crypto.subtle.generateKey(
    {
      length: 256,
      name: "AES-GCM"
    },
    true,
    ["encrypt", "decrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    {
      iv: nonce,
      name: "AES-GCM"
    },
    key,
    plaintext
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const exportedKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", key)
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encryptedBytes)
  );
  const createdAt = Date.now();

  return EncryptedFileRecordSchema.parse({
    contentHash: bytesToHex(digest),
    encryptedBlobBase64: bytesToBase64(encryptedBytes),
    nonceBase64: bytesToBase64(nonce),
    keyBase64: bytesToBase64(exportedKey),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    createdAt,
    expiresAt: createdAt + 7 * 24 * 60 * 60 * 1000
  });
}

export async function decryptEncryptedFileBytes({
  encryptedBlobBase64,
  keyBase64,
  nonceBase64
}: {
  encryptedBlobBase64: string;
  keyBase64: string;
  nonceBase64: string;
}): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(keyBase64),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      iv: base64ToBytes(nonceBase64),
      name: "AES-GCM"
    },
    key,
    base64ToBytes(encryptedBlobBase64)
  );
  return new Uint8Array(plaintext);
}
