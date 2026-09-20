# CLAUDE.md

MandalaFab — ブラウザで曼荼羅ステンシルをデザインし、レーザー加工用 SVG を生成する Web アプリ。
公開 URL: https://fooping-tech.github.io/MandalaFab/ （GitHub Pages、`main` への push で自動デプロイ）。

## 作業の進め方

1. 作業開始時に `PLANS.md` を読む。依頼・実装範囲・検証結果が時系列で記録されている。
2. 新しい依頼は `PLANS.md` 末尾に日付付きの節を追加し、要求と完了条件を書く。終わったら結果（テスト件数、ビルド、ブラウザ確認、未検証事項）を同じ節に追記する。検証していないことを検証済みと書かない。
3. 利用者向けの仕様が変わったら `README.md` と `docs/` を更新する。
4. push 後は Actions の成功と公開 URL の HTTP 200 を確認する。

## コマンド

Node.js 22 以上。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## 構成

- `src/geometry` `src/validation` `src/export` `src/generate` `src/model` `src/presets`: React/DOM に依存しない純粋 TS。Vitest で直接テストする。
- `src/editor`: ストア（`useSyncExternalStore`）、Command パターン、`computeRender`。
- `src/components` `src/app`: React UI。DOM はリング数に比例（コピーは path 文字列にまとめる）。
- 詳細は `docs/architecture.md` `docs/data-model.md` `docs/geometry-model.md`。

## 守るべき前提

- `vite.config.ts` の `base: "/MandalaFab/"` は変更しない。
- SVG は mm 単位・`viewBox` 付き・閉じた path のみ（transform / text / stroke だけの図形を出さない）。プレビューの「ステンシル表示」と書き出しは同じ `StencilGeometry.final` を使う。
- ジオメトリの向き規約: outer は `signedArea > 0`、hole は負。union は `pftPositive`。
- ブリッジは穴から差し引く矩形。形状を足して繋ぐ操作ではない。
- 保存済みプロジェクト JSON の互換性を壊さない。読み込みは必ず `normalizeProject` を通す。
- プロジェクト・SVG を外部に送信しない（共有 URL はハッシュのみ）。
- 検証結果を「安全」「保証」と読める文言にしない。
- 形状処理を変えたらテストを追加し、5 プリセットすべてで島 0・エラー 0、Dense Floral Stencil で 100 パス以上を維持する。
- Clipper へ領域を渡すときは `RegionNode.children`（穴の中の領域）まで再帰的に投入する（`addRegions`）。省くと中心部が消える。
- 有機モチーフは Bézier（`geometry/bezier.ts`）で作る。単純な circle/petal の repeat だけのプリセットは作らない。
- プリセットは手で書かず `GALLERY=1 npx vitest run scripts/make-presets.test.ts` で Composition Engine（`src/generate/compose.ts`）から再生成する。受け入れ基準は `tests/compose.test.ts`。
- 生成器のテンプレートを変えたら `GALLERY=1 npx vitest run scripts/sector-view.test.ts`（1 セクタ拡大）と `scripts/gallery.test.ts` で目視確認する。島（islandsBefore）が増えたら配置の衝突が原因なので `fits()` の条件を疑う。
