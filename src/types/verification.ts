export type ActionType =
  | 'bike_commute'
  | 'public_transit'
  | 'tree_planting'
  | 'renewable_energy_use'
  | 'recycling'
  | 'custom';

export interface UserAction {
  id: string;
  userId: string;
  actionType: ActionType;
  quantity: number;
  unit: string;
  timestamp: number; // epoch ms
  metadata?: Record<string, unknown>;
  emissionsSavedLbs?: number;
  status?: 'pending_verification' | 'verified' | 'needs_review';
}

export interface UserHistorySummary {
  totalActions: number;
  monthlyActionCounts: Record<string, number>; // e.g. '2025-11' -> 12
  typicalRangesByAction: Record<ActionType, { min: number; max: number; unit: string }>;
  lastLocations?: string[];
  lastActiveHours?: number[]; // 0-23 hours observed
}

export interface VerificationRequestContext {
  user: { id: string; profile?: Record<string, unknown> };
  action: UserAction;
  history?: UserHistorySummary;
}

export interface VerificationAIResponse {
  verified: boolean;
  confidence: number; // 0..1
  reasoning: string;
  provider?: 'openai' | 'anthropic' | 'google' | 'mock';
  latencyMs?: number;
}

export interface VerificationResult extends VerificationAIResponse {
  finalStatus: 'verified' | 'needs_review';
}

export interface VerificationConfig {
  confidenceThreshold: number; // e.g. 0.85
  provider: 'openai' | 'anthropic' | 'google' | 'mock';
  timeoutMs?: number; // e.g. 2000
  fallbackMode?: 'auto_verify_simple' | 'flag_complex';
}


