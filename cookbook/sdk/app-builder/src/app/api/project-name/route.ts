import {
  generateProjectName,
  ProjectNameGenerationTimeoutError,
  type ProjectNameMessage,
  UnknownAppBuilderSessionError,
} from "@/lib/app-builder/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProjectNameRequest = {
  sessionId?: string
  prompt?: string
  messages?: unknown
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ProjectNameRequest
    const sessionId = body.sessionId?.trim()
    const prompt = body.prompt?.trim()
    const messages = toProjectNameMessages(body.messages)

    if (!sessionId || (!prompt && messages.length === 0)) {
      return Response.json(
        { error: "sessionId and conversation context are required." },
        { status: 400 }
      )
    }

    const context = { prompt, messages }
    const title = await generateProjectName(sessionId, context)
    return Response.json({ title })
  } catch (error) {
    if (error instanceof UnknownAppBuilderSessionError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: 404 }
      )
    }

    if (error instanceof ProjectNameGenerationTimeoutError) {
      return Response.json(
        { code: error.code, error: error.message },
        { status: 504 }
      )
    }

    const message =
      error instanceof Error ? error.message : "Failed to generate project name."

    return Response.json({ error: message }, { status: 500 })
  }
}

function toProjectNameMessages(value: unknown): ProjectNameMessage[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }

    const message = item as Partial<ProjectNameMessage>
    if (
      (message.role !== "assistant" && message.role !== "user") ||
      typeof message.content !== "string"
    ) {
      return []
    }

    const content = message.content.replace(/\s+/g, " ").trim()
    return content ? [{ role: message.role, content }] : []
  })
}
