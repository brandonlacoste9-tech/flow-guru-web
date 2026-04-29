import { jsonError } from "@/lib/agents/http"
import {
  clearPersistedKey,
  createSession,
  restoreSession,
} from "@/lib/agents/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SessionRequest = {
  apiKey?: string
  remember?: boolean
  sessionId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as SessionRequest
    const apiKey = body.apiKey?.trim()

    if (apiKey) {
      return jsonSession(await createSession(apiKey, Boolean(body.remember)), request)
    }

    return jsonSession(await restoreSession(body.sessionId?.trim()), request)
  } catch (error) {
    return jsonError(error, "Failed to create an Agent Kanban session.")
  }
}

export async function DELETE(request: Request) {
  try {
    await clearPersistedKey()
    const response = Response.json({ ok: true })
    response.headers.set(
      "Set-Cookie",
      `agent-kanban-session=; ${sessionCookieAttributes(request)}; Max-Age=0`
    )
    return response
  } catch (error) {
    return jsonError(error, "Failed to clear the persisted Cursor API key.")
  }
}

function jsonSession(
  session: Awaited<ReturnType<typeof createSession>>,
  request: Request
) {
  const response = Response.json(session)
  response.headers.set(
    "Set-Cookie",
    `agent-kanban-session=${encodeURIComponent(
      session.id
    )}; ${sessionCookieAttributes(request)}; Max-Age=2592000`
  )
  return response
}

function sessionCookieAttributes(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const isHttps = new URL(request.url).protocol === "https:" || forwardedProto === "https"
  const secure = isHttps ? "; Secure" : ""
  return `Path=/; HttpOnly; SameSite=Lax${secure}`
}
