import {
  createSession,
  InvalidCursorApiKeyError,
  readPersistedCursorApiKey,
  restoreSession,
  savePersistedCursorApiKey,
  UnknownAppBuilderSessionError,
  validateCursorApiKey,
} from "@/lib/app-builder/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SessionRequest = {
  apiKey?: string
  persistApiKey?: boolean
  sessionId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SessionRequest
    const submittedApiKey = body.apiKey?.trim()
    const sessionId = body.sessionId?.trim()
    const apiKey = submittedApiKey || (await readPersistedCursorApiKey())

    if (!apiKey) {
      return Response.json(
        {
          code: "missing_api_key",
          error: "A Cursor API key is required to start a session.",
        },
        { status: 400 }
      )
    }

    if (!apiKey.startsWith("crsr_")) {
      return Response.json(
        {
          code: "invalid_api_key",
          error: "Cursor API keys start with crsr_. Please check the key.",
        },
        { status: 400 }
      )
    }

    await validateCursorApiKey(apiKey)

    if (submittedApiKey && body.persistApiKey) {
      await savePersistedCursorApiKey(submittedApiKey)
    }

    if (sessionId) {
      const session = await restoreSession(sessionId, apiKey)
      return Response.json(session)
    }

    const session = await createSession(apiKey)
    return Response.json(session)
  } catch (error) {
    if (error instanceof InvalidCursorApiKeyError) {
      return Response.json(
        {
          code: error.code,
          error: error.message,
        },
        { status: 400 }
      )
    }

    if (error instanceof UnknownAppBuilderSessionError) {
      return Response.json(
        {
          code: error.code,
          error: error.message,
        },
        { status: 404 }
      )
    }

    const message =
      error instanceof Error ? error.message : "Failed to create session."

    return Response.json({ error: message }, { status: 500 })
  }
}
