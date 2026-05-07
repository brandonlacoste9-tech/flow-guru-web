import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ENV } from "./lib/_core/env.js";
import * as db from "./lib/db.js";
import { MasterOrchestrator } from "./lib/_core/sub-agents/orchestrator.js";
import { planAssistantAction, executeAssistantAction } from "./lib/assistantActions.js";

async function sendTelegramMessage(chatId: string | number, text: string) {
  if (!ENV.telegramBotToken) return;
  await fetch(`https://api.telegram.org/bot${ENV.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!ENV.telegramBotToken) {
    return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN not configured" });
  }

  const update = req.body;
  if (!update || !update.message) {
    return res.status(200).send("OK");
  }

  const chatId = update.message.chat.id;
  const text = update.message.text || "";
  const from = update.message.from;

  try {
    // 1. Handle Account Linking (/start link_USERID)
    if (text.startsWith("/start link_")) {
      const userIdStr = text.replace("/start link_", "").trim();
      const userId = parseInt(userIdStr, 10);
      
      if (isNaN(userId)) {
        await sendTelegramMessage(chatId, "❌ Invalid linking link. Please try again from the Flow Guru settings page.");
        return res.status(200).send("OK");
      }

      await db.upsertUserMemoryProfile(userId, { telegramChatId: String(chatId) });
      await sendTelegramMessage(chatId, "✅ *Account Linked!* I am now your Flow Guru assistant on Telegram. You can talk to me just like on the web app.");
      return res.status(200).send("OK");
    }

    // 2. Resolve User
    const user = await db.resolveUserByTelegramChatId(String(chatId));
    if (!user) {
      await sendTelegramMessage(chatId, "👋 Hello! I'm your Flow Guru AI assistant.\n\nTo get started, please go to your [Flow Guru Settings](https://floguru.com/settings) and click 'Connect Telegram'.");
      return res.status(200).send("OK");
    }

    // 3. Get User Context
    const profile = await db.getUserMemoryProfile(user.id);
    const facts = await db.listUserMemoryFacts(user.id);

    // 4. Process Message via Orchestrator
    const orchestrator = new MasterOrchestrator();
    const actionResults = await orchestrator.route(text, {
      userId: user.id,
      userName: user.name || "User",
      memoryContext: "", // Can be enriched if needed
      language: "en",
    });

    let reply = "";
    if (actionResults.length > 0) {
      // For now, we just take the first result summary. 
      // In the future, we could handle tool results more gracefully like the web app.
      reply = actionResults[0].summary;
    } else {
      // Fallback to basic planner
      const plannedAction = await planAssistantAction({
        userName: user.name || "User",
        memoryContext: "",
        message: text,
      });
      const result = await executeAssistantAction(plannedAction, { userId: user.id });
      reply = result.summary;
    }

    // 5. Reply to Telegram
    await sendTelegramMessage(chatId, reply);
    return res.status(200).send("OK");

  } catch (err: any) {
    console.error("[Telegram Webhook] Error:", err);
    const errorMessage = err?.message || String(err);
    await sendTelegramMessage(chatId, `⚠️ Sorry, I encountered an error: ${errorMessage}`);
    return res.status(200).send("OK");
  }
}
