// The reviewed product contract is the single validator/advertisement source.
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation/types.js';
import contract from '../../../docs/mcp-public-file.schema.json' with { type: 'json' };

export const publicContract = contract;
const definitions = contract.$defs as unknown as Record<string, JsonSchemaType>;
const ajv = new Ajv2020({ strict: true, validateFormats: true, allErrors: true });
addFormats(ajv);
const provider = new AjvJsonSchemaValidator(ajv);
const validators = new Map<string, ReturnType<typeof provider.getValidator>>();
export function publicDefinition(name: string): JsonSchemaType | undefined { return definitions[name]; }
export function validatePublicDefinition(name: string, value: unknown): boolean {
  if (!definitions[name]) return false;
  let validate = validators.get(name);
  if (!validate) {
    validate = provider.getValidator({ $schema: contract.$schema, $defs: definitions, $ref: `#/$defs/${name}` });
    validators.set(name, validate);
  }
  return validate(value).valid;
}

export const PUBLIC_TOOL_DEFINITIONS = {
  mot_get_capabilities: ['capabilityRequest', 'publicInfoResponse'],
  fcc_search_catalog: ['catalogSearch', 'catalogPage'],
  fcc_get_city: ['cityRequest', 'cityResult'],
  fcc_get_item: ['itemRequest', 'catalogItem'],
  fcc_get_asset: ['assetRequest', 'assetResult'],
} as const;

export const PUBLIC_CATALOGUE_ERRORS = {
  INVALID_INPUT: 'Invalid catalogue input.',
  CATALOG_UNAVAILABLE: 'Catalogue data is unavailable.',
  SNAPSHOT_CHANGED: 'Catalogue snapshot changed. Restart discovery.',
  CURSOR_INVALID: 'Catalogue cursor is invalid. Restart discovery.',
  NOT_ELIGIBLE: 'This representation is not eligible for the requested operation.',
} as const;
export class PublicCatalogueError extends Error {
  readonly code: keyof typeof PUBLIC_CATALOGUE_ERRORS;
  constructor(code: keyof typeof PUBLIC_CATALOGUE_ERRORS) { super(code); this.code = code; }
}
