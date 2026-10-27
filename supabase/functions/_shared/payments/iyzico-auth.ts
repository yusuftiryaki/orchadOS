// iyzico request authentication (IYZWSv2), with Web Crypto only.
//
//   signature     = hex(HMAC-SHA256(secret, rnd + uriPath + body))
//   Authorization = "IYZWSv2 " + base64("apiKey:" + apiKey + "&randomKey:" + rnd + "&signature:" + signature)
//   x-iyzi-rnd    = rnd

const encoder = new TextEncoder();

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64(text: string): string {
  let binary = "";
  for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${Date.now()}${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

// uriPath is the request path (and query string, if any) without the host,
// e.g. "/payment/iyzipos/checkoutform/initialize/auth/ecom".
export async function iyzicoHeaders(
  apiKey: string,
  secret: string,
  uriPath: string,
  body: string,
  rnd: string = randomKey(),
): Promise<Record<string, string>> {
  const signature = await hmacSha256Hex(secret, rnd + uriPath + body);
  const auth = base64(`apiKey:${apiKey}&randomKey:${rnd}&signature:${signature}`);
  return {
    authorization: `IYZWSv2 ${auth}`,
    "x-iyzi-rnd": rnd,
    "content-type": "application/json",
    accept: "application/json",
  };
}
