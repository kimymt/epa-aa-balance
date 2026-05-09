# Changelog

All notable changes to this project will be documented in this file.

## [0.8.2] - 2026-05-09 — Passkey 認証 API + 保護ルート helper

E2E 暗号化履歴機能 Phase 1 のサブフェーズ 2: 認証パス。**まだ UI 露出なし**。
登録 (v0.8.1) と認証 (v0.8.2) が揃ったので、これ以降のサブフェーズで
クライアント実装に進める。

### Added
- **API endpoints**:
  - `POST /api/auth/login/start` — discoverable credential を使う認証 options
    生成 + 5min JWT (challenge 保持) 発行。allowCredentials は空のため、
    browser/OS が登録済の Passkey を一覧から選ばせる UI を出す。
    PRF Extension の eval salt は `lib/webauthn.ts` 側で固定値設定済。
  - `POST /api/auth/login/finish` — login token 検証 → response.id で
    `user_credentials` を引いて public_key + counter 取得 → WebAuthn assertion
    検証 (signature / challenge / origin / rpID) → counter 更新 (replay 防止) →
    24h session token 発行。未登録 credential は privacy 配慮で「登録なし」を
    明示せず汎用 401 で返却。
  - `GET /api/auth/me` — 認証済ユーザー確認用の軽量エンドポイント。
    `Authorization: Bearer <session>` で `{ userId }` を返す。v0.8.5 の
    history 表示前 auth 確認 + 保護ルートの reference 実装。
- **`requireSession(req)`** in `lib/jwt.ts`: 保護ルート用ヘルパ。Bearer header
  検証 → success なら `{ session }`、failure なら `{ response: 401 }` を返す
  discriminated union 型。今後 `/api/history` `/api/analyses` 等の保護ルートで
  共通利用。

### Tests
- 267 → **272 pass** / 1 skip / 0 fail (+5 new)
  - `requireSession` × 5: 有効 Bearer / Authorization なし / malformed / 無効 JWT /
    エラー時の Content-Type=application/json
  - login/start, login/finish, me 自体は実認証器なしで E2E テスト不可。
    内部で利用する `verifyLoginToken` `verifyAuthentication` `readBearerSession`
    は既存テストでカバー済 (lib/jwt.test.ts × 14、lib/webauthn.test.ts × 15)

### Background
[F-016 Phase 1 サブフェーズ計画](TODOS.md F-017 セクション参照) に従う。
v0.8.2 単独では UI 露出なし。次フェーズ:
- v0.8.3: クライアント側 AES-GCM 暗号化 lib + PRF 鍵 in-memory 管理
- v0.8.4: 「この記録を残す」CTA + 暗号化保存
- v0.8.5: `/history` page (auth 状態判定 + 復号 + lipidPct bar +
  DietPatternComparison)
- v0.8.6: 削除 / export + プライバシーポリシー更新

### マイグレーション / 環境変数
- D1 schema: 変更なし (v0.8.1 で揃済)
- 新環境変数: なし (`JWT_SECRET` は v0.8.1 で設定済)

## [0.8.1] - 2026-05-09 — 履歴機能の基盤 (Passkey 登録 API + D1 schema)

E2E 暗号化された履歴機能 (Phase 1) のサブフェーズ 1: 登録パスのみ。UI 露出はまだなし。

### Added
- **D1 マイグレーション 0005**: `users` / `user_credentials` / `analyses` /
  `coach_proposals` の 4 テーブル。PII フィールドは無し。
  `analyses.cipher_blob` `coach_proposals.cipher_blob` は AES-GCM 暗号化済み
  base64 を保存する想定 (暗号化レイヤは v0.8.4 で実装)。
  `user_credentials.prf_supported` で PRF Extension 対応 credential か記録。
- **`lib/jwt.ts`**: `jose` ベースの JWT 発行 / 検証。3 種類:
  - 24h session token (`Authorization: Bearer ...` 用)
  - 5min registration token (start → finish の challenge 紐付け)
  - 5min login token (将来 v0.8.2 で利用)
- **`lib/webauthn.ts`**: `@simplewebauthn/server` ラッパ。
  - `deriveRpInfo`: req URL から rpID 動的決定 (preview / local 対応)
  - `buildRegistrationOptions`: PRF Extension (capability 検出) + 匿名 user
    labels で options 生成
  - `buildAuthenticationOptions`: PRF eval (salt = "eaa-scorer/v1/encryption-key"
    の base64url) を組み込み — クライアント側の対称鍵派生用
  - `verifyRegistration` / `verifyAuthentication`: 検証 + counter / PRF 状態返却
  - `toBase64Url` / `fromBase64Url`: D1 TEXT 列向け encode helper
- **API endpoints (registration only)**:
  - `POST /api/auth/register/start` — UUID v7 発行 → registration options +
    5min JWT を返す。D1 にはまだ書き込まない (中断時の孤児行を防ぐ)
  - `POST /api/auth/register/finish` — JWT 検証 + WebAuthn 検証 → user 行 +
    credential 行を D1 に作成 + 24h session token 返却
- **依存追加**: `@simplewebauthn/server@13.3.0`, `@simplewebauthn/browser@13.3.0`,
  `jose@6.2.3`

### Tests
- 238 → **267 pass** / 1 skip / 0 fail (+29 new)
  - `lib/jwt.test.ts` × 14: 各 token roundtrip、issuer 分離、tampering 検出、
    `readBearerSession` の Bearer prefix 互換性
  - `lib/webauthn.test.ts` × 15: rpID 導出 (production / preview / localhost)、
    PRF Extension 注入、anonymous user labels、resident key required、
    base64url roundtrip と URL-safe 文字確認

### 環境変数 (新規)
- `JWT_SECRET` (必須、本番): 32+ 文字のランダム値。`openssl rand -hex 32` で生成。
  Vercel の Production / Preview env に設定する必要あり。dev は fallback あり。

### Background
[F-016 / 履歴機能の Phase 1 実装計画](TODOS.md) に従う。**v0.8.1 単独では UI に
露出しない**。後続フェーズ:
- v0.8.2: 認証 (login) endpoint + JWT middleware
- v0.8.3: クライアント側 AES-GCM 暗号化ライブラリ + PRF 鍵管理
- v0.8.4: 「この記録を残す」CTA + 暗号化保存
- v0.8.5: `/history` page + 復号 + lipidPct bar + DietPatternComparison
- v0.8.6: 削除 / export + プライバシーポリシー更新

### マイグレーション適用方法
本 PR をデプロイした後、ローカルから以下を実行 (production 環境変数が必要):

```bash
bun --env-file=.env.local run scripts/migrate-d1.ts
```

冪等。既に適用済みなら `SKIP` 表示。

## [0.8.0] - 2026-05-09 — AI コーチのレイテンシ短縮 (streaming + skeleton + Tokyo region)

v0.7.0 で出力 token が増えたことによる体感待ち時間 (15-25s) を、4 軸の組合せで
削減・改善。**最初のレシピが ~6-10 秒で読み始められる** ようになり、固定スピナーで
全部待つ体験から、進捗が目に見える体験へ。

### Changed
- **`/api/coach` を NDJSON ストリーミング応答に変更** (v0.4.x → v0.8.0)。
  Gemini の token streaming を [`partial-json`](https://www.npmjs.com/package/partial-json)
  で逐次パースし、Recipe が 1 件確定するたびに 1 行 JSON を client へ送る:
  - `{"type":"recipe","index":0,"recipe":{...}}`
  - `{"type":"complete","retried":false}`
  - `{"type":"error","code":"...","message":"..."}` (ストリーム途中エラーは embed)
  - 早期エラー (rate limit / validation) は従来通り 400/429 JSON
- **`generateCoachRecipesStream(req)`** (新): async generator として export。
  既存の `generateCoachRecipes(req)` は内部で本 generator を畳み込む互換 wrapper
  に refactor (programmatic な「全件揃ってから」用途のため残す)。
- **`isRecipeComplete(r)`** (新): 部分パース結果が Recipe として完結したかの
  type predicate。全 12 必須フィールドを検査。
- **Vercel リージョンを `hnd1` (Tokyo) に変更** (`vercel.json`)。日本ユーザーから
  Gemini API への往復が ~150-300ms 短縮 (iad1 → hnd1)。
- **CoachSection の loading state を再設計**:
  - State shape を `{ kind: "loading" }` → `{ kind: "loading"; partialRecipes: Recipe[]; activeChip }` に拡張
  - 届いた recipe は実 RecipeCard で表示、未到着スロットは新規 `SkeletonRecipeCard`
    (animate-pulse、v0.7.0 RecipeCard と同じ寸法) で表示
  - 進捗カウンタ「N / 3 件 届きました」を chip 名と並べて表示
  - 進捗メッセージを 5 秒ごとにローテーション (材料を選定中... → 手順を組み立て
    中... → コツと安全注意を確認中... → もう少しで完成します...)
- **初期画面の所要時間表示を更新**: 「5〜15 秒ほどかかります」→「1 件目は約 6〜10
  秒で届きます (3 件揃うまで 15〜25 秒)」

### Tests
- 227 → **238 pass** / 1 skip / 0 fail (+11 new)
  - `isRecipeComplete` × 11: 完全形 / null / 各フィールド欠損 / 空配列 /
    no_cook の equipment 空配列許容 / tips/safetyNote 空文字列許容 / mid-stream
    部分オブジェクトを reject

### Background
v0.7.0 で Recipe schema を full-detail に拡張した結果、出力 token が ~2-3x になり
体感待ち時間が伸びた。本 PR は実時間そのものより **perceived latency** に効く
施策をまとめて投入。Gemini の実時間は変えていないが、ストリーミングで
1 件ずつ画面に届くため「最後まで何も見えない 20 秒」が「6 秒で 1 件読み始め
られる体験」に。

### 体感差 (期待)
- 1 件目が読み始められるまで: **20s → ~6-10s** (50-70% 短縮)
- 3 件揃うまで: 15-25s (実時間は概ね同じ、Tokyo region で ~200ms 改善)
- 進捗表示: 固定スピナー → 「N / 3 件届きました」+ ローテーションメッセージで
  「進んでる感」が出る

### Out of scope (将来検討)
- B-1 (3 並列コール、~50% 実時間短縮) — rate limit bucket 設計 + 重複対策が
  必要なため別 PR
- streaming 経路では retry は実装せず (ストリーム中断時の UX が複雑)。fish-only
  filter は wrapper (非streaming) 側に残存。retry 必要性は計測後判断。

## [0.7.0] - 2026-05-09 — レシピを「実装図面」に格上げ (F-015)

ユーザーから「提案の質が高くない」と指摘されていた 3 軸 (入力解像度 / 出力粒度 /
ループ不在) のうち **出力粒度** を本リリースで全面強化。レシピが name + 50-100 字
description だけだった状態から、ingredients / steps / equipment / tips /
safetyNote を伴う「そのまま作れる」粒度へ。

### Added
- **`Ingredient` 型** (新): `{ name, amount }`。amount は日本語料理の表現の幅
  ("190g" / "1 缶" / "大さじ 1" / "1/2 個") を許容する string。
- **Recipe 拡張** (新規 6 フィールド、全て required):
  - `servings: number` (1-4 の整数、人数)
  - `ingredients: Ingredient[]` (3-7 件、最初は主要な魚介)
  - `steps: string[]` (1-5 件、各 30-80 文字。no_cook なら 1-2 件可)
  - `equipment: string[]` (鍋/フライパン/魚焼きグリル等。不要なら空配列)
  - `tips: string` (1 文のコツ、なければ空文字列)
  - `safetyNote: string` (生魚等で必要、それ以外は空文字列)
- **RECIPE_SCHEMA** (Gemini responseSchema) を上記 6 フィールドに合わせて更新。
- **few-shot examples** を full-detail に書き直し: raw / simmered / grilled /
  no_cook の 4 例、それぞれ実際の材料・手順・道具・コツ・安全注意付き。
  Gemini が「鯵のなめろう丼」を出すときに包丁の叩き回数や生食安全注意も
  添えられるように。

### UI
- **`RecipeCard` を expandable に**: 折りたたみ時は従来通り (name + meal/cookTime
  + description) の見た目、底部に "材料 N つ・手順 M ステップ ▾" の affordance。
  タップで全詳細展開、再タップで折りたたむ。
- 展開エリアの構造:
  - 材料 (人数表記つき): 名前と分量を 2 列で
  - 手順 (番号付きリスト)
  - 道具 (空配列なら非表示)
  - コツ (💡 アイコン付き、amber テーマ、空文字列なら非表示)
  - 安全注意 (⚠ アイコン付き、rose テーマ、生魚等で表示)
- `aria-expanded` を button に付与、折りたたみ時のラベルは情報量予告として
  件数を表示することで「タップする価値」を伝える設計 (UX 軸 C1 + 案 3)。

### Tests
- 210 → **227 pass** / 1 skip / 0 fail (+17 new)
  - `RecipeCard.test.tsx` (+11): 折りたたみ初期状態、affordance 件数表示、
    展開で ingredients/steps/equipment 表示、tips/safetyNote の条件付き表示
    (空文字列なら非表示)、aria-expanded toggle、再タップで折りたたみ
  - `lib/coach.test.ts` (+6): description 30-60 文字 / ingredients 3-7 件 /
    steps 1-5 件 ルールの prompt 反映、few-shot に servings/ingredients/steps/
    equipment/safetyNote が含まれていること、no_cook 例の equipment が空配列、
    raw 例の safetyNote に「当日中」が入っていること、closing line に
    全 12 フィールド指示が含まれること

### Background
v0.6.0 で chip 多様性 + cookingMethod 構造化を導入したが、ユーザー実感としては
「依然作れる粒度に達していない」状態 (description 50-100 字では実装図面に届かず、
結局 Google で検索してしまう)。本リリースで **アイデア帳 → 実装図面** の格上げ。

### 体感への効果 (期待)
- ユーザーが「これ作る」と決断できる: 材料の g 量・道具・3-5 ステップが揃い、
  Google 検索なしで作れる
- 期待値設定が UI 上で完結: カードを開く前に「材料 4 つ・手順 3 ステップ」と
  分かるので、忙しい朝には軽量レシピを選べる
- 安全な提案: 生魚レシピには「刺身用 (生食可) と表示のあるものを当日中に」が
  自動付与され、コーチとして責任ある提案になる

### 残課題 (本 PR 範囲外)
- F-014: 入力解像度 (時間帯/人数/在庫食材/予算等の構造化) の追加
- F-016: 提案ループ (作った/保留/スルーの記録 + 履歴注入)
- 出力レイテンシ: 6 フィールド追加で Gemini 出力 ~2-3x、現状 5-15s が
  10-25s 程度になる見込み (Vercel maxDuration 45s 内には収まる)

## [0.6.2] - 2026-05-07 — モバイルで UploadZone の枠が画面幅を超える問題の修正

### Fixed
- `components/UploadZone.tsx` のファイルリストカードで、長いファイル名が
  iOS Safari 等で overflow して body 横スクロールが起き、ドロップゾーンの
  枠まで画面幅より広く見える問題を修正。
  - カード `<div>` に `overflow-hidden` を追加(safety belt)。
  - filename の `truncate` を `break-all` に変更し、長いファイル名は折り返して
    全体を見せる(UX 改善も兼ねる)。

## [0.6.1] - 2026-05-06 — UI 文言修正 (rate-limit 表示 + AI コーチ目標表示)

### Fixed
- レート制限到達時の文言を実装値 (5 req/h/IP, v0.5.5 から) に追従させる。
  `components/CoachSection.tsx` の rate_limited state で「1 時間あたり 10 回」と
  表示していたが実際の上限は 5 回。ユーザーが見える数字とサーバー実装が
  ずれていたのを修正。
- 解析結果画面の AI コーチ開始前の target 表示文言を、達成済みの食習慣を
  肯定するトーンに変更:
  - 「目標: <食習慣>」→「今のあなたより魚を食べていたのは <食習慣>」
  - 「このギャップを埋めるレシピを優先して提案します。」→
    「これからも美味しく魚を食べてください」

## [0.6.0] - 2026-05-07 — AI コーチ提案の品質改善 (chip 多様性 + cookingMethod 制約)

ユーザー実感の 2 件の不満 (「chip 違いで同じメニューが出る」「生魚を頼んでも焼き魚が出る」)
を直接潰す改善。eval 基盤導入は次フェーズに送り、まず体感に効く 4 つの施策をまとめて投入。

### Added
- **`Recipe.cookingMethod` enum** (新フィールド): `raw | grilled | simmered |
  steamed | fried | deep_fried | no_cook`。Gemini が調理法を構造化して返すように
  なり、post-validation で制約違反を検出可能に。`RECIPE_SCHEMA` (responseSchema)
  にも対応する enum を追加。
- **`CHIP_FOOD_CANDIDATES`**: chip ごとに食材候補リストを切り替える機構。
  `convenience_store` → サバ缶/ツナ缶/しらすパック、`kid_friendly` → 鮭/たら/
  はんぺん、`cheap_ingredients` → イワシ/サンマ/サバ缶、等。chip 設定時は
  target section の汎用 4 魚種列挙 (サバ/サンマ/イワシ/鮭) は省略され、
  chip 文脈に合った食材から提案が組まれる。
- **`detectRequestedCookingMethods(text)`**: free-text refinement から「生魚」
  「焼き」「煮」等のキーワードを抽出し、対応する CookingMethod を返す。
  検出された場合、prompt に「【絶対遵守の調理法制約】少なくとも 2 件は
  cookingMethod=raw」のように強い制約として明示注入する。
- **few-shot examples**: prompt 末尾に raw / grilled / simmered / no_cook を
  使い分けた 4 例を JSON で添える。Gemini が調理法と料理名の対応を学習し、
  「生魚→刺身/カルパッチョ/なめろう」を直接マッピングできるようになる。
- **`generateCoachRecipes` の cookingMethod retry**: free-text に調理法
  キーワードがあるのに 1 件も該当しなかった場合、1 回だけ再生成 (既存の
  fish-type retry と統合)。

### Changed
- buildPrompt の「3 件のレシピは…」ルールに「cookingMethod を散らす」を追加。
  同じ method (例: 全部 grilled) に偏ることを抑制。
- target section: chip 指定時は重複・矛盾を避けるため魚種列挙部分を省略。

### Tests
- 196 → **210 pass** / 1 skip / 0 fail (+14 new)
  - `detectRequestedCookingMethods`: 6 テスト (raw/grilled/simmered/steamed/
    fried/deep_fried/no_cook 検出 + 複数同時 + 該当なし)
  - `buildPrompt` 拡張: chip-specific food candidates 表示、generic 4-fish anchor
    の省略、freetext 由来の調理法制約注入、few-shot examples 存在、
    cookingMethod 多様性指示の存在を確認

### Background
v0.5.x までの実装では (a) target section が常にサバ/サンマ/イワシ/鮭の 4 種を
mg 量つきで列挙していたため chip を変えても食材アンカーが共通で収束、(b) Recipe
schema に調理法フィールドが無く free-text 制約 (「生魚で」) が単なる prompt 追記で
post-validation 不能、という 2 つの根本問題があった。本リリースで両方を構造的に
解決する。

### 体感への効果 (期待)
- chip 切替で実食材レベルの差: convenience_store なら缶詰中心、kid_friendly
  なら鮭/たら/はんぺん、と物理的に異なる候補から提案される
- 「生魚で」希望時の遵守率: 70% → 95%+ (few-shot 例 + 明示制約 + retry の
  3 段重ねで)

### 次フェーズ候補 (このリリースには含まない)
- D: eval framework 導入で改善の定量化
- C-1: oversample 6 件 + diversity sort
- session 内 anti-repetition

## [0.5.5] - 2026-05-06 — `/api/coach` レート制限を 10/h → 5/h に引き下げ

### Changed
- **`COACH_RATE_LIMIT` のデフォルト値を 10 → 5** に変更
  ([app/api/coach/route.ts:27](app/api/coach/route.ts:27))。
  チャット AI による提案 (Gemini レシピ生成) の 1 IP あたり 1 時間の上限。
  env var `COACH_RATE_LIMIT` で override 可能 (Vercel 未設定なのでコード値が
  そのまま本番に反映される)。
- README.md の env var 表 + セキュリティ一覧を 5/h に更新。

### Background
方針として AI コール頻度を保守側に寄せる調整。`/api/analyze` は 10/h のまま
(画像解析、平均使用の 2〜3 倍バッファ設計)、`/api/feedback` admin GET は 30/h
で据え置き。

### Tests / Build
- 196 pass / 1 skip / 0 fail (no test hardcoded the previous value)
- `bun run build` ✓

## [0.5.4] - 2026-05-06 — `scripts/ingest-mext-foods.ts` の TypeScript 型強化

### Changed
- **`scripts/ingest-mext-foods.ts` から `any` を全削除** (8 箇所 → 0)。`Food` /
  `FoodsFile` 型を追加し、Excel cell は `unknown` に narrowing、protein_g 削除の
  destructure は `_protein_g` で unused-var rule に対応。
- **`kuromoji.d.ts` を新規追加**: kuromoji は npm 公式 typings 不在のため、
  `scripts/ingest-mext-foods.ts` が使う最小 surface (`builder` / `Tokenizer` /
  `Token`) のみ宣言。これにより `// @ts-ignore` を除去し、`tokenizer.tokenize()`
  の戻り値が `Token[]` として補完・型チェックされるようになった。

### Background
v0.5.3 引き継ぎ時の「未追跡 low-priority debt」項目。本番ランタイムには乗らない
build-time only スクリプトだが、`bun run build` が v0.5.3 で type-check 通過する
ようになり、`any` を残しておく理由がなくなった。

### Tests / Build
- 196 pass / 1 skip / 0 fail (no behavioral change)
- `bun run build` ✓ TypeScript phase passes

## [0.5.3] - 2026-05-06 — browserslist 縮小で legacy polyfill 削除 (-14 KiB JS)

### Changed
- **`package.json` に `browserslist` 追加**: `chrome >= 109` / `firefox >= 115` /
  `safari >= 16.4` / `edge >= 109` (全て 2023 年以降リリースの modern browser)。
  Next.js / SWC のデフォルト targets が古いブラウザを含んでいたため、
  `Array.prototype.at` / `flat` / `flatMap`、`Object.fromEntries` / `hasOwn`、
  `String.prototype.trimStart` / `trimEnd` の polyfill が bundle に混入していた。
  これらは指定ターゲットでは全て baseline-supported なので不要。

### Performance
- **PSI mobile (https://epaaa.mymt.casa) 計測値 (改善前)**:
  Performance 96/100、LCP 0.5s、FCP 0.3s、TBT 10ms、CLS 0.15、Speed Index 0.8s
- PSI Diagnostics: "Legacy JavaScript Est savings of 14 KiB" を解消する施策
- LCP は既に target (<2.0s) を大幅クリアしていたため LCP 自体には効かないが、
  bundle size 削減 (=低速回線環境での体感速度) には寄与する

### Background
F-008 「LCP 2.27s → <2.0s」TODO を再評価。実測 LCP は 0.5s で当初前提が無効、
当初対策 (font-display: swap、画像 preload、critical CSS inline) も全て
Next.js 16 / `next/font/google` のデフォルトで適用済 / 該当なしと判明。
代わりに PSI Diagnostics で実検出された改善余地を data-driven に対応した。

### TODOS.md
- F-008 を Completed セクションへアーカイブ (v0.5.3 で解決の経緯付き)
- 新タスク **F-013: CLS 改善 (0.15 → <0.1)** を追加
  (Web Vitals "Needs Improvement" 圏。font swap 由来の text reflow が主因と推定)

## [0.5.2] - 2026-05-05 — コンポーネントテスト導入 (happy-dom + Testing Library)

### Added
- **テストインフラ**: `happy-dom` + `@testing-library/react` を bun:test に統合
  - `test/setup.ts`: `GlobalRegistrator.register()` で window/document を globalThis に注入
  - `bunfig.toml`: `[test] preload = ["./test/setup.ts"]` で全テスト起動時に DOM 注入
  - `beforeEach` で localStorage + DOM クリア (テスト間状態漏れ防止)
- **17 件のコンポーネントテスト**:
  - `RecipeCard.test.tsx` (4): name/cookTime/mealType/description 各レンダリング
  - `OnboardingCard.test.tsx` (3): 描画 + 安全性注意 + プロキシ性 disclaimer + button type
  - `Footer.test.tsx` (3): branding / GitHub URL / Q&A active link
  - `DietPatternComparison.test.tsx` (8): ヘッダー数値 / 5 パターン名 / マーカー位置 /
    WHO/AHA チップ + 達成判定 / イヌイット時代註記 / null/0 ガード / 6 食 = 2 日換算

### Tests
- 179 → **196 pass** / 1 skip / 0 fail
- 14 → 18 test files

### Background
前 retro で「コンポーネントテスト不在」を growth area として指摘されていた件への対応。
これまで 175 tests 全てが lib/script 層のみ。React 描画ロジックの regression を
catch する仕組みが無かった。

### Design notes
- **OnboardingCard の localStorage state machine** はコンポーネントテストでは
  描画 + 構造のみ検証。状態遷移 (setItem → render → 再 read) の網羅は
  `lib/onboarding.test.ts` 側で行う設計。理由: bun:test + happy-dom + React 19
  useEffect の組み合わせで multi-file 並行実行時に timing 起因で flaky 化する
  ケースを観測したため。`hasSeenOnboarding`/`markOnboardingSeen` の振る舞いは
  lib テストで担保済みなので二重投資せず。

## [0.5.1] - 2026-05-05 — セキュリティヘッダー (CSP + 4 種)

### Security
- **`next.config.ts` で全ルートにセキュリティヘッダーを付与** (defense in depth):
  - **Content-Security-Policy**: default-src 'self' ベース。許可:
    - `script-src 'self' 'unsafe-inline'` (Next.js ハイドレーション)、dev mode のみ `'unsafe-eval'` 追加 (React HMR)
    - `style-src 'self' 'unsafe-inline'` (Tailwind + Next 自動 style)
    - `img-src 'self' data: blob:` (アップロード画像 thumbnail は blob: URL)
    - `frame-src https://www.youtube-nocookie.com` (v0.4.3 フィッシュ啓蒙動画のみ許可)
    - `connect-src 'self'` (API は同一オリジン)
    - `frame-ancestors 'none'` (clickjacking 防止)
    - `object-src 'none'` (Flash/plugin 不要)
  - **X-Frame-Options: DENY** (古いブラウザ向け clickjacking 対策、frame-ancestors と冗長)
  - **X-Content-Type-Options: nosniff** (MIME sniffing 抑止)
  - **Referrer-Policy: strict-origin-when-cross-origin** (外部リンクへ referrer 制限)
  - **Permissions-Policy**: camera/microphone/geolocation/interest-cohort を全 disable

### Why
`/cso` 監査の informational #5 として TODOS.md に記録されていた CSP ヘッダー追加に対応。React のデフォルト XSS 防御のみだった状態に defense-in-depth 層を追加。XSS / clickjacking / MIME sniffing / 不要 API 権限の各リスクを軽減。

### Notes
- 'unsafe-eval' は dev mode のみ (React 開発時の eval 使用に対応)、本番は strict
- 本番デプロイ時 (Vercel) は `NODE_ENV=production` で自動的に 'unsafe-eval' 除外
- 既存機能 (onboarding / upload / coach UI / footer) すべて動作確認済 (localhost dev で console clean)

## [0.5.0] - 2026-05-05 — xlsx → exceljs 置換 (HIGH CVE 解消)

### Security
- **`xlsx@0.18.5` → `exceljs@4.x`** に置換。`scripts/ingest-mext-foods.ts` でのみ
  使用される build-time only スクリプトの hygiene 移行。
- `bun audit` の HIGH 級 CVE 2 件 (Prototype Pollution + ReDoS) を完全解消:
  - Before: `3 vulnerabilities (2 high, 1 moderate)`
  - After: `2 vulnerabilities (0 high, 2 moderate)` ← uuid + postcss、両方
    transitive + build-time のみで実用的影響なし

### Background
xlsx の修正版 (0.19.3+) は SheetJS が npm 配布停止しており CDN 経由のみで実用的に
更新困難だった。exceljs は active maintenance + npm 配布あり + 同等機能 + 同程度の
ファイルサイズで、純粋な代替候補として最有力だった。

### API change
`scripts/ingest-mext-foods.ts` の Excel 読み込み 3 行のみリファクタ:
- 旧: `XLSX.readFile()` + `sheet_to_json({header:1, defval:""})` で 2D 配列取得
- 新: `new ExcelJS.Workbook().xlsx.readFile()` + 手動 `slice(1)` で 2D 配列構築
  (exceljs の `row.values` は 1-indexed、`slice(1)` で xlsx と同じ 0-indexed shape に)
- `_mext_row` 等の既存 row index 参照は壊れない設計

### Tests
- `bun test` → 179 pass / 1 skip / 0 fail (変更なし)
- `bun build scripts/ingest-mext-foods.ts` → 2.13 MB bundle 成功 (型エラーなし)

## [0.4.19] - 2026-05-05 — `/qa-only` 検出 issue 2 件の修正

### Fixed
- **Issue #1 (medium)**: `lib/coach.ts:isGeminiQuotaError` に per-minute throttling
  検出を追加。連続呼び出しで Gemini が per-minute RPM 上限に達した時、SDK が
  `RESOURCE_EXHAUSTED` を含まない異なる文言を返すケースを観測したため検出強化。
  - 追加マッチ: `"rate limit exceeded"`、`"rate_limit_exceeded"`、
    `"requests per minute"`、`"requests per day"`
  - HTTP 429 単独は引き続き除外 (自前 rate limit と区別)
  - 効果: per-minute throttling 時に `LLM_ERROR (500)` ではなく
    `QUOTA_EXCEEDED (503)` を返し、UI が ⏳「本日分が尽きました」誤表示
    する代わりに正しい文脈を出せる
- **Issue #2 (low)**: `OnboardingCard` の dismiss / re-expand ボタンに
  `type="button"` 明示。HTML default の `type="submit"` を排除し、将来 form
  内に配置されても意図しない form submission が発生しないように。

### Tests
- `lib/coach.test.ts` に 4 ケース追加 (rate limit / per-minute / per-day 検出)
- 175 → 179 pass

### Documentation
- `TODOS.md` の v0.5.x backlog から **F-011 (PR #27) と F-012 (PR #28)** を
  Completed セクションに移動。既に shipped 済の項目が backlog に残ったままだった
  cleanup。

## [0.4.18] - 2026-05-04 — 医学的レビュー対応 (用語精緻化 + 安全性数値訂正 + 免責)

### Background
専門家からのレビューで以下の指摘を受け、UI と README の両方で対応:
1. 「魚由来脂質割合」は誤解を招く表現（厳密には LC-PUFA に占める n-3 系比率）
2. 信号機「赤 = 改善推奨」が医学的判定と誤解されるリスク (AA も必須脂肪酸)
3. **「3 g/日 にサバ缶 15 個必要」は誤り** (実際はサバ缶 1 缶 150g で約 3 g 到達)
4. AI コーチ表現が薬機法・医師法の食事療法に近いニュアンス → 免責必須
5. AHA 推奨に年次未併記 (STRENGTH 試験等で慎重見解も出ている)

### Changed (UI / コード)
- **`components/ResultPanel.tsx`**: `SIGNAL_LABEL` を医学判定ニュアンス排除へ
  - 良好 → **魚多めの傾向**
  - 中程度 → **混在傾向**
  - 改善推奨 → **魚少なめの傾向**
  - 集約カード側のラベルも統一、✓ マーク削除（成功印象排除）
- **`components/CoachSection.tsx`**: AI 提案ボタン下に**免責文を追加**
  - 「※ 提案は栄養計算に基づく参考情報です。特定の疾患の予防・診断・治療や、医師・管理栄養士による食事療法を代替するものではありません。」
- **`lib/safety-notes.ts`**: 高摂取時の文言で **「3 g/日 超」→「5 g/日 超」** に修正
  - 3 g は通常食で到達可能（サバ缶 1 缶 150g）なため、出血リスク等で「過剰」とされる目安は EFSA 上限 (5 g/日) ベースに
- **`lib/diet-patterns.ts`**: イヌイット食を **「イヌイット伝統食 (1970 年代以前)」** に変更
  - caption も「現代イヌイット食は欧米化、この値は歴史的な極端値」と補足
- **`lib/recommendations.ts`**: AHA 推奨に年次併記
  - 「AHA 一般推奨 (2002 / 再確認 2017)」「AHA CVD 二次予防 (2017 年版)」
  - tooltip description に STRENGTH 試験 (2020) の慎重見解にも言及
- **`lib/standards.ts`**: `LIPID_RATIO_THRESHOLDS` コメント拡充
  - 指標名の正確な意味を明示（LC-PUFA に占める n-3 系比）
  - 信号機ラベルが「描写的」であって医学判定ではないことを明示

### Changed (README)
- ヒーロー: テストバッジ削除（テスト数 ≠ 品質）、Vercel URL 削除（独自ドメインのみ）
- 主指標セクション: 名称併記（魚指標 / フィッシュ・インデックス）+ 「描写的ラベル」表現 + 「医学判定ではない」注記
- 食習慣比較: イヌイットに時代註記
- WHO/AHA セクション: 年次併記 + STRENGTH 試験注記
- AI コーチセクション: 免責文を追加
- 安全性セクション: **サバ缶誤記を修正**（1 缶 150g で約 3 g 到達と正しく記述）

### Why
ユーザーが UI で見る情報と README で説明される情報の整合性を保ち、医学的に
誠実なプロダクトとしての立ち位置を明確にする。健康系プロダクトで誤った数値や
過度な医学判定ニュアンスが残ると、ユーザー判断を誤らせるリスクがある。

## [0.4.16] - 2026-05-04 — 安全性注意事項の中央集権 + 過剰称賛メッセージ修正

### Added
- **`lib/safety-notes.ts`** 新規: 安全性注意事項の単一情報源 (single source of truth)
  - `ANTICOAGULANT_CONSULT`: 抗凝固薬・抗血小板剤服用者・手術予定者向けの相談推奨
  - `HIGH_INTAKE_MAINTENANCE`: 高摂取到達時の「維持が大事」メッセージ
  - 出典コメント付き (AHA 2002/2017, EFSA 2012, REDUCE-IT, Cochrane 2018)
- **`lib/safety-notes.test.ts`**: 5 ケース（整合性 + 文言禁則チェック）

### Changed
- **OnboardingCard に注意書き 1 行追加**: 抗凝固薬服用者・手術予定者向けの医師
  相談推奨 (amber 枠で「わかった」ボタン直前に配置、dismiss 前に必ず目に入る)
- **DietPatternComparison「全パターン超え」メッセージを書き換え**:
  - 旧: `🏆 全パターンを超えました！EPA+DHA 摂取量がイヌイット伝統食水準です。`
  - 新: `ℹ 食事からの EPA+DHA 摂取が高水準に達しています。これ以上の上乗せは
    不要で、ここから先は量より「この食習慣を続けること」が大事です。サプリメント
    等で 3 g/日を超える継続摂取がある場合は医師にご相談ください。`
  - 称賛 (🏆) → 中立的な情報通告 (ℹ)
  - emerald (祝賀色) → amber (注意喚起色)
  - 「目指せ Inuit」感を排除、行動方針 (「維持」) を明示

### Why
v0.4.15 で公開した Q&A 集の作成過程で、LLM 生成回答に「3 g/日を超える継続摂取で
出血傾向リスク」という古い説に基づく誤情報が含まれていた問題が判明。

科学的事実関係を再調査:
- AHA 2002/2017: 〜3-4 g/日で出血リスク増加なし
- EFSA 2012: 最大 5 g/日まで安全性懸念なし
- REDUCE-IT 試験 (2018): 4 g/日 × 5 年で major bleeding なし (vs placebo)
- Cochrane Review 2018 (79 RCTs): 出血イベントに有意差なし
- 食事だけで 3 g 超は現実的に困難 (サバ缶 1 個で約 200 mg、15 個分必要)

→ アプリ側は (1) 該当者 (抗凝固薬服用者等) には情報通告、(2) 一般ユーザーには
fear-mongering せず、(3) 過剰摂取を称賛しない、の方針で修正。

Q&A 側の文言修正はユーザー側で対応。

## [0.4.15] - 2026-05-04 — Q&A リンク active 化

### Changed
- `components/Footer.tsx`: Q&A リンクの URL を確定値 (Notion ページ) に更新。
  `QA_URL_PLACEHOLDER` 判定が自動で false になり、active リンク化される設計
  どおりの挙動。「（準備中）」サフィックス消去、target=_blank 等が付与される。
- `QA_URL` の型を `string` にウィデン (literal type narrowing で TS comparison
  error 回避、将来 placeholder に戻す可能性も担保)。

## [0.4.14] - 2026-05-04 — グローバルフッター（GitHub + Q&A リンク）

### Added
- **`components/Footer.tsx`** 新規: ページ最下部のグローバルフッター
  - 左: 「EPA/AAバランス」ブランディングテキスト
  - 右: GitHub リポジトリリンク（公式 Octocat SVG アイコン付き、新規タブで開く）
  - 右: Q&A リンク（**URL 未確定のため一時的に「準備中」状態**、グレーアウト + cursor-not-allowed）
- `app/layout.tsx` の body 末尾に `<Footer />` を配置（`mt-auto` で sticky bottom）
- `min-h-full flex flex-col` の既存 body スタイルが効いて、コンテンツが少ないページでも常に viewport 最下部に貼り付く

### TODO
- Q&A の URL が確定したら `components/Footer.tsx:11` の `QA_URL` 定数を更新
  - 現状 `"#"` プレースホルダ → `QA_URL_PLACEHOLDER` 判定で「準備中」表示
  - 確定後は自動的に通常リンク化（target="_blank" + rel + active styling）

## [0.4.13] - 2026-05-04 — WHO/AHA 公的推奨値の達成バッジ（#17）

### Added
- **`lib/recommendations.ts`** 新規: 国際的な公的推奨値 3 段階を定義
  - WHO 一般推奨: 250 mg/日（FAO/WHO 2010 専門家委員会）
  - AHA 一般推奨: 500 mg/日（週 2 回の oily fish 相当）
  - AHA CVD 二次予防: 1000 mg/日（心血管疾患既往者向け）
  - 各エントリに**出典付き description**（ホバーで tooltip 表示）
- **`evaluateAchievements(userMgPerDay)`**: 全推奨値との照合結果を返すヘルパ
- **DietPatternComparison ヘッダーに達成チップ追加**:
  - 達成: emerald + ✓
  - 未達: slate + ○ + 進捗 % 表示
  - 各チップに mg/日 閾値表示
- **`lib/recommendations.test.ts`**: 9 ケース（整合性 4 + 達成判定 5）

### Documentation
- `lib/standards.ts` の `LIPID_RATIO_THRESHOLDS` コメントを大幅拡充:
  - 30%/15% 閾値は「魚に偏ってるか」を直感把握するヒューリスティック
  - 血中 EPA/AA 比への直接マッピングは存在しない（AA は内因性合成支配）
  - 心血管疾患リスク低減で確立しているのは絶対摂取量ベース推奨
  - したがって UI は両指標を併記する設計（lipidPct + WHO/AHA 達成度）
  - 出典は `lib/recommendations.ts` 参照

### Why
これまで lipidPct 閾値（30%/15%）には「暫定値、エビデンス再評価は v0.4.0 で」と
明記しつつも、再評価そのものが宙に浮いていた。今回の対応:

1. **lipidPct 閾値は維持** — ヒューリスティックとして残す価値あり、変更で既存
   ユーザーが混乱
2. **絶対 mg/日 のエビデンス anchor を別系統で導入** — WHO/AHA 達成バッジで
   科学的に強い anchor を可視化
3. **科学的位置付けをコードコメントで明文化** — 将来の貢献者・ユーザーから
   「なぜ 30% なのか」と問われても答えられる状態に

これで「ratio = 食事傾向把握」「mg = エビデンスベース判定」の二系統で食事を評価
できる。/design-consultation の Step 1 オンボーディングで開示したプロキシ性とも整合。

## [0.4.12] - 2026-05-04 — 個別食事カードに画像サムネイル表示（F-012）

### Added
- **MealResultCard 上部にアップロード画像のサムネイル表示** (`object-cover` で 128px 高)
  - `URL.createObjectURL` でブラウザ内 URL を生成、`useEffect` cleanup で確実に
    `URL.revokeObjectURL` を呼ぶ → メモリリーク防止
  - `lazy` 属性で初期描画コスト最小化
  - `file` prop 未提供時は section 自体省略（後方互換）
- ResultPanel 経由で `app/page.tsx` の `files` state がカードまで伝搬

### Why (フィードバック精度向上)
従来は結果ページで「正確 ✓ / 誤り - 修正」フィードバックを押すとき、ユーザーは
「どの写真の判定だったか」を記憶頼りで判断する必要があった。サムネイル併記で
**Vision の食材識別が合っているかを目視で即判断**できるようになり、フィードバック
の質が上がる → 将来の Vision プロンプトチューニング・食材 DB 改善の根拠データに直結。

副次効果として「自分の食事」感が出てエンゲージメント向上。

### Background
v0.4.7 `/design-review` 監査時の本番動作確認でユーザーから直接挙がった要望
（PR #23 で TODOS.md に F-012 として記録済み）。

## [0.4.11] - 2026-05-04 — 判定不能カード高さ問題（F-011）

### Fixed
- 個別の食事結果グリッドに `items-start` を追加。CSS grid デフォルトの
  `align-items: stretch` だと、判定不能カード（signal=unknown、内訳セクション空）
  も他カードと同じ高さに引き伸ばされ、不自然な余白が出ていた。各カードを自然な
  高さで並べることで、データ量の差がそのまま視覚的軽重に反映される。
- `/design-review` 監査時のユーザー実機フィードバックから検出した F-011 に対応。

## [0.4.10] - 2026-05-04 — AI コーチ目標食習慣連動（WOW 体験 Step 3/3 完）

### Added
- **`CoachRequest.target`** 新フィールド: 目標食習慣 (`patternName`) と
  不足量 (`gapMg`) を Gemini に渡すため。
- **`buildPrompt` 強化**: target が設定されていれば prompt に「【目標食習慣】」
  セクションを追加。「あと +N mg/日」明示 + 高 EPA+DHA 食材 (サバ ~1500mg/100g
  等) のヒントを Gemini に与え、ギャップを埋める設計のレシピを優先誘導。
- **`CoachSection` で目標自動算出**: `findPatternPosition` + `dailyAverageMg`
  を用いて、ユーザー現在地の「次の食習慣パターン」を自動でターゲットに設定。
  - 全パターン超え or データ無しなら target=undefined（prompt にセクション出さない）
- **UI 表示**: 「AI に提案してもらう」ボタン上部に sky-blue のチップで
  「目標: 地中海食 (あと +120 mg/日)」を inline 表示。ユーザーが事前に
  「何を目指すレシピが返ってくるか」を把握できる。

### Changed
- `validateCoachBody` に target validation 追加:
  - patternName: string、1-50 文字
  - gapMg: 数値、0 以上、有限
- `ResultPanel` から `CoachSection` への props に `mealsWithData` を追加。

### Tests
- `lib/coach.test.ts`: 11 ケース追加（target validation 6 + prompt 強化 5）
- 149 → 160 pass

### Background
WOW ファクター追求 3 ステップ計画の **Step 3 (完)**:
- ✅ Step 1 (#24): オンボーディング（プロキシ性開示）
- ✅ Step 2 (#25): 食パターン比較ビジュアル
- ✅ Step 3 (本 PR): AI コーチが目標食習慣を理解してレシピ提案

### User flow (3 ステップ完成形)
1. 初回訪問 → オンボーディングカードで「EPA/DHA とは何か」+「食事比率は血液
   検査の代用ではない」を理解
2. 食事写真アップロード → 結果ページで「あなたは標準的アメリカ食と地中海食の
   間です」と現在地を把握
3. 「AI に提案してもらう」ボタン → 「地中海食まであと +120 mg/日」のギャップを
   埋める具体的レシピを 3 件取得 → 行動変容トリガー

## [0.4.9] - 2026-05-04 — 食習慣パターン比較ビジュアル（WOW 体験 Step 2/3）

### Added
- **`components/DietPatternComparison.tsx`**: 結果ページの aggregate カード下、
  AI コーチセクション上に配置される新セクション。
  - 「あなたの食事の魚由来脂質割合」+「EPA+DHA 摂取量 X.XX g（平均 YYY mg/日）」
    のヘッダー
  - 5 つの代表的食習慣を mg/日 昇順に縦リスト表示:
    1. 標準的アメリカ食 (150 mg/日) — 魚は週 1 回未満
    2. 地中海食 (600 mg/日) — 週 2-3 回の魚介、オリーブオイル中心
    3. 日本伝統食 (1,200 mg/日) — 青魚を週 3-4 回（戦後〜70 年代の標準）
    4. ノルウェー食 (1,700 mg/日) — 鮭・鯖中心 + 肝油サプリ普及
    5. イヌイット伝統食 (14,000 mg/日) — アザラシ・クジラの脂で 90%+ 魚介由来
  - ユーザーの daily 平均値を「あなたはここ 👉」マーカーで inline 挿入
  - 超えたパターンには ✓、次のパターンには「あと +N mg」表示
  - フッターに具体食材アクション (例: "サバ缶 1 つ追加で届きます")
- **`lib/diet-patterns.ts`**: 5 パターンデータ + ヘルパ関数
  - `findPatternPosition(userDailyMg)`: ユーザー位置を計算
  - `dailyAverageMg(totalMg, mealsCount)`: **3 食 = 1 日**として日次平均を算出
- **`lib/diet-patterns.test.ts`**: 17 ケース（パターン整合性 4 + 位置計算 6 + 日換算 7）

### UX
- ユーザーがアップロードした食数から自動で 1 日換算（3 食 = 1 日）
  - 3 食 → daily = total
  - 6 食 → daily = total / 2
  - 1 食 → daily = total × 3
- カード状態色:
  - 超えたパターン: emerald 系（達成感）
  - 次のパターン: sky 系（目標）
  - その他: slate 系（ニュートラル）
  - ユーザーマーカー: amber 系 + 点線ボーダー（注目）

### Background
WOW ファクター追求 3 ステップ計画の **Step 2**:
- ✅ Step 1 (PR #24): オンボーディング（プロキシ性開示）
- ✅ Step 2 (本 PR): 食パターン比較ビジュアル
- 🔲 Step 3 (次 PR): AI コーチ強化（目標食パターンに近づける提案）

### Note on data sources
比較値は集団平均の代表値で、個人差・調査時期・調理法等で 2-3 倍ぶれます。
クリニカルな絶対値ではなく、文化的アンカーで自分の位置を直感把握させる WOW 装置と
位置付けています。プロキシ性は v0.4.8 オンボーディングカードで開示済み。

## [0.4.8] - 2026-05-04 — オンボーディングカード（プロキシ性の透明開示）

### Added
- **`components/OnboardingCard.tsx`**: 初回訪問ユーザー向けの説明カード。
  - **EPA・DHA の心血管健康への寄与**を簡潔に説明（強いエビデンス領域に絞る）
  - **食事比率は血液検査の代用ではない**ことを明示（プロキシ性を honesty 開示）
  - EPA・DHA / AA の食材源（青魚 / 肉・卵・乳製品）も併記
- **`lib/onboarding.ts`**: localStorage ベースの初回 / リピート判定ヘルパ
  - `hasSeenOnboarding()`, `markOnboardingSeen()`, `resetOnboardingState()`
  - SSR セーフ（`typeof window === "undefined"` ガード + try/catch）
  - キーは `"eaa-onboarding-seen-v1"` — `-v1` suffix で将来 bump 可能
- **`lib/onboarding.test.ts`**: 6 ケース（in-memory localStorage polyfill 使用）

### UX
- ホーム画面のヘッダー直下、UploadZone の上に配置
- **初回訪問**: 完全展開（sky-blue 背景 + 本文 + bullet list + dismiss ボタン）
- **リピート訪問**: 1 行に折りたたみ（「🐟 EPA/AA バランスとは？ （クリックで展開）」）
- 折りたたみ ⇄ 再展開はトグル。再展開しても localStorage は更新しない
  （「読み返しただけ」と「再 dismiss」を区別する設計）
- 結果ページでは表示しない（情報過多回避）
- SSR 対策: mounted flag で hydration mismatch 回避

### Background
`/design-review` 由来の F-001 (home 60% 空白) と F-003 (what's next preview)
の議論から派生。WOW ファクター追求のための 3 ステップ計画 Step 1 として実装:
- **Step 1 (本 PR)**: オンボーディング — プロキシ性の透明開示 + EPA/DHA 基礎説明
- Step 2 (次 PR): 食パターン比較ビジュアル（5 パターン: 米国 / 地中海 / 日本 / ノルウェー / イヌイット）
- Step 3 (3 つめ PR): AI コーチ強化（目標食パターンに近づける提案）

## [0.4.7] - 2026-05-03 — /design-review クイックウィン

### Changed
- **F-002**: シグナルラベル（良好/中程度/改善推奨/判定不能）を **チップスタイル**に変更
  - 旧: `bg-{color}-500 + rounded-full + text-white` = ボタン状ピル
  - 新: `bg-{color}-50 + text-{color}-700 + border + rounded-md` = ステータスチップ
  - 「改善推奨」が clickable CTA に見える false affordance を解消
  - 4 色（green/yellow/red/unknown）すべてに dark mode 対応
- **F-007**: 結果ページの「別の写真で試す」リセットボタンを可視化
  - 旧: outline-only border + text-sm
  - 新: subtle filled (bg-slate-100) + text-base + 矢印サフィックス
  - スクロール後の見落とし軽減

### Accessibility
- **F-004**: 「個別の食事結果」を `<div>` から `<h2>` へ昇格（セマンティック構造）
- **F-006**: 判定方法フッターのコントラスト改善
  - text-xs (12px) text-slate-500 → text-sm (14px) text-slate-600
  - WCAG コントラスト要件への準拠を強化

### Background
`/design-review` 監査結果より、CSS-only の最小リスク 4 件をまとめて修正。
スコア: B− → B（推定、再監査で最終確認予定）。
保留した HIGH 級項目（home page 60% empty space, "what's next" preview,
🍱 emoji ブランディング）は別 PR / design-consultation 案件として TODOS.md 記録。

## [0.4.6] - 2026-05-03 — セキュリティ hardening パッケージ (/cso 監査 informational 対応)

### Security
- **Constant-time credential comparison** (`lib/timing-safe.ts` 新規):
  - `lib/auth.ts:28` の Basic Auth 比較を `!==` → `constantTimeStringEqual` に変更
  - `app/api/feedback/route.ts:81` の admin token 比較も同様
  - 内部で Node 標準 `crypto.timingSafeEqual` を使用
  - 実害は理論的だがセキュリティ慣習に準拠
- **`/api/feedback` GET (admin) endpoint に rate limit を追加**:
  - デフォルト **30 req/h/IP**、`FEEDBACK_ADMIN_RATE_LIMIT` env で変更可
  - `request_log` テーブルに `endpoint = "/api/feedback-admin"` で記録（POST と区別）
  - 401 連発（brute-force 試行）も telemetry で可視化される
  - 超過時 429 + `Retry-After`

### Documentation
- `scripts/ingest-mext-foods.ts` のヘッダに xlsx CVE の **受容根拠**を明記:
  - xlsx@0.18.5 には HIGH 級 CVE 2 件存在
  - 修正版 (0.19.3+) は SheetJS が npm 配布停止、CDN のみ
  - 本プロジェクトでは devDep + build-only + 信頼入力 (MEXT) のみで実害ゼロと判断、受容
  - 将来的な exceljs 置換は TODOS.md に記録
- `.env.example` に `FEEDBACK_ADMIN_RATE_LIMIT` を追記

### Tests
- `lib/timing-safe.test.ts` 5 ケース新規（同一/異長/UTF-8/トークン形式）
- 121 → 126 pass

## [0.4.5] - 2026-05-03 — `/api/analyze` レート制限 + 環境変数ドキュメント整備

### Security
- **`/api/analyze` に D1 ベースのレート制限を追加**（`/cso` 監査の Finding 1 対応）。
  デフォルト 10 req/h/IP、`ANALYZE_RATE_LIMIT` env で変更可。1 リクエストで最大 9 並列
  Vision 呼び出しが走るため、未保護のままだと攻撃者が 1 IP で free-tier quota を
  数分で枯渇可能だった。
- 制限超過時は **429 + Retry-After** ヘッダ。telemetry は `request_log` テーブルに
  全リクエスト記録（v0.4.2 と同パターン、同テーブル共有）。
- D1 環境変数が無い環境（local dev）では rate limit を自動 disable。

### Added
- `.env.example` に `IP_HASH_SECRET`, `COACH_RATE_LIMIT`, `ANALYZE_RATE_LIMIT` を
  ドキュメント化。新規 contributor が rate limit / IP hash の存在を発見可能に。

### Background
v0.4.2 で `/api/coach` のみ守ったが、`/cso --infra` 監査で「`/api/analyze` の方が
9 倍重い」ことが判明。同 D1 テーブル `request_log` を共有することでマイグレーション不要、
コード変更のみでデプロイ可能。

## [0.4.4] - 2026-05-03 — Gemini モデル変更 (flash → flash-lite)

### Changed
- `lib/coach.ts` の `MODEL` を `gemini-2.5-flash` → `gemini-2.5-flash-lite` に変更。
  無料枠が **20 req/day → 1000 req/day** と 50 倍になり、実用的な運用が可能に。
- レシピ提案は 3 件 × 5 フィールドの構造化出力なので、lite モデルで品質は十分と判断。

### Background
v0.4.0-alpha のリリース直後、ローカル + 本番でテストを重ねて Gemini 2.5 Flash の
無料枠 20 req/day にすぐ到達。v0.4.3 で QUOTA_EXCEEDED 専用 UI を入れて
ユーザー体験は守ったが、根本的に枠が足りないので lite に切り替え。

## [0.4.3] - 2026-05-03 — エラー文言の細分化（魚啓蒙動画 + Gemini quota 専用 UI）

### Added
- **429 (自前 rate limit) 専用 UI**: `/api/coach` で 1 IP / 1 時間 10 回の上限に
  到達したとき、汎用エラー画面ではなく「魚を好きになれるよう、この洗脳動画を
  ご覧ください」という啓蒙メッセージと YouTube 動画 (youtube-nocookie 埋め込み)
  を表示。「上限に達するまで提案を求めるユーザーは、まだ魚を食べる意識が育って
  いない」という仮説に基づく啓蒙体験。
- **503 (Gemini quota 超過) 専用 UI**: Google Gemini API の本日の無料枠
  (gemini-2.5-flash は 20 req/day と非常に厳しい) に到達したとき、
  「本日分の AI 提案枠が尽きました。明日まで待つかしばらく時間を置いてください」
  と明示。アプリ側の問題ではなく Google 側の問題であることをユーザーに明確化。
- `lib/coach.ts` に `isGeminiQuotaError(message)` ヘルパ。SDK エラー文の
  `RESOURCE_EXHAUSTED` / `quota exceeded` / `exceeded your current quota` を検出。
  HTTP 429 単独では検出しない（自前 rate limit と紛らわしい）。
- `lib/coach.test.ts` に 8 ケース追加（quota 検出 5 + getCoachErrorCode 3）。

### Changed
- `CoachError.code` に `"RATE_LIMITED"` と `"QUOTA_EXCEEDED"` を追加
  （既存 INVALID_REQUEST / LLM_ERROR / TIMEOUT に加えて）。
- `app/api/coach/route.ts` の 429 レスポンスは `code: "RATE_LIMITED"` を返す。
- `app/api/coach/route.ts` の Gemini quota 検出時は **HTTP 503** + `code: "QUOTA_EXCEEDED"`
  を返す（自前 429 と区別、上流 API 不調の意味）。
- `components/CoachSection.tsx` に新 state `rate_limited` と `quota_exceeded` を追加。
  status / code どちらでも判定可能。
- `getCoachErrorCode` の戻り値型に `"QUOTA_EXCEEDED"` を追加。

## [0.4.2] - 2026-05-03 — レート制限 + リクエスト telemetry

### Added
- D1 ベースのレート制限を `/api/coach` に実装。1 IP / 1 時間で
  `COACH_RATE_LIMIT`（デフォルト 10）回まで。超過時は 429 + `Retry-After` ヘッダ。
- `request_log` テーブル (`migrations/0004_add_request_log.sql`)。全リクエストの
  endpoint / IP ハッシュ / status / timestamp を記録（429 含む）。
  telemetry first 設計 — abuse パターンを後で集計可能。
- `lib/d1.ts`: `d1Query`/`firstRow` を共有モジュールに抽出
  （`app/api/feedback/route.ts` から重複削除）。
- `lib/rate-limit.ts`: `getClientIp`, `hashIp`（SHA-256 + secret）,
  `checkRateLimit`, `logRequest`。
- `lib/rate-limit.test.ts`: 12 ケース（IP 抽出 6、ハッシュ決定性 6）。

### Security / Privacy
- IP は SHA-256 + `IP_HASH_SECRET`（環境変数）で 16 hex にハッシュ化して保存。
  生 IP は永続化しない。
- D1 環境変数が無い環境（local dev）では rate limit を自動 disable。

### Migration Notes
v0.4.2 デプロイ時、D1 マイグレーション実行が必須:
```bash
bun --env-file=.env.local run scripts/migrate-d1.ts
```
冪等。0003 がスキップ、0004 が APPLY される。

## [0.4.1] - 2026-05-03 — クリーンアップ

### Removed
- 後方互換 alias `ProteinCategory`（`lib/standards.ts`）を削除。v0.3.7 で
  `FoodCategory` にリネーム後、参照ゼロを確認した上で完全撤去。
  新コードは `FoodCategory` を使用すること。

## [0.3.0] - 2026-05-03 — 脂質ベース計算移行

### ⚠ 破壊的変更
- **スコア計算が「魚タンパク質割合」から「魚由来脂質割合」に変更されました。**
  v0.2.0 と v0.3.0 でスコアの数値が異なります（同じ食事でも別の値）。
- API レスポンス: 旧 `fishProteinPct`, `proteinByCategory`, `totalProteinG`,
  `proteinCoverage`, `insufficientData` フィールド削除。
  新 `lipidPct`, `lipidRatio`, `epaMg`, `dhaMg`, `aaMg`, `lipidCoverage` 追加。
- 信号機 (`light`) に `"unknown"` 値追加（データ不足時、グレー表示）。

### Added
- 食材データベース (`data/foods.json`) の全 57 品目に脂肪酸成分追加
  (`epa_mg`, `dha_mg`, `aa_mg`, `total_lipid_g`)。
  データソース: MEXT 食品成分表 脂肪酸成分表編 2020 (可食部100g当たり)。
- 脂質ベース計算ロジック (`lib/scoring.ts` の `computeLipidScore`):
  - **lipidPct** = (EPA + DHA) / (EPA + DHA + AA) × 100 (share form, 主表示)
  - **lipidRatio** = (EPA + DHA) / AA (true ratio, 内部 + API)
  - **epaMg / dhaMg / aaMg** 集計値
  - **lipidCoverage** mass-weighted 信頼度
- 暫定信号機閾値: 緑 ≥30%、黄 15-29%、赤 <15%。エビデンス再評価は v0.4.0。
- データ不足ハンドリング: 全食材の脂肪酸データが null なら `signal="unknown"`、
  UI でグレー表示。
- D1 マイグレーションランナー (`scripts/migrate-d1.ts`):
  REST API ベース、PRAGMA による冪等性チェック。
- D1 feedback テーブルに `calculation_version` 列追加 (`migrations/0003_*.sql`):
  v0.2.0 レコード = `version=1`、v0.3.0+ = `version=2`。
- 新規コンポーネント `LipidSourceBar.tsx`: EPA/DHA/AA を色分けスタックドバー表示。

### Changed
- 信号機ラベル変更:
  - 旧 「魚タンパク中心」「やや魚少なめ」「魚不足」
  - 新 「魚由来 多め」「魚由来 やや少なめ」「魚由来 少ない」「判定不能」
- 結果カードの内訳表示: タンパク質 g 単位 → EPA/DHA/AA mg 単位 + (EPA+DHA)/AA 比。
- 集約表示 (複数食事) に EPA/DHA/AA 合計値追加。
- 説明文 (フッター) の判定方法解説を脂質ベースに刷新。

### Removed
- `lib/scoring.ts` の旧 `computeLight()` (タンパク質ベース)。
- `lib/standards.ts` の `FISH_RATIO_THRESHOLDS`, `MIN_TOTAL_PROTEIN_G`, `COVERAGE_THRESHOLD`。
- `lib/lipid-scoring.ts` ファイル (内容を `lib/scoring.ts` に統合)。
- `components/ProteinSourceBar.tsx` (`LipidSourceBar.tsx` で置換)。
- `lib/scoring.test.ts` (旧 protein テスト、新規 lipid テストで置換)。

### Migration Notes
v0.2.0 から v0.3.0 へのデプロイ時、D1 マイグレーション実行が必須:
```bash
bun --env-file=.env.local run scripts/migrate-d1.ts
```
冪等なので既に適用済みなら SKIP される。

### Known Issues / 暫定事項
- 閾値 30%/15% は暫定値。「魚中心 80% が緑」検証で設定したが、
  WHO/AHA mg/日推奨値ベースの再評価は v0.4.0 で実施予定。
- 食材 DB は 57 品目のみ。MEXT 1,900 品目への拡張は v0.3.1 で予定。
- `feature-flags.ts` は dead code として残存。次回 cleanup PR で削除予定。

### Deferred to v0.4.0
- AI コーチング・レシピ提案機能（旧 v0.3.0 設計、脂質ベース完了後に着手）
- 設計ドキュメント: `~/.gstack/projects/kimymt-epa-aa-balance/likemike-main-design-20260502-145712.md`
- プロトタイプ: `designs/coach-section-20260502/finalized.html`
- 文化圏比較機能（イヌイット食、地中海食 vs ユーザー）
- WHO/AHA エビデンスベース閾値

---

## [0.2.0] - 2026-05-02 [LOCKED & RELEASED]

### Added
- Vision API accuracy feedback on each meal result card (正確 / 誤り-修正 buttons).
  Users can confirm predictions or submit corrections with the actual food list.
- `/admin` dashboard (token-gated) showing total feedback, accuracy %, per-meal-type
  breakdown, and recent 20 corrections with original predictions.
- HTTP Basic Auth on `/admin` route via Next.js 16 proxy. Browser shows native
  password dialog before page HTML is served.
- Cloudflare D1 storage for feedback (eaa-scorer-feedback, APAC region) accessed
  via REST API from Vercel. Indexed on meal_type, accurate, created_at.
- Unit tests for Basic Auth check (9 cases) and feedback validation (12 cases).

### Changed
- `MealAnalysis.foods` type corrected from `string[]` to `VisionFood[]` to match
  what the analyzer actually returns ({name, grams} objects).
- POST `/api/feedback` now validates the request body in a dedicated module
  (`lib/feedback-validation.ts`) — rejects unknown meal types with 400 instead of
  silently passing through.
- `/admin` page reverts to thank-you confirmation after feedback submit instead
  of showing the buttons again immediately.
