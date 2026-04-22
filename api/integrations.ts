import express from "express";
import { registerProviderConnectionRoutes } from "./lib/_core/providerConnections.js";

const app = express();
app.use(express.json());
registerProviderConnectionRoutes(app);

export default app;
