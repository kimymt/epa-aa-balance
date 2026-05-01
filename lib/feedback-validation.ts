// Validation for POST /api/feedback request body.
// Extracted for unit testability.

const VALID_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);

export interface FeedbackBody {
  mealType: string;
  predictedFoods: unknown;
  accurate: boolean;
  correctedFoods: unknown;
  timestamp: string | undefined;
}

export type ValidationResult =
  | { ok: true; body: FeedbackBody }
  | { ok: false; reason: string };

export function validateFeedbackBody(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "body-not-object" };
  }
  const body = input as Record<string, unknown>;

  if (typeof body.mealType !== "string") {
    return { ok: false, reason: "mealType-not-string" };
  }
  if (!VALID_MEAL_TYPES.has(body.mealType)) {
    return { ok: false, reason: "mealType-invalid" };
  }
  if (typeof body.accurate !== "boolean") {
    return { ok: false, reason: "accurate-not-boolean" };
  }
  if (
    body.timestamp !== undefined &&
    typeof body.timestamp !== "string"
  ) {
    return { ok: false, reason: "timestamp-wrong-type" };
  }

  return {
    ok: true,
    body: {
      mealType: body.mealType,
      predictedFoods: body.predictedFoods,
      accurate: body.accurate,
      correctedFoods: body.correctedFoods,
      timestamp:
        typeof body.timestamp === "string" ? body.timestamp : undefined,
    },
  };
}
