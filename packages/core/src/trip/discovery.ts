import { z } from 'zod';

export const DISCOVERY_MODEL = 'muse-spark-1.3-contributor';
export const DISCOVERY_CATEGORIES = ['any', 'food', 'coffee', 'culture', 'shops'] as const;
export const discoveryRequestSchema = z.object({
  cityId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/),
  seedIds: z.array(z.string().min(1).max(200)).min(1).max(3).refine(ids => new Set(ids).size === ids.length),
  category: z.enum(DISCOVERY_CATEGORIES),
}).strict();
export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>;
export function discoveryName(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
export function discoveryPublicUrl(value: string): boolean {
  try {
    const u = new URL(value), h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && h.includes('.') &&
      !h.endsWith('.local') && !h.endsWith('.localhost') && !h.endsWith('.internal') &&
      !h.includes(':') && !/^[\d.]+$/.test(h) && value.length <= 2000;
  } catch { return false; }
}
export const discoveryEvidenceSchema = z.object({
  url: z.string().max(2000).refine(discoveryPublicUrl), title: z.string().max(300),
  snippet: z.string().min(1).max(2000), kind: z.enum(['public-web', 'instagram-mention']),
}).strict();
export const discoveryCandidateSchema = z.object({
  name: z.string().min(2).max(160), relatedSeedId: z.string().min(1).max(200),
  reason: z.string().min(1).max(600), evidence: z.array(discoveryEvidenceSchema).min(1).max(3),
}).strict();
export const discoveryResponseSchema = z.object({
  status: z.literal('ok'), cityId: z.string().max(120), modelId: z.literal(DISCOVERY_MODEL),
  retrievedAt: z.iso.datetime(), candidates: z.array(discoveryCandidateSchema).max(5),
}).strict();
export type DiscoveryCandidate = z.infer<typeof discoveryCandidateSchema>;
export type DiscoveryResponse = z.infer<typeof discoveryResponseSchema>;
