import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

const app = express();
app.use(express.json());

// Mount the brain directly at the root of this function
app.use("/", createExpressMiddleware({
  router: appRouter,
  createContext,
}));

export default app;
