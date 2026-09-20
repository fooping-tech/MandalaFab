# Architecture

## 方針

- **UI と geometry engine を分離する。** `src/geometry`, `src/validation`, `src/export`, `src/generate`, `src/model`, `src/presets` は React にも DOM にも依存しない純粋な TypeScript で、Node（Vitest）でそのまま動く。将来 Web Worker に移す場合も、この境界をそのまま使える。
- **プレビュー = 書き出し。** キャンバスの「ステンシル表示」と SVG 書き出しは同じ `StencilGeometry.final` を描く。見えているものがそのまま切られる。
- **DOM は O(リング数)。** 1 リングの全コピーを 1 本の compound path 文字列にまとめて描く。数千〜数万のモチーフでも DOM 要素は増えない。重い計算は `useDeferredValue` で入力操作から切り離している。
- **島とブリッジは別の概念。** TypeFab と同じく、ブリッジは「穴から差し引く矩形」であり、形状を足すものではない。

## v0.2 の要点

- 基本単位は **Sector**: `Ring { radius, repeat, phase, mirrorLocal, elements[] }`。要素はセクタ座標（+x 外向き、+y 接線）で置かれ、セクタごと回転複製される。
- **Bézier が第一級**（`geometry/bezier.ts`）。有機モチーフは制御点から生成し、SVG では帯／閉じた輪郭に変換する。
- **Web Worker**（`editor/render.worker.ts`）で `computeStaged`: ジオメトリ段階を先に返し、検証段階を後から返す。新しいプロジェクトが来たら古い検証はスキップ。
- Material View / Cutout View は同じ最終形状の塗り分け。

## ディレクトリ

```
src/
  app/          エントリ (main.tsx), App レイアウト, bootstrap（URL/自動保存/プリセットの読み込み）
  components/   Toolbar, RingTree, Canvas, Inspector, StatusBar, fields, dialogs/
  editor/       store（useSyncExternalStore）, commands（Command パターン）, pipeline（RenderData）, actions, persist
  geometry/
    types.ts    Vec2, Contour, Region, RegionNode, TOLERANCE
    vec.ts      ベクトル演算、面積、重心、点内包、レイ交差、ベジェ平坦化、円弧分割
    bezier.ts   CubicSegment、点列変換、flattenPath、closedFromHalf、bendContour
    boolean/    clipper-lib アダプタ（union / difference / intersection / offset / stroke / cleanRegions）
    motifs/     単純形レジストリ（heart, star, polygon, crescent, tulip, lotus, scallop …）= `shape` 要素
    elements/   builders（要素型 → 形状）, sector（セクタ組み立て: 変換・局所リピート・ミラー・cut/keep・compound）
    center.ts   中心モチーフ
    radial/     transform, repeat（Radial Repeat）, mandala（generateMandala）
    stencil/    sheet, islands（島検出）, bridges（自動ブリッジ）, pipeline（buildStencil）
  validation/   validateStencil
  export/       exportSVG, exportJSON, share（URL ハッシュ）
  generate/     mulberry32 と generateProject
  model/        Project 型・デフォルト・上限、normalizeProject（JSON 検証）
  presets/      8 つの JSON プリセットとローダ
tests/          Vitest（radial, transform, motifs, stencil, svg, generator）
docs/           このドキュメント
```

## パイプライン API

```ts
generateMandala(project): MandalaGeometry        // 中心 + リングごとの穴（要素別の世界座標も保持）
buildSector(ring, project): SectorResult          // 1 セクタの cut 領域（keep 適用済み）と要素別領域
buildStencil(project, geometry): StencilGeometry // union → シートで切り取り → 手動+自動ブリッジ
validateStencil({ geometry, stencil, constraints, sheet }): ValidationResult
generateBridges(apertures, options): BridgeResult // buildStencil の内部でも使う
exportSVG(project, stencil.final): { svg, subpaths, dropped }
computeStaged(project): { stencil, validate() }  // editor 層。ジオメトリ段階と検証段階を分けて path 文字列にする
computeRender(project): RenderData               // 同期版（テスト・サムネイル）
```

## 状態管理と Undo / Redo

`EditorStore` は `project` と UI 状態（選択、ホバー、表示モード）を持つ小さな外部ストアで、React には `useSyncExternalStore` で接続する。
変更は `Command { label, coalesceKey?, apply(project): Project }` として `store.execute()` に渡す。ストアは実行前の `project` を履歴に積むので、コマンドは `apply` だけを書けばよい（スナップショット方式）。
`coalesceKey` が同じコマンドが 900 ms 以内に連続すると 1 つの履歴にまとめられ、スライダー操作が 1 回の Undo になる。履歴は 100 段。

## TypeFab から引き継いだ知見

| TypeFab | MandalaFab での扱い |
| --- | --- |
| mm 単位・0.02 mm で曲線を平坦化 | `TOLERANCE = 0.02`、モチーフはすべて折れ線で持つ |
| clipper-lib（SCALE 10000） | 同じライブラリ・同じスケール。`geometry/boolean/clipper.ts` に閉じ込める |
| PolyTree を歩いて `{outer, holes}` を作る | `RegionNode`（outer, holes, children）として木構造ごと保持し、島の入れ子を扱う |
| ブリッジ = 矩形を差分 | `Bridge` 矩形を穴から `difference` |
| 島 = 親を持つ輪郭 | 島 = union 後の穴の hole。中心を含むかで中央／周辺を区別 |
| プレビューと書き出しが同じ関数 | `StencilGeometry.final` を両方で使う |
| `M/L/Z` の折れ線 SVG、4 桁 | 3 桁、compound path、evenodd、重複 subpath 除去 |
| `<desc>` にメタデータ | `<metadata>` にプロジェクト JSON（SVG から再読込可能） |
| JSON プロジェクトの厳格な検証 | `normalizeProject` で clamp／デフォルト補完 |
| 「安全」と言い切らない UI 文言 | 検証結果は件数と領域のみ。保証しない旨を明記 |
| `node --test` の数値不変量テスト | Vitest で同じスタイル（面積、対称性、閉路、幅） |

## ライブラリ選定（polygon boolean）

| 候補 | union/diff | offset | 実行環境 | 判断 |
| --- | --- | --- | --- | --- |
| **clipper-lib**（Clipper 6.4 JS 移植） | ○ | ○（round/miter/square、open/closed） | 純 JS、Node/Worker 可 | **採用**。TypeFab で加工用途の実績。offset が必須（線モチーフの帯化、輪郭線、細さ検査のモルフォロジー） |
| clipper2-js | ○ | ○ | 純 JS | 有望だが実績が薄い。アダプタ層を差し替えれば移行できる |
| clipper2-wasm | ○ | ○ | WASM・非同期初期化 | テスト/Worker で扱いにくい |
| Paper.js | ○ | △（プラグイン） | DOM/Canvas 前提、重い | 不採用 |
| Martinez / polygon-clipping | ○ | × | 純 JS | offset がないため不採用 |
| flatten-js | ○ | × | 純 JS | 同上 |

依存はこれと React / Vite / Tailwind / Vitest のみ。フォントや外部サービスは使わない。

## デプロイ

GitHub Actions（`.github/workflows/pages.yml`）で `npm ci → npm test → npm run build → deploy-pages`。`vite.config.ts` の `base: "/MandalaFab/"` を固定。
