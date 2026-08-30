import { LLMClient, MessageContext, ExplanationContext } from './llmClient';

const TONE_PREFIX: Record<string, string> = {
  GENTLE: 'Just a reminder — ',
  FIRM: 'Following up again — ',
  FINAL: 'Final notice — ',
};

const REASON_MESSAGE: Record<string, (ctx: MessageContext) => string> = {
  BANK_SERVER_ERROR: (ctx) => `we're retrying your ₹${ctx.amountRupees} payment now that the bank/gateway issue should have cleared.`,
  INSUFFICIENT_FUNDS: (ctx) =>
    `we tried to collect ₹${ctx.amountRupees} for your ${ctx.isSubscription ? 'subscription renewal' : 'order'} but the payment didn't go through due to insufficient balance. We'll retry automatically in a few days.`,
  OTP_FAILED: (ctx) => `we couldn't confirm the OTP for your ₹${ctx.amountRupees} payment. Please update your payment method to try again.`,
  CARD_EXPIRED: (ctx) => `your card on file has expired, so we couldn't collect ₹${ctx.amountRupees}. Please update your payment method to avoid interruption.`,
  INVALID_CARD_DETAILS: (ctx) => `we couldn't verify your card details for the ₹${ctx.amountRupees} payment. Please re-enter your card details.`,
  DAILY_LIMIT_EXCEEDED: (ctx) => `your ₹${ctx.amountRupees} payment hit your daily transaction limit. We'll retry once the limit resets.`,
  RISK_DECLINED: (ctx) => `your ₹${ctx.amountRupees} payment was flagged for manual review. Our team will follow up shortly.`,
};

const REASON_EXPLANATION: Record<string, string> = {
  BANK_SERVER_ERROR: 'the failure looked transient (bank/gateway timeout), so a same-day retry is likely to succeed without contacting the customer.',
  INSUFFICIENT_FUNDS: 'the account likely needs time to be topped up, so we wait a few days and send a reminder rather than retrying immediately.',
  OTP_FAILED: 'a single OTP failure is often a one-off entry error, so we retry once before assuming the payment method needs updating.',
  CARD_EXPIRED: 'an expired card cannot succeed on retry, so we go straight to asking the customer to update their payment method.',
  INVALID_CARD_DETAILS: 'invalid card details cannot succeed on retry, so we go straight to asking the customer to re-enter them.',
  DAILY_LIMIT_EXCEEDED: 'the limit resets daily, so waiting a day before retrying is more likely to succeed than an immediate retry.',
  RISK_DECLINED: 'a risk-engine decline cannot be resolved by retrying and needs human judgment, so this goes straight to escalation.',
};

export class TemplateLLMClient implements LLMClient {
  async draftMessage(ctx: MessageContext): Promise<string> {
    const prefix = TONE_PREFIX[ctx.tone];
    const body = REASON_MESSAGE[ctx.reason](ctx);
    return `${prefix}${body}`;
  }

  async explainDecision(ctx: ExplanationContext): Promise<string> {
    const why = REASON_EXPLANATION[ctx.reason];
    return `Attempt ${ctx.attemptNumber}: chose ${ctx.action} because ${why}`;
  }
}
