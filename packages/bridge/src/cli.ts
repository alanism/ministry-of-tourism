#!/usr/bin/env node
// Writer's Board bridge.
//
// Desktop agents (Claude Desktop, Cowork, Cursor) launch it over stdio:
//   node packages/bridge/src/cli.ts --stdio --token <pairing token>
// It also listens on 127.0.0.1:7457 so the board in your browser can connect.
//
// As a relay for cloud agents, run it on a public HTTPS host:
//   node packages/bridge/src/cli.ts --relay --port 8080 --origin https://your-board-site
// Agents then use https://<host>/mcp?agent=<name> with Authorization: Bearer <token>.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, startBridge } from './bridge.ts';
import { isValidToken } from './protocol.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);
// stdout belongs to MCP in stdio mode, so all logging goes to stderr.
const log = (message: string) => process.stderr.write(`[writers-board-bridge] ${message}\n`);

const relay = has('relay');
const bridge = await startBridge({
  port: Number(flag('port') ?? process.env.PORT ?? 7457),
  host: relay ? '0.0.0.0' : '127.0.0.1',
  allowedOrigins: process.argv.flatMap((arg, i) => (arg === '--origin' ? [process.argv[i + 1]!] : [])),
  log,
});
log(`listening on ${relay ? '0.0.0.0' : '127.0.0.1'}:${bridge.port}${relay ? ' (relay)' : ''}`);

if (has('stdio')) {
  const token = flag('token') ?? process.env.WRITERS_BOARD_TOKEN;
  if (!isValidToken(token)) {
    log('pass --token with the pairing token shown in Writer’s Board (Connect agents).');
    process.exit(1);
  }
  const server = createMcpServer(bridge, token, { id: 'agent:mcp', name: 'Desktop agent' });
  await server.connect(new StdioServerTransport());
  log('MCP ready on stdio');
}
