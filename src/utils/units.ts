export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

export function ensureLbs(value: number, unit: string): { lbs: number; unit: 'lbs' } {
  if (unit === 'lbs') return { lbs: value, unit: 'lbs' };
  if (unit === 'kg') return { lbs: kgToLbs(value), unit: 'lbs' };
  // Unknown unit: reject in backend, but client coerces to lbs with no-op
  return { lbs: value, unit: 'lbs' };
}

export function assertNoKgUnit(unit: string): void {
  if (unit.toLowerCase() === 'kg' || unit.toLowerCase() === 'kilograms') {
    throw new Error('Invalid unit: kg is not allowed. Use lbs.');
  }
}


