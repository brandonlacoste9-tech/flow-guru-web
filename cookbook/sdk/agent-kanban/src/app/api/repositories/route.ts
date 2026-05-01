import { jsonError } from "@/lib/agents/http"
import { listRepositories, requireSession } from "@/lib/agents/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    return Response.json({ repositories: await listRepositories(session.apiKey) })
  } catch (error) {
    return jsonError(error, "Failed to list repositories.")
  }
}
