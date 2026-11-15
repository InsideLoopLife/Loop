// Turns health data sent from a phone (Health Auto Export JSON, or Loop's simple format for
// Apple Shortcuts) into one value per person, day and metric, plus workouts and weights.

export type DailyMetricKey =
  | "steps" | "active_kcal" | "resting_kcal" | "exercise_min" | "distance_km" | "flights"
  | "resting_hr" | "heart_rate_avg" | "hrv_ms" | "weight_kg" | "body_fat_pct" | "sleep_hours"
  | "water_ml" | "caffeine_mg" | "mindful_min" | "vo2max";

type Combine = "sum" | "avg" | "last";

const METRICS: Record<DailyMetricKey, { unit: string; combine: Combine; label: string }> = {
  steps: { unit: "count", combine: "sum", label: "Steps" },
  active_kcal: { unit: "kcal", combine: "sum", label: "Active energy" },
  resting_kcal: { unit: "kcal", combine: "sum", label: "Resting energy" },
  exercise_min: { unit: "min", combine: "sum", label: "Exercise" },
  distance_km: { unit: "km", combine: "sum", label: "Walking + running" },
  flights: { unit: "count", combine: "sum", label: "Flights climbed" },
  resting_hr: { unit: "bpm", combine: "avg", label: "Resting heart rate" },
  heart_rate_avg: { unit: "bpm", combine: "avg", label: "Average heart rate" },
  hrv_ms: { unit: "ms", combine: "avg", label: "Heart rate variability" },
  weight_kg: { unit: "kg", combine: "last", label: "Weight" },
  body_fat_pct: { unit: "%", combine: "last", label: "Body fat" },
  sleep_hours: { unit: "h", combine: "sum", label: "Sleep" },
  water_ml: { unit: "ml", combine: "sum", label: "Water" },
  caffeine_mg: { unit: "mg", combine: "sum", label: "Caffeine" },
  mindful_min: { unit: "min", combine: "sum", label: "Mindful minutes" },
  vo2max: { unit: "ml/kg/min", combine: "last", label: "VO₂ max" },
};

export const METRIC_LABELS: Record<string, { label: string; unit: string }> = Object.fromEntries(Object.entries(METRICS).map(([key, value]) => [key, { label: value.label, unit: value.unit }]));

// Health Auto Export metric names (and a few common alternatives) → Loop metric.
const NAME_MAP: Record<string, DailyMetricKey> = {
  step_count: "steps", steps: "steps",
  active_energy: "active_kcal", active_energy_burned: "active_kcal", active_kcal: "active_kcal",
  basal_energy_burned: "resting_kcal", resting_energy: "resting_kcal", resting_kcal: "resting_kcal",
  apple_exercise_time: "exercise_min", exercise_time: "exercise_min", exercise_min: "exercise_min",
  walking_running_distance: "distance_km", distance_walking_running: "distance_km", distance_km: "distance_km",
  flights_climbed: "flights", flights: "flights",
  resting_heart_rate: "resting_hr", resting_hr: "resting_hr",
  heart_rate: "heart_rate_avg", heart_rate_avg: "heart_rate_avg",
  heart_rate_variability: "hrv_ms", heart_rate_variability_sdnn: "hrv_ms", hrv: "hrv_ms", hrv_ms: "hrv_ms",
  weight_body_mass: "weight_kg", body_mass: "weight_kg", weight: "weight_kg", weight_kg: "weight_kg",
  body_fat_percentage: "body_fat_pct", body_fat_pct: "body_fat_pct",
  sleep_analysis: "sleep_hours", sleep: "sleep_hours", sleep_hours: "sleep_hours",
  dietary_water: "water_ml", water: "water_ml", water_ml: "water_ml",
  dietary_caffeine: "caffeine_mg", caffeine: "caffeine_mg", caffeine_mg: "caffeine_mg",
  mindful_minutes: "mindful_min", mindful_session: "mindful_min", mindful_min: "mindful_min",
  vo2_max: "vo2max", vo2max: "vo2max",
};

function num(value: unknown) {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "2026-11-15 07:30:00 +0000", ISO strings or epoch seconds → "2026-11-15" (the day as recorded on the phone). */
export function dayOf(value: unknown): string | null {
  if (typeof value === "number" && value > 1e9) return new Date(value * (value > 1e12 ? 1 : 1000)).toISOString().slice(0, 10);
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function convert(metric: DailyMetricKey, value: number, unitRaw: unknown) {
  const unit = String(unitRaw || "").toLowerCase().trim();
  switch (metric) {
    case "active_kcal":
    case "resting_kcal":
      return unit === "kj" ? value / 4.184 : value;
    case "distance_km":
      return unit === "mi" ? value * 1.60934 : unit === "m" ? value / 1000 : unit === "yd" ? value * 0.0009144 : value;
    case "weight_kg":
      return unit === "lb" || unit === "lbs" ? value * 0.453592 : unit === "st" ? value * 6.35029 : unit === "g" ? value / 1000 : value;
    case "water_ml":
      return unit === "l" || unit === "lt" ? value * 1000 : unit.includes("fl_oz") || unit === "fl oz" || unit === "oz" ? value * 29.5735 : unit === "cup" ? value * 236.6 : value;
    case "caffeine_mg":
      return unit === "g" ? value * 1000 : value;
    case "exercise_min":
    case "mindful_min":
      return unit === "s" || unit === "sec" ? value / 60 : unit === "hr" || unit === "h" ? value * 60 : value;
    case "sleep_hours":
      return unit === "min" ? value / 60 : unit === "s" ? value / 3600 : value;
    case "body_fat_pct":
      return value <= 1 ? value * 100 : value;
    default:
      return value;
  }
}

/** Value of one data point, coping with Health Auto Export's special shapes. */
function pointValue(metric: DailyMetricKey, point: any): number | null {
  if (metric === "sleep_hours") {
    // Aggregated sleep: totalSleep / asleep; otherwise add up the stages.
    const total = num(point?.totalSleep) ?? num(point?.asleep);
    if (total != null) return total;
    const stages = ["core", "deep", "rem"].map((key) => num(point?.[key]) || 0).reduce((a, b) => a + b, 0);
    if (stages > 0) return stages;
    return num(point?.qty) ?? num(point?.value);
  }
  if (metric === "heart_rate_avg") return num(point?.Avg) ?? num(point?.avg) ?? num(point?.qty) ?? num(point?.value);
  return num(point?.qty) ?? num(point?.value) ?? num(point?.Avg);
}

export type NormalisedPayload = {
  daily: Array<{ metric_date: string; metric: DailyMetricKey; value: number; unit: string }>;
  workouts: Array<{ external_id: string; workout_type: string; started_at: string; ended_at: string | null; duration_min: number | null; active_kcal: number | null; distance_km: number | null }>;
  weights: Array<{ measured_on: string; weight_kg: number }>;
  skipped: number;
};

const MAX_POINTS = 20000;

export function normaliseHealthPayload(body: any): NormalisedPayload {
  const root = body?.data && typeof body.data === "object" ? body.data : body;
  const metrics: any[] = Array.isArray(root?.metrics) ? root.metrics : [];
  const buckets = new Map<string, { metric: DailyMetricKey; date: string; values: Array<{ value: number; order: string }> }>();
  let skipped = 0;
  let seen = 0;

  for (const entry of metrics) {
    const name = String(entry?.name || entry?.type || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    const metric = NAME_MAP[name];
    // Loop simple format: one data point per entry ({ name, date, value, unit }).
    const points: any[] = Array.isArray(entry?.data) ? entry.data : entry && ("value" in entry || "qty" in entry) ? [entry] : [];
    if (!metric) { skipped += points.length || 1; continue; }
    for (const point of points) {
      if (++seen > MAX_POINTS) break;
      const date = dayOf(point?.date ?? point?.sleepEnd ?? point?.endDate ?? point?.startDate ?? entry?.date);
      const raw = pointValue(metric, point);
      if (!date || raw == null || raw < 0) { skipped += 1; continue; }
      const value = convert(metric, raw, point?.units ?? point?.unit ?? entry?.units ?? entry?.unit);
      const key = `${metric}|${date}`;
      const bucket = buckets.get(key) || { metric, date, values: [] };
      bucket.values.push({ value, order: String(point?.date ?? "") });
      buckets.set(key, bucket);
    }
  }

  const daily: NormalisedPayload["daily"] = [];
  for (const bucket of buckets.values()) {
    const rule = METRICS[bucket.metric];
    const values = bucket.values;
    let value: number;
    if (rule.combine === "sum") value = values.reduce((sum, item) => sum + item.value, 0);
    else if (rule.combine === "avg") value = values.reduce((sum, item) => sum + item.value, 0) / values.length;
    else value = values.sort((a, b) => a.order.localeCompare(b.order))[values.length - 1].value;
    if (bucket.metric === "sleep_hours" && value > 24) value = 24;
    daily.push({ metric_date: bucket.date, metric: bucket.metric, value: Math.round(value * 100) / 100, unit: rule.unit });
  }

  const weights = daily.filter((row) => row.metric === "weight_kg" && row.value > 2 && row.value < 400).map((row) => ({ measured_on: row.metric_date, weight_kg: Math.round(row.value * 10) / 10 }));

  const workoutsRaw: any[] = Array.isArray(root?.workouts) ? root.workouts.slice(0, 500) : [];
  const workouts: NormalisedPayload["workouts"] = [];
  for (const workout of workoutsRaw) {
    const start = String(workout?.start || workout?.startDate || "");
    if (!dayOf(start)) { skipped += 1; continue; }
    const startDate = new Date(start.replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2").replace(" ", "T"));
    const endText = String(workout?.end || workout?.endDate || "");
    const endDate = endText ? new Date(endText.replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2").replace(" ", "T")) : null;
    const fromTimes = endDate && !Number.isNaN(endDate.getTime()) && !Number.isNaN(startDate.getTime()) ? (endDate.getTime() - startDate.getTime()) / 60000 : null;
    const durationRaw = num(workout?.duration);
    const duration = fromTimes ?? (durationRaw != null ? (durationRaw > 400 ? durationRaw / 60 : durationRaw) : null);
    const energy = workout?.activeEnergyBurned ?? workout?.activeEnergy ?? workout?.active_kcal;
    const energyQty = typeof energy === "object" ? num(energy?.qty) : num(energy);
    const energyKcal = energyQty == null ? null : String(typeof energy === "object" ? energy?.units : "").toLowerCase() === "kj" ? energyQty / 4.184 : energyQty;
    const distance = workout?.distance ?? workout?.distance_km;
    const distanceQty = typeof distance === "object" ? num(distance?.qty) : num(distance);
    const distanceKm = distanceQty == null ? null : convert("distance_km", distanceQty, typeof distance === "object" ? distance?.units : "km");
    workouts.push({
      external_id: String(workout?.id || `${workout?.name || "workout"}|${start}`).slice(0, 200),
      workout_type: String(workout?.name || workout?.type || "Workout").slice(0, 80),
      started_at: Number.isNaN(startDate.getTime()) ? `${dayOf(start)}T00:00:00Z` : startDate.toISOString(),
      ended_at: endDate && !Number.isNaN(endDate.getTime()) ? endDate.toISOString() : null,
      duration_min: duration != null ? Math.round(duration * 10) / 10 : null,
      active_kcal: energyKcal != null ? Math.round(energyKcal) : null,
      distance_km: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
    });
  }

  return { daily, workouts, weights, skipped };
}
