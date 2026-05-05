// components/DietPatternComparison.test.tsx (v0.5.2)
//
// 結果ページのコア体験 (WOW factor Step 2) を担保する。
// - ヘッダーの数値表示
// - 5 食習慣パターンが全て表示
// - WHO/AHA 達成チップが正しく on/off
// - 「あなたはここ 👉」マーカー
// - データ無し時のガード
//
// セレクタ方針:
// - 同一テキストが複数箇所に出る場合は queryAllByText().length で件数確認
// - WHO/AHA チップ全体は closest('[title]') で取得 (description が title 属性)

import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DietPatternComparison } from "./DietPatternComparison";

describe("DietPatternComparison", () => {
  // 標準ケース: 3 食 (= 1 日換算) で EPA 200 + DHA 280 = 480 mg/日
  const baseProps = {
    totalEpaMg: 200,
    totalDhaMg: 280,
    mealsWithData: 3,
    lipidPct: 25,
  };

  it("renders header with formatted lipidPct %, total g, daily mg/日", () => {
    render(<DietPatternComparison {...baseProps} />);

    expect(screen.getByText(/魚由来脂質割合/)).toBeTruthy();
    // 25% は header と一致
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    // total 0.48 g
    expect(screen.getByText("0.48 g")).toBeTruthy();
    // 平均 480 mg/日 (full-width 括弧で囲まれている、内部マッチで OK)
    expect(screen.getByText(/平均 480 mg\/日/)).toBeTruthy();
  });

  it("renders all 5 diet pattern names", () => {
    render(<DietPatternComparison {...baseProps} />);

    // 注: 地中海食 等は pattern row + footer hint paragraph の両方に出るため
    // getAllByText で件数確認 (>= 1 で OK)
    expect(screen.getAllByText("標準的アメリカ食").length).toBeGreaterThan(0);
    expect(screen.getAllByText("地中海食").length).toBeGreaterThan(0);
    expect(screen.getAllByText("日本伝統食").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ノルウェー食").length).toBeGreaterThan(0);
    // v0.4.18: イヌイットに時代註記
    expect(
      screen.getAllByText("イヌイット伝統食 (1970 年代以前)").length
    ).toBeGreaterThan(0);
  });

  it("places user marker between surpassed and next pattern", () => {
    // 480 mg/日 → 標準的アメリカ食 (150) を超え、地中海食 (600) 未満
    render(<DietPatternComparison {...baseProps} />);

    // user marker
    expect(screen.getByText("あなたはここ")).toBeTruthy();

    // surpassed pattern (US) には ✓ 超えました
    expect(screen.getByText("✓ 超えました")).toBeTruthy();

    // next pattern (地中海食) には「あと +120 mg」(600 - 480 = 120)
    // 同じ "+120 mg" が footer hint にも出る (full message: "+120 mg/日")
    // chip の方は「あと +120 mg」、hint の方は「+120 mg/日」で末尾が違うので
    // 完全一致セレクタで chip 側を特定可能
    expect(screen.getByText("あと +120 mg")).toBeTruthy();
  });

  it("renders WHO/AHA achievement chips with v0.4.18 year notes", () => {
    render(<DietPatternComparison {...baseProps} />);

    expect(screen.getByText("WHO 一般推奨")).toBeTruthy();
    // v0.4.18: AHA に年次併記
    expect(screen.getByText("AHA 一般推奨 (2002/2017)")).toBeTruthy();
    expect(screen.getByText("AHA CVD 二次予防 (2017 年版)")).toBeTruthy();
  });

  it("WHO chip achieved (480 >= 250), AHA primary not (480 < 500)", () => {
    render(<DietPatternComparison {...baseProps} />);

    // チップ wrapper は title 属性を持つ span。closest('[title]') で取得。
    const whoChip = screen.getByText("WHO 一般推奨").closest("[title]");
    expect(whoChip).not.toBeNull();
    expect(whoChip?.textContent).toContain("✓"); // 達成
    expect(whoChip?.textContent).toContain("250 mg/日");

    const ahaPrimaryChip = screen
      .getByText("AHA 一般推奨 (2002/2017)")
      .closest("[title]");
    expect(ahaPrimaryChip).not.toBeNull();
    expect(ahaPrimaryChip?.textContent).toContain("○"); // 未達
    expect(ahaPrimaryChip?.textContent).toContain("500 mg/日");
    expect(ahaPrimaryChip?.textContent).toContain("(96%)"); // 480/500
  });

  it("guard: shows fallback message when lipidPct is null", () => {
    render(<DietPatternComparison {...baseProps} lipidPct={null} />);
    expect(screen.getByText(/比較できません/)).toBeTruthy();
    // 5 パターンは表示しない
    expect(screen.queryByText("イヌイット伝統食 (1970 年代以前)")).toBeNull();
  });

  it("guard: shows fallback when mealsWithData = 0", () => {
    render(<DietPatternComparison {...baseProps} mealsWithData={0} />);
    expect(screen.getByText(/比較できません/)).toBeTruthy();
  });

  it("daily average: 6 meals (= 2 days) divides totals by 2", () => {
    // 6 食 = 2 日、totalMg 1200 → daily 600 mg/日 (= AHA 一般推奨ぴったり)
    render(
      <DietPatternComparison
        totalEpaMg={500}
        totalDhaMg={700}
        mealsWithData={6}
        lipidPct={30}
      />
    );
    expect(screen.getByText(/平均 600 mg\/日/)).toBeTruthy();
    expect(screen.getByText("1.20 g")).toBeTruthy();
    // 600 mg/日 → AHA 一般推奨 500 を超え、AHA CVD 1000 未満
    const ahaPrimaryChip = screen
      .getByText("AHA 一般推奨 (2002/2017)")
      .closest("[title]");
    expect(ahaPrimaryChip?.textContent).toContain("✓");
  });
});
