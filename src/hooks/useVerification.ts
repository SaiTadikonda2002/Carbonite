import { useCallback, useMemo, useRef, useState } from 'react';
import { verifyUserAction } from '../services/verification';
import {
  VerificationConfig,
  VerificationRequestContext,
  VerificationResult,
} from '../types/verification';

export function useVerification(defaultConfig?: Partial<VerificationConfig>) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRunId = useRef(0);

  const config: VerificationConfig = useMemo(
    () => ({
      confidenceThreshold: defaultConfig?.confidenceThreshold ?? 0.85,
      provider: defaultConfig?.provider ?? 'mock',
      timeoutMs: defaultConfig?.timeoutMs ?? 2000,
      fallbackMode: defaultConfig?.fallbackMode ?? 'auto_verify_simple',
    }),
    [defaultConfig]
  );

  const run = useCallback(async (ctx: VerificationRequestContext) => {
    const runId = ++lastRunId.current;
    setIsVerifying(true);
    setError(null);
    setResult(null);
    try {
      const res = await verifyUserAction(ctx, config);
      if (runId !== lastRunId.current) return; // ignore stale
      setResult(res);
      return res;
    } catch (e) {
      if (runId !== lastRunId.current) return;
      setError((e as Error)?.message ?? 'Verification failed');
      return null;
    } finally {
      if (runId === lastRunId.current) setIsVerifying(false);
    }
  }, [config]);

  return { isVerifying, result, error, run, config };
}


