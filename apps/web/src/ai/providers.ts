// Calls the writer's chosen model for a JSON answer of a given shape.
// Anthropic goes through the official SDK; OpenAI, OpenRouter, Google and xAI
// share their OpenAI-compatible chat endpoint. Calls go straight from this
// browser to the provider with the writer's own key.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { PROVIDERS, aiSettings, type Job } from './settings';
import { chatGptResponse } from './chatgpt-responses';
import { sendChatGptResponse } from './chatgpt-connection';

export class AiError extends Error {}

export interface StructuredRequest<T> {
  job: Job;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  name: string;
  effort?: 'low' | 'medium' | 'high';
}

/** Lets tests and demos stand in for a real model (development builds only). */
type Stand = (request: { job: Job; system: string; user: string; name: string }) => unknown;
declare global {
  interface Window {
    __writersBoardStandInModel?: Stand;
  }
}

// Models that accept server-side refusal fallbacks ("default" routing).
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

async function anthropic<T>(apiKey: string, model: string, request: StructuredRequest<T>): Promise<T> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const fallbacks = FALLBACK_MODELS.has(model);
  try {
    const message = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
      output_config: { format: betaZodOutputFormat(request.schema), ...(request.effort ? { effort: request.effort } : {}) },
    });
    if (message.stop_reason === 'refusal') throw new AiError('The model declined this request.');
    if (message.stop_reason === 'max_tokens') throw new AiError('The answer was cut off; try a shorter piece.');
    if (!message.parsed_output) throw new AiError('The model did not return a usable answer.');
    return message.parsed_output as T;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof Anthropic.AuthenticationError) throw new AiError('Anthropic did not accept that key.');
    if (error instanceof Anthropic.PermissionDeniedError) throw new AiError('That key cannot use this model.');
    if (error instanceof Anthropic.NotFoundError) throw new AiError(`Anthropic has no model named ${model}.`);
    if (error instanceof Anthropic.RateLimitError) throw new AiError('Anthropic is rate-limiting this key; try again shortly.');
    if (error instanceof Anthropic.APIError) throw new AiError(`Anthropic error ${error.status ?? ''}: ${error.message}`);
    throw error;
  }
}

async function openAiCompatible<T>(baseUrl: string, label: string, apiKey: string, model: string, request: StructuredRequest<T>): Promise<T> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: request.name, schema: z.toJSONSchema(request.schema) } },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AiError(`${label} error ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new AiError(`${label} returned no answer.`);
  const parsed = request.schema.safeParse(JSON.parse(content));
  if (!parsed.success) throw new AiError(`${label} returned an answer in the wrong shape.`);
  return parsed.data;
}

export async function generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
  if (import.meta.env.DEV && window.__writersBoardStandInModel) {
    return request.schema.parse(await window.__writersBoardStandInModel(request));
  }
  const { provider, model } = aiSettings().jobs[request.job];
  if (!model.trim()) throw new AiError('Choose a model in AI settings first.');
  if (provider === 'chatgpt') {
    const response = await chatGptResponse(sendChatGptResponse, {
      model: model.trim(),
      instructions: request.system,
      input: [{ role: 'user', content: request.user }],
      format: { name: request.name, schema: z.toJSONSchema(request.schema) },
      effort: request.effort,
    });
    const parsed = request.schema.safeParse(JSON.parse(response.text));
    if (!parsed.success) throw new AiError('ChatGPT returned an answer in the wrong shape.');
    return parsed.data;
  }
  const apiKey = aiSettings().keys[provider];
  if (!apiKey) throw new AiError(`Add your ${PROVIDERS[provider].label} key in AI settings first.`);
  if (provider === 'anthropic') return anthropic(apiKey, model.trim(), request);
  const config = PROVIDERS[provider];
  return openAiCompatible(config.baseUrl, config.label, apiKey, model.trim(), request);
}
