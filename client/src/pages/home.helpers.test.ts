import { describe, expect, it } from "vitest";
import { getDisplayedMessages, mergeVoiceDraft, sanitizeSpeechText } from "./home.helpers";

describe("home helpers", () => {
  it("filters system messages out of the displayed chat list", () => {
    const messages = [
      { role: "system" as const, content: "Internal instruction" },
      { role: "assistant" as const, content: "Hello there." },
      { role: "user" as const, content: "Good morning." },
    ];

    expect(getDisplayedMessages(messages)).toEqual([
      { role: "assistant", content: "Hello there." },
      { role: "user", content: "Good morning." },
    ]);
  });

  it("merges the current draft and live transcript without extra whitespace", () => {
    expect(mergeVoiceDraft("Already typed", "  a spoken follow-up ")).toBe("Already typed a spoken follow-up");
    expect(mergeVoiceDraft("", "  start with voice ")).toBe("start with voice");
  });

  it("sanitizes markdown-style characters before speech playback", () => {
    expect(sanitizeSpeechText("**Plan**\n- Wake up at 6:30 > stay calm")).toBe("Plan Wake up at 6:30 stay calm");
  });
});
