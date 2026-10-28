// End to end: an MCP client (as a cloud agent would) -> bridge -> WebSocket ->
// the board -> back. The board side uses the same handler the browser uses.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import WebSocket from 'ws';
import { BoardSession, createBoard, createRemoteCallHandler, type BoardView } from '@writers-board/core';
import { startBridge, type Bridge } from './bridge.ts';

const TOKEN = 'test-token-0123456789abcdefghij';
const writer = { kind: 'human' as const, id: 'writer', name: 'Writer' };

let bridge: Bridge;
let session: BoardSession;
let board: WebSocket;

async function connectBoard(token = TOKEN): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/board?token=${token}`);
  const handler = createRemoteCallHandler(session);
  ws.on('message', (data) => ws.send(JSON.stringify(handler.handle(JSON.parse(String(data))))));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return ws;
}

async function mcpClient(agent = 'Grok Bot', token = TOKEN) {
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${bridge.port}/mcp?agent=${encodeURIComponent(agent)}`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

const text = (result: object) => ((result as { content: { text: string }[] }).content)[0]!.text;

beforeEach(async () => {
  session = new BoardSession(createBoard({ starterCards: false }));
  bridge = await startBridge({ port: 0 });
});

afterEach(async () => {
  board?.terminate();
  await bridge.close();
});

describe('bridge', () => {
  it('lists the board tools with their labels, never the writer-only settings', async () => {
    board = await connectBoard();
    const client = await mcpClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('card_create_from_quote');
    expect(names.some((n) => n.startsWith('settings_'))).toBe(false);
    expect(tools.find((t) => t.name === 'card_delete')?.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(tools.find((t) => t.name === 'board_export')?.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.find((t) => t.name === 'board_import')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    await client.close();
  });

  it('runs a cloud agent’s calls on the open board, as that agent', async () => {
    board = await connectBoard();
    const client = await mcpClient('Grok Bot');
    const created = await client.callTool({ name: 'card_create', arguments: { type: 'idea.thesis' } });
    expect(created.isError).toBeFalsy();
    const view = session.execute<BoardView>(writer, 'board_read');
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0]!.createdBy).toBe('agent:mcp:grok-bot');

    const read = await client.callTool({ name: 'board_read', arguments: {} });
    expect(JSON.parse(text(read)).cards[0].name).toBe('Thesis');
    await client.close();
  });

  it('keeps Coach mode and Solo mode for outside agents', async () => {
    board = await connectBoard();
    const client = await mcpClient();
    const { id } = JSON.parse(text(await client.callTool({ name: 'card_create', arguments: { type: 'form.hook' } })));
    const ghost = await client.callTool({ name: 'card_set_text', arguments: { id, text: 'Ghost-written' } });
    expect(ghost.isError).toBe(true);
    expect(text(ghost)).toMatch(/^coach_mode/);

    session.execute(writer, 'settings_set_agent_mode', { mode: 'solo' });
    const blocked = await client.callTool({ name: 'note_create', arguments: { x: 0, y: 0 } });
    expect(text(blocked)).toMatch(/^solo_mode/);
    await client.close();
  });

  it('says the board is closed when nobody has it open, and refuses bad tokens', async () => {
    const client = await mcpClient();
    const closed = await client.callTool({ name: 'board_read', arguments: {} });
    expect(closed.isError).toBe(true);
    expect(text(closed)).toMatch(/isn't open/);
    await client.close();

    const response = await fetch(`http://127.0.0.1:${bridge.port}/mcp`, { method: 'POST', body: '{}', headers: { Authorization: 'Bearer short' } });
    expect(response.status).toBe(401);
  });

  it('routes each token to its own board only', async () => {
    board = await connectBoard();
    const other = await mcpClient('Other', 'another-token-0123456789abcdefgh');
    const result = await other.callTool({ name: 'card_create', arguments: { type: 'idea.thesis' } });
    expect(result.isError).toBe(true);
    expect(session.execute<BoardView>(writer, 'board_read').cards).toHaveLength(0);
    await other.close();
  });
});
