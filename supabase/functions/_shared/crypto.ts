import { HttpError } from "./http.ts";

const encoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new HttpError(400, "Invalid base64url value.", "invalid_encoding");
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

export async function sha256Hex(value: string): Promise<string> {
  return bytesToHex(await sha256Bytes(value));
}

export function randomToken(size = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  if (!jwk.crv || !jwk.kty || !jwk.x || !jwk.y) {
    throw new HttpError(400, "Incomplete kiosk public key.", "invalid_key");
  }

  const canonical = JSON.stringify({
    crv: jwk.crv,
    kty: jwk.kty,
    x: jwk.x,
    y: jwk.y,
  });
  return bytesToBase64Url(await sha256Bytes(canonical));
}

export async function verifyKioskSignature(
  jwk: JsonWebKey,
  signature: string,
  canonicalRequest: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new Uint8Array(base64UrlToBytes(signature)),
      encoder.encode(canonicalRequest),
    );
  } catch {
    return false;
  }
}
