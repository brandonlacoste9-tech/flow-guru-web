import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '../shared/const.js';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context.js";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof Error ? error.cause.message : null,
        stack: error.stack,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Simple in-memory rate limiting (per-instance on Vercel)
const rateLimitMap = new Map<string, { count: number; lastReset: number }>();

const rateLimit = t.middleware(async ({ ctx, next }) => {
  const ip = (ctx.req.headers['x-forwarded-for'] as string) || ctx.req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const limit = 100; // 100 requests
  const window = 60 * 1000; // 1 minute

  const record = rateLimitMap.get(ip) || { count: 0, lastReset: now };

  if (now - record.lastReset > window) {
    record.count = 1;
    record.lastReset = now;
  } else {
    record.count++;
  }

  rateLimitMap.set(ip, record);

  if (record.count > limit) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded. Please try again in a minute.',
    });
  }

  return next();
});

export const rateLimitedProcedure = t.procedure.use(rateLimit);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const protectedRateLimitedProcedure = t.procedure.use(rateLimit).use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
