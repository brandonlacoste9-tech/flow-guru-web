import { clearPersistedCursorApiKey } from "@/lib/app-builder/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE() {
  await clearPersistedCursorApiKey()
  return Response.json({ ok: true })
}
