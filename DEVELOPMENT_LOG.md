# 開発履歴: Lightning Tip QRコード機能

## 概要
食事写真解析完了後に表示されるライトニングネットワーク対応のチップQRコード機能を実装。

**期間**: 2026-08-16
**ブランチ**: `feat/lightning-tip-qr` → `fix/lightning-scheme`
**PR**: #65, #66, #67

---

## 経緯・意思決定

### 1. 要件整理
- **表示トリガー**: 解析完了後のみ（価値実感後のチップ動線）
- **見出し**: "開発を支援する" のみ
- **URL**: なし（後でライトニングアドレス追加想定）
- **常時表示**: 不要

### 2. デザイン検討（/design-shotgun で比較）
| 案 | 配置 | 評価 | 採否 |
|----|------|------|------|
| A | ヘッダー直下 | 常時表示要件に合うが価値実感前 | ❌ |
| B | フッター | QR小さい、情報過多 | ❌ |
| C1 | 結果パネル内カード | 到達率不安 | ❌ |
| **C2** | **独立セクション** | **区切り明確、QR大、到達率高** | **✅** |
| C3 | フローティングバー | 常時表示に近い、邪魔 | ❌ |

**採用: C2（独立セクション）**
- 区切り線 + 見出しで「結果」と「支援」を明確分離
- QR 128-160px 確保
- 補助説明スペース十分

---

## 技術実装

### LightningTipLink コンポーネントの進化

#### v1: lnurl: + Webフォールバック（失敗）
```tsx
const LNURL_HREF = `lnurl:${LNURL}`;
const FALLBACK_URL = `https://lnurl.dev/${LNURL}`;
// 1.5秒後に lnurl.dev へリダイレクト
```
**問題**: `lnurl.dev` が DNS 解決不可。Webフォールバック自体をユーザーは望まない。

#### v2: lightning: + lnurl: フォールバック（採用）
```tsx
const LIGHTNING_HREF = `lightning:${LNURL}`;  // Primary
const LNURL_HREF = `lnurl:${LNURL}`;          // Fallback (2秒後)
// Webページを開かない
```
**理由**:
- `lightning:` スキームは主要ウォレット（Alby, BlueWallet, Phoenix, Zeus, Breez 等）で対応
- `lnurl:` は一部拡張・ニッチウォレットで対応
- インストール済みウォレットのみ起動という要件に合致

### 実装コード（最終版）
```tsx
const LNURL = "lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhkwctjvfkx2erpvd6xjmmwxuenvyj4066";
const LIGHTNING_HREF = `lightning:${LNURL}`;
const LNURL_HREF = `lnurl:${LNURL}`;

function LightningTipLink() {
  const handleClick = useCallback((e) => {
    const fallbackTimer = setTimeout(() => {
      if (document.hasFocus() && !document.hidden) {
        window.location.href = LNURL_HREF;
      }
    }, 2000);

    const handleBlur = () => clearTimeout(fallbackTimer);
    window.addEventListener("blur", handleBlur, { once: true });
    document.addEventListener("visibilitychange", handleBlur, { once: true });
  }, []);

  return (
    <a href={LIGHTNING_HREF} aria-label="ライトニングウォレットで支払う" onClick={handleClick} rel="noopener noreferrer">
      <img src="/WoS.png" alt="ライトニングネットワークで支払うQRコード" className="mx-auto h-32 w-32 sm:h-40 sm:w-40" />
    </a>
  );
}
```

---

## ファイル変更

| ファイル | 変更内容 |
|---------|---------|
| `app/page.tsx` | LightningTipLink 実装 + Tip セクション追加 |
| `public/WoS.png` | QRコード画像配置（1000×1000 PNG） |
| `.gitignore` | `.design-preview/` 除外追加 |

---

## 学び・教訓

### 1. LNURL リゾルバーの外部依存リスク
- `lnurl.dev` 等の外部サービスはダウン/消滅リスクあり
- **対策**: `lightning:` / `lnurl:` スキーム直接起動をメインに、Webフォールバックは不要なら削除

### 2. モバイルでのウォレット起動検知
- `blur` + `visibilitychange` イベントでウォレット起動を検知
- タイムアウトは **2秒以上** 推奨（モバイル起動に時間がかかる）
- 完全な検知は不可能だが、実用上十分

### 3. QRコード配置
- `public/` 配下でないと Next.js で静的配信されない（404 になる）
- デプロイ後に `/WoS.png` が 404 になって気づいた

### 4. ブランチ保護ルール
- `main` への直接 push はブランチ保護で拒否される
- **対策**: 機能ブランチ作成 → PR → マージのフローを徹底

---

## 今後の拡張案

| 案 | 内容 | 優先度 |
|----|------|--------|
| 再訪問時フッター表示 | `localStorage.setItem('hasAnalyzed', 'true')` で解析済みユーザーに控えめ表示 | 中 |
| 金額入力 UI | 自前 `/api/lnurl-pay` でメタデータ取得 → 金額指定 → BOLT11 取得 | 低 |
| 複数通貨対応 | BTC建て以外の表示 | 低 |

---

## 関連コマンド

```bash
# 開発
bun dev

# ビルド・テスト
bun run build
bun test

# デプロイフロー
git checkout -b feat/xxx
git add -A && git commit -m "feat: ..."
git push -u origin feat/xxx
gh pr create --title "..." --body "..."
gh pr merge --squash --delete-branch --auto

# 本番確認
curl -sI https://epaaa.mymt.casa
curl -sI https://epaaa.mymt.casa/WoS.png
```

---

## 参考リンク
- 本番: https://epaaa.mymt.casa
- PR #65: 機能追加
- PR #66: 画像配置修正（public/ 移動）
- PR #67: lightning: スキーム採用