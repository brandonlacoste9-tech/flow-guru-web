import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import path from "path";
import fs from "fs";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

const app = express();

// 1. Body Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 2. TRPC API (The Brain)
const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});
app.use("/api/trpc", trpcMiddleware);

// 3. Health Check
app.get("/api/health", (req, res) => res.json({ status: "ok", mode: "vercel-native" }));

// 4. Static Assets & SPA Fallback
const distPath = path.resolve(process.cwd(), "dist", "public");

app.use(express.static(distPath, {
  maxAge: '1y',
  immutable: true,
  index: false
}));

app.get("*", (req, res, next) => {
  if (req.url.startsWith('/api/')) return next();
  
  const indexPath = path.resolve(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Front-end not found. Please redeploy.");
  }
});

// 5. Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[Vercel Fatal]", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: err.message });
});

export default app;
