/**
 * Optional Dialogflow CX integration for conversational replies when no structured assistant tool ran.
 * Configure GCP credentials + agent IDs via env (see docs/DIALOGFLOW_CX.md).
 */
import { SessionsClient } from "@google-cloud/dialogflow-cx";

type CxResponseMessage = {
  text?: { text?: string[] };
};

let cachedClient: SessionsClient | null = null;
let cachedForEndpoint = "";

function cxCredentialsJson(): string {
  return (
    process.env.DIALOGFLOW_GOOGLE_CREDENTIALS_JSON?.trim() ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() ??
    ""
  );
}

export function isDialogflowCxConfigured(): boolean {
  const projectId = process.env.DIALOGFLOW_CX_PROJECT_ID?.trim();
  const agentId = process.env.DIALOGFLOW_CX_AGENT_ID?.trim();
  return Boolean(projectId && agentId && cxCredentialsJson());
}

/** CX session IDs must be ≤ 36 chars */
export function buildCxSessionId(threadId: number): string {
  const s = `fg-${threadId}`;
  return s.length <= 36 ? s : s.slice(0, 36);
}

function languageCode(lang?: string): string {
  if (lang === "fr") return "fr-FR";
  return "en-US";
}

function getSessionsClient(location: string): SessionsClient {
  const endpoint = `${location}-dialogflow.googleapis.com`;
  if (cachedClient && cachedForEndpoint === endpoint) return cachedClient;

  const json = cxCredentialsJson();
  cachedClient = new SessionsClient({
    credentials: JSON.parse(json) as Record<string, unknown>,
    apiEndpoint: endpoint,
  });
  cachedForEndpoint = endpoint;
  return cachedClient;
}

function flattenCxMessages(messages: unknown[] | null | undefined): string | null {
  if (!messages?.length) return null;
  const parts: string[] = [];
  for (const m of messages) {
    const t = (m as CxResponseMessage).text?.text;
    if (t?.length) parts.push(...t);
  }
  const reply = parts.map((p) => p.trim()).filter(Boolean).join(" ").trim();
  return reply.length ? reply : null;
}

export async function detectDialogflowCxReply(params: {
  threadId: number;
  message: string;
  language?: string;
}): Promise<string | null> {
  if (!isDialogflowCxConfigured()) return null;

  const projectId = process.env.DIALOGFLOW_CX_PROJECT_ID!.trim();
  const location = process.env.DIALOGFLOW_CX_LOCATION?.trim() || "us-central1";
  const agentId = process.env.DIALOGFLOW_CX_AGENT_ID!.trim();

  const sessionStr = buildCxSessionId(params.threadId);

  try {
    const client = getSessionsClient(location);
    const sessionPath = client.projectLocationAgentSessionPath(projectId, location, agentId, sessionStr);

    const [response] = await client.detectIntent({
      session: sessionPath,
      queryInput: {
        text: { text: params.message },
        languageCode: languageCode(params.language),
      },
    });

    const msgs = response.queryResult?.responseMessages as unknown[] | undefined;
    return flattenCxMessages(msgs);
  } catch (err) {
    console.warn("[Dialogflow CX] detectIntent failed, falling back to LLM:", err);
    return null;
  }
}
