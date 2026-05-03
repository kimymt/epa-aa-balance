// Feature flags for v0.3.0 lipid migration.
//
// v0.3.0-beta (PR 2): introduces USE_LIPID_CALCULATION flag.
//   - false (default): keep computing the protein-based fishProteinPct as the
//     primary signal. Lipid fields are ALSO computed and included in the API
//     response, but `light` reflects the protein logic.
//   - true: lipid-based signal becomes primary. `light` is computed from
//     lipidPct (or "unknown" if data insufficient).
//
// v0.3.0 (PR 3): UI cutover. Flag still present.
// v0.3.0+1week (cleanup PR): this file deleted; lipid is the only logic.
//
// Per /plan-eng-review Issue 4: kept for ~1 week post-deploy as rollback
// safety net. Then removed in cleanup PR.

/**
 * Returns true when the lipid-based calculation should drive the primary
 * `light` signal. Default: false (protein-based, v0.2.0 behavior).
 *
 * Strict string comparison: only the literal string "true" enables the flag.
 * Any other value (including "True", "1", undefined) returns false. This
 * prevents accidental enablement from typos.
 */
export function useLipidCalculation(): boolean {
  return process.env.USE_LIPID_CALCULATION === "true";
}
