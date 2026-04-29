import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

import { Agent } from "@cursor/sdk"

const projectRoot = process.cwd()
const debugDir = path.join(projectRoot, ".debug")
const rawPath = path.join(debugDir, "agent-details.raw.json")
const shapePath = path.join(debugDir, "agent-details.shape.json")

const apiKey = await readApiKey()

if (!apiKey) {
  throw new Error(
    "No Cursor API key found. Set CURSOR_API_KEY or complete app onboarding first."
  )
}

const listResult = await Agent.list({
  runtime: "cloud",
  apiKey,
  includeArchived: true,
  limit: 8,
})
const agents = Array.isArray(listResult.items) ? listResult.items : []

const details = []
for (const agentInfo of agents.slice(0, 8)) {
  const agentId = agentInfo.agentId
  const [agentGet, runList, artifacts] = await Promise.allSettled([
    Agent.get(agentId, { apiKey }),
    Agent.listRuns(agentId, { runtime: "cloud", apiKey, limit: 5 }),
    listArtifacts(agentId),
  ])

  details.push({
    agentInfo,
    agentGet: settledValue(agentGet),
    runList: normalizeRunList(settledValue(runList)),
    artifacts: settledValue(artifacts),
  })
}

const shape = {
  agentCount: agents.length,
  detailCount: details.length,
  details: details.map((detail) => {
    const runs = Array.isArray(detail.runList?.items) ? detail.runList.items : []
    const artifacts = Array.isArray(detail.artifacts) ? detail.artifacts : []

    return {
      agentId: detail.agentInfo.agentId,
      listKeys: Object.keys(detail.agentInfo),
      getKeys: detail.agentGet ? Object.keys(detail.agentGet) : [],
      runListKeys: detail.runList ? Object.keys(detail.runList) : [],
      runCount: runs.length,
      runShapes: runs.slice(0, 3).map((run) => ({
        keys: Object.keys(run),
        valueTypes: Object.fromEntries(
          Object.entries(run).map(([key, value]) => [key, valueType(value)])
        ),
        sample: run,
      })),
      artifactCount: artifacts.length,
      artifactShapes: artifacts.slice(0, 3).map((artifact) => ({
        keys: Object.keys(artifact),
        valueTypes: Object.fromEntries(
          Object.entries(artifact).map(([key, value]) => [key, valueType(value)])
        ),
        sample: artifact,
      })),
    }
  }),
}

await fs.mkdir(debugDir, { recursive: true })
await fs.writeFile(rawPath, `${JSON.stringify(sanitize(details), null, 2)}\n`)
await fs.writeFile(shapePath, `${JSON.stringify(shape, null, 2)}\n`)

console.log(`Wrote ${rawPath}`)
console.log(`Wrote ${shapePath}`)
console.log(
  JSON.stringify(
    {
      detailCount: shape.detailCount,
      first: shape.details[0]
        ? {
            agentId: shape.details[0].agentId,
            runCount: shape.details[0].runCount,
            firstRunKeys: shape.details[0].runShapes[0]?.keys ?? [],
            artifactCount: shape.details[0].artifactCount,
            firstArtifactKeys: shape.details[0].artifactShapes[0]?.keys ?? [],
          }
        : null,
    },
    null,
    2
  )
)

async function listArtifacts(agentId) {
  const agent = await Agent.resume(agentId, { apiKey })
  try {
    return await agent.listArtifacts()
  } finally {
    await agent[Symbol.asyncDispose]?.()
  }
}

function settledValue(result) {
  if (result.status === "fulfilled") {
    return result.value
  }

  return {
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  }
}

function normalizeRunList(runList) {
  if (!runList || !Array.isArray(runList.items)) {
    return runList
  }

  return {
    ...runList,
    items: runList.items.map((run) => ({
      id: run.id,
      agentId: run.agentId,
      status: run.status ?? run._status,
      createdAt: run.createdAt,
      result: run.result ?? run._result,
      durationMs: run.durationMs ?? run._durationMs,
      git: run.git ?? run._git,
    })),
  }
}

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(sanitize)
  }

  if (!value || typeof value !== "object") {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "client" && key !== "buffer" && key !== "listeners")
      .map(([key, child]) => [
        key,
        key.toLowerCase().includes("apikey") ? "[redacted]" : sanitize(child),
      ])
  )
}

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
