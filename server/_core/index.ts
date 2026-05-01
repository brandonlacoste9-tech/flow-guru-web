import "./load-env";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerProviderConnectionRoutes } from "./providerConnections";
import { registerStorageProxy } from "./storageProxy";
import { registerElevenLabsRoutes } from "./elevenLabs";
import { registerStripeRoutes } from "./stripe";
import { registerWaitlistRoutes } from "./waitlist";
import { appRouter } from "../routers";
import { createContext } from "./context";
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
  
  // 1. TRPC API - HIGHEST PRIORITY (Specific to /api/trpc to avoid catching source files)
  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
  });
  app.use("/api/trpc", trpcMiddleware);
  app.use("/trpc", trpcMiddleware);

  // 2. Health & Logging
  app.get("/api/health", (req, res) => res.json({ status: "ok", env: process.env.NODE_ENV }));
  app.use((req, res, next) => {
    if (req.url.includes("/api/trpc")) {
        console.log(`[Flow Guru API] ${req.method} ${req.url}`);
    }
    next();
  });

  // 3. Webhook (Must be registered BEFORE global body parsers for raw body access)
  registerStripeRoutes(app);

  // 4. Body parsers
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // 5. Integrations
  registerElevenLabsRoutes(app);
  registerWaitlistRoutes(app);
  registerOAuthRoutes(app);
  registerProviderConnectionRoutes(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    console.log('>>> SETTING UP VITE...');
    const { setupVite } = await import("./vite");
    const server = createServer(app);
    console.log('>>> CALLING setupVite...');
    await setupVite(app, server);
    console.log('>>> VITE SETUP COMPLETE.');
    return { app, server };
  } else {
    // ---- PRODUCTION STATIC SERVING (INLINED FOR VERCEL STABILITY) ----
    const distPath = path.resolve(process.cwd(), "dist", "public");
    app.use(express.static(distPath));
    registerStorageProxy(app);
    
    app.use("*", (req, res) => {
      const indexPath = path.resolve(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Front-end build not found. Please run 'npm run build' first.");
      }
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
    console.log('>>> FLOW GURU SERVER STARTING...');
    try {
      const { app, server } = await createMainApp();
      const preferredPort = parseInt(process.env.PORT || "3000");
      const port = await findAvailablePort(preferredPort);

      if (port !== preferredPort) {
        console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
      }

      server.listen(port, () => {
        console.log(`Server running on http://localhost:${port}/`);
        
        // Start background reminders (local dev only)
        import("./reminders").then(m => m.startBackgroundReminders());
      });
    } catch (e) {
      console.error('>>> SERVER START FAILED:', e);
    }
  };

  // Only start server if not running in Vercel environment
  if (!process.env.VERCEL) {
    startLocalServer();
  }
}
