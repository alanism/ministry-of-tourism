// The bridge: lets outside agents use the board that is open in the writer's
// browser. It is a pass-through: the board connects out to /board over a
// WebSocket, agents call tools over MCP, and the bridge forwards each call to
// the board and the answer back. Nothing is stored; a closed board is unreachable.
//
//   GET  /board?token=…   WebSocket from the browser
//   POST /mcp?agent=…     MCP (streamable HTTP), Authorization: Bearer <token>
//   GET  /health
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer, type WebSocket } from 'ws';
import { BOARD_COMMANDS, COACH_COMMANDS, EXPORT_COMMANDS, IMPORT_COMMANDS, ITEM_COMMANDS, toToolDefinition } from '@writers-board/core';
import { isValidToken, type AgentIdentity, type BoardMessage, type CallMessage } from './protocol.ts';

const CALL_TIMEOUT_MS = 30_000;

/** The tools agents may use: every command except the writer-only settings. */
export const AGENT_TOOLS = [...BOARD_COMMANDS, ...ITEM_COMMANDS, ...COACH_COMMANDS, ...EXPORT_COMMANDS, ...IMPORT_COMMANDS].filter((c) => !c.humanOnly).map(toToolDefinition);

interface BoardLink {
  socket: WebSocket;
  pending: Map<string, { resolve: (m: BoardMessage) => void; timer: NodeJS.Timeout }>;
}

export interface BridgeOptions {
  port: number;
  host?: string;
  /** Browser origins allowed to connect a board. Empty means any. */
  allowedOrigins?: string[];
  log?: (message: string) => void;
}

export interface Bridge {
  http: HttpServer;
  port: number;
  callTool(token: string, agent: AgentIdentity, name: string, input: unknown): Promise<ToolResult>;
  close(): Promise<void>;
}

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** Builds an MCP server whose tool calls go to the board for this token. */
export function createMcpServer(bridge: Pick<Bridge, 'callTool'>, token: string, agent: AgentIdentity): Server {
  const server = new Server({ name: 'writers-board', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: AGENT_TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations, _meta: t._meta })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Name the agent after the MCP client when it says who it is.
    const client = server.getClientVersion()?.name;
    const who = client && agent.id === 'agent:mcp' ? { id: `agent:mcp:${client}`, name: client } : agent;
    return bridge.callTool(token, who, request.params.name, request.params.arguments ?? {});
  });
  return server;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function agentFromQuery(url: URL): AgentIdentity {
  const name = (url.searchParams.get('agent') ?? '').replace(/[^\w .-]/g, '').slice(0, 40);
  return name ? { id: `agent:mcp:${name.toLowerCase().replace(/\s+/g, '-')}`, name } : { id: 'agent:mcp', name: 'Outside agent' };
}

export function startBridge(options: BridgeOptions): Promise<Bridge> {
  const log = options.log ?? (() => {});
  const boards = new Map<string, BoardLink>();

  const callTool: Bridge['callTool'] = (token, agent, name, input) => {
    const link = boards.get(token);
    if (!link) {
      return Promise.resolve({
        content: [{ type: 'text', text: "The board isn't open. Open Writer's Board and turn on agent connections, then try again." }],
        isError: true,
      });
    }
    const id = randomUUID();
    const message: CallMessage = { type: 'call', id, name, input, agent };
    return new Promise<ToolResult>((resolve) => {
      const timer = setTimeout(() => {
        link.pending.delete(id);
        resolve({ content: [{ type: 'text', text: 'The board did not answer in time.' }], isError: true });
      }, CALL_TIMEOUT_MS);
      link.pending.set(id, {
        timer,
        resolve: (reply) => {
          if (reply.type !== 'result') return;
          resolve(
            reply.ok
              ? { content: [{ type: 'text', text: JSON.stringify(reply.value ?? { ok: true }) }] }
              : { content: [{ type: 'text', text: `${reply.error.code}: ${reply.error.message}` }], isError: true },
          );
        },
      });
      link.socket.send(JSON.stringify(message));
    });
  };

  const http = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://bridge');
    if (url.pathname === '/health') return sendJson(res, 200, { ok: true, boards: boards.size });
    if (url.pathname !== '/mcp') return sendJson(res, 404, { error: 'not found' });

    const token = bearer(req);
    if (!isValidToken(token)) return sendJson(res, 401, { error: 'Send the board pairing token as Authorization: Bearer <token>.' });
    // Stateless: a fresh MCP server and transport per request, nothing kept between calls.
    const server = createMcpServer({ callTool }, token, agentFromQuery(url));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      log(`mcp request failed: ${String(error)}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    }
  });

  const sockets = new WebSocketServer({ noServer: true });
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://bridge');
    const token = url.searchParams.get('token');
    const origin = req.headers.origin ?? '';
    const originOk = !options.allowedOrigins?.length || options.allowedOrigins.includes(origin);
    if (url.pathname !== '/board' || !isValidToken(token) || !originOk) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => {
      boards.get(token)?.socket.close(4000, 'replaced by a newer connection');
      const link: BoardLink = { socket: ws, pending: new Map() };
      boards.set(token, link);
      log('board connected');
      ws.on('message', (data) => {
        let message: BoardMessage;
        try {
          message = JSON.parse(String(data));
        } catch {
          return;
        }
        if (message.type !== 'result') return;
        const waiting = link.pending.get(message.id);
        if (!waiting) return;
        clearTimeout(waiting.timer);
        link.pending.delete(message.id);
        waiting.resolve(message);
      });
      ws.on('close', () => {
        if (boards.get(token) === link) boards.delete(token);
        for (const waiting of link.pending.values()) {
          clearTimeout(waiting.timer);
          waiting.resolve({ type: 'result', id: '', ok: false, error: { code: 'board_closed', message: 'The board closed before answering.' } });
        }
        log('board disconnected');
      });
    });
  });

  return new Promise((resolve) => {
    http.listen(options.port, options.host ?? '127.0.0.1', () => {
      const address = http.address();
      const port = typeof address === 'object' && address ? address.port : options.port;
      resolve({
        http,
        port,
        callTool,
        close: () =>
          new Promise((done) => {
            for (const link of boards.values()) link.socket.terminate();
            sockets.close();
            http.close(() => done());
          }),
      });
    });
  });
}
