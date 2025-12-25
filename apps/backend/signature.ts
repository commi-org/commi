import { createSign, createHash } from "node:crypto";

export function signRequestHeaders(
  method: string,
  url: string,
  body: string,
  keyId: string,
  privateKey: string
): Record<string, string> {
  const u = new URL(url);
  const date = new Date().toUTCString();
  const host = u.host;
  const target = `${method.toLowerCase()} ${u.pathname}`;

  const digest = `SHA-256=${createHash('sha256').update(body).digest('base64')}`;

  const headersToSign = ["(request-target)", "host", "date", "digest"];
  const stringToSign = `(request-target): ${target}\nhost: ${host}\ndate: ${date}\ndigest: ${digest}`;

  const signer = createSign("sha256");
  signer.update(stringToSign);
  const signature = signer.sign(privateKey, "base64");

  const header = `keyId="${keyId}",algorithm="rsa-sha256",headers="${headersToSign.join(" ")}",signature="${signature}"`;

  return {
    Date: date,
    Host: host,
    Digest: digest,
    Signature: header,
    "Content-Type": "application/activity+json",
    Accept: "application/activity+json"
  };
}
