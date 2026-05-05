import { getDb } from "./db.js";
import { embeddings } from "./drizzle/schema.js";
import { generateEmbedding } from "./_core/llm.js";
import { eq, sql } from "drizzle-orm";

export async function storeMemory(userId: number, content: string, metadata: any = {}) {
  try {
    const db = await getDb();
    if (!db) return;

    const embedding = await generateEmbedding(content);

    await db.insert(embeddings).values({
      userId,
      content,
      metadata: JSON.stringify(metadata),
      embedding,
    });
  } catch (error) {
    console.error("[Flow Guru] Failed to store memory:", error);
  }
}

export async function searchMemories(userId: number, query: string, limit: number = 5) {
  try {
    const db = await getDb();
    if (!db) return [];

    const queryEmbedding = await generateEmbedding(query);
    const vectorString = `[${queryEmbedding.join(',')}]`;

    // Using pgvector cosine distance: embedding <=> queryEmbedding
    // The smaller the distance, the more similar.
    const results = await db.select({
      content: embeddings.content,
      metadata: embeddings.metadata,
      distance: sql<number>`${embeddings.embedding} <=> ${vectorString}::vector`
    })
    .from(embeddings)
    .where(eq(embeddings.userId, userId))
    .orderBy(sql`${embeddings.embedding} <=> ${vectorString}::vector`)
    .limit(limit);

    return results.map((r: any) => ({
      content: r.content,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
      similarity: 1 - r.distance, // Convert distance to similarity
    }));
  } catch (error) {
    console.error("[Flow Guru] Failed to search memories:", error);
    return [];
  }
}
