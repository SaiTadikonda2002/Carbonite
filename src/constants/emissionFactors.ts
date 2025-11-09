// All factors in pounds (lbs) of CO2e
export const EMISSION_FACTORS_LBS = {
  car_per_mile: 0.88,
  bus_per_mile: 0.196,
  cycling_vs_car_per_mile: 0.88,
  led_bulb_per_hour: 0.099,
  beef_per_lb: 59.5,
  plant_based_meal: 3.3,
} as const;

export type EmissionFactorKey = keyof typeof EMISSION_FACTORS_LBS;

// Heuristic: one mature tree absorbs ~48 lbs CO2/year
export const TREE_EQUIVALENT_LBS_PER_TREE = 48;


