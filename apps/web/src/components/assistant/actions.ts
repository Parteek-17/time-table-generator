'use server';

import { api } from '@/lib/api';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Sends the conversation to "Ask Slotwise" (POST /assistant/chat) as the signed-in user. */
export async function askAssistant(
  messages: ChatTurn[],
): Promise<{ ok: true; reply: string } | { ok: false; message: string }> {
  const res = await api<{ reply: string }>('/assistant/chat', {
    method: 'POST',
    body: { messages: messages.slice(-30) },
  });
  return res.ok ? { ok: true, reply: res.data.reply } : { ok: false, message: res.message };
}
