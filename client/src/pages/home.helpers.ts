export type ChatLikeMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getDisplayedMessages<T extends ChatLikeMessage>(messages: T[]) {
  return messages.filter(message => message.role !== "system");
}

export function mergeVoiceDraft(base: string, transcript: string) {
  return [base.trim(), transcript.trim()].filter(Boolean).join(" ").trim();
}

export function sanitizeSpeechText(text: string) {
  return text.replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim();
}
