import "dotenv/config";
console.log('>>> FLOW GURU SERVER STARTING...');
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerProviderConnectionRoutes } from "./providerConnections";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
  
  // 1. TRPC API - HIGHEST PRIORITY
  const trpcMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
  });
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
  registerProviderConnectionRoutes(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    const server = createServer(app);
    await setupVite(app, server);
    return { app, server };
  } else {
    serveStatic(app);
    return { app, server: createServer(app) };
  }
}

// For Vercel - export a handler
const appPromise = createMainApp().then(res => res.app);
export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}

// Local development server
if (process.env.NODE_ENV === "development" || !process.env.VERCEL) {
  async function startLocalServer() {
    const { app, server } = await createMainApp();
    const preferredPort = parseInt(process.env.PORT || "3000");
    const port = await findAvailablePort(preferredPort);

    if (port !== preferredPort) {
      console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
    }

    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
    });
  }

  // Only start server if not running in Vercel environment
  if (!process.env.VERCEL) {
    startLocalServer().catch(console.error);
  }
}
