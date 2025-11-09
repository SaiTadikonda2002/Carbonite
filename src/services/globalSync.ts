import { VerificationResult, VerificationRequestContext } from '../types/verification';

type GlobalState = {
  totalLbsSaved: number;
  actionCount: number;
};

const globalState: GlobalState = {
  totalLbsSaved: 0,
  actionCount: 0,
};

type Listener = (data: { event: 'global_update'; emissions_added_lbs: number; new_total_lbs: number }) => void;
const listeners: Set<Listener> = new Set();

export function subscribeGlobal(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function broadcast(emissionsAddedLbs: number) {
  const payload = { event: 'global_update' as const, emissions_added_lbs: emissionsAddedLbs, new_total_lbs: globalState.totalLbsSaved };
  listeners.forEach((l) => l(payload));
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 150): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function aggregateVerifiedAction(ctx: VerificationRequestContext, result: VerificationResult): Promise<GlobalState> {
  if (result.finalStatus !== 'verified') throw new Error('Action not verified; cannot aggregate globally');
  const y = ctx.action.emissionsSavedLbs ?? 0;
  // atomic transaction (mocked): we perform all steps and only then "commit"
  // using in-memory state; in real backend, use DB transaction
  return retry(async () => {
    // update user_actions (mock)
    // update user_stats (mock)
    const newTotal = globalState.totalLbsSaved + y;
    const newCount = globalState.actionCount + 1;

    // commit
    globalState.totalLbsSaved = newTotal;
    globalState.actionCount = newCount;

    // global activity log (omitted: mock)
    // redis cache update
    // broadcast
    broadcast(y);

    console.log(`Global DB updated: +${y.toFixed(2)} lbs, new total: ${newTotal.toFixed(2)} lbs`);
    return { ...globalState };
  });
}

export function getGlobalState(): GlobalState {
  return { ...globalState };
}


