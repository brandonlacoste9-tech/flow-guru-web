import { z } from "zod";

const NEWS_ISSUE_SLUGS = ["human-development", "planet-climate", "existential-threats", "science-technology"] as const;

const plannerSchema = z.object({
  action: z.string(),
  rationale: z.string(),
  browser: z.object({ task: z.string().nullable() }).optional().nullable(),
  subagent: z.object({ task: z.string().nullable() }).optional().nullable(),
  route: z.object({ origin: z.string().nullable(), destination: z.string().nullable(), mode: z.string().nullable() }).optional().nullable(),
  weather: z.object({ location: z.string().nullable(), timeframe: z.string().nullable() }).optional().nullable(),
  news: z.object({ issueSlug: z.enum(NEWS_ISSUE_SLUGS).nullable(), interestLabel: z.string().nullable(), limit: z.number().nullable() }).optional().nullable(),
  calendar: z.object({ title: z.string().nullable(), startDescription: z.string().nullable(), endDescription: z.string().nullable() }).optional().nullable(),
  music: z.object({ query: z.string().nullable(), targetType: z.string().nullable() }).optional().nullable(),
  list: z.object({ action: z.string().nullable(), listName: z.string().nullable(), itemContent: z.string().nullable(), newName: z.string().nullable(), time: z.string().nullable(), location: z.string().nullable() }).optional().nullable(),
});

try {
  console.log("Parsed:", plannerSchema.parse({ "action": "list.manage", "rationale": "The user wants to see their grocery list.", "list": { "action": "list", "listName": "Grocery", "itemContent": null, "newName": null, "time": null } }));
} catch (e: any) {
  console.log("Failed:", JSON.stringify(e, null, 2));
}
