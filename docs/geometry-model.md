# Geometry Model

## 座標系

- 単位は mm。デザイン座標は **曼荼羅の中心が原点**、y は下向き（SVG と同じ）。
- 角度は「0° = 真上、時計回り」で UI に見せる（`polarToPoint`, `pointAngleDeg`）。内部の回転はラジアン。
- SVG 書き出し時にシート左上が (0,0) になるよう `(W/2, H/2)` だけ平行移動した座標を書く。`transform` 属性は使わない。
- 曲線はすべて `TOLERANCE = 0.02 mm` で折れ線化する。

## 型

```ts
Vec2      { x, y }
Contour   Vec2[]                 // 閉じた多角形。終点に始点を繰り返さない
Polyline  Vec2[]                 // 開いた折れ線（線状モチーフの元）
Region    { outer, holes }       // union の結果。outer は符号付き面積が正、hole は負
RegionNode extends Region { children, childHole }   // hole の中にある Region（入れ子）
```

## モチーフ

モチーフはローカル座標で作る: **+x が放射方向（外向き）、+y が接線方向、中心が原点**。`length` は x 方向の寸法、`width` は y 方向の寸法。

```ts
interface MotifDefinition {
  id; label; description?; params: MotifParamSpec[]; lineLike?: boolean;
  build(ctx: { length, width, ringRadius, tolerance, params }): { closed: Contour[]; open: Polyline[] };
}
registerMotif(def)  // 追加はこれだけ。UI のセレクトと JSON 検証は自動で追随する
```

| ID | 形 | 備考 |
| --- | --- | --- |
| circle | 楕円 | length × width |
| dot | 真円 | 直径 = width |
| petal | 両端が尖る | 3 次ベジェを x 軸で鏡映。`bulge`, `shoulder` |
| leaf | 内側が丸く外側が尖る | `tip` |
| diamond | ひし形 | `skew` |
| triangle | 外向きの三角形 | |
| arc | リングに沿う円弧帯 | 帯の厚み = length、弧長 = width、曲率はリング半径 |
| teardrop | 雫 | 円と接線の組み合わせ |
| line | 放射方向のバー（矩形） | |
| wave | 正弦波（open） | `periods`。線幅で帯にする |
| spiral | 渦巻（open） | `turns`。線幅で帯にする |

閉じたモチーフは `strokeWidth = 0` なら塗り（穴）、`> 0` なら `ClipperOffset(etClosedLine)` で輪郭帯にする。open モチーフは常に `etOpenRound` で帯にする（線幅 0 のときは `max(1.0, minFeatureWidth)` を使い、ノートを出す）。

## Radial Repeat

```ts
radialRepeat(shape, { count, radius, phaseDeg, rotationDeg, rotationMode, direction, stagger }): RadialInstance[]
```

コピー i の角度は `phase + 360·i/count`。変換は「回転 → 平行移動」の剛体変換 `Transform { tx, ty, rotation }` で、`radial` モードでは角度ぶん回転して +x が外を向き、`inward` なら +180°。`stagger` は奇数番目の半径に加える。
すべてのコピーは同じ剛体変換の族なので、自己交差チェックはリングごとに 1 回で済む。

## ブーリアン（clipper-lib アダプタ）

- 座標は `SCALE = 10000` で整数化（0.1 µm）。
- **union は `pftPositive`。** outer を正、hole を負に向きを揃えてから加えるので、ある形の hole が別の形に穴を開けることがない（穴の中にある材料 +1、hole -1、別の形 +1 = +1 で塗られる）。
- `difference` / `intersection` も同じ向き規約。PolyTree を歩いて `RegionNode` の木にする。
- `offset(regions, delta)`：モルフォロジー検査とブリッジ以外にも使える汎用 API。

## ステンシル・パイプライン

```
generateMandala   リングごとに Radial Repeat → 穴の Region[]
unionApertures    全リングを union → RegionNode[]（穴の木）
clip to sheet     はみ出しがあればシートで intersection
findIslands       各 Region の hole = 島（材料）。中心を含むかで central / radial を判定
generateBridges   島ごとにブリッジ矩形 → difference → 島が無くなるまで反復（最大 6 回）
validateStencil   問題の検出
exportSVG         final の全輪郭を 1 本の compound path に
```

### 島

union 後の穴の hole は「切り抜きに完全に囲まれた材料」= 島。Clipper の PolyTree は hole の中の材料に載る別の穴（子 Region）も表すので、同心円のような入れ子の島もそのまま扱える。

### ブリッジ

- ブリッジは矩形 `{x, y, length, width, rotation}`。**穴から差し引く**ので、その分の材料が残り島がつながる。
- **中心を含む島**: `n = autoCenterCount(symmetry)` 本（対称数 ≤ 8 ならその数、それ以上なら 8 以下の最大の約数）。共通位相 φ を 24 分割でサンプリングし、n 本すべてが穴を渡れて合計長が最短の φ を選ぶ。
- **それ以外の島**: 重心（重心が島の外にある凹形状は内部点）から **内向き・外向き** の放射方向にレイを飛ばし、島の輪郭を出た点から同じ Region の次の境界（outer か別の hole）までを渡る。`perIsland = 2` なら両方、1 なら短い方。両方失敗したら 16 方向を試す。
- どの島も自分のローカルな放射座標系で同じ規則で判断するため、k 回対称の入力には k 回対称のブリッジが出る（テストで検証）。
- ブリッジ追加で位相が変わる（島が別の島とつながる等）ので、島が無くなるまで反復する。解決できない島は `unresolved` として検証エラーになる。

### 検証（`validateStencil`）

| コード | 重大度 | 方法 |
| --- | --- | --- |
| island | error | ブリッジ後に残った hole |
| bridge-too-narrow | error | `bridge.width < minBridgeWidth` |
| thin-material | warning | 材料 = シート − 穴 を `minGap/2` で erode。消える領域、領域数の増加（くびれ）、hole 数の減少（穴同士の薄い壁）を検出。位置は opening との差分のうち面積 ≥ 0.3·w² のもの |
| thin-feature | warning | 穴側に同じ手法（`minFeatureWidth`） |
| small-hole | warning | 穴のバウンディング最大辺 < `minHoleDiameter` |
| self-intersection | warning | モチーフ形状の辺同士の交差（リングごとに 1 回） |
| duplicate-path | warning | 面積・重心・周長が一致するコピーが複数ある |
| sheet-overflow | warning | 穴がシートの外に出ている |

「安全」「切り残しなし」といった保証の表現は UI に書かない。

## SVG 書き出し

- `width="Wmm" height="Hmm" viewBox="0 0 W H"`、ユーザー単位 = 1 mm。
- `<path id="apertures" d="M…Z M…Z" fill="none" fill-rule="evenodd" stroke="#ff0000" stroke-width="0.1">` の 1 本。必要なら `<path id="outline">`。
- 各 subpath は `CleanPolygon` + 共線点除去（0.0015 mm）を通し、面積が無いものと重複するもの（点集合の署名で判定）を除く。数値は 3 桁。
- `<metadata>` にプロジェクト JSON を CDATA で埋め込む。`projectFromSVG()` で読み戻せる。
