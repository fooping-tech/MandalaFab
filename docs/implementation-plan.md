# Implementation Plan

| 段階 | 内容 | 状態 |
| --- | --- | --- |
| 0 | TypeFab の調査（UI、ジオメトリ、Clipper の使い方、ブリッジ、SVG 出力、テスト） | 済 |
| 1 | アーキテクチャ・データモデル・ジオメトリモデル・MVP 範囲を docs に整理 | 済 |
| 2 | 足場: Vite + React + TypeScript + Tailwind + Vitest、GitHub Pages ワークフロー | 済 |
| 3 | geometry: 型、ベクトル、Clipper アダプタ、モチーフレジストリ + 11 モチーフ、Radial Repeat、generateMandala | 済 |
| 4 | stencil: シート、union、島検出、自動ブリッジ、pipeline | 済 |
| 5 | validation / export（SVG, JSON, URL）/ presets / generator | 済 |
| 6 | editor: store（Undo/Redo）、commands、pipeline、persist、actions | 済 |
| 7 | UI: Toolbar / RingTree / Canvas（zoom, pan, grid, guides, ruler, hover, select）/ Inspector / StatusBar / dialogs | 済 |
| 8 | テスト: Radial Repeat、座標変換、SVG 生成、closed path、ブリッジ幅検証、島、対称ブリッジ、生成の決定性、プリセット | 済（41 件） |
| 9 | ブラウザ確認（Playwright でスクリーンショット）、GitHub Pages 公開 | 済 |
| 10 | 手動ブリッジ UI、Worker 化、DXF、SVG モチーフ、PNG/PDF | 未着手 |

## 作業ルール

- ジオメトリを変えたらテストを足す。8 つのプリセットすべてで「島 0・エラー 0」が通ることを `tests/generator.test.ts` が確認している。
- `PLANS.md` に依頼と結果を日付付きで追記する（TypeFab と同じ運用）。
- 検証していないことを検証済みと書かない。
