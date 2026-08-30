import { LLMClient } from './llmClient';
import { TemplateLLMClient } from './templateClient';
import { OpenAICompatibleLLMClient } from './openAICompatibleClient';

export function getLLMClient(): LLMClient {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return new TemplateLLMClient();
  }
  const baseUrl = process.env.LLM_BASE_URL ?? 'https://api.x.ai/v1';
  const model = process.env.LLM_MODEL ?? 'grok-beta';
  return new OpenAICompatibleLLMClient(baseUrl, apiKey, model);
}
