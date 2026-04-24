import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { upsertProviderConnection, getProviderConnection } from "./lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Extract provider from URL path: /api/integrations/:provider/disconnect
    const url = new URL(req.url ?? "", `https://${req.headers.host}`);
    const parts = url.pathname.split("/");
    // Expected: ["", "api", "integrations", "<provider>", "disconnect"]
    const provider = parts[3] ?? (req.body as any)?.provider;

    if (!provider || !["google-calendar", "spotify"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    const existing = await getProviderConnection(user.id, provider);
    if (!existing) {
      return res.json({ ok: true, message: "Already disconnected" });
    }

    await upsertProviderConnection({
      userId: user.id,
      provider,
      status: "disconnected",
      accessToken: null,
      refreshToken: null,
      expiresAtUnixMs: null,
      lastError: null,
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[Disconnect]", err.message);
    return res.status(500).json({ error: "Failed to disconnect" });
  }
}
