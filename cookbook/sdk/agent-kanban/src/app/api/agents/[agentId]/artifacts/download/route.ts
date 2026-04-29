import { jsonError } from "@/lib/agents/http"
import { downloadArtifact, requireSession } from "@/lib/agents/server"

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

    return Response.json(
      await downloadArtifact(session.apiKey, agentId, artifactPath)
    )
  } catch (error) {
    return jsonError(error, "Failed to download artifact.")
  }
}
