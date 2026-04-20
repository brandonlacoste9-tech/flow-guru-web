import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

const app = express();
app.use(express.json());

// 1. Diagnosis Logger (Helps us see the real path in Vercel logs)
app.use((req, res, next) => {
  console.log(`[TRPC HIT] Path: ${req.url}`);
  next();
});

// 2. The Universal Listener
const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// We mount it at the root AND the long path to be 100% safe
app.use("/api/trpc", trpcMiddleware);
app.use("/trpc", trpcMiddleware);
app.use("/", trpcMiddleware);

export default app;
