# Voice context

GPT-Live, Gemini Live and ElevenLabs receive a compact description of the current selection,
board edits and viewport. All three delegate to the same board agent with structured
context and recent conversation, including questions spoken by the voice model.

## Try it

1. In **AI settings**, supply the selected voice provider's API key (OpenAI,
   Google or ElevenLabs) and configure the
   built-in agent's model/provider. The voice and board agent can use different
   models. The existing ChatGPT plan connection is separate from live audio.
2. Open **Coaches & agent → Agent**, choose **GPT-Live**, **Gemini Live** or
   **ElevenLabs**, then
   click **Live** and allow microphone access. End live before switching providers.
   AI settings remembers separate live models: `gpt-live-1` and `gemini-3.8-live`
   by default. Existing settings continue to select GPT-Live. Keys stay in this
   browser and go directly to the chosen provider; missing keys/access produce an
   error, with no automatic provider switch.
3. Select a card and ask, “What could I clarify on this card?” Select a different
   card and say, “And this one?” Edits and selection changes update quietly.
4. An open card/sticky editor is shared as an **unsaved draft**, separate from its
   stored text. Reading that draft does not commit or replace the writer's work.
5. For visual discussion, ask the agent to inspect a particular picture on the
   board. Choose a vision-capable API-backed agent model for this; the hosted
   ChatGPT writing connection currently accepts text only. No provider or billing
   fallback is made automatically.

### ElevenLabs setup

In AI settings, select **ElevenLabs** under Live conversation. Add your own
ElevenLabs key with Agents and Tools permissions, then click **Create voice
agent** once. This creates a private agent and a `board_agent` client tool in
your ElevenLabs account, and saves its agent ID in this browser. The tool waits
up to 120 seconds for the same built-in board agent used by GPT-Live and Gemini.
No board content is stored in the agent's configuration; the initial context is
supplied at conversation start through the `board_context` dynamic variable.

The created agent waits for the writer to speak and uses ElevenLabs' default
voice/model. Change those in the ElevenLabs dashboard to compare voices. An
existing agent can also be entered, provided it has the same shared policy,
`{{board_context}}` prompt variable and `board_agent` client tool (required string
`request`, Wait for response enabled). Its input must be `pcm_16000`, output PCM,
with audio, interruption, user/agent transcripts and client-tool events enabled.

This is a bring-your-own-key application: your key stays in your browser and is
sent directly to ElevenLabs over HTTPS to create the private agent or obtain a
short-lived signed WebSocket URL. It never appears in the socket URL and is
never embedded in the deployed bundle. Do not put an application-owned secret
into the frontend. Account/key access errors do not switch billing providers.
If agent creation fails after a tool was created, inspect your ElevenLabs Tools
and Agents dashboard before retrying; the app does not retry creation silently.

## Shared contract and provider adapter

- `voice/context.ts` defines the provider-independent `VoiceSource`,
  `VoiceSnapshot` and `VoiceTurn` contracts. A snapshot has the selected item,
  up to four items connected by yarn, current viewport, unsaved editor text,
  board counts/mode/title, the eight most recent item changes and recent dialogue.
  Transcript history is bounded to 16 entries and 6,000 UTF-8 bytes.
- `voice/board-context.ts` reads the existing board/UI state and card/sticky
  editor. Document, selection and editing subscriptions are active only during
  a live session; no polling, extra model call or image request is needed.
- `voice/live.ts` is the GPT-Live adapter. It seeds `session.input` with factual
  context and recent dialogue, then sends `session.thinking.append` with
  `delegation_id: null` after `session.started`. Rapid updates are combined over
  250 ms and identical snapshots are skipped. Each append is bounded to 480 UTF-8
  bytes, below the API's 500-token ceiling even for multibyte text.
- `voice/gemini-live.ts` is lazy-loaded only when Gemini Live starts. Its native
  WebSocket sends a setup message, waits for `setupComplete`, then seeds initial
  `clientContent` history using `historyConfig.initialHistoryInClientContent`.
  Later text updates have `turnComplete: false` and are coalesced over 250 ms.
  Because Gemini client-content updates can interrupt generation, background
  updates wait during speech or delegated work, then flush at turn completion.
  `board_agent` function calls use the same agent/context/permissions; tool IDs
  are deduplicated and cancelled calls do not publish late results.
- Gemini's `gemini-audio.ts` and `pcm-capture.js` capture mono audio in a silent
  AudioWorklet, send PCM16 little-endian frames with their actual sample rate
  (16 kHz requested), and schedule returned 24 kHz PCM audio for playback.
  Interruption stops queued playback. No Gemini SDK, capture, worklet, WebSocket
  or audio context loads while the writer simply works on the board.
- `voice/eleven-live.ts` is also lazy-loaded. It sends startup context/dialogue
  as a dynamic variable, waits for negotiated audio metadata, then uses silent
  `contextual_update` events for 250 ms coalesced board changes. The same PCM
  capture/playback engine handles ElevenLabs' negotiated output sample rate.
  Client-tool IDs are deduplicated. Interruption cancels pending delegated work,
  stops playback and drops stale audio/results. Transcript corrections replace
  interrupted assistant text in both the shared context and the visible log.
- Delegations capture selection/context at request time and pass the latest
  spoken request plus recent dialogue to the existing board agent. The agent is
  instructed to read the current board before changes. Duplicate delegation IDs
  are ignored. Actual writes still use BoardSession's Solo/Coach rules and one
  undo group per agent request. Board content and transcripts remain reference
  data, separate from application instructions.
- End live, server closure, connection loss and leaving the Agent tab clean up
  context subscriptions and microphone/peer/socket/audio resources. Leaving while connecting
  cancels that connection; the Connecting button prevents duplicate starts.

A future provider adapter can consume the same source/snapshot,
record transcript turns, and pass snapshots to `AgentConversation.ask` without
changing card storage or board commands.

## Images stay on demand

Snapshots contain image IDs, captions and positions, with no image bytes or
automatic screen capture. Captions are not treated as proof of visual contents.
`board_inspect_image` loads `voice/board-images.ts` only when the agent calls it
for a visual request. It reads the requested board image from local IndexedDB,
resizes it to at most 1024 pixels on its longest side and supplies its pixels to
the selected API-backed board model. It does not fetch model-supplied URLs or
load the FCC artwork catalogue. All three voice providers receive the backend's textual findings.
Whole-canvas screenshots and interpretation of freehand ink are not part of this
image tool.

## Verification and API references

`context.test.ts`, `live.test.ts`, `gemini-live.test.ts`, `gemini-audio.test.ts`,
`eleven-live.test.ts`, `eleven-agent.test.ts`, `pcm.test.ts` and
`ai/voice-context.test.ts` cover selection,
linked cards, edits/deletions, unsaved drafts, dialogue, deduplication, bounded
multilingual updates, cancellation and lazy image routing. The existing ChatGPT
and core command tests cover the unchanged writing permissions.

Browser QA uses real UI/board/IndexedDB code with simulated WebRTC/WebSocket and
model endpoints, never a real key or paid call. Gemini checks use real Web Audio
and the real capture AudioWorklet with a synthetic microphone stream. ElevenLabs
uses the same real audio processing with simulated setup/signing/socket replies.
The unrelated, still-undeployed ChatGPT sign-in session endpoint is stubbed as
disconnected when QA opens settings. QA checks desktop and touch-mobile
startup/selection, edits, short spoken replies, note/undo behavior, Coach mode,
actual image resizing, reconnect, server close and cancellation while connecting.
Physical audio, network quality, recognition accuracy and spoken response quality
need a real provider session on the user's device.

- [OpenAI: Delegation, UI context and visual input](https://developers.openai.com/api/docs/guides/live-delegation)
- [OpenAI: Startup conversation history](https://developers.openai.com/api/docs/guides/live-conversations)
- [OpenAI: Images and vision](https://developers.openai.com/api/docs/guides/images-vision)
- [Google: Live API WebSocket quickstart](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)
- [Google: Live API protocol](https://ai.google.dev/api/live)
- [Google: Live API tools](https://ai.google.dev/gemini-api/docs/live-api/tools)
- [Google: Gemini 3.8 Live](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live)
- [ElevenLabs: WebSocket protocol](https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket)
- [ElevenLabs: Client tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools)
- [ElevenLabs: Non-interrupting context updates](https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events)
- [ElevenLabs: Agent and tool schemas](https://api.elevenlabs.io/openapi.json)
