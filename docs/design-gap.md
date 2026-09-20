# Design Gap: なぜ v0.2 の Dense Floral Stencil は市販ステンシルの意匠品質に届かないか

対象コード: `src/generate/generator.ts`（v0.2）、`src/geometry/elements/builders.ts`、`src/geometry/elements/sector.ts`、`src/presets/dense-floral.json`。

## 1. 生成器は「Band Template のランダム選択」で、装飾文法を持たない

`generator.ts` は 7 つの Band Template（`teardropCluster`, `paisleyPair`, `curlPair`, `lotusBordered`, `scurveLattice`, `fanLeaves`, `petalRow`）を帯ごとに 1 つ乱択し、各テンプレートは 3〜5 個の要素を固定座標の比率（`x: -L*0.15, y: W*0.55 + c.W*0.1` など）で置くだけである。

- 要素間に **主従関係がない**。primary（主役）/ secondary / flow / filler の区別がなく、すべて同じ重みで並ぶ。
- 要素同士は **互いを参照しない**。葉や渦は主モチーフの輪郭や「流れ」に沿って置かれるのではなく、独立した座標に置かれる。結果として「図形の集合」に見える。
- 帯（band）は `gap` を空けて独立に並び、**帯と帯の関係（overlap / interlock / tangent）がない**。参考画像では内側の葉や蔓が外側のモチーフの間に食い込み、輪郭が連続して見える。

## 2. sector 境界を意識していない

要素は sector 座標 (x, y) に置かれるだけで、**境界（±θ）上の端点・接線を拘束する仕組みがない**。隣接 sector へ回転コピーされたとき、境界付近で曲線が途切れるか、偶然重なるだけである。参考画像の連続した蔓・アーチは「境界で端点と接線が一致する曲線」が作る。

## 3. Flow（流れ）の概念がない

`scurve` と `curl` は一様幅の線を帯にしただけで、主モチーフから伸びて枝分かれする **背骨（spine）** の役割を持たない。葉・雫・ドットが spine に沿って配置されないため、蔓やアラベスクの構造（Primary → spine → branches → leaf/curl/teardrop）が現れない。

## 4. 曲線プリミティブが貧弱で、幅が一様

存在するのは S-Curve / Curl / Spiral の 3 種で、いずれも `strokeOpen`（一様幅）で帯化している。装飾曲線は根元が太く先端に向かって細くなる **テーパー付きの帯** であり、C-Curve、Hook、Vine、Double Curl、Opposed Curl、Tendril のような語彙が必要。

## 5. Paisley が「涙滴を剪断しただけ」

`buildPaisley()` は `buildTeardrop()` を 3 次の剪断（`bendContour`）で曲げるだけで、

- 先端が内側へ **巻き込む**（curl）構造がない（曲がるだけ）
- 腹の **非対称**（belly）がない
- 内側の輪郭・内側の雫・内部の渦がない

ため、参考画像の主役であるペイズリーとして成立していない。

## 6. Nested Ornament が「同形の inset」しかない

`inset` は輪郭を一定幅で内側にオフセットして同じ形の材料を残すだけで、**異なる内部モチーフ**（大きな雫の中の小さな雫、蓮弁の中の花弁、ペイズリーの中の渦）を置けない。参考画像の密度は主にこの入れ子で作られている。

## 7. 密度の作り方が「小さい要素を増やす」になっている

`density` は要素数・ドット数・区切り帯の数を増やすが、要素の寸法は帯幅の比率で小さくなるため、密度を上げるほど「ドットのリング」に近づく。参考画像の密度は、大きな主モチーフ＋その内部と周囲を埋める従属モチーフ＋帯をまたぐ蔓、で作られる。

## 8. プリセットも同じ構造

`dense-floral.json` は手作業で 4 帯 + 区切り帯 2 を組んだが、生成器と同じ「独立要素の配置」であり、入れ子は inset のみ、境界接続なし、帯間の食い込みなし。565 パスという数字は密度の指標にならない（ドットで水増しされる）。

## 対策（v0.3 で実装するもの）

| ギャップ | 対策 |
| --- | --- |
| 1, 7 | **Ornamental Composition Engine**（`src/generate/compose.ts`）: Primary 1 / Secondary 2〜5 / Flow 2〜6 / Filler 複数 / Boundary connection の文法で sector を組む。Sector Composition Template 6 種 |
| 3 | **Flow Field**: primary から伸びる Bezier spine を作り、spine の点・接線・法線に沿って leaf / curl / teardrop / dot を配置 |
| 4 | テーパー帯（`taperedBand`）と C-Curve / Hook / Vine / Double Curl / Opposed Curl / Tendril |
| 5 | **True Paisley**: spine + 可変幅（belly 非対称）+ 先端の巻き込み + 内側輪郭 + 内側雫 + 内部渦（`length, width, belly, curlRadius, curlAmount, tipSharpness, innerInset, innerCurl`） |
| 6 | **Nested Ornament**: 要素の `children[]`（親のローカル座標、cut / keep）で異なる内部モチーフを入れ子にする |
| 2 | **Boundary-aware**: 境界上の端点を境界線に乗せ、接線を境界法線に揃える（mirror / 回転コピーの両方で連続）。stencil 用に境界で `boundaryGap` の材料を残す |
| 1 | **Interlock**: 帯の半径範囲を `interlock` だけ重ね、隣接帯は半セクタ位相差。内側帯の軸要素が外側帯の主モチーフの間に食い込み、外側帯の境界曲線は内側帯の軸先端を避ける |
| 8 | 5 プリセットを Composition Engine から生成し直す。受け入れ基準は「1 sector に意味のある primitive 10 以上、nested 2 種以上、flow 3 本以上、境界接続 1 以上、帯間 interlock 2 以上」 |

## 実装結果（v0.3）

| ギャップ | 実装 | 場所 |
| --- | --- | --- |
| 装飾文法 | `SectorContext` + 6 つの Composition Template（floralArabesque, paisleyVine, lotusScroll, gothicFloral, laceFlower, ornamentalVine）。各 sector に primary 1 / secondary ≥ 2 / flow ≥ 3（boundary 含む）/ filler 複数 / boundary ≥ 1 を `ensureFlows` `ensureSecondaries` `fillFreeSpace` が保証 | `src/generate/compose.ts` |
| Flow Field | `spine()` / `boundarySpine()` / `placeOnSpine()`: primary の肩から出る Bezier spine に沿って leaf / drop / hook / dot を接線方向に配置 | 同上 |
| 曲線語彙 | `taperedBand()`（可変幅・非対称）と C-Curve / Hook / Vine / Double Curl / Opposed Curl / Tendril、`bezier` の `taper` パラメータ。自己交差は `cleanBand()` で解消 | `src/geometry/elements/builders.ts` |
| True Paisley | 直線の雫を「曲がって巻き込む背骨」に沿ってスイープ（`sweepAlongSpine`）。belly 非対称、curlRadius / curlAmount、innerInset（縁取り＋茎）、innerCurl（内部の鉤） | 同上 `buildTruePaisley` |
| Nested Ornament | `SectorElement.children[]`（親ローカル座標、cut / keep）。primary は縁取り雫の中に別の雫／花弁／葉を cut する | `src/geometry/elements/sector.ts` |
| Boundary-aware | 境界上の端点を `boundaryGap/2` だけ内側に置き、接線を境界法線に揃える。mirrorLocal + 回転 = 境界での反射なので隣 sector と C1 連続。テスト `boundary connections end on the boundary gap …` | `boundarySpine` |
| Interlock | `layoutBands()` が帯の半径範囲を `interlock` だけ重ね、位相を半セクタずらす。前の帯の実形状を障害物として次の帯の配置に渡す（`obstaclesFor`）。`bandInterlocks()` で計測 | `composeMandala` |
| 衝突回避 | すべての配置を `fits()`（gap 付き offset の交差判定、両境界、予約ゾーン、自分のミラー像）で検査し、ずらし／縮小／破棄。結果として島がほぼ 0 になり、ブリッジは意図した箇所だけになる | `SectorContext.add` |
| プリセット | 5 種を `scripts/make-presets.test.ts` でエンジンから生成。受け入れ基準は `tests/compose.test.ts` が検査 | `src/presets/*.json` |

残る限界: 12 分割の最内帯は幅が足りないため分割数を半分にしている。fillFreeSpace のドットは格子状の候補点から選ぶため、密度を上げるとドットが目立つ。曲線同士の「接線接触」は材料ギャップ（boundaryGap）を挟む形で表現しており、完全に連続した一本の線にはしていない（ステンシルとして島を作らないため）。
