import "dotenv/config";
import { ENV } from "./server/_core/env.js";

console.log("DEEPSEEK_API_KEY:", process.env.DEEPSEEK_API_KEY ? "EXISTS" : "MISSING");
console.log("SPOTIFY_CLIENT_ID:", process.env.SPOTIFY_CLIENT_ID ? "EXISTS" : "MISSING");
console.log("BUILT_IN_FORGE_API_KEY:", process.env.BUILT_IN_FORGE_API_KEY ? "EXISTS" : "MISSING");
console.log("ENV.forgeApiKey:", ENV.forgeApiKey ? "EXISTS" : "MISSING");
