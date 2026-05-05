# TODOS

## v0.5.x Design backlog (/design-review 由来)

### F-001: ホーム画面の空白 60% を埋める「what's next」コンテンツ
**What:** 初期状態のホーム画面、アップロードゾーン下に画面の 60% が空白で
"is this all?" 感を生む。サンプル結果プレビュー / FAQ / 「アップロード後にこんな
分析が見られる」例を入れる。
**Why:** First Impression が "MVP 感" になる主因。Goodwill 60/100 の主因。
**Effort:** デザイン要検討 (sample data + レイアウト)、〜2-4h。
**Trigger:** /design-consultation で仕様化してから実装。

### F-003: アップロード前の「何が得られるか」プレビュー
**What:** F-001 とセット。"あなたが得られる結果はこれです" という 1 食分の
サンプル結果カードを home に inline 表示。
**Why:** 初見ユーザーが「魚由来脂質って何？それで何が分かる？」を試さずに把握できる。
**Trigger:** F-001 と同時。

### F-005: 🍱 絵文字をブランディング要素に置換
**What:** ホーム + after-upload の bento 🍱 を、科学的雰囲気にあう SVG icon
（魚アイコン or 食材分析アイコン）に置換。
**Why:** 現状は generic、ブランド identity ゼロ。EPA/AA 科学アプリらしさを欠く。
**Effort:** SVG icon 選定 + 配色合わせ、〜1h。
**Trigger:** ブランドアイデンティティ方針が決まってから。

### F-008: LCP 改善 (2.27s → <2.0s)
**What:** font-display: swap、画像 preload、critical CSS inlining。
**Effort:** Next.js 16 の最適化機能で 30 分。
**Trigger:** 実ユーザーから遅さの指摘があったとき。

### F-009: スピナーをブランド化
**What:** 解析中の generic 円形ボーダースピナーを on-brand なアニメーション
（例: 魚泳ぎ、もしくはタイポグラフィベース）に。
**Effort:** 1-2h、要デザイン検討。
**Trigger:** brand identity 確立後。

### F-010: After-upload state でアップロードゾーンを縮小
**What:** 写真追加後はアップロードゾーンを「+ 追加」アイコンボタンに collapse、
垂直スペース節約。
**Effort:** 30 分、CSS state toggling。
**Trigger:** モバイル UX 改善の優先度が上がったとき。

---

## ✅ Completed (アーカイブ — 履歴目的で残す)

### xlsx → exceljs 置換 ✅ Shipped v0.5.0 (PR #36)
**What:** `scripts/ingest-mext-foods.ts` の xlsx@0.18.5 を exceljs@4.x に置換。
**Resolution:** `XLSX.readFile()` + `sheet_to_json({header:1})` → `new ExcelJS.Workbook().xlsx.readFile()`
+ 手動 `slice(1)` で 2D 配列構築 (xlsx の sheet_to_json と同じ shape)。
**Effect:** `bun audit` の HIGH CVE 2 件 (Prototype Pollution + ReDoS) を完全解消
(Before: 3 vulns / 2 high → After: 2 vulns / 0 high)。

### F-011: 「判定不能」カードの空セクションが余白を取る ✅ Shipped v0.4.11 (PR #27)
**What:** signal=unknown のカードでも他のカードと同じ高さで描画される問題。
**Resolution:** 個別食事グリッドに `items-start` を追加 (CSS grid デフォルトの
`align-items: stretch` を解除)。各カードが自然な高さで並ぶように。
**Commit:** 0727720

### F-012: 個別食事カードに、アップロードした画像のサムネイル表示 ✅ Shipped v0.4.12 (PR #28)
**What:** MealResultCard 上部にアップロード画像のサムネイル表示。
**Resolution:** `URL.createObjectURL` でブラウザ内 URL 生成、`useEffect` cleanup で
`URL.revokeObjectURL` 確実に呼ぶ。`loading="lazy"` で初期描画コスト最小化。
ResultPanel 経由で `app/page.tsx` の files state がカードまで伝搬。
**Commit:** fe69cab

---

## v0.5.x Security backlog

### CSP ヘッダー追加
**What:** `next.config.ts` の `headers()` で `Content-Security-Policy` を設定。
**Why:** 現状 React のデフォルト XSS 防御のみ。defense in depth として CSP を追加。
**Notes:** YouTube nocookie iframe (v0.4.3 洗脳動画) を許可するため `frame-src` に
`https://www.youtube-nocookie.com` を含める必要あり。
**Effort:** 30 分 (慎重に reload 検証)。

---

## v1.x Candidates (monetization-adjacent)

### 履歴バルクアップロード機能（過去 1〜3 ヶ月遡及）
**What:** ユーザーが過去の食事写真をまとめて取り込めるモード。
ZIP / 複数フォルダ / 月別アルバム ドロップで、順次 `/api/analyze` を呼んで
日次トレンドグラフを再構築する。

**Why:** EPA/DHA は慢性指標（直近 1〜3 ヶ月の習慣が血中濃度に効く）。
リアルタイム計測より「過去の自分はどうだったか」のトレンド把握の方が、
本質的な顧客価値が大きい可能性。

**Monetization potential:**
- Vision API コスト基準で持続可能な課金モデル化が現実的
  （1 写真 ~$0.0007、月 100 枚 = $0.07、$5/mo サブスクで粗利 98%+）
- 競合（MyFitnessPal Premium $20/mo, Cronometer Gold $9/mo）の主要課金ポイントと一致
- ただし**現状はホビープロジェクト**、ユーザー数が育つ前の課金導入は overhead 過大

**Pros:**
- アプリの本質価値（慢性指標トレンド分析）を引き出す
- 課金ポイントとして筋が良い
- Vision コストが上限値を持つ設計（バルクは別レート制限で制御可能）

**Cons:**
- 認証システム導入が前提（Clerk / Supabase Auth）
- Stripe 統合・サブスク管理 UI・解約処理・税対応の運用負荷
- ユーザー基盤がない段階での課金導入は ROI 悪い

**Depends on:**
1. ユーザー数の自然増（month 50+ 程度を目安）
2. 認証システム導入
3. `/api/analyze/bulk` 別エンドポイント設計（既存 `/api/analyze` のレート制限を
   壊さないため。既存は 10/h/IP のまま、bulk は認証ユーザーに 100/day 等）

**Context:** v0.4.5 の `/cso` 監査 → レート制限値議論で「課金点になりうるか？」
の問いから派生。今は実装しない、設計余地として開けておく決定。

---

## v0.3.1 Candidates

### ProteinCategory → FoodCategory リネーム
**What:** `lib/standards.ts` の `ProteinCategory` 型を `FoodCategory` に、
`plant_protein` を `plant` にリネーム。CATEGORY_LABELS_JA も連動。

**Why:** v0.3.0 で計算が脂質ベースになると、「タンパク質」を含む型名がドメイン
語彙とズレる。`FoodCategory` の方が中立で正確。

**Pros:** ドメイン語彙統一、長期的にコードがきれい、新人が混乱しない。
**Cons:** scoring.ts、analyzer.ts、UI 等多数ファイルへの波及。
**Context:** /plan-eng-review 2026-05-02 Issue 8 で「機能変更（v0.3.0）と命名変更を
分離する」原則に従い、別 PR にしました。Beck の "make the change easy, then make
the easy change"。
**Depends on:** v0.3.0 リリース完了。

---

### 食材 DB を MEXT 脂肪酸成分表編から自動 ingest（57 → 500+）
**What:** `scripts/ingest-mext-foods.ts` を新規作成。MEXT 脂肪酸成分表編 Excel
（公開）を読み込んで `data/foods.json` に自動転記。LLM 推定不使用、純粋な
Excel パース。

**Why:** 現状 57 品目では Vision API が識別する食材を頻繁にカバーできない。
MEXT は 1900 品目登録、覚悟を決めて全部入れるべき。v0.3.0 で食材スキーマが
固まった後がベストタイミング。

**Pros:** Vision API ヒット率大幅改善、unknown 表示が激減、ユーザー体験向上、
将来の手動メンテナンス不要。
**Cons:** Excel パースのスクリプト工数（半日〜1 日）、データ品質チェック必要。
**Context:** /plan-eng-review 2026-05-02 Cross-Model Tension 3。outside voice の
「57 → 1900 のチャンスを逃すと後で 2 度手間」指摘を v0.3.1 で解決する判断。
**Depends on:** v0.3.0 リリース完了（脂肪酸スキーマ確定）。

---

### admin ダッシュボードに calculation_version フィルタ追加
**What:** `app/admin/page.tsx` に「集計対象バージョン」フィルタ UI 追加。
v1 (タンパク質ベース)、v2 (脂質ベース)、両方の 3 オプション。

**Why:** v0.2.0 と v0.3.0 で feedback のスコアが別 scale。混在表示すると分析できない。

**Pros:** バージョン別に accuracy 集計可能、移行前後の品質比較できる。
**Cons:** v0.2.0 feedback 数が少なければ実用価値低い。
**Context:** /office-hours で「過去 feedback の表示扱い」を deferred。実際の蓄積数を
v0.3.0 リリース後に確認してから判断。
**Depends on:** v0.3.0 リリース完了 + v0.2.0 feedback ≥ 50 件あること。

---

### 過去スコアの UI 表示時バージョンバッジ
**What:** admin で過去 feedback 表示時に「v1 (タンパク質ベース)」「v2 (脂質ベース)」
バッジを併記。

**Why:** 同じ admin 画面で v0.2.0 時代と v0.3.0 以降の feedback が混在表示される。
スコアが意味する内容が違うのに視覚的に区別がない。

**Pros:** ユーザー（自分）が混乱しない、データの解釈ミス防止。
**Cons:** 軽量機能、上の calculation_version フィルタと合わせて実装でほぼ終わる。
**Context:** /plan-eng-review 2026-05-02 outside voice point 7。
**Depends on:** calculation_version フィルタの v0.3.1 実装と同時。

---

### Vision API → food-db マッチ率 telemetry
**What:** `app/api/analyze/route.ts` でレスポンスに含まれる `unmatched` 配列を
集計し、Vercel Analytics または admin に「unmatched food rate」を表示。

**Why:** どの食材が food-db に無いか、頻度はどれくらいかをデータで把握。
v0.3.1 の食材 DB 拡張優先順位の判断材料になる。

**Pros:** データ駆動の優先順位付け、勘ではなく事実で判断。
**Cons:** 集計基盤の実装工数（中程度）、telemetry 目的のためだけに inflastructure 追加。
**Context:** /plan-eng-review 2026-05-02 outside voice point 9。
**Depends on:** v0.3.0 リリース完了（マッチ率の baseline 取得開始）。

---

## v0.4.0 Candidates

### AI コーチング・レシピ提案機能
**What:** 食事結果カードに「AI に提案してもらう」ボタン、Gemini で 3 レシピ生成 +
チップ refinement (和食寄り、コンビニで、20分以内、安い食材で、子ども向け) +
自由入力。

**Why:** 食事の数値を「行動を変える」アクションに変換する。EPA+DHA を増やす具体的
レシピ提案で user value を運ぶ。

**Pros:** v0.3.0 の正確な数値を活かせる、cultural data 比較（イヌイット食等）の
ベース機能。
**Cons:** Gemini API コスト、UX 設計工数。
**Context:** 元の v0.3.0 設計だったが、土台（タンパク質ベース）が間違っていることが
判明し v0.4.0 へ繰り延べ。設計ドキュメント
`~/.gstack/projects/kimymt-epa-aa-balance/likemike-main-design-20260502-145712.md`
プロトタイプ HTML
`~/.gstack/projects/kimymt-epa-aa-balance/designs/coach-section-20260502/finalized.html`
**Depends on:** v0.3.0 リリース完了。

---

### WHO/AHA EPA+DHA mg/日推奨値ベースの external validation
**What:** v0.3.0 の閾値（30%/15%）が暫定。WHO（250-500mg/日）、AHA（500mg/日）、
日本人健康人口の食事 EPA+DHA 摂取分布データを文献調査し、絶対量と share form の
両方で根拠ある閾値を確定。

**Why:** v0.3.0 の閾値は「人間が魚中心と判定 → 緑」という tautological な検証で
仮置き。本当の妥当性は外部 anchor が必要。

**Pros:** 信号機判定の科学的根拠、海外コミュニティへの説明責任、医療系プロが
「これ根拠ある」と認める。
**Cons:** 文献調査工数（中程度〜大）、栄養学知見必要。
**Context:** /plan-eng-review 2026-05-02 outside voice point 2 + Open Question 1。
absolute mg/day 目標値も同時検討。
**Depends on:** 文献調査ができる時間の確保。

---

### 文化圏比較機能（イヌイット食、地中海食、伝統日本食 vs ユーザー）
**What:** ユーザーの食事パターン（直近 7-30 日 average）を、イヌイット伝統食、
地中海食、現代日本食、伝統日本食、アスリート食事等の参照データと比較表示。

**Why:** 単独スコアより「自分は今どの食文化に近いか」のストーリーが強い。
人間の感情を動かす UX。

**Pros:** 唯一無二の差別化、教育的、SNS でシェアされる可能性、user retention 向上。
**Cons:** 参照データ収集（学術文献）の工数、UX デザイン難。
**Context:** /office-hours で AI コーチ機能と並んで「coolest version」候補だった。
v0.3.0 で脂質ベース化された数値があれば同じ単位で比較可能。
**Depends on:** v0.3.0 リリース + AI コーチング機能（提案文脈に組み込むため）。
