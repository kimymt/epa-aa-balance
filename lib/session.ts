import type { AnalysisResult } from "./analyzer";

export type TrafficLight = "green" | "yellow" | "red";

export interface MealAnalysis {
  index: number;
  mealType: "breakfast" | "lunch" | "dinner";
  result: AnalysisResult;
}

export interface FailedMeal {
  index: number;
  mealType: "breakfast" | "lunch" | "dinner";
  error: string;
  userMessage: string;
}

export interface AggregateStats {
  fishPct: number;
  signal: TrafficLight;
  totalMeals: number;
  successfulMeals: number;
}

export interface AnalysisSessionResult {
  meals: MealAnalysis[];
  failed: FailedMeal[];
  aggregate: AggregateStats;
}

export function computeAggregate(
  meals: AnalysisResult[]
): Omit<AggregateStats, "totalMeals" | "successfulMeals"> {
  if (meals.length === 0) {
    return { fishPct: 0, signal: "red" };
  }

  const avgFishPct =
    meals.reduce((sum, meal) => sum + meal.fishProteinPct, 0) / meals.length;

  const signal: TrafficLight =
    avgFishPct >= 50 ? "green" : avgFishPct >= 25 ? "yellow" : "red";

  return { fishPct: Math.round(avgFishPct), signal };
}

// Meal type constants for UI
export const MEAL_TYPES = [
  { value: "breakfast", label: "朝食", labelEn: "Breakfast" },
  { value: "lunch", label: "昼食", labelEn: "Lunch" },
  { value: "dinner", label: "夕食", labelEn: "Dinner" },
] as const;

export type MealTypeValue = (typeof MEAL_TYPES)[number]["value"];
