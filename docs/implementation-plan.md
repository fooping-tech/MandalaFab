# Implementation Plan

| 段階 | 内容 | 状態 |
| --- | --- | --- |
| 0–9 | v0.1: TypeFab 調査、設計、単純モチーフの Radial Repeat、検証、ブリッジ、UI、テスト、公開 | 済（2026-09-20） |
| 10 | v0.2 データモデル: Sector / SectorElement / CompoundMotif / CenterMotif、v1 移行 | 済 |
| 11 | Bézier 基盤と有機モチーフ（teardrop, leaf, scurve, curl, paisley）、要素ビルダー | 済 |
| 12 | セクタ組み立て（変換、局所リピート、ミラー、cut/keep、compound）、中心ジェネレータ | 済 |
| 13 | density 生成、プリセット 5 種、ギャラリー／プロファイル用スクリプト | 済 |
| 14 | UI: ツリー（中心・リング・要素）、要素インスペクタ、Bezier 制御点編集、Material/Cutout ビュー、Worker | 済 |
| 15 | 検証高速化（頂点間引き、square join、警告ノイズ削減）、入れ子領域の消失バグ修正 | 済 |
| 16 | テスト（sector, bezier, center, migration, Dense Floral 受け入れ）、ドキュメント、公開 | 済 |
| 17 | 手動ブリッジ UI、要素のドラッグ回転／スケール、DXF、SVG モチーフ | 未着手 |

## 作業ルール

- ジオメトリを変えたらテストを足す。5 プリセットで「島 0・エラー 0」、Dense Floral で「100 パス以上」を `tests/generator.test.ts` が確認する。
- `GALLERY=1 npx vitest run scripts` でギャラリーを出し、目視で確認してから公開する。
- `PLANS.md` に依頼と結果を日付付きで追記する。検証していないことを検証済みと書かない。
