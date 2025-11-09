import { useState } from 'react';
import { useVerification } from '../hooks/useVerification';
import { VerificationRequestContext } from '../types/verification';
import { EMISSION_FACTORS_LBS } from '../constants/emissionFactors';
import { saveUserAction, verifyAndSyncAction } from '../services/globalDb';

export default function VerifyDemo() {
  const { isVerifying, result, error, run } = useVerification({ timeoutMs: 2000 });
  const [quantity, setQuantity] = useState<number>(5);

  const onVerify = async () => {
    const now = Date.now();
    const emissionsSavedLbs = quantity * EMISSION_FACTORS_LBS.cycling_vs_car_per_mile;
    const ctx: VerificationRequestContext = {
      user: { id: 'demo-user' },
      action: {
        id: `temp-${now}`, // Temporary ID, will be replaced by DB
        userId: 'demo-user',
        actionType: 'bike_commute',
        quantity,
        unit: 'miles',
        timestamp: now,
        emissionsSavedLbs,
      },
      history: {
        totalActions: 42,
        monthlyActionCounts: { [new Date(now).toISOString().slice(0, 7)]: 8 },
        typicalRangesByAction: {
          bike_commute: { min: 1, max: 30, unit: 'miles' },
          public_transit: { min: 1, max: 60, unit: 'minutes' },
          tree_planting: { min: 1, max: 50, unit: 'trees' },
          renewable_energy_use: { min: 1, max: 100, unit: 'kwh' },
          recycling: { min: 1, max: 20, unit: 'lbs' },
          custom: { min: 1, max: 100, unit: 'units' },
        },
        lastLocations: [],
        lastActiveHours: [7, 8, 9, 17, 18, 19],
      },
    };

    // Step 1: Save action to DB with verified=false
    const actionId = await saveUserAction(ctx);
    
    // Step 2: Run AI verification
    const res = await run(ctx);
    
    // Step 3: Update verified status (triggers database trigger)
    if (res) {
      await verifyAndSyncAction(actionId, ctx, res);
    }
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Bike commute miles</label>
        <input
          type="number"
          className="border rounded px-2 py-1 w-24"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        <button
          onClick={onVerify}
          disabled={isVerifying}
          className="px-3 py-1 rounded bg-emerald-600 text-white disabled:opacity-60"
        >
          {isVerifying ? 'Verifying…' : 'Verify'}
        </button>
      </div>

      {result && (
        <div className="text-sm">
          <div className="font-medium">
            {result.finalStatus === 'verified' ? 'Verified' : 'Needs review'}
          </div>
          <div>Confidence: {(result.confidence * 100).toFixed(0)}%</div>
          <div className="text-gray-600">{result.reasoning}</div>
          {result.finalStatus === 'verified' && (
            <div className="text-emerald-700 font-medium">
              {(quantity * EMISSION_FACTORS_LBS.cycling_vs_car_per_mile).toFixed(2)} lbs CO2 saved
            </div>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}


