import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { renderAgentNotes } from './src/agentNotes/render.ts';

/** Puts the trip agent contract into the page as a collapsed block. */
function agentNotes(): Plugin {
  return {
    name: 'agent-notes',
    transformIndexHtml: (html) => html.replace('<!--agent-notes-->', renderAgentNotes(readFileSync(fileURLToPath(new URL('./public/trip-agents.md', import.meta.url)), 'utf8'))),
  };
}

export default defineConfig({
  plugins: [react(), agentNotes()],
  server: { port: 5173, strictPort: true, proxy:{'/api/muse':{target:'http://127.0.0.1:8788',changeOrigin:false}} },
});
