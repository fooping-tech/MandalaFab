# MVP Scope

## MVP-1（済）

1. 曼荼羅表示（リング → Radial Repeat → キャンバス）
2. リングの追加／削除／複製／並べ替え／表示切替
3. モチーフ Petal / Circle / Diamond（+ Dot, Leaf, Triangle, Arc, Teardrop, Line, Wave, Spiral）
4. repeat（モチーフ数）変更、対称数プリセット・任意値
5. radius 変更（+ 幅・サイズ・線幅・間隔・向き）
6. rotation 変更（回転角・位相・回転モード）
7. SVG 書き出し（mm・viewBox・閉じた compound path・重複除去・メタデータ）

## MVP-2（済）

- Stencil Validation（島・細いブリッジ・細い材料・細い形状・小さい穴・自己交差・重複パス・はみ出し）とキャンバスでのハイライト
- 自動 Bridge Generator（対称性維持、反復解決、設定 UI）
- プリセット 8 種、Random Generate（seed 再現）、JSON 保存／読込、URL 共有、自動保存、Undo/Redo、加工制約と材料プリセット

## 意図的に MVP に含めないもの

- 手動ブリッジの配置 UI（データ構造 `manualBridges` と適用は実装済み）
- DXF / PNG / PDF 書き出し
- Web Worker での計算（境界は用意済み。現状 150 mm・数千要素で数十〜百数十 ms）
- モバイル UI（デスクトップ優先）
- SVG モチーフのインポート（レジストリの `build()` が Contour を返せば追加できる）
- ベジェ形式での書き出し（現状は折れ線。0.02 mm 許容なので加工上の差はない）
- カーフ補正、ネスティング、複数ステンシルの配置

## 将来の拡張の入り口

| 拡張 | 触る場所 |
| --- | --- |
| 新しいモチーフ | `src/geometry/motifs/builtin.ts` に `MotifDefinition` を追加して `BUILTIN_MOTIFS` に入れる |
| SVG モチーフ | `MotifDefinition.build` が SVG を折れ線化して返す実装（`path d` パーサが必要） |
| 材料プリセット | `src/model/project.ts` の `MATERIAL_PRESETS` |
| 手動ブリッジ UI | Canvas のポインタ操作で `manualBridges` を編集するコマンドを追加 |
| Worker 化 | `computeRender(project)` を Worker に移し、`RenderData` をそのまま postMessage |
| DXF | `export/dxf.ts` を追加し `StencilGeometry.final` から LWPOLYLINE を書く |
| Clipper2 への移行 | `src/geometry/boolean/clipper.ts` のみ差し替え |
