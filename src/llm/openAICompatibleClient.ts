import { LLMClient, MessageContext, ExplanationContext } from './llmClient';

export class OpenAICompatibleLLMClient implements LLMClient {
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  private async chat(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.choices[0].message.content.trim();
  }

  async draftMessage(ctx: MessageContext): Promise<string> {
    const prompt = `Write a short, ${ctx.tone.toLowerCase()}-tone payment reminder message (1-2 sentences) to a customer whose ₹${ctx.amountRupees} ${ctx.isSubscription ? 'subscription renewal' : 'payment'} failed due to: ${ctx.reason}. Do not include a greeting or signature.`;
    return this.chat(prompt);
  }

  async explainDecision(ctx: ExplanationContext): Promise<string> {
    const prompt = `In one sentence, explain why a payment recovery agent chose the action "${ctx.action}" on attempt ${ctx.attemptNumber} for a payment failure reason of "${ctx.reason}".`;
    return this.chat(prompt);
  }
}
