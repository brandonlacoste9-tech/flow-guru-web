import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sdk } from "./lib/_core/sdk.js";
import { upsertProviderConnection } from "./lib/db.js";
import {
  connectMicrosoftCalendar,
  getMicrosoftCalendarCallbackUrl,
  parseMicrosoftOAuthState,
} from "./lib/_core/microsoftCalendar.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      return res.redirect(302, "/?error=auth_required");
    }

    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;

    if (!code || !state) {
      return res.redirect(302, "/?integration=microsoft-calendar&status=error&message=Missing code or state");
    }

    try {
      const parsedState = parseMicrosoftOAuthState(state);
      if (parsedState.userId !== user.id) {
        throw new Error("Microsoft OAuth state did not match the authenticated user.");
      }

      const result = await connectMicrosoftCalendar({
        userId: user.id,
        code,
        redirectUri: getMicrosoftCalendarCallbackUrl(req),
      });

      return res.redirect(302, `/?integration=microsoft-calendar&status=connected&account=${encodeURIComponent(result.accountLabel)}`);
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "Outlook Calendar connection failed.";
      await upsertProviderConnection({
        userId: user.id,
        provider: "microsoft-calendar",
        status: "error",
        lastError: message,
      });
      return res.redirect(302, `/?integration=microsoft-calendar&status=error&message=${encodeURIComponent(message)}`);
    }
  } catch (err: any) {
    return res.redirect(302, "/?error=auth_required");
  }
}
