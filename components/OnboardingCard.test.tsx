// components/OnboardingCard.test.tsx (v0.5.2)
//
// 描画レイヤーの担保のみ。localStorage state machine の網羅は lib/onboarding.test.ts
// が責任を持つ (こちらは UI の存在確認に絞る)。
//
// 設計判断: localStorage を test body 内で setItem してから render する系の
// テストは bun:test + happy-dom + React 19 useEffect の組み合わせで多テスト
// ファイル並行実行時に timing 起因で flaky 化することを観測 (v0.5.2 開発時)。
// 単体テスト (lib/onboarding.test.ts の hasSeenOnboarding/markOnboardingSeen)
// で振る舞いは担保済みのため、コンポーネントテストは描画 + 構造のみに focus。

import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { OnboardingCard } from "./OnboardingCard";

describe("OnboardingCard", () => {
  it("first visit (clean localStorage): renders expanded card with safety warning + dismiss button", async () => {
    // beforeEach (test/setup.ts) で localStorage は clean
    render(<OnboardingCard />);

    // findByText で useEffect 後の DOM を待つ
    expect(await screen.findByText(/EPA\/AA バランスとは？/)).toBeTruthy();
    expect(screen.getByText(/わかった、写真をアップロード/)).toBeTruthy();

    // v0.4.16 の安全性注意ボックスが表示されること
    expect(screen.getByText(/抗凝固薬・抗血小板剤を服用中/)).toBeTruthy();

    // v0.4.19: dismiss ボタンに type='button' 明示
    const dismiss = screen.getByText(
      /わかった、写真をアップロード/
    ) as HTMLButtonElement;
    expect(dismiss.tagName).toBe("BUTTON");
    expect(dismiss.type).toBe("button");
  });

  it("EPA/DHA + AA food sources are listed in the bullet list", async () => {
    render(<OnboardingCard />);
    await screen.findByText(/EPA\/AA バランスとは？/);

    expect(screen.getByText(/サバ・イワシ・サンマ/)).toBeTruthy();
    expect(screen.getByText(/肉・卵・乳製品/)).toBeTruthy();
  });

  it("includes proxy disclaimer (v0.4.8 honesty disclosure)", async () => {
    render(<OnboardingCard />);
    await screen.findByText(/EPA\/AA バランスとは？/);

    // 「血液検査の代わりにはなりません」 disclaimer
    expect(screen.getByText(/血液検査の代わりにはなりません/)).toBeTruthy();
  });
});
