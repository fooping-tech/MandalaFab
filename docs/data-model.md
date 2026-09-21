# Data Model (v2)

プロジェクトはひとつの JSON（`Project`）で、ファイル保存・URL 共有・localStorage 自動保存・SVG メタデータのすべてに同じ形を使う。読み込みは必ず `normalizeProject()` を通し、範囲外の値は clamp、未知の型は既定に置き換える。**v1（`motif` / `count` を持つリング）は自動で v2 に移行**する（1 リング = 1 `shape`/組み込み要素）。

```jsonc
{
  "version": 2,
  "app": "0.2.0",
  "name": "Dense Floral Stencil",
  "symmetry": 12,
  "sheet": { "width": 200, "height": 200, "outline": false, "cornerRadius": 0 },
  "center": { "type": "radialPetals", "petals": 24, "innerRadius": 7, "outerRadius": 21, "petalWidth": 2.5, "coreRadius": 3.5, "strokeWidth": 0, "rotation": 0 },
  "rings": [
    { "id": "band-a", "name": "Band A", "visible": true, "radius": 32, "repeat": 12, "phase": 0, "mirrorLocal": true,
      "elements": [
        { "id": "e1", "type": "teardrop", "x": 0, "y": 0, "length": 15, "width": 6, "inset": 1.5, "insetStem": 1.8, "params": { "tipSharpness": 0.85, "curvature": 0 } },
        { "id": "e2", "type": "curl", "x": 4.5, "y": 6.3, "rotation": 50, "length": 8, "width": 5, "strokeWidth": 1.2, "params": { "turns": 1.25, "taper": 0.7, "direction": 1 } }
      ] }
  ],
  "compounds": [ { "id": "floral-unit", "name": "floral-unit", "elements": [ /* SectorElement[] */ ] } ],
  "constraints": { "minBridgeWidth": 1.5, "minFeatureWidth": 1.0, "minGap": 1.0, "minHoleDiameter": 1.0 },
  "bridges": { "auto": true, "width": 1.6, "centerCount": "auto", "perIsland": 2, "overlap": 0.3 },
  "manualBridges": [],
  "seed": 42,
  "generator": { "symmetry": 12, "density": 0.8, "seed": 42 }
}
```

## Ring（セクタ）

| フィールド | 意味 |
| --- | --- |
| `radius` | セクタ座標系の原点の中心からの距離（mm） |
| `repeat` | 回転複製数。セクタ角 = 360 / repeat |
| `phase` | 位相（度、0° = 真上、時計回り） |
| `mirrorLocal` | y ≥ 0 側にデザインした要素をセクタ軸で鏡映して両側に置く |
| `elements` | セクタ座標系の要素。**+x = 外向き（放射方向）、+y = 接線方向** |

## SectorElement

共通フィールド（`ElementBase`）:

| フィールド | 意味 |
| --- | --- |
| `type` | `teardrop` `leaf` `petal` `paisley` `scurve` `curl` `spiral` `arc` `dot` `circle` `bezier` `connector` `shape` `compound` + v0.3: `ccurve` `hook` `vine` `doublecurl` `opposedcurl` `tendril` + 文様: `arch` `fan` `zigzag` |
| `x`, `y`, `rotation`, `scaleX`, `scaleY`, `mirror` | local position / rotation / scale / mirror |
| `length`, `width` | 軸方向・横方向の寸法（mm） |
| `strokeWidth` | 0 = 塗り、>0 = 輪郭帯。線状要素（S-Curve, Curl, Spiral, Connector, 開いた Bezier）では帯の幅 |
| `mode` | `cut`（抜く）/ `keep`（材料として残す。同じリングの先行する cut から差し引く） |
| `orient` | `sector`（配置のまま）/ `radial`（中心から外を向くよう回転） |
| `repeat`, `repeatSpread` | 局所リピート: 中心のまわりに `repeatSpread`°（0 = セクタ角）の範囲で均等配置 |
| `inset`, `insetStem` | 縁取り: 内側に同形の材料を残す幅と、根元でつなぐ茎の幅（0 = 自動ブリッジ） |
| `params` | 種類別パラメータ（下表） |
| `role` | 任意。`primary` / `secondary` / `flow` / `filler` / `boundary`（装飾文法上の役割） |
| `children` | 任意。入れ子の子要素（親ローカル座標、`mode` で cut / keep、深さ 3 まで） |

種類別:

| type | params / フィールド |
| --- | --- |
| teardrop | `curvature` (-1..1), `tipSharpness` (0..1) |
| leaf | `bend` (-1..1), `tipSharpness` (0..1) |
| petal | `bulge`, `shoulder` |
| paisley | `belly` (0..1), `curlRadius` (mm, 0 = 自動), `curlAmount` (0..1.5 turns), `tipSharpness`, `innerInset` (mm), `innerCurl` (0..1), `direction` (±1) |
| ccurve / doublecurl | `tip`（端の太さ比）, doublecurl は `turns` |
| hook / tendril | `tip`, `turns`, `direction` |
| arch | `pointed` (0..1: 0 で半円、1 で尖頭) |
| fan | `pointed`, `spokes` (放射線の本数), `spokeWidth`, `eye` (根元に残す円の比), `rim` (縁の帯幅 mm) |
| zigzag | `waves` (山の数), `tip` (先端の太さ比)。`strokeWidth` が帯幅 |
| shape motif=`morew` | `turns`, `thorn` (棘の長さ比), `direction`, `gap` (渦の隙間 mm) |
| shape motif=`urenmorew` | `turns`, `gap` |
| vine | `tip`, `waves` |
| opposedcurl | `tip`, `turns` |
| scurve | `curvature` (0.1..1.2) |
| curl | `radius` (mm, 0 = 自動), `turns`, `taper`, `direction` (±1) |
| spiral | `turns` |
| bezier | `points: Vec2[]`（start, cp1, cp2, end, …）, `closed`, `taper`（開いたパスをテーパー帯にする） |
| connector | `from`, `to`, `bulge` |
| shape | `motif`（heart, star, polygon, crescent, tulip, lotus, scallop, diamond, triangle, line, wave …） |
| compound | `ref`（`project.compounds[].id`） |

## CenterMotif

`type` = `none` / `radialPetals` / `sunflower` / `starburst` / `circularPetals`、`petals`, `innerRadius`, `outerRadius`, `petalWidth`, `coreRadius`, `strokeWidth`, `rotation`。

## CompoundMotif

`{ id, name, elements }`。`compound` 要素から参照し、要素の位置・回転・スケールで配置される（入れ子は 3 段まで）。インスペクタの「複合モチーフ化」で選択要素から作れる。

## Constraints / Bridges / Sheet / Share

v1 と同じ。`GeneratorParams` は `{ symmetry, density, seed }`（complexity は廃止）。共有 URL は `#z=<base64url(deflate-raw(JSON))>` または `#p=<base64url(JSON)>`。

## マイパーツ（ユーザーライブラリ）

`src/model/library.ts`。プロジェクト JSON とは別に、ブラウザの `localStorage["mandalafab-parts-v1"]` に配列で保存する。書き出し / 読み込みのファイル形式:

```json
{ "format": "mandalafab-parts", "version": 1, "items": [
  { "id": "p…", "kind": "element", "name": "big leaf", "createdAt": "2026-09-21T00:00:00.000Z", "compounds": [ … ], "data": { …SectorElement… } },
  { "id": "p…", "kind": "ring",    "name": "Band 2",   "createdAt": "…", "compounds": [ … ], "data": { …Ring… } },
  { "id": "p…", "kind": "project", "name": "My Lace",  "createdAt": "…", "compounds": [],    "data": { …Project… } }
] }
```

- `compounds` には要素 / リングが参照する `CompoundMotif` を再帰的に同梱する（別プロジェクトへ挿入しても壊れない）。
- 挿入時は `freshIds()` で要素・リング・複合モチーフの id を振り直し、`ref` も同時に付け替える。プロジェクトに同じ id の複合モチーフがあれば追加しない（`insertPartElement` / `insertPartRing`）。
- 生成器の設定 `project.generator` には `partsFrequency`（0..1）と `partWeights`（パーツ id → 重み、0 = 不使用）も保存される。`generateProject(params, base, elementParts)` がライブラリの要素パーツから `PartsSettings`（候補 + 頻度）を作り、Composition Engine の `SectorContext.pickPart()` が各枠で頻度の確率と重みで候補を選ぶ。パーツは `scaleX/scaleY` で枠の大きさに合わせ、参照する複合モチーフは生成プロジェクトの `compounds` に取り込まれる。
- 読み込みは `parseLibrary()` → `normalizeLibraryItem()` を必ず通す（要素は `normalizeElement`、リングは `normalizeRing`、プロジェクトは `normalizeProject`）。壊れた項目は捨てる。ファイル・配列・単一項目のいずれも受け付ける。

## 出力（Output Polarity）

```json
"output": { "polarity": "stencil" | "positive", "minConnectionWidth": 1.5, "autoConnect": true, "maxConnectorSpan": 14 }
```

- `polarity`: `stencil`（曼荼羅 = 抜く領域、シート = 残る材料）または `positive`（曼荼羅 = 残る材料、外側 = 除去）。省略時は `stencil`。
- `minConnectionWidth`: Positive でこれより細いつながりを「くびれ」として警告し、自動コネクタの帯幅にもなる（0.1〜20 mm）。
- `autoConnect` / `maxConnectorSpan`: Positive で離れた部品を曲線の帯で自動的に繋ぐか、その最大長。
