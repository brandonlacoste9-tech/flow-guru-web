/**
 * Vertex AI Search (Discovery Engine) — optional knowledge retrieval for indexed corpora.
 * Server-only; credentials via env. See docs/VERTEX_SEARCH.md.
 */
import { SearchServiceClient } from "@google-cloud/discoveryengine";

export type VertexSearchSource = { title: string; snippet: string; uri?: string };

export type VertexSearchOutcome = {
  /** Answer text (generative summary when enabled, else stitched snippets). */
  summary: string;
  sources: VertexSearchSource[];
};

let cachedClient: SearchServiceClient | null = null;

function credentialsJson(): string {
  return (
    process.env.VERTEX_SEARCH_GOOGLE_CREDENTIALS_JSON?.trim() ??
    process.env.DIALOGFLOW_GOOGLE_CREDENTIALS_JSON?.trim() ??
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() ??
    ""
  );
}

export function isVertexSearchConfigured(): boolean {
  const project = process.env.VERTEX_SEARCH_PROJECT_ID?.trim();
  const location = process.env.VERTEX_SEARCH_LOCATION?.trim();
  const dataStore = process.env.VERTEX_SEARCH_DATA_STORE_ID?.trim();
  return Boolean(project && location && dataStore && credentialsJson());
}

function getClient(): SearchServiceClient {
  if (!cachedClient) {
    cachedClient = new SearchServiceClient({
      credentials: JSON.parse(credentialsJson()) as Record<string, unknown>,
    });
  }
  return cachedClient;
}

function pickTitle(doc: Record<string, unknown> | undefined, fallbackName: string | undefined): string {
  const derived = (doc?.derivedStructData ?? doc?.structData ?? doc?.jsonData) as Record<string, unknown> | undefined;
  const title =
    (derived?.title as string) ??
    (derived?.name as string) ??
    (derived?.display_name as string) ??
    fallbackName ??
    "Result";
  return String(title).slice(0, 300);
}

function pickSnippet(
  item: Record<string, unknown>,
  doc: Record<string, unknown> | undefined,
): string {
  const sn = item.snippet as string | undefined;
  if (sn?.trim()) return sn.trim().slice(0, 800);
  const derived = (doc?.derivedStructData ?? doc?.structData ?? doc?.jsonData) as Record<string, unknown> | undefined;
  const text =
    (derived?.snippet as string) ??
    (derived?.description as string) ??
    (derived?.body as string) ??
    "";
  return String(text).trim().slice(0, 800);
}

/**
 * Query the configured data store with optional generative summary (Discovery Engine billing SKUs).
 */
export async function searchKnowledgeBase(query: string): Promise<VertexSearchOutcome> {
  if (!isVertexSearchConfigured()) {
    throw new Error("Vertex AI Search is not configured (missing VERTEX_SEARCH_* env).");
  }

  const client = getClient();
  const projectId = process.env.VERTEX_SEARCH_PROJECT_ID!.trim();
  const location = process.env.VERTEX_SEARCH_LOCATION!.trim();
  const dataStoreId = process.env.VERTEX_SEARCH_DATA_STORE_ID!.trim();
  const servingConfigId = process.env.VERTEX_SEARCH_SERVING_CONFIG_ID?.trim() || "default_search";

  const servingConfig = client.projectLocationDataStoreServingConfigPath(
    projectId,
    location,
    dataStoreId,
    servingConfigId,
  );

  const [response] = await client.search({
    servingConfig,
    query: query.trim(),
    pageSize: 8,
    languageCode: "en-US",
    contentSearchSpec: {
      snippetSpec: {
        returnSnippet: true,
        maxSnippetCount: 2,
      },
      summarySpec: {
        summaryResultCount: 1,
        includeCitations: true,
        ignoreAdversarialQuery: true,
      },
    },
  });

  const sources: VertexSearchSource[] = [];
  const rawResults = (response.results ?? []) as Array<Record<string, unknown>>;
  for (const item of rawResults) {
    const doc = item.document as Record<string, unknown> | undefined;
    const derived = (doc?.derivedStructData ?? doc?.structData ?? doc?.jsonData) as Record<string, unknown> | undefined;
    const uri =
      (derived?.uri as string | undefined) ??
      (derived?.link as string | undefined) ??
      (derived?.url as string | undefined);
    sources.push({
      title: pickTitle(doc, doc?.name as string | undefined),
      snippet: pickSnippet(item, doc),
      ...(uri ? { uri: String(uri) } : {}),
    });
  }

  const summaryWrapper = response.summary as Record<string, unknown> | undefined | null;
  let summaryText =
    (summaryWrapper?.summaryText as string | undefined) ??
    ((summaryWrapper?.summaryWithMetadata as Record<string, unknown> | undefined)?.summary as string | undefined) ??
    "";

  summaryText = typeof summaryText === "string" ? summaryText.trim() : "";

  if (!summaryText && sources.length > 0) {
    summaryText = sources
      .slice(0, 5)
      .map((s, i) => `${i + 1}. **${s.title}** — ${s.snippet.slice(0, 280)}${s.snippet.length > 280 ? "…" : ""}`)
      .join("\n\n");
  }

  if (!summaryText) {
    summaryText = "No relevant passages turned up in your knowledge base for that query.";
  }

  return { summary: summaryText, sources };
}
