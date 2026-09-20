# Geometry Model (v2)

## 座標系

- 単位 mm、デザイン座標は曼荼羅の中心が原点、y は下向き（SVG と同じ）。角度は 0° = 真上、時計回り。
- **セクタ座標系**: 原点 = 中心から `ring.radius` の位置（セクタ軸上）、+x = 外向き、+y = 接線方向。曼荼羅の中心はセクタ座標で (−R, 0)。
- **要素座標系**: 要素の中心が原点、+x = 要素の軸。`scale → mirror → rotate → translate(x, y)` でセクタ座標へ。`orient: radial` は `atan2(y, x + R)` を回転に加える。
- 曲線はすべて `TOLERANCE = 0.02 mm` で折れ線化。

## Bézier

`src/geometry/bezier.ts`: `CubicSegment { start, cp1, cp2, end }`、点列 `[start, cp1, cp2, end, cp1, cp2, end, …]` との相互変換、`flattenPath`（再帰分割）、`closedFromHalf`（半分の輪郭を x 軸で鏡映して閉じる）、`bendContour`（y += k·((x−x0)/span)^p の剪断で曲げる）、`bulgeSegment`。

有機モチーフ（`src/geometry/elements/builders.ts`）:

| type | 構成 |
| --- | --- |
| teardrop | 先端 → 最大幅 → 根元 の 2 本の 3 次曲線を鏡映。`tipSharpness` で先端の制御点を軸に寄せる。`curvature` で剪断 |
| leaf | 根元 → 先端の 1 本を鏡映。`bend` で反り |
| petal | 両端が尖る 1 本を鏡映（`bulge`, `shoulder`） |
| paisley | teardrop を 3 次の剪断（`curl`）で先端を鉤状に曲げる。`innerGap` は縁取りとして扱う |
| scurve | 3 次曲線 1 本の開いた線 |
| curl | 3 次曲線の茎 + 半径が `taper` で減る渦巻き（開いた線） |
| arc | 中心と同心の円弧帯（要素位置の半径を使う） |
| bezier | ユーザーの点列。閉じていれば塗り、開いていれば帯 |
| connector | 2 点を結ぶ曲線帯（既定 keep） |

## セクタ組み立て（`elements/sector.ts`）

要素ごとに:

1. 形状を作る → `strokeWidth` なら輪郭帯（`etClosedLine`）／開いた線は帯（`etOpenRound`）／`inset` なら `offset(−inset)` との差分 + 茎矩形の差分
2. 要素変換でセクタ座標へ
3. 局所リピート: 中心 (−R, 0) のまわりに `spread·((j+0.5)/n − 0.5)` 回転
4. `mirrorLocal` なら y → −y の鏡映を追加（元と一致する形は追加しない）
5. `cut` は蓄積、`keep` は蓄積済みの cut から `difference`
6. `compound` は子要素を 1〜5 で組み立ててから要素変換で配置

セクタの結果を `radialRepeatRegions` で `repeat` 回回転して世界座標へ。同じ規則で全コピーが作られるため k 回対称が保たれる。

## 中心モチーフ（`center.ts`）

`radialPetals`（petal）、`circularPetals`（丸い teardrop）、`starburst`（三角）、`sunflower`（2 層の leaf + ドット環）を `innerRadius..outerRadius` に `petals` 個放射配置し、`coreRadius` の円を加える。

## ブーリアン

- clipper-lib、`SCALE = 10000`。outer は正、hole は負、union は `pftPositive`。
- `RegionNode`（outer, holes, children）の**入れ子は差分・交差・offset のすべてで再帰的に投入**する（v0.2 で修正した重要バグ: 中心部が大きな環の穴の子だったため消えていた）。
- 面積 0.05 mm² 未満の hole は数値ノイズとして捨てる（帯が自分に触れる場所に出る）。

## ステンシル・パイプラインと検証

`generateMandala → unionApertures → clip to sheet → findIslands → generateBridges（反復）→ validateStencil → exportSVG`。島・ブリッジのアルゴリズムは v1 と同じ（`docs/architecture.md` 参照）。

検証の変更点:

- モルフォロジー検査（細い材料／形状）は頂点を 0.1 mm で間引いてから行う（Dense Floral で 2.9 s → 0.6 s）。
- 材料側: erode で消える材料片、領域数の増加（くびれ）、穴数の減少（薄い壁）を検出。位置は opening との差分のうち面積 ≥ 0.8·w²・長さ ≥ 2w のもの（角の先端は除外される）。
- 穴側: erode で消える形状のみ警告（尖った先端は正常）。

## Material / Cutout

材料 = シート − 最終穴。キャンバスの材料ビューは最終穴を背景色で塗ることで「残る材料が白」になり、抜きビューは最終穴を黒で塗る。どちらも `StencilGeometry.final` を描くので書き出しと一致する。
