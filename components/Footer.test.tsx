// components/Footer.test.tsx (v0.5.2)
//
// Footer は静的だが GitHub / Q&A リンクの target 属性と URL を担保する。
// QA_URL_PLACEHOLDER の disabled UI は別 PR でリグレッションが起きやすい (v0.4.14
// で placeholder、v0.4.15 で active 化、後で再 placeholder に戻す可能性も
// あるため挙動の両方を確認できる仕組みを残す)。

import { describe, it, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Footer } from "./Footer";

describe("Footer", () => {
  it("renders branding text", () => {
    render(<Footer />);
    // ブランディングは複数箇所に出るので getAllByText
    const matches = screen.getAllByText(/EPA\/AAバランス/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("GitHub link points to repo and opens in new tab", () => {
    render(<Footer />);
    const link = screen.getByText("GitHub").closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(
      "https://github.com/kimymt/epa-aa-balance"
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("Q&A link points to Notion page and opens in new tab", () => {
    render(<Footer />);
    const link = screen.getByText(/Q&A/).closest("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toContain("notion.site");
    expect(link?.getAttribute("target")).toBe("_blank");
    // 「準備中」サフィックスがついていないこと (active 化されている)
    expect(link?.textContent).not.toContain("準備中");
  });
});
