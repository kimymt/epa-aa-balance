// components/RecipeCard.test.tsx (v0.5.2 → v0.7.0)
//
// 描画 (折りたたみ初期状態 + 展開) と props 反映を確認。
// テスト基盤 (happy-dom + @testing-library/react) のスモークテストも兼ねる。

import { describe, it, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { RecipeCard } from "./RecipeCard";
import type { Recipe } from "@/lib/coach";

const sampleRecipe: Recipe = {
  name: "サバの味噌煮",
  mealType: "dinner",
  cookTime: "20分",
  description: "サバを味噌・砂糖・生姜で煮込んだ和食の定番。EPA・DHA 豊富。",
  fishType: "fish",
  cookingMethod: "simmered",
  servings: 2,
  ingredients: [
    { name: "サバ (切り身)", amount: "2 切れ (200g)" },
    { name: "味噌", amount: "大さじ 2" },
    { name: "砂糖", amount: "大さじ 1" },
    { name: "生姜 (薄切り)", amount: "1 片" },
    { name: "水", amount: "100ml" },
  ],
  steps: [
    "鍋に水・砂糖・味噌・生姜を入れ中火で煮立てる。",
    "サバを並べ、落とし蓋をして弱火で 12 分煮る。",
    "煮汁をかけながら 2 分仕上げ煮し、火を止める。",
  ],
  equipment: ["鍋", "落とし蓋"],
  tips: "サバの皮目を上にして並べると煮崩れしにくい。",
  safetyNote: "",
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

  // v0.7.0: 折りたたみ初期状態
  it("starts collapsed: ingredients / steps not visible by default", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    // 材料の特定行は表示されない
    expect(screen.queryByText("味噌")).toBeNull();
    // 手順の特定文も表示されない
    expect(screen.queryByText(/煮立てる/)).toBeNull();
  });

  it("renders affordance button with ingredient and step counts", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    // 「材料 5 つ・手順 3 ステップ ▾」のような表示
    expect(screen.getByRole("button", { name: /材料 5 つ・手順 3 ステップ/ })).toBeTruthy();
  });

  it("affordance button starts with aria-expanded=false", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  // v0.7.0: 展開動作
  it("clicking the affordance button expands and shows ingredients", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    fireEvent.click(screen.getByRole("button"));
    // 材料セクションのヘッダ
    expect(screen.getByText(/材料 \(2 人前\)/)).toBeTruthy();
    // 各材料の name が表示
    expect(screen.getByText("味噌")).toBeTruthy();
    expect(screen.getByText("砂糖")).toBeTruthy();
    // amount も
    expect(screen.getByText("大さじ 2")).toBeTruthy();
  });

  it("clicking expands and shows ordered steps", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/煮立てる/)).toBeTruthy();
    expect(screen.getByText(/落とし蓋をして弱火で 12 分/)).toBeTruthy();
  });

  it("clicking expands and shows equipment when non-empty", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("道具")).toBeTruthy();
    expect(screen.getByText(/鍋 \/ 落とし蓋/)).toBeTruthy();
  });

  it("does NOT render equipment section when array is empty", () => {
    const r: Recipe = { ...sampleRecipe, equipment: [] };
    render(<RecipeCard recipe={r} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("道具")).toBeNull();
  });

  it("renders tips section when tips is non-empty", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/💡 コツ/)).toBeTruthy();
    expect(screen.getByText(sampleRecipe.tips)).toBeTruthy();
  });

  it("does NOT render tips section when tips is empty", () => {
    const r: Recipe = { ...sampleRecipe, tips: "" };
    render(<RecipeCard recipe={r} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText(/💡 コツ/)).toBeNull();
  });

  it("renders safetyNote with red styling cue when raw fish", () => {
    const r: Recipe = {
      ...sampleRecipe,
      cookingMethod: "raw",
      safetyNote: "刺身用 (生食可) と表示のあるものを当日中に使い切ってください。",
    };
    render(<RecipeCard recipe={r} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/⚠ 安全注意/)).toBeTruthy();
    expect(screen.getByText(r.safetyNote)).toBeTruthy();
  });

  it("does NOT render safetyNote when empty (cooked recipes)", () => {
    render(<RecipeCard recipe={sampleRecipe} />); // safetyNote: ""
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText(/⚠ 安全注意/)).toBeNull();
  });

  it("clicking again collapses (toggles aria-expanded)", () => {
    render(<RecipeCard recipe={sampleRecipe} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.textContent).toContain("折りたたむ");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    // 折りたたみ後: 材料行が消える
    expect(screen.queryByText("味噌")).toBeNull();
  });
});
