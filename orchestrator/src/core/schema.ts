/**
 * Converts a Zod object schema into the plain JSON Schema shape
 * {@link ToolParameterSchema} needs for a tool declaration — used both for
 * ordinary tools and for the "submit" tools agents call to hand back
 * structured output (see `agent-loop.ts`).
 */
import { z } from 'zod';

import type { ToolParameterSchema } from '../providers/types.js';

export function zodToToolParameters(schema: z.ZodObject): ToolParameterSchema {
  // z.toJSONSchema() emits a `$schema` key that is meaningless inside a tool
  // declaration (providers expect a bare schema, not a standalone document).
  const { $schema: _$schema, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema as ToolParameterSchema;
}
