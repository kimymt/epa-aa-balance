import { test, expect, spyOn } from "bun:test";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { render, fireEvent } from "@testing-library/react";
import { OnboardingCard } from "./OnboardingCard";
import { ResultPanel } from "./ResultPanel";
import type { AnalysisSessionResult } from "@/lib/session";

test("onboarding hydrates, remembers dismissal, and can be reopened", () => {
  expect(renderToString(<OnboardingCard />)).toBe("");
  const first = render(<OnboardingCard />);
  try {
    fireEvent.click(first.getByText("わかった、写真をアップロード →"));
    expect(first.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  } finally { first.unmount(); }
  const returning = render(<OnboardingCard />);
  try {
    fireEvent.click(returning.getByRole("button"));
    expect(returning.getByText("わかった、写真をアップロード →")).toBeTruthy();
    returning.rerender(<OnboardingCard forceCollapsed />);
    expect(returning.getByRole("button").hasAttribute("disabled")).toBe(true);
    expect(returning.queryByText("わかった、写真をアップロード →")).toBeNull();
  } finally { returning.unmount(); }
});

test("thumbnail URLs are released on replacement, removal, and StrictMode unmount", () => {
  const created: string[] = [];
  const create = spyOn(URL, "createObjectURL").mockImplementation(() => {
    const url = `blob:test-${created.length + 1}`;
    created.push(url);
    return url;
  });
  const revoke = spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const result: AnalysisSessionResult = {
    meals: [{ index: 0, mealType: "breakfast", result: {
      light: "unknown", lipidPct: null, lipidRatio: null, epaMg: 0, dhaMg: 0, aaMg: 0,
      lipidCoverage: 0, matched: [], excludedNoData: [], unmatched: [],
    } }], failed: [], aggregate: {
      lipidPct: null, totalEpaMg: 0, totalDhaMg: 0, totalAaMg: 0, signal: "unknown",
      totalMeals: 1, successfulMeals: 1, mealsWithData: 0,
    },
  };
  const first = new File(["a"], "a.jpg", { type: "image/jpeg" });
  const second = new File(["b"], "b.jpg", { type: "image/jpeg" });
  const ui = (files: File[]) => <StrictMode><ResultPanel result={result} files={files} /></StrictMode>;
  const view = render(ui([first]));
  try {
    const previous = view.getByAltText("朝食の写真").getAttribute("src");
    if (!previous) throw new Error("Missing initial thumbnail");
    view.rerender(ui([second]));
    expect(revoke.mock.calls.flat()).toContain(previous);
    const replacement = view.getByAltText("朝食の写真").getAttribute("src");
    if (!replacement) throw new Error("Missing replacement thumbnail");
    expect(replacement).not.toBe(previous);
    view.rerender(ui([]));
    expect(view.queryByAltText("朝食の写真")).toBeNull();
    expect(revoke.mock.calls.flat()).toContain(replacement);
    view.rerender(ui([first]));
  } finally {
    view.unmount();
    expect(revoke.mock.calls.flat().sort()).toEqual(created.sort());
    create.mockRestore(); revoke.mockRestore();
  }
});
