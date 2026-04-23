// Removed dotenv for Vercel stability
console.log('>>> FLOW GURU SERVER STARTING...');
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth.js";
import { registerGoogleAuthRoutes } from "./googleAuth.js";
import { registerProviderConnectionRoutes } from "./providerConnections.js";
import { registerStorageProxy } from "./storageProxy.js";
import { appRouter } from "../routers.js";
import { createContext } from "./context.js";
// Removed static import of vite/dev-tools to prevent Vercel 500 errors
import fs from "fs";
import path from "path";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function createMainApp() {
  const app = express();
  
  // 1. TRPC API - HIGHEST PRIORITY (Regex catch-all for any TRPC call)
  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
  });
  app.use(/.*trpc.*/, trpcMiddleware);
  app.use("/api/trpc", trpcMiddleware);
  app.use("/trpc", trpcMiddleware);

  // 2. Body parsers
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // 3. Health & Logging
  app.get("/api/health", (req, res) => res.json({ status: "ok", env: process.env.NODE_ENV }));
  app.use((req, res, next) => {
    if (req.url.includes("/api/trpc")) {
        console.log(`[Flow Guru API] ${req.method} ${req.url}`);
    }
    next();
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerGoogleAuthRoutes(app);
  registerProviderConnectionRoutes(app);

  // ElevenLabs TTS speak endpoint
  app.get("/api/speak", async (req: any, res: any) => {
    try {
      const text = req.query.text as string;
      const voiceId = req.query.voiceId as string | undefined;
      if (!text) {
        return res.status(400).send("Text query parameter is required");
      }
      const { textToSpeech } = await import("./elevenLabs.js");
      const audioBuffer = await textToSpeech({ text, voiceId, stability: 0.75, similarityBoost: 0.75 });
      res.setHeader("Content-Type", "audio/mpeg");
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("[ElevenLabs Error]", error);
      res.status(500).send(error.message);
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite.js");
    const server = createServer(app);
    await setupVite(app, server);
    return { app, server };
  } else {
    // ---- PRODUCTION STATIC SERVING (INLINED FOR VERCEL STABILITY) ----
    const distPath = path.resolve(process.cwd(), "dist", "public");
    
    // Serve static files with aggressive caching
    app.use(express.static(distPath, {
      maxAge: '1y',
      immutable: true,
      index: false
    }));
    
    // Fallback to index.html for SPA routing
    app.get("*", (req, res, next) => {
      // Don't catch API routes here
      if (req.url.startsWith('/api/') || req.url.includes('trpc')) {
        return next();
      }
      
      const indexPath = path.resolve(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Front-end build not found. Please run 'npm run build' first.");
      }
    });

    // 5. Global Error Handler (Must be last)
    app.use((err: any, req: any, res: any, next: any) => {
      console.error("[Fatal Error]", err);
      res.status(500).json({
        message: "A server error occurred. Please check your environment variables.",
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });

    return { app, server: createServer(app) };
  }
}

// For Vercel - export a handler
// Vercel Serverless Entry
export default async function handler(req: any, res: any) {
  try {
    const { app } = await createMainApp();
    return app(req, res);
  } catch (error: any) {
    console.error("[Vercel Handler Crash]", error);
    res.status(500).json({
      error: "FATAL_BOOTSTRAP_ERROR",
      message: error.message,
      stack: error.stack
    });
  }
}

// Local development server
if (process.env.NODE_ENV === "development" || !process.env.VERCEL) {
  const startLocalServer = async () => {
    const { app, server } = await createMainApp();
    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);

    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }

    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  };

  // Only start server if not running in Vercel environment
  if (!process.env.VERCEL) {
    startLocalServer().catch(console.error);
  }
}
