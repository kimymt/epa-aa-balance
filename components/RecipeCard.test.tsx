// components/RecipeCard.test.tsx (v0.5.2)
//
// 最小のコンポーネントテスト: RecipeCard が props を正しく描画するかだけ確認。
// テスト基盤 (happy-dom + @testing-library/react) のスモークテストを兼ねる。

import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { RecipeCard } from "./RecipeCard";
import type { Recipe } from "@/lib/coach";

const sampleRecipe: Recipe = {
  name: "サバの味噌煮",
  mealType: "dinner",
  cookTime: "20分",
  description: "サバを味噌・砂糖・生姜で煮込んだ和食の定番。EPA・DHA 豊富。",
  fishType: "fish",
};

describe("RecipeCard", () => {
  it("renders recipe name", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    expect(screen.getByText("サバの味噌煮")).toBeTruthy();
  });

  it("renders cook time and meal type", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    expect(screen.getByText(/20分/)).toBeTruthy();
    expect(screen.getByText(/夕食/)).toBeTruthy();
  });

  it("renders description verbatim", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    expect(screen.getByText(sampleRecipe.description)).toBeTruthy();
  });

  it("handles all 3 mealType values (breakfast / lunch / dinner)", () => {
    const meals: Recipe["mealType"][] = ["breakfast", "lunch", "dinner"];
    const labels = ["朝食", "昼食", "夕食"];
    for (let i = 0; i < meals.length; i++) {
      const r: Recipe = { ...sampleRecipe, mealType: meals[i] };
      const { unmount } = render(<RecipeCard recipe={r} />);
      expect(screen.getByText(new RegExp(labels[i]))).toBeTruthy();
      unmount();
    }
  });
});
