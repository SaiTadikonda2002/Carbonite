import { VerificationAIResponse, VerificationRequestContext, VerificationConfig } from '../types/verification';

export interface AIVerificationProvider {
  verify(context: VerificationRequestContext, config: VerificationConfig): Promise<VerificationAIResponse>;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimatePlausibilityScore(context: VerificationRequestContext): number {
  const { action, history } = context;
  const typical = history?.typicalRangesByAction?.[action.actionType];
  if (!typical) return 0.6; // neutral if no history
  if (action.unit !== typical.unit) return 0.3;
  if (action.quantity < typical.min) return clamp(0.6 + (action.quantity - typical.min) / Math.max(1, typical.min) * 0.2, 0.2, 0.8);
  if (action.quantity > typical.max) return clamp(0.6 - (action.quantity - typical.max) / Math.max(1, typical.max) * 0.5, 0.1, 0.7);
  return 0.9; // within typical range
}

function estimatePatternScore(context: VerificationRequestContext): number {
  const { history } = context;
  if (!history) return 0.6;
  return clamp(Math.min(0.95, 0.5 + Math.log10(1 + history.totalActions)), 0.4, 0.95);
}

function estimateContextScore(context: VerificationRequestContext): number {
  const hour = new Date(context.action.timestamp).getHours();
  const hours = context.history?.lastActiveHours;
  if (!hours || hours.length === 0) return 0.6;
  const proximity = hours.includes(hour) ? 1 : 0.5;
  return 0.6 * proximity + 0.4;
}

function estimateAnomalyPenalty(context: VerificationRequestContext): number {
  const { action, history } = context;
  if (!history) return 0;
  const monthlyKey = new Date(action.timestamp).toISOString().slice(0, 7);
  const monthlyCount = history.monthlyActionCounts?.[monthlyKey] ?? 0;
  // very naive rate limiting / anomaly heuristic
  if (monthlyCount > 100) return 0.3;
  if (monthlyCount > 50) return 0.15;
  return 0;
}

export class MockAIVerificationProvider implements AIVerificationProvider {
  async verify(context: VerificationRequestContext, _config: VerificationConfig): Promise<VerificationAIResponse> {
    const start = performance.now();
    const plausibility = estimatePlausibilityScore(context);
    const pattern = estimatePatternScore(context);
    const ctx = estimateContextScore(context);
    const anomaly = estimateAnomalyPenalty(context);

    // weighted blend
    const raw = 0.45 * plausibility + 0.3 * pattern + 0.25 * ctx;
    const confidence = clamp(raw - anomaly, 0, 1);
    const verified = confidence >= 0.85;

    // Synthetic reasoning string
    const reasons: string[] = [];
    reasons.push(`Plausibility=${plausibility.toFixed(2)}`);
    reasons.push(`Pattern=${pattern.toFixed(2)}`);
    reasons.push(`Context=${ctx.toFixed(2)}`);
    if (anomaly > 0) reasons.push(`AnomalyPenalty=${anomaly.toFixed(2)}`);

    // simulate API latency 150-600ms
    const delay = 150 + Math.floor(Math.random() * 450);
    await new Promise((r) => setTimeout(r, delay));

    const latencyMs = Math.round(performance.now() - start) + delay;
    return {
      verified,
      confidence,
      reasoning: reasons.join('; '),
      provider: 'mock',
      latencyMs,
    };
  }
}


