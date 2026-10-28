import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoardSession, createBoard } from '@writers-board/core';
import { renderAgentNotes } from './render.ts';

const notes = readFileSync(new URL('../../public/agents.md', import.meta.url), 'utf8');

describe('rendering the notes into the page', () => {
  it('makes a collapsed block with headings, lists, bold, code and links', () => {
    const html = renderAgentNotes('# Title\n\n## Part\nA **bold** call to `board_read` and [the page](/agents.md).\n\n- one\n- two\n\n1. first\n2. second');
    expect(html.startsWith('<details class="agent-notes"><summary>For AI agents</summary>')).toBe(true);
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<h3>Part</h3>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>board_read</code>');
    expect(html).toContain('<a href="/agents.md">the page</a>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(html).not.toContain(' open');
  });

  it('escapes anything that looks like markup, and drops links that are not http or on-site', () => {
    const html = renderAgentNotes('<script>alert(1)</script> and [bad](javascript:alert(1)) and `<b>`');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<code>&lt;b&gt;</code>');
  });
});

describe('agents.md stays true to the tools', () => {
  const session = new BoardSession(createBoard({ starterCards: false }));
  const real = new Set(session.tools().map((t) => t.name));
  const writerOnly = new Set(['settings_set_draft_for_me', 'settings_set_agent_mode']);
  const mentioned = new Set([...notes.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((m) => m[1]!));

  it('only names tools that exist', () => {
    expect([...mentioned].filter((name) => !real.has(name))).toEqual([]);
  });

  it('names every tool an agent can call', () => {
    expect([...real].filter((name) => !mentioned.has(name) && !writerOnly.has(name))).toEqual([]);
  });

  it('keeps the sections agents rely on', () => {
    for (const heading of ['## What this is', '## Ways to reach a board', '## Your first task', '## Rules that apply to you', '## Carry a board between sessions', '## FAQ']) {
      expect(notes).toContain(heading);
    }
  });
});
