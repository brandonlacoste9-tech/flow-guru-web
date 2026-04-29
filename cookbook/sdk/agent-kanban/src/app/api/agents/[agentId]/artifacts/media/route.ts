import { jsonError } from "@/lib/agents/http"
import { readArtifactContent, requireSession } from "@/lib/agents/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await requireSession(request)
    const { agentId } = await params
    const url = new URL(request.url)
    const artifactPath = url.searchParams.get("path")

    if (!artifactPath) {
      return Response.json(
        { error: "Artifact path is required." },
        { status: 400 }
      )
    }

    const artifact = await readArtifactContent(
      session.apiKey,
      agentId,
      artifactPath
    )
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(artifact.bytes)
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": artifact.contentType,
      },
    })
  } catch (error) {
    return jsonError(error, "Failed to stream artifact media.")
  }
}
