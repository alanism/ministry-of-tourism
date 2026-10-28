// Connect outside agents: desktop agents through the local bridge, cloud agents
// through a relay. The board stays in this browser; agents reach it only while
// it is open, through the same tools and rules as the built-in agent.
import { useState } from 'react';
import { applyAgentLinks, newToken, useAgentLinks, type LinkStatus } from '../state/bridge';
import { useUi } from '../state/ui';

const STATUS: Record<LinkStatus, string> = {
  off: 'Off',
  connecting: 'Connecting…',
  connected: 'Connected',
  unreachable: 'Not reachable (is the bridge running?)',
};

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function ConnectAgentsDialog() {
  const { settings, status, activity } = useAgentLinks();
  const [relay, setRelay] = useState(settings.relayUrl);
  const close = () => useUi.getState().setDialog(null);
  const relayBase = settings.relayUrl.trim().replace(/\/+$/, '') || 'https://your-relay.example';

  const desktopConfig = JSON.stringify(
    {
      mcpServers: {
        'writers-board': {
          command: 'node',
          args: ['<path to writers-board>/packages/bridge/src/cli.ts', '--stdio', '--token', settings.token],
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="agents-title">
        <h2 id="agents-title">Connect agents</h2>
        <p className="dialog-note">
          Agents reach this board only while it is open here. They use the same tools as the built-in agent, under your Solo /
          Together / Autopilot setting and Coach mode.
        </p>

        <fieldset>
          <legend>Pairing token</legend>
          <div className="token-row">
            <code>{settings.token}</code>
            <Copy text={settings.token} label="Copy" />
            <button type="button" onClick={() => applyAgentLinks({ ...settings, token: newToken() })}>
              New token
            </button>
          </div>
          <p className="hint">A new token disconnects every agent using the old one.</p>
        </fieldset>

        <fieldset>
          <legend>Desktop agents (Claude Desktop, Cowork, Cursor)</legend>
          <label className="agent-draft">
            <input type="checkbox" checked={settings.local} onChange={(e) => applyAgentLinks({ ...settings, local: e.target.checked })} /> Connect to the
            local bridge · <strong>{STATUS[status.local]}</strong>
          </label>
          <p className="hint">Add this MCP server to the agent's settings; it starts the bridge for you.</p>
          <pre className="snippet">{desktopConfig}</pre>
          <Copy text={desktopConfig} label="Copy config" />
        </fieldset>

        <fieldset>
          <legend>Cloud agents (ChatGPT dots, Muse, Grok Bot)</legend>
          <label className="field">
            <span>Relay address (a bridge you run on an HTTPS host with --relay)</span>
            <div className="token-row">
              <input value={relay} placeholder="https://your-relay.example" onChange={(e) => setRelay(e.target.value)} />
              <button type="button" onClick={() => applyAgentLinks({ ...settings, relayUrl: relay })}>
                {relay.trim() ? 'Connect' : 'Disconnect'}
              </button>
            </div>
          </label>
          <p className="hint">
            Relay: <strong>{STATUS[status.relay]}</strong>. Give the agent this MCP server:
          </p>
          <pre className="snippet">{`URL:    ${relayBase}/mcp?agent=<agent name>\nHeader: Authorization: Bearer ${settings.token}`}</pre>
        </fieldset>

        {activity.length > 0 && (
          <fieldset>
            <legend>Recent agent activity</legend>
            <ul className="activity">
              {activity.map((a, i) => (
                <li key={i} className={a.ok ? '' : 'refused'}>
                  {new Date(a.at).toLocaleTimeString()} · {a.agent} · {a.tool}
                  {a.ok ? '' : ` (refused: ${a.detail})`}
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <div className="dialog-actions">
          <button className="primary" onClick={close}>
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
