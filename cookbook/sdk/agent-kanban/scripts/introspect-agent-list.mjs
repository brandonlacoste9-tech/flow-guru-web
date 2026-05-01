import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { Agent } from "@cursor/sdk"

const projectRoot = process.cwd()
const debugDir = path.join(projectRoot, ".debug")
const rawPath = path.join(debugDir, "agent-list.raw.json")
const shapePath = path.join(debugDir, "agent-list.shape.json")

const apiKey = await readApiKey()

if (!apiKey) {
  throw new Error(
    "No Cursor API key found. Set CURSOR_API_KEY or complete app onboarding first."
  )
}

const response = await Agent.list({
  runtime: "cloud",
  apiKey,
  includeArchived: true,
  limit: 25,
})

const items = Array.isArray(response.items) ? response.items : []
const shape = {
  responseKeys: Object.keys(response),
  itemCount: items.length,
  nextCursor: response.nextCursor ?? null,
  itemKeySets: items.slice(0, 5).map((item) => ({
    agentId: item.agentId,
    keys: Object.keys(item),
    valueTypes: Object.fromEntries(
      Object.entries(item).map(([key, value]) => [key, valueType(value)])
    ),
  })),
  firstItem: items[0] ?? null,
}

await fs.mkdir(debugDir, { recursive: true })
await fs.writeFile(rawPath, `${JSON.stringify(response, null, 2)}\n`)
await fs.writeFile(shapePath, `${JSON.stringify(shape, null, 2)}\n`)

console.log(`Wrote ${rawPath}`)
console.log(`Wrote ${shapePath}`)
console.log(
  JSON.stringify(
    {
      itemCount: shape.itemCount,
      responseKeys: shape.responseKeys,
      firstItemKeys: shape.itemKeySets[0]?.keys ?? [],
    },
    null,
    2
  )
)

async function readApiKey() {
  if (process.env.CURSOR_API_KEY?.trim()) {
    return process.env.CURSOR_API_KEY.trim()
  }

  const settingsPath = path.join(os.homedir(), ".agent-kanban", "settings.json")
  try {
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"))
    return typeof settings.cursorApiKey === "string"
      ? settings.cursorApiKey.trim()
      : undefined
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "ENOENT") {
        return undefined
      }
    }
    throw error
  }
}

function valueType(value) {
  if (Array.isArray(value)) {
    return "array"
  }
  if (value === null) {
    return "null"
  }
  return typeof value
}
