# PLANS

## MandalaFab 新規開発（2026-09-20）

### 要求

- TypeFab（https://github.com/fooping-tech/TypeFab）を調査し、UI/UX・設計思想・SVG 生成・プレビュー・データ構造を参考に、曼荼羅ステンシル向けに最適化した Web アプリ MandalaFab を新規開発する。
- 中心 → リング → モチーフの階層、Radial Repeat、11 モチーフ（レジストリ構造）、Stencil Validation、自動 Bridge（対称性維持）、対称数 4..32 + 任意、CAD 風 UI（左ツリー／中央キャンバス／右インスペクタ／上ツールバー／下ステータス）、キャンバス機能（zoom/pan/grid/guides/ruler/selection/hover）、ライブプレビュー、プリセット 8 種（JSON）、URL/JSON 共有、Random Generate（seed）、シートサイズ、加工制約と材料プリセットへの拡張性、レーザー投入可能な SVG 書き出し、Undo/Redo、UI と geometry engine の分離、ジオメトリのユニットテスト。
- まず docs に architecture / data model / geometry model / MVP scope / implementation plan を整理し、最小 MVP → Stencil Validation → Bridge Generator の順に実装する。
- TypeFab と同じように GitHub Pages にデプロイする。

### 完了条件

- `npm test` と `npm run build` が通る。
- 8 プリセットすべてで島が残らず、エラーなしで SVG を書き出せる。
- GitHub Pages で公開され HTTP 200 を返す。

### 実装

- 技術: Vite 8 + React 19 + TypeScript 7 + Tailwind CSS 4 + Vitest 4 + clipper-lib 6.4.2。
- TypeFab 調査の要点と引き継ぎは `docs/architecture.md` に表でまとめた。
- ジオメトリ: `src/geometry`（types, vec, boolean/clipper, motifs, radial, stencil）、`src/validation`、`src/export`、`src/generate`、`src/model`、`src/presets`。すべて React 非依存。
- UI: `src/editor`（store, commands, pipeline, actions, persist）と `src/components`。
- 書き出し SVG: mm、`viewBox 0 0 W H`、transform なし、evenodd の compound path 1 本（+ 任意の外形）、重複 subpath 除去、3 桁、`<metadata>` にプロジェクト JSON。

### 結果

- テスト: `npm test` 6 ファイル 41 件すべて成功（Radial Repeat、座標変換、モチーフ、島検出、対称ブリッジ、ブリッジ幅検証、細い材料検出、重複/小穴、SVG 生成と閉路、生成の決定性、8 プリセット）。
- ビルド: `npm run build` 成功（tsc 型チェック込み、JS 約 403 kB / gzip 123 kB）。
- ブラウザ確認: Playwright（headless Chromium）で初期画面（Flower）、デザイン表示、プリセットダイアログ、Sacred Geometry のブリッジ表示、リング選択時のインスペクタをスクリーンショットで確認。コンソールエラーなし。
- 未検証: 実機でのレーザー加工。手動ブリッジ配置 UI は未実装（データ構造のみ）。モバイル表示は対象外。
- 公開: GitHub Pages を `build_type=workflow` で有効化し、`main` へ push。Actions 実行 https://github.com/fooping-tech/MandalaFab/actions/runs/35502150047 が成功し、https://fooping-tech.github.io/MandalaFab/ が HTTP 200 を返すことを確認した。
