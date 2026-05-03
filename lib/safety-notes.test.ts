// lib/safety-notes.ts のユニットテスト
//
// 中央集権された注意事項の整合性を保証する。文言ロジック自体は無いが、
// 「IDが unique」「必要な note が存在する」「文言が空でない」を担保。

import { describe, it, expect } from "bun:test";
import { SAFETY_NOTES, type SafetyNoteKey } from "./safety-notes";

describe("SAFETY_NOTES", () => {
  it("contains required notes (anticoagulant + high-intake)", () => {
    const keys = Object.keys(SAFETY_NOTES) as SafetyNoteKey[];
    expect(keys).toContain("ANTICOAGULANT_CONSULT");
    expect(keys).toContain("HIGH_INTAKE_MAINTENANCE");
  });

  it("each note has id/label/body/category populated", () => {
    for (const note of Object.values(SAFETY_NOTES)) {
      expect(note.id.length).toBeGreaterThan(0);
      expect(note.id).toMatch(/^[a-z_]+$/);
      expect(note.label.length).toBeGreaterThan(0);
      expect(note.body.length).toBeGreaterThan(20); // 内容のある文章
      expect(["bleeding", "allergy", "interaction", "general"]).toContain(
        note.category
      );
    }
  });

  it("note ids are unique", () => {
    const ids = Object.values(SAFETY_NOTES).map((n) => n.id);
    const uniq = new Set(ids);
    expect(uniq.size).toBe(ids.length);
  });

  it("ANTICOAGULANT_CONSULT body mentions key actionable terms", () => {
    const body = SAFETY_NOTES.ANTICOAGULANT_CONSULT.body;
    // 該当者が自分のことだと認識できる単語が入っていること
    expect(body).toContain("抗凝固薬");
    expect(body).toContain("医師");
  });

  it("HIGH_INTAKE_MAINTENANCE message avoids celebration language", () => {
    const body = SAFETY_NOTES.HIGH_INTAKE_MAINTENANCE.body;
    // 称賛表現が無いこと (🏆 / すごい / 達成 / 素晴らしい 等の不在)
    expect(body).not.toContain("🏆");
    expect(body).not.toContain("素晴らし");
    expect(body).not.toContain("すごい");
    // 「維持・継続」のメッセージが含まれること
    expect(body).toMatch(/続け|継続|維持/);
  });
});
