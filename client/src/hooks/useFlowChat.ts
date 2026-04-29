import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export function useFlowChat(userId: string = 'anonymous') {
  return useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { userId },
    }),
    onError: (err: unknown) => console.error('[useFlowChat]', err),
  });
}
