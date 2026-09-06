// Validation for POST /api/feedback request body.
// Extracted for unit testability.

const VALID_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);

export interface FeedbackBody {
  mealType: string;
  predictedFoods: Array<{ name: string; grams: number } | string>;
  accurate: boolean;
  correctedFoods: string[] | null;
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

  const predictedFoods = body.predictedFoods ?? [];
  const correctedFoods = body.correctedFoods ?? null;
  if (!Array.isArray(predictedFoods) || predictedFoods.length > 20 ||
      !predictedFoods.every((f) => validName(f) || (f && typeof f === "object" && validName(f.name) &&
        typeof f.grams === "number" && Number.isFinite(f.grams) && f.grams > 0 && f.grams <= 10000))) {
    return { ok: false, reason: "predictedFoods-invalid" };
  }
  if (correctedFoods !== null && (!Array.isArray(correctedFoods) || correctedFoods.length > 20 || !correctedFoods.every(validName))) {
    return { ok: false, reason: "correctedFoods-invalid" };
  }
  if (typeof body.timestamp === "string" && (body.timestamp.length > 40 || !Number.isFinite(Date.parse(body.timestamp)))) {
    return { ok: false, reason: "timestamp-invalid" };
  }
  return {
    ok: true,
    body: {
      mealType: body.mealType,
      predictedFoods,
      accurate: body.accurate,
      correctedFoods,
      timestamp:
        typeof body.timestamp === "string" ? body.timestamp : undefined,
    },
  };
}

function validName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

// Legacy database rows are untrusted too: malformed JSON or shapes become empty lists.
export function safeStoredFoods(value: string | null, corrected = false): FeedbackBody["predictedFoods"] {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    const result = validateFeedbackBody({ mealType: "breakfast", accurate: true,
      ...(corrected ? { correctedFoods: parsed } : { predictedFoods: parsed }) });
    if (!result.ok) return [];
    return corrected ? result.body.correctedFoods ?? [] : result.body.predictedFoods;
  } catch { return []; }
}
