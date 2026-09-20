# Data Model

プロジェクトはひとつの JSON（`Project`）で、ファイル保存・URL 共有・localStorage 自動保存・SVG メタデータのすべてに同じ形を使う。読み込み時は必ず `normalizeProject()` を通し、範囲外の値は clamp、未知のモチーフは `circle` に置き換える。

```jsonc
{
  "version": 1,
  "app": "0.1.0",
  "name": "Lotus",
  "symmetry": 12,                        // 1..64。生成・ブリッジ対称性・UI の「×n」に使う
  "sheet": { "width": 150, "height": 150, "outline": false, "cornerRadius": 0 },
  "rings": [ /* Ring[] 内側→外側 */ ],
  "constraints": { "minBridgeWidth": 1.5, "minFeatureWidth": 1.0, "minGap": 1.0, "minHoleDiameter": 1.0 },
  "bridges": { "auto": true, "width": 1.5, "centerCount": "auto", "perIsland": 2, "overlap": 0.3 },
  "manualBridges": [ { "id": "b1", "x": 0, "y": -20, "length": 6, "width": 2, "rotation": 90 } ],
  "seed": 42,                            // 任意。生成に使った seed
  "generator": { "symmetry": 12, "complexity": 3, "ringCount": 5, "density": 0.5, "seed": 42 }
}
```

## Ring

| フィールド | 型 | UI ラベル | 意味 |
| --- | --- | --- | --- |
| `id` | string | — | 一意 ID（選択・Undo で使用） |
| `name` | string | 名前 | ツリー表示名 |
| `visible` | boolean | 表示 | false なら生成対象外 |
| `motif` | string | モチーフ | レジストリの ID（`petal` など） |
| `count` | 1..360 | モチーフ数 | 円周上のコピー数 |
| `radius` | 0..500 mm | 半径 | 中心からモチーフ中心までの距離 |
| `length` | 0.2..300 mm | 幅 | 放射方向の寸法 |
| `width` | 0.2..300 mm | サイズ | 接線方向の寸法 |
| `rotation` | -180..180° | 回転角 | 各コピーの追加回転 |
| `rotationMode` | `radial` \| `fixed` | 回転モード | radial: 常に中心を向く、fixed: 向きを保つ |
| `phase` | -180..180° | オフセット | 位相（0° = 真上、時計回り） |
| `strokeWidth` | 0..20 mm | 線幅 | 0 = 塗り、>0 = 輪郭線（帯）。線状モチーフは帯の幅 |
| `stagger` | -50..50 mm | 間隔 | 奇数番目のコピーを放射方向にずらす（交互配置） |
| `direction` | `outward` \| `inward` | 向き | inward は 180° 反転して先端が中心を向く |
| `params` | Record<string, number> | モチーフのパラメータ | `MotifDefinition.params` に定義された値 |

「中心」は独立した概念ではなく、`radius: 0, count: 1` のリングとして表す。

## Constraints / Material

`Constraints` は 4 つの mm 値。`MATERIAL_PRESETS`（標準・紙・プラ板・MDF・アクリル）は Constraints の組を名前付きで持つだけの薄い層で、材料を増やすときは配列に追加する。

## Bridge

- 自動ブリッジは保存しない（プロジェクトから常に再計算できるため）。`bridges` にはその設定だけを持つ。
- `manualBridges` はユーザーが置く矩形（中心座標・長さ・幅・角度）。MVP ではデータ構造と適用のみ実装し、UI は今後。
- 内部表現 `Bridge { id, x, y, length, width, rotation(rad), auto }` は自動・手動で共通。

## Preset

`src/presets/*.json` は `Project` の部分集合。`normalizeProject` が欠けたフィールドを補う。ID を固定しているのでプリセット間で衝突しない。

## Share URL

`#z=<base64url(deflate-raw(JSON))>`（CompressionStream が使える環境）または `#p=<base64url(JSON)>`。読み込み後はハッシュを URL から除く。サーバーには何も送らない。

## 互換性ルール

- `version` を上げるときは `normalizeProject` で旧形式を読めるようにする（TypeFab の v1→v2 移行と同じ方針）。
- 保存済み JSON の値を勝手に作り直さない。未知のフィールドは無視する。
