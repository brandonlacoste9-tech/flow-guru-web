import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

/**
 * Matches `assistant.send` response from the web app router.
 */
export type AssistantSendResult = {
  threadId: number;
  reply: string;
  messages: unknown[];
  memoryUpdate?: { profileUpdated: boolean; factsAdded: number };
  actionResult: unknown;
  billing?: { plan: string; limit: number; used: number; limitReached: boolean };
};

function getTrpcUrl(): string {
  const base = process.env.EXPO_PUBLIC_FLOW_GURU_API_URL?.replace(/\/+$/, "") ?? "";
  if (!base) {
    throw new Error(
      "Set EXPO_PUBLIC_FLOW_GURU_API_URL to your deployed origin (e.g. https://floguru.com)",
    );
  }
  return `${base}/api/trpc`;
}

/** Lazy client so env vars are read after Expo loads `.env`. */
let trpcSingleton: ReturnType<typeof createTRPCProxyClient<any>> | null = null;

function getTrpc(): ReturnType<typeof createTRPCProxyClient<any>> {
  if (!trpcSingleton) {
    trpcSingleton = createTRPCProxyClient<any>({
      links: [
        httpBatchLink({
          url: getTrpcUrl(),
          transformer: superjson,
        }),
      ],
    });
  }
  return trpcSingleton;
}

export async function sendAssistantMessage(params: {
  message: string;
  guestDeviceId: string;
  threadId?: number;
  timeZone?: string;
  language?: "en" | "fr";
  deviceLatitude?: number;
  deviceLongitude?: number;
}): Promise<AssistantSendResult> {
  const client = getTrpc() as unknown as {
    assistant: {
      send: {
        mutate: (input: Record<string, unknown>) => Promise<AssistantSendResult>;
      };
    };
  };
  return client.assistant.send.mutate({
    message: params.message,
    guestDeviceId: params.guestDeviceId,
    threadId: params.threadId,
    timeZone: params.timeZone,
    language: params.language ?? "en",
    deviceLatitude: params.deviceLatitude,
    deviceLongitude: params.deviceLongitude,
  });
}
