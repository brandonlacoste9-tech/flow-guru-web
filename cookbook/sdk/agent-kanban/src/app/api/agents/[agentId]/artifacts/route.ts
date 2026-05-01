import { jsonError } from "@/lib/agents/http"
import { listArtifactsForAgent, requireSession } from "@/lib/agents/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await requireSession(request)
    const { agentId } = await params
    return Response.json({
      artifacts: await listArtifactsForAgent(session.apiKey, agentId),
    })
  } catch (error) {
    return jsonError(error, "Failed to list agent artifacts.")
  }
}
