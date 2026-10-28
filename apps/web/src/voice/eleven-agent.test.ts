import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../ai/providers', () => ({ AiError: Error }));
import { createElevenAgent, elevenSignedUrl } from './eleven-agent';
afterEach(() => vi.unstubAllGlobals());

it('creates a private voice agent with the shared policy and one response-waiting board client tool', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: 'tool-board' })).mockResolvedValueOnce(Response.json({ agent_id: 'agent-board' }));
  vi.stubGlobal('fetch', fetcher);
  expect(await createElevenAgent('test-key')).toBe('agent-board');
  const tool = JSON.parse(fetcher.mock.calls[0]![1].body).tool_config;
  expect(tool).toMatchObject({ type: 'client', name: 'board_agent', expects_response: true, parameters: { required: ['request'] } });
  const agent = JSON.parse(fetcher.mock.calls[1]![1].body);
  expect(agent.platform_settings.auth.enable_auth).toBe(true);
  expect(agent.conversation_config.agent.prompt).toMatchObject({ tool_ids: ['tool-board'] });
  expect(agent.conversation_config.agent.prompt.prompt).toContain('{{board_context}}');
  expect(agent.conversation_config.conversation.client_events).toContain('client_tool_call');
  expect(agent.conversation_config.asr.user_input_audio_format).toBe('pcm_16000');
  expect(agent.conversation_config.agent.first_message).toBe('');
});

it('keeps signing credentials in the HTTPS request and rejects unrelated socket destinations', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test' })).mockResolvedValueOnce(Response.json({ signed_url: 'wss://example.com/steal' }));
  vi.stubGlobal('fetch', fetcher);
  expect(await elevenSignedUrl('test-key', 'agent-one')).toContain('wss://api.elevenlabs.io/');
  expect(fetcher.mock.calls[0]![1].headers['xi-api-key']).toBe('test-key');
  expect(fetcher.mock.calls[0]![0]).not.toContain('test-key');
  await expect(elevenSignedUrl('test-key', 'agent-one')).rejects.toThrow('invalid connection');
});

it('reports authentication errors without creating an agent or switching providers', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ detail: { message: 'Denied' } }, { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(createElevenAgent('test-key')).rejects.toThrow('ElevenLabs');
  expect(fetcher).toHaveBeenCalledOnce();
});
