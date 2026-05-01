# Dialogflow CX in Flow Guru

Flow Guru can route **conversational turns** (when no structured assistant tool/action matched) through **Google Dialogflow CX**, so usage draws against your Google Cloud / promotional CX credits.

## Behavior

- Calendar, lists, weather, directions, and other **planned assistant actions** still run through the existing planner (`assistantActions`) first.
- If **`action === "none"`**, the backend optionally asks your CX agent for a reply **instead of** the usual LLM.
- If Dialogflow is disabled, misconfigured, or errors, the app **falls back to the LLM** as before.

Code lives only in **`api/lib/_core/dialogflowCx.ts`** (server-side); routers import it—never expose credentials to the client.

---

## Step-by-step: gather credentials

### 1. Project ID (`DIALOGFLOW_CX_PROJECT_ID`)

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select the project that owns Dialogflow CX (project picker in the top bar).
3. Copy **Project ID** (stable string like `my-project-123`).  
   - **IAM & Admin → Settings**, or the dashboard, shows **Project ID** (not the display name).

### 2. Enable APIs and billing

1. Link **Billing** to this project if it isn’t already (promo credits apply here).
2. Enable **[Dialogflow API](https://console.cloud.google.com/apis/library/dialogflow.googleapis.com)** on the same project.

### 3. Location and Agent ID (`DIALOGFLOW_CX_LOCATION`, `DIALOGFLOW_CX_AGENT_ID`)

1. Open **[Dialogflow CX](https://dialogflow.cloud.google.com/cx/)** and select the **same** GCP project.
2. Open your agent.
3. **Location** — the region where the agent was created (e.g. `us-central1`, `global`). It must match the agent’s region exactly.
4. **Agent ID** — appears in the CX Console URL or **Agent settings**, typically as part of:  
   `.../locations/<LOCATION>/agents/<AGENT_ID>/...`

### 4. Service account JSON (`DIALOGFLOW_GOOGLE_CREDENTIALS_JSON`)

1. In Cloud Console: **[IAM & Admin → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)** (same project).
2. **Create service account** (e.g. name `flow-guru-dialogflow-cx`).
3. Grant **Dialogflow API Client** (`roles/dialogflow.client`) on this project (or a broader role only while prototyping).
4. **Keys → Add key → Create new key → JSON** — download the file.

Put the **entire JSON file contents** into the environment variable **`DIALOGFLOW_GOOGLE_CREDENTIALS_JSON`** (or **`GOOGLE_APPLICATION_CREDENTIALS_JSON`**). Do **not** commit this file to git.

---

## Environment variables (quick reference)

| Variable | Description |
| :-- | :-- |
| `DIALOGFLOW_CX_PROJECT_ID` | GCP **project ID** |
| `DIALOGFLOW_CX_LOCATION` | CX agent **region** (default in code if omitted: `us-central1` — prefer setting explicitly to match the agent) |
| `DIALOGFLOW_CX_AGENT_ID` | **Agent ID** from CX Console / URL |
| `DIALOGFLOW_GOOGLE_CREDENTIALS_JSON` | Full **service account key JSON** (preferred name). **`GOOGLE_APPLICATION_CREDENTIALS_JSON`** is also accepted. |

Paste the JSON in Vercel as a secret (multiline supported). Until **project ID, location, agent ID, and valid JSON** are set, Dialogflow is skipped (LLM only).

---

## Session IDs

Each chat thread maps to a CX session id like `fg-<threadId>` (≤ 36 characters). Same thread keeps conversational context on the CX side.

---

## Billing / credits

Dialogflow CX usage appears under your GCP billing account (including CX promotional balances such as trial credits). Train flows and fulfillments in CX Console as needed; Flow Guru only sends **text** `detectIntent` calls.
