import { activeApiKey, apiKeyEnvVar, config, type ProviderName } from '../core/config.js';
import { GeminiProvider } from './gemini.js';
import { GroqProvider } from './groq.js';
import type { LlmProvider } from './types.js';

export * from './types.js';

/** Builds the configured provider. Throws if its API key is missing — call
 * {@link ../cli.js}'s preflight check first so this never fires mid-run. */
export function createProvider(provider: ProviderName = config.provider): LlmProvider {
  const apiKey = activeApiKey(provider);
  if (apiKey === undefined) {
    throw new Error(
      `No API key for provider "${provider}". Set ${apiKeyEnvVar(provider)} in .env.`
    );
  }

  switch (provider) {
    case 'gemini':
      return new GeminiProvider(apiKey, config.gemini.model);
    case 'groq':
      return new GroqProvider(apiKey, config.groq.model);
  }
}
