import {
  getPublicSession,
  streamAgentResponse,
  type AgentStreamEvent,
} from "@/lib/app-builder/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatRequest = {
  sessionId?: string
  message?: string
  model?: string
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatRequest

  if (!body.sessionId || !body.message?.trim()) {
    return Response.json(
      { error: "sessionId and message are required." },
      { status: 400 }
    )
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        const session = await getPublicSession(body.sessionId!)
        send("session", session)

        await streamAgentResponse(
          body.sessionId!,
          body.message!,
          body.model,
          (event: AgentStreamEvent) => send(event.type, event)
        )

        send("done", { ok: true })
      } catch (error) {
        const message = getFriendlyErrorMessage(error)
        send("error", { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  })
}

function getFriendlyErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "The agent run failed."

  if (message.toLowerCase().includes("already has active run")) {
    return "Cursor is still working on the previous request. Wait a moment and try again."
  }

  return message
}
