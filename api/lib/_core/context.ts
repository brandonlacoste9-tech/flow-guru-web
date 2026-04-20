import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../drizzle/schema.js";
import { sdk } from "./sdk.js";

export type TrpcContext = {
  req: VercelRequest;
  res: VercelResponse;
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req as unknown as VercelRequest);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req as unknown as VercelRequest,
    res: opts.res as unknown as VercelResponse,
    user,
  };
}
