import { jsonError } from "@/lib/agents/http"
import {
  createCloudAgent,
  listCloudAgents,
  requireSession,
} from "@/lib/agents/server"
import type { CreateAgentInput } from "@/lib/agents/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    const url = new URL(request.url)

    return Response.json(
      await listCloudAgents(session.apiKey, {
        cursor: url.searchParams.get("cursor") ?? undefined,
        prUrl: url.searchParams.get("prUrl") ?? undefined,
        includeArchived: url.searchParams.get("includeArchived") === "true",
      })
    )
  } catch (error) {
    return jsonError(error, "Failed to list cloud agents.")
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    const body = (await request.json()) as CreateAgentInput
    return Response.json(await createCloudAgent(session.apiKey, body))
  } catch (error) {
    return jsonError(error, "Failed to create a cloud agent.")
  }
}
