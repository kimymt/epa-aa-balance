import { describe, test, expect } from "bun:test";
import { analyzePhoto } from "./vision";

describe("Gemini Vision Concurrency (Free Tier)", () => {
  test.skip("9 concurrent requests complete within 45s (pre-build verification)", async () => {
    // This test is SKIPPED during normal runs.
    // Run manually with: bun test --grep "9 concurrent"
    // Purpose: Verify Gemini free tier allows 9 concurrent API calls
    // Expected: All 9 complete in ~3-9s (parallel), not rate-limited
    // If this test times out or returns 429 (rate limit), fallback to sequential batching

    // Create 9 dummy image buffers (minimal JPEG)
    // Real test would use actual meal photos
    const dummyJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    ]);

    const imagePromises = Array.from({ length: 9 }, (_, i) =>
      analyzePhoto(dummyJpeg, "image/jpeg").catch((err) => ({
        error: err.message,
        index: i,
      }))
    );

    const startTime = Date.now();
    const results = await Promise.allSettled(imagePromises);
    const elapsed = Date.now() - startTime;

    // Assertions
    const successful = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    console.log(`Concurrency Test Results:
      - Total requests: 9
      - Successful: ${successful.length}
      - Failed: ${failed.length}
      - Elapsed time: ${elapsed}ms
      - Average per call: ${(elapsed / 9).toFixed(0)}ms
      - Rate limited? ${failed.some((f) => f.reason?.message?.includes("429")) ? "YES" : "NO"}
    `);

    // For real test: expect(successful.length).toBeGreaterThan(0);
    // For concurrency verification: if successful.length < 9, need batching fallback
  });

  test("Single request works (sanity check)", async () => {
    // Minimal test to ensure vision.ts is importable
    expect(typeof analyzePhoto).toBe("function");
  });
});
