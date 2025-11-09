import { MockAIVerificationProvider, AIVerificationProvider } from './aiProvider';
import {
  VerificationRequestContext,
  VerificationResult,
  VerificationConfig,
  UserAction,
} from '../types/verification';

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T | Promise<T>): Promise<T> {
  let settled = false;
  return new Promise((resolve) => {
    const t = setTimeout(async () => {
      if (settled) return;
      settled = true;
      const fallback = await onTimeout();
      resolve(fallback);
    }, ms);
    promise
      .then((v) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(v);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        onTimeout().then(resolve);
      });
  });
}

function selectProvider(config: VerificationConfig): AIVerificationProvider {
  // Placeholders for real providers; currently mock
  return new MockAIVerificationProvider();
}

export async function verifyUserAction(
  context: VerificationRequestContext,
  config: VerificationConfig
): Promise<VerificationResult> {
  const provider = selectProvider(config);

  // STEP 1: mark pending (client-side placeholder)
  // In real app, write to DB: status = 'pending_verification'
  // Here we just echo back.
  const pending: UserAction = { ...context.action, status: 'pending_verification' };

  // STEP 2-4: call AI with timeout + fallback
  const timeoutMs = config.timeoutMs ?? 2000;
  const aiResponse = await withTimeout(
    provider.verify(context, config),
    timeoutMs,
    async () => {
      // Fallback policy
      if (config.fallbackMode === 'auto_verify_simple') {
        // naive rule: if quantity small-ish and unit not extreme, auto verify at low confidence
        const small = typeof pending.quantity === 'number' && pending.quantity <= 5;
        return {
          verified: small,
          confidence: small ? 0.86 : 0.5,
          reasoning: small
            ? 'Fallback: auto-verified simple low-quantity action due to AI timeout.'
            : 'Fallback: AI timeout; complex action flagged.',
          provider: 'mock',
          latencyMs: timeoutMs,
        };
      }
      return {
        verified: false,
        confidence: 0.5,
        reasoning: 'Fallback: AI failure or timeout; flagged for review.',
        provider: 'mock',
        latencyMs: timeoutMs,
      };
    }
  );

  const finalStatus = aiResponse.confidence >= config.confidenceThreshold && aiResponse.verified
    ? 'verified'
    : 'needs_review';

  return {
    ...aiResponse,
    finalStatus,
  };
}


