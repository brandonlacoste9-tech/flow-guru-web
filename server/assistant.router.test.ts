import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  createConversationMessage: vi.fn(),
  createConversationThread: vi.fn(),
  createUserMemoryFacts: vi.fn(),
  findLatestConversationThread: vi.fn(),
  getConversationThreadById: vi.fn(),
  getUserMemoryProfile: vi.fn(),
  listConversationMessages: vi.fn(),
  listProviderConnections: vi.fn(),
  listUserMemoryFacts: vi.fn(),
  resolveAssistantUserId: vi.fn(async (user: { id: number } | null) => user?.id ?? 1),
  touchConversationThread: vi.fn(),
  upsertUserMemoryProfile: vi.fn(),
}));

const llmMocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => dbMocks);
vi.mock("./_core/llm", () => llmMocks);

import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(overrides?: Partial<AuthenticatedUser>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "flow-user",
    email: "flow@example.com",
    name: "Flow User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as TrpcContext["res"],
  };
}

describe("assistant router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.listProviderConnections.mockResolvedValue([]);
  });

  it("loads bootstrap memory and history for the authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const profile = {
      id: 1,
      userId: ctx.user!.id,
      wakeUpTime: "6:30 AM",
      dailyRoutine: "Morning walk, coffee, deep work block.",
      preferencesSummary: "Prefers concise plans.",
      recurringEventsSummary: "Team sync every Monday at 9 AM.",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const memoryFacts = [
      {
        id: 1,
        userId: ctx.user!.id,
        category: "preference",
        factKey: "style",
        factValue: "Likes short, calm responses.",
        confidence: 95,
        sourceMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const thread = {
      id: 3,
      userId: ctx.user!.id,
      title: "Flow Guru Chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    };
    const messages = [
      {
        id: 11,
        threadId: thread.id,
        userId: ctx.user!.id,
        role: "assistant",
        content: "Good morning. Ready to ease into the day?",
        createdAt: new Date(),
      },
    ];

    dbMocks.getUserMemoryProfile.mockResolvedValue(profile);
    dbMocks.listUserMemoryFacts.mockResolvedValue(memoryFacts);
    dbMocks.findLatestConversationThread.mockResolvedValue(thread);
    dbMocks.listConversationMessages.mockResolvedValue(messages);

    const result = await caller.assistant.bootstrap();

    expect(result.profile).toEqual(profile);
    expect(result.memoryFacts).toEqual(memoryFacts);
    expect(result.thread).toEqual(thread);
    expect(result.messages).toEqual(messages);
    expect(result.providerConnections).toEqual([]);
  });

  it("stores a user message, generates a reply, and persists extracted memory", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    dbMocks.findLatestConversationThread.mockResolvedValue({
      id: 10,
      userId: ctx.user!.id,
      title: "Flow Guru Chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    dbMocks.getUserMemoryProfile.mockResolvedValue({
      id: 1,
      userId: ctx.user!.id,
      wakeUpTime: null,
      dailyRoutine: null,
      preferencesSummary: "Likes quiet mornings.",
      recurringEventsSummary: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    dbMocks.listUserMemoryFacts.mockResolvedValue([
      {
        id: 1,
        userId: ctx.user!.id,
        category: "preference",
        factKey: "tempo",
        factValue: "Prefers quiet mornings.",
        confidence: 90,
        sourceMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    dbMocks.createConversationMessage
      .mockResolvedValueOnce(21)
      .mockResolvedValueOnce(22);

    dbMocks.listConversationMessages
      .mockResolvedValueOnce([
        {
          id: 21,
          threadId: 10,
          userId: ctx.user!.id,
          role: "user",
          content: "I usually wake up at 6:15 and stretch before coffee.",
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 21,
          threadId: 10,
          userId: ctx.user!.id,
          role: "user",
          content: "I usually wake up at 6:15 and stretch before coffee.",
          createdAt: new Date(),
        },
        {
          id: 22,
          threadId: 10,
          userId: ctx.user!.id,
          role: "assistant",
          content: "That sounds like a steady start. I’ll keep that rhythm in mind.",
          createdAt: new Date(),
        },
      ]);

    llmMocks.invokeLLM
      .mockResolvedValueOnce({
        id: "plan-1",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                action: "none",
                rationale: "This is a personal memory-sharing message, not an external action request.",
                route: null,
                weather: null,
                news: null,
                calendar: null,
                music: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "chat-1",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "That sounds like a steady start. I’ll keep that rhythm in mind.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "chat-2",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                profile_updates: {
                  wakeUpTime: "6:15 AM",
                  dailyRoutine: "Usually stretches before coffee after waking.",
                  preferencesSummary: null,
                  recurringEventsSummary: null,
                },
                facts: [
                  {
                    category: "wake_up_time",
                    factKey: "usual_time",
                    factValue: "Usually wakes up at 6:15 AM.",
                    confidence: 96,
                  },
                ],
              }),
            },
          },
        ],
      });

    const result = await caller.assistant.send({
      message: "I usually wake up at 6:15 and stretch before coffee.",
    });

    expect(result.reply).toContain("steady start");
    expect(result.threadId).toBe(10);
    expect(result.memoryUpdate).toEqual({
      profileUpdated: true,
      factsAdded: 1,
    });

    expect(dbMocks.createConversationMessage).toHaveBeenCalledTimes(2);
    expect(dbMocks.createConversationMessage).toHaveBeenNthCalledWith(1, {
      threadId: 10,
      userId: ctx.user!.id,
      role: "user",
      content: "I usually wake up at 6:15 and stretch before coffee.",
    });
    expect(dbMocks.createConversationMessage).toHaveBeenNthCalledWith(2, {
      threadId: 10,
      userId: ctx.user!.id,
      role: "assistant",
      content: "That sounds like a steady start. I’ll keep that rhythm in mind.",
    });

    expect(dbMocks.upsertUserMemoryProfile).toHaveBeenCalledWith(ctx.user!.id, {
      userId: ctx.user!.id,
      wakeUpTime: "6:15 AM",
      dailyRoutine: "Usually stretches before coffee after waking.",
      preferencesSummary: "Likes quiet mornings.",
      recurringEventsSummary: null,
    });

    expect(dbMocks.createUserMemoryFacts).toHaveBeenCalledWith(ctx.user!.id, [
      {
        userId: ctx.user!.id,
        category: "wake_up_time",
        factKey: "usual_time",
        factValue: "Usually wakes up at 6:15 AM.",
        confidence: 96,
      },
    ]);
    expect(dbMocks.touchConversationThread).toHaveBeenCalledWith(10);
    expect(llmMocks.invokeLLM).toHaveBeenCalledTimes(3);
  });

  it("falls back gracefully when the chat model fails", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    dbMocks.findLatestConversationThread.mockResolvedValue({
      id: 12,
      userId: ctx.user!.id,
      title: "Flow Guru Chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });
    dbMocks.getUserMemoryProfile.mockResolvedValue(undefined);
    dbMocks.listUserMemoryFacts.mockResolvedValue([]);
    dbMocks.createConversationMessage.mockResolvedValueOnce(30).mockResolvedValueOnce(31);
    dbMocks.listConversationMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    llmMocks.invokeLLM
      .mockResolvedValueOnce({
        id: "plan-fallback",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                action: "none",
                rationale: "This is a general planning question without an external provider action.",
                route: null,
                weather: null,
                news: null,
                calendar: null,
                music: null,
              }),
            },
          },
        ],
      })
      .mockRejectedValueOnce(new Error("llm unavailable"))
      .mockResolvedValueOnce({
        id: "extract-fallback",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                profile_updates: {
                  wakeUpTime: null,
                  dailyRoutine: null,
                  preferencesSummary: null,
                  recurringEventsSummary: null,
                },
                facts: [],
              }),
            },
          },
        ],
      });

    const result = await caller.assistant.send({ message: "Help me plan tomorrow." });

    expect(result.reply).toBe("I’m here with you. Tell me a little more, and I’ll help from there.");
    expect(result.memoryUpdate).toEqual({ profileUpdated: false, factsAdded: 0 });
    expect(dbMocks.createConversationMessage).toHaveBeenNthCalledWith(2, {
      threadId: 12,
      userId: ctx.user!.id,
      role: "assistant",
      content: "I’m here with you. Tell me a little more, and I’ll help from there.",
    });
  });

  it("starts a fresh authenticated chat without loading prior messages", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const thread = {
      id: 25,
      userId: ctx.user!.id,
      title: "Flow Guru Chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    };

    dbMocks.createConversationThread.mockResolvedValue(thread.id);
    dbMocks.getConversationThreadById.mockResolvedValue(thread);
    dbMocks.listProviderConnections.mockResolvedValue([
      {
        id: 1,
        userId: ctx.user!.id,
        provider: "google-calendar",
        status: "connected",
        externalAccountId: "acct_1",
        externalAccountLabel: "flow@example.com",
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        scopes: null,
        metadataJson: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await caller.assistant.startFresh();

    expect(dbMocks.createConversationThread).toHaveBeenCalledWith({
      userId: ctx.user!.id,
      title: "Flow Guru Chat",
    });
    expect(dbMocks.getConversationThreadById).toHaveBeenCalledWith(thread.id);
    expect(result.thread).toEqual(thread);
    expect(result.messages).toEqual([]);
    expect(result.providerConnections).toHaveLength(1);
  });

  it("scopes bootstrap reads to the authenticated user account", async () => {
    const ctx = createAuthContext({
      id: 42,
      openId: "another-user",
      email: "another@example.com",
      name: "Another User",
    });
    const caller = appRouter.createCaller(ctx);

    dbMocks.getUserMemoryProfile.mockResolvedValue(undefined);
    dbMocks.listUserMemoryFacts.mockResolvedValue([]);
    dbMocks.findLatestConversationThread.mockResolvedValue(undefined);

    const result = await caller.assistant.bootstrap();

    expect(result.thread).toBeNull();
    expect(result.messages).toEqual([]);
    expect(dbMocks.getUserMemoryProfile).toHaveBeenCalledWith(42);
    expect(dbMocks.listUserMemoryFacts).toHaveBeenCalledWith(42);
    expect(dbMocks.findLatestConversationThread).toHaveBeenCalledWith(42);
  });

  it("ignores a foreign thread and creates a new authenticated-user thread for sends", async () => {
    const ctx = createAuthContext({
      id: 55,
      openId: "owner-55",
      email: "owner55@example.com",
      name: "Owner 55",
    });
    const caller = appRouter.createCaller(ctx);

    dbMocks.findLatestConversationThread.mockResolvedValue({
      id: 999,
      userId: 88,
      title: "Foreign Thread",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });
    dbMocks.createConversationThread.mockResolvedValue(56);
    dbMocks.getUserMemoryProfile.mockResolvedValue(undefined);
    dbMocks.listUserMemoryFacts.mockResolvedValue([]);
    dbMocks.createConversationMessage.mockResolvedValueOnce(60).mockResolvedValueOnce(61);
    dbMocks.listConversationMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    llmMocks.invokeLLM
      .mockResolvedValueOnce({
        id: "plan-safe",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                action: "none",
                rationale: "This is a private account-scoping request without a provider action.",
                route: null,
                weather: null,
                news: null,
                calendar: null,
                music: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "chat-safe",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "I’ll keep everything scoped to you.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "extract-safe",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                profile_updates: {
                  wakeUpTime: null,
                  dailyRoutine: null,
                  preferencesSummary: null,
                  recurringEventsSummary: null,
                },
                facts: [],
              }),
            },
          },
        ],
      });

    const result = await caller.assistant.send({ message: "Keep this in my account only." });

    expect(result.threadId).toBe(56);
    expect(dbMocks.createConversationThread).toHaveBeenCalledWith({
      userId: 55,
      title: "Flow Guru Chat",
    });
    expect(dbMocks.createConversationMessage).toHaveBeenNthCalledWith(1, {
      threadId: 56,
      userId: 55,
      role: "user",
      content: "Keep this in my account only.",
    });
  });

  it("uses an explicitly selected authenticated thread when sending a message", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    dbMocks.getConversationThreadById.mockResolvedValue({
      id: 44,
      userId: ctx.user!.id,
      title: "Flow Guru Chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });
    dbMocks.getUserMemoryProfile.mockResolvedValue(undefined);
    dbMocks.listUserMemoryFacts.mockResolvedValue([]);
    dbMocks.createConversationMessage.mockResolvedValueOnce(70).mockResolvedValueOnce(71);
    dbMocks.listConversationMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    llmMocks.invokeLLM
      .mockResolvedValueOnce({
        id: "plan-threaded",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                action: "none",
                rationale: "This is a normal conversation turn without a provider action.",
                route: null,
                weather: null,
                news: null,
                calendar: null,
                music: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "chat-threaded",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "Picked up in the active thread.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "extract-threaded",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                profile_updates: {
                  wakeUpTime: null,
                  dailyRoutine: null,
                  preferencesSummary: null,
                  recurringEventsSummary: null,
                },
                facts: [],
              }),
            },
          },
        ],
      });

    const result = await caller.assistant.send({
      message: "Continue from this clean thread.",
      threadId: 44,
    });

    expect(dbMocks.getConversationThreadById).toHaveBeenCalledWith(44);
    expect(dbMocks.findLatestConversationThread).not.toHaveBeenCalled();
    expect(result.threadId).toBe(44);
    expect(dbMocks.createConversationMessage).toHaveBeenNthCalledWith(1, {
      threadId: 44,
      userId: ctx.user!.id,
      role: "user",
      content: "Continue from this clean thread.",
    });
  });

  it("keeps the send flow successful when memory extraction returns invalid JSON", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    dbMocks.findLatestConversationThread.mockResolvedValue({
      id: 14,
      userId: ctx.user!.id,
      title: "Flow Guru Chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });
    dbMocks.getUserMemoryProfile.mockResolvedValue(undefined);
    dbMocks.listUserMemoryFacts.mockResolvedValue([]);
    dbMocks.createConversationMessage.mockResolvedValueOnce(40).mockResolvedValueOnce(41);
    dbMocks.listConversationMessages
      .mockResolvedValueOnce([
        {
          id: 40,
          threadId: 14,
          userId: ctx.user!.id,
          role: "user",
          content: "I like quiet evenings.",
          createdAt: new Date(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 40,
          threadId: 14,
          userId: ctx.user!.id,
          role: "user",
          content: "I like quiet evenings.",
          createdAt: new Date(),
        },
        {
          id: 41,
          threadId: 14,
          userId: ctx.user!.id,
          role: "assistant",
          content: "Quiet evenings can be restorative.",
          createdAt: new Date(),
        },
      ]);
    llmMocks.invokeLLM
      .mockResolvedValueOnce({
        id: "plan-ok",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                action: "none",
                rationale: "This is a conversational preference statement without an external action.",
                route: null,
                weather: null,
                news: null,
                calendar: null,
                music: null,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "chat-ok",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "Quiet evenings can be restorative.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: "extract-bad",
        created: Date.now(),
        model: "test-model",
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "not valid json",
            },
          },
        ],
      });

    const result = await caller.assistant.send({ message: "I like quiet evenings." });

    expect(result.reply).toBe("Quiet evenings can be restorative.");
    expect(result.memoryUpdate).toEqual({ profileUpdated: false, factsAdded: 0 });
    expect(dbMocks.createUserMemoryFacts).not.toHaveBeenCalled();
    expect(dbMocks.upsertUserMemoryProfile).not.toHaveBeenCalled();
  });

  it("surfaces a persistence failure when a conversation thread cannot be created", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    dbMocks.findLatestConversationThread.mockResolvedValue(undefined);
    dbMocks.createConversationThread.mockResolvedValue(undefined);

    await expect(caller.assistant.send({ message: "Please remember this." })).rejects.toThrow(
      "Failed to create conversation thread",
    );
    expect(dbMocks.createConversationMessage).not.toHaveBeenCalled();
  });
});
