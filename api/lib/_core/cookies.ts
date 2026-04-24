import type { VercelRequest } from "@vercel/node";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: VercelRequest) {
  const protocol = (req as any).protocol;
  if (protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some((proto: string) => proto.trim().toLowerCase() === "https");
}

function extractHostname(req: VercelRequest): string | undefined {
  const host = (req as any).hostname
    || (req.headers?.["x-forwarded-host"] as string)?.split(",")[0]?.trim()
    || (req.headers?.host as string)?.split(":")[0];
  return host || undefined;
}

export function getSessionCookieOptions(
  req: VercelRequest
): any {
  const hostname = extractHostname(req);
  const isLocal =
    !hostname ||
    LOCAL_HOSTS.has(hostname) ||
    isIpAddress(hostname);

  const secure = isSecureRequest(req);

  // For production domains, set domain to apex with leading dot
  // so sessions survive www↔apex and future subdomains.
  let domain: string | undefined;
  if (!isLocal && hostname) {
    // Extract apex domain (e.g. "floguru.com" from "www.floguru.com" or "flow-guru-web.vercel.app")
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      domain = `.${parts.slice(-2).join(".")}`;
    }
  }

  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure,
    ...(domain ? { domain } : {}),
  };
}
