# Vertex AI Search (Discovery Engine) in Flow Guru

When the assistant planner chooses **`knowledge.search`**, Flow Guru runs a **Discovery Engine** query against your **indexed data store** (uploaded docs, GCS, etc.) via `@google-cloud/discoveryengine`. Usage typically counts toward **Gen AI App Builder / Discovery Engine** billing (including many promotional credit pools—confirm eligible SKUs under **Billing → Credits**).

This is **separate** from **Dialogflow CX** (`docs/DIALOGFLOW_CX.md`) and from calling **Gemini** directly.

## Prerequisites (GCP)

1. Same or dedicated GCP project with **Discovery Engine API** / Vertex AI Search enabled.
2. A **data store** created in [Gen App Builder / AI Applications](https://console.cloud.google.com/gen-app-builder/) with documents ingested.
3. Note **Location**, **Data store ID**, and the **serving config** id (often `default_search`—verify in Console).

## Environment variables

Set these on **Vercel** / server only (never expose JSON keys to the client):

| Variable | Description |
| :-- | :-- |
| `VERTEX_SEARCH_PROJECT_ID` | GCP project ID |
| `VERTEX_SEARCH_LOCATION` | Region (e.g. `global`, `us`, `us-central1`) — must match where the data store lives |
| `VERTEX_SEARCH_DATA_STORE_ID` | Data store ID |
| `VERTEX_SEARCH_SERVING_CONFIG_ID` | Optional; defaults to **`default_search`** |
| `VERTEX_SEARCH_GOOGLE_CREDENTIALS_JSON` | Service account JSON with Discovery Engine access (e.g. **Discovery Engine Editor** or **Viewer** + Search usage as needed). **`DIALOGFLOW_GOOGLE_CREDENTIALS_JSON`** / **`GOOGLE_APPLICATION_CREDENTIALS_JSON`** are accepted as fallbacks if you reuse one SA (ensure IAM allows Discovery Engine). |

If these are missing, **`knowledge.search`** returns **`needs_connection`** with setup instructions.

## Planner behavior

The LLM planner must emit **`knowledge.search`** with **`knowledge.query`** for corpus-style questions (your indexed library). Use **`browser.use`** for arbitrary web lookup.

## Anti-patterns

- Do **not** import `@google-cloud/discoveryengine` in `client/`.
- Avoid routing **every** chat turn to Search—only when the planner selects **`knowledge.search`** (saves cost and noise).
