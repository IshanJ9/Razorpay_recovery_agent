import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getLLMClient } from '../../src/llm';
import { TemplateLLMClient } from '../../src/llm/templateClient';
import { OpenAICompatibleLLMClient } from '../../src/llm/openAICompatibleClient';

describe('getLLMClient', () => {
  const originalKey = process.env.LLM_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalKey;
  });

  it('returns the template client when no API key is configured', () => {
    delete process.env.LLM_API_KEY;
    expect(getLLMClient()).toBeInstanceOf(TemplateLLMClient);
  });

  it('returns the OpenAI-compatible client when an API key is configured', () => {
    process.env.LLM_API_KEY = 'test-key';
    expect(getLLMClient()).toBeInstanceOf(OpenAICompatibleLLMClient);
  });
});
