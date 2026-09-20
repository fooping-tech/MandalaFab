# Scope

## v0.1（済）

リング = 単純モチーフの Radial Repeat、Stencil Validation、自動ブリッジ、プリセット、seed 生成、SVG/JSON/URL、Undo/Redo、CAD 風 UI。

## v0.2（済）: Sector モデルへの再設計

- 基本単位を Ring から **Sector Motif** に変更（Ring = セクタ設計 + repeat）
- Cubic Bézier を第一級に、Teardrop / Leaf / S-Curve / Curl / Paisley を Bézier で実装
- 要素の position / rotation / scaleX / scaleY / mirror / strokeWidth / boolean（cut・keep）/ radial orientation
- Compound Motif、入れ子の Radial Repeat（局所リピート）、セクタ内ミラー
- Center Motif（radial petals / sunflower / starburst / circular petals）
- density ベースの生成、プリセット 5 種（Dense Floral Stencil は 565 パス、島 0、エラー 0）
- Material View / Cutout View
- Web Worker による段階的計算（ジオメトリ → 検証）
- v1 プロジェクトの自動移行

## 意図的に含めないもの

- 手動ブリッジ配置 UI（データ構造と適用は実装済み）
- DXF / PNG / PDF、SVG モチーフのインポート、カーフ補正、ネスティング
- 要素同士の吸着・整列などの本格的な 2D CAD 操作
- モバイル UI

## 拡張の入り口

| 拡張 | 触る場所 |
| --- | --- |
| 新しい要素型 | `model/project.ts` の `ElementType` と `ELEMENT_TYPES`、`elements/builders.ts` の `buildElementShape` / `ELEMENT_PARAMS` |
| 新しい単純形 | `motifs/builtin.ts`（`shape` 要素から使える） |
| 生成テンプレート | `generate/generator.ts` の `TEMPLATES` |
| 中心モチーフ | `geometry/center.ts` |
| Clipper2 移行 | `geometry/boolean/clipper.ts` |
