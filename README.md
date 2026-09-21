# MandalaFab

ブラウザ上で曼荼羅・幾何学模様をデザインし、レーザーカッター／カッティングマシン／CNC で加工できる **ステンシル用 SVG** を生成する Web アプリです。

公開 URL: https://fooping-tech.github.io/MandalaFab/

MandalaFab は単なる曼荼羅ジェネレータではなく、「製造可能性を理解した Generative CAD」を目指しています。
[TypeFab](https://github.com/fooping-tech/TypeFab) が文字を加工可能な形に変換するのと同じように、MandalaFab は放射対称のジェネラティブアートを **一枚のステンシルとして切り出せる形状** に変換します。

## 考え方（v0.2: Sector モデル）

市販のレース調ステンシルは「単純な図形を円周に並べたもの」ではなく、**1つの角度セクタの中に涙滴・葉・渦巻き・ペイズリーなどを配置し、そのセクタを回転複製したもの**です。MandalaFab v0.2 はこの構造をそのままデータモデルにしています。

```
MandalaProject
 ├ symmetry / sheet / constraints / bridges
 ├ center      : 中心モチーフ（radial petals / sunflower / starburst / circular petals）
 ├ rings[]     : リング = セクタ（360° / repeat）のデザイン
 │   ├ radius, repeat, phase, mirrorLocal
 │   └ elements[] : Teardrop / Leaf / Petal / Paisley / S-Curve / Curl / Spiral / Arc / Dot / Circle
 │                  / Bezier Path / Connector / Shape / Compound
 └ compounds[] : 再利用できる複合モチーフ
```

- **Cubic Bézier が第一級オブジェクト。** 有機的なモチーフはすべて制御点から生成され、`Bezier Path` 要素では制御点を直接編集できます（インスペクタ、またはキャンバス上のハンドル）。最終 SVG は stroke ではなく閉じた輪郭（帯）に変換されます。
- **セクタ内ミラー**（`mirrorLocal`）: 30° セクタなら左半分 15° だけデザイン → ミラー → 30° → ×12。少ない定義で複雑な図柄になります。
- **入れ子の Radial Repeat**: 要素ごとに `repeat` / `repeatSpread` でセクタ内の局所複製、`orient: radial` で中心からの向きに整列。
- **cut / keep**: 要素は「抜く」だけでなく「残す」（材料）としても置けます。Connector は keep モードで材料の橋になります。
- **縁取り（inset / innerGap）**: 形の内側に同形の材料を残し、茎（insetStem）または自動ブリッジで接続します。
- **Material View / Cutout View**: 残る材料を白で見るビューと、抜ける領域を黒で見るビュー。どちらも書き出される SVG と同じ形状です。

## v0.3: Ornamental Composition Engine

v0.2 の生成器は「帯ごとに単純なテンプレートを乱択して独立に要素を置く」ものでした（[docs/design-gap.md](docs/design-gap.md) に分析）。v0.3 では 1 セクタを **装飾文法** で組み立てます。

- **Primary / Secondary / Flow / Filler / Boundary** の役割を持つ要素をこの順に配置。すべての配置は衝突判定（gap・両境界・予約ゾーン・自分のミラー像・前の帯の実形状）を通り、ずらし／縮小／破棄されます。
- **Flow Field**: primary の肩から出る Bezier spine に沿って葉・雫・鉤・ドットを接線方向に配置（蔓・アラベスク構造）。
- **境界接続**: 曲線の端点をセクタ境界の材料ギャップ上に置き、接線を境界法線に揃えるので、ミラー／回転コピーした隣セクタと C1 連続になります。
- **Interlock**: 帯の半径範囲を重ね、位相を半セクタずらし、前の帯の先端が次の帯の主モチーフの間に食い込みます。
- **新しい曲線語彙**（テーパー帯）: C-Curve / Hook / Vine / Double Curl / Opposed Curl / Tendril。`Bezier Path` も `taper` で先細りの帯になります。
- **True Paisley**: 曲がって巻き込む背骨に雫をスイープした本物のペイズリー（belly / curlRadius / curlAmount / tipSharpness / innerInset / innerCurl）。
- **Nested Ornament**: 要素の `children` で、大きな雫の中に小さな雫、蓮弁の中に花弁、ペイズリーの中に渦、といった異なる内部モチーフを入れられます（インスペクタの「内部モチーフ」）。
- **Composition Template 6 種**: floralArabesque / paisleyVine / lotusScroll / gothicFloral / laceFlower / ornamentalVine。プリセット 5 種はこのエンジンから生成（`GALLERY=1 npx vitest run scripts/make-presets.test.ts`）。

受け入れ基準（`tests/compose.test.ts`）: Dense Floral Stencil の各帯で意味のある primitive 10 以上・flow 3 本以上・境界接続 1 以上、プロジェクト全体で nested motif 2 種以上・帯間 interlock 2 以上、島 0・検証エラー 0。

## Reference Image Import（v0.4）

ツールバーの「参照画像」から PNG / JPG / WebP / SVG を読み込み、ウィザード（Crop → Threshold → Center → Symmetry → Sector → Vectorize → Convert → Validate）で **編集可能な Sector / Element モデル** に変換します。中心と対称数は自動推定（極座標展開の相関、帯ごとの対称数にも対応、ドラッグ／手動変更可）、輪郭は marching squares → Douglas–Peucker → 3 次 Bézier フィット、形は IoU ベースで teardrop / leaf / circle などに認識（自信がなければ Bézier のまま）、半径クラスタリングでリング化し、対称に揃う形はセクタ 1 つだけを保存して repeat で復元、揃わない形は元の位置で保持します。Trace Only / Stencilize（塗り形状）/ Stencilize cells（線画: 線で囲まれた領域を抜く）の 3 モード、参照画像は半透明 Reference Layer と Difference View で比較できます。詳細は [docs/import.md](docs/import.md)。

## できること

- 中心モチーフ + リング（セクタ）+ 要素の階層編集（左ツリー / 右インスペクタ / 中央 CAD 風キャンバス）
- 要素: 位置・回転・scaleX/Y・ミラー・線幅・cut/keep・放射向き・局所リピート・縁取り・種類別パラメータ（curvature, tipSharpness, bend, turns, taper, curl, innerGap …）
- **Stencil Validation**: 脱落する島・細すぎるブリッジ・細すぎる材料（くびれ／壁）・細すぎる形状・小さすぎる穴・自己交差・重複パス・はみ出し を検出しハイライト
- **自動 Bridge 生成**: 島を対称性を保って外側へ接続（中心の島は対称数由来の本数、周辺の島は放射方向）
- 対称数 4 / 6 / 8 / 10 / 12 / 16 / 24 / 32 と任意値
- プリセット 9 種: **Dense Floral Stencil**（12回対称・4帯+区切り帯・565 パス）、Floral Lace、Paisley Mandala、Lotus Lace、Ornamental Arabesque、および参考画像に合わせた文様プリセット **Arch Lace**（アーチ窓の重ね・扇・ドット）、**Scallop Fan Lace**（スカラップ縁と放射扇）、**Ainu Morew**（モレウ渦巻き・アイウシ棘・シク眼・ハート）、**Ethnic Border**（三角・バー・葉脈付きの葉・ジグザグ・ドット付きアーチ・太陽花・格子）
- 文様用の要素: `arch`（アーチ、`pointed`）、`fan`（放射線入りの扇、`spokes` / `eye` / `rim`）、`zigzag`（テーパー帯のジグザグ、`waves`）、モチーフ `morew` / `urenmorew`（渦の隙間 `gap` を保って帯幅を自動で絞る）
- **Density ベースの自動生成**（対称数・密度 0..1・seed）。密度が上がると帯・要素・局所リピート・装飾ドット・曲線の細部が増え、余白が減ります
- **マイパーツ**: 要素（入れ子・複合モチーフ込み）・複数選択した要素（1 つのグループとして）・リング（セクタのデザイン）・プロジェクト全体を右クリックメニューか Inspector の「マイパーツに登録」で保存し、ツールバーの「マイパーツ」から挿入 / 名前変更 / 削除。ブラウザ（localStorage）に保存され、`mandalafab.parts.json` として書き出し・読み込みできる
- **複数選択・グループ化・右クリックメニュー**: キャンバスの空白からドラッグで矩形範囲選択（Alt / Space / 中ボタンでパン）、Shift+クリックで追加選択（キャンバス・左のツリー）、⌘A で全選択。複数の要素を「グループ化」（⌘G）すると 1 つの複合モチーフになり、「グループ解除」（⌘⇧G）で元の位置に戻る。右クリックで複製・削除・グループ化・マイパーツに登録（複数選択なら 1 つのグループとして登録）・cut/keep 切替・反転・表示切替などのメニュー
- **生成にマイパーツを混ぜる**: 「生成」ダイアログの「マイパーツを使う」で使用頻度（0〜1）とパーツごとの重み（低 / 標準 / 高 / 最高、チェックを外すと不使用）を設定。要素パーツが主モチーフ・副モチーフ（蔓の上・先端）・フィラーの枠でその確率で先に試され、枠に合わせて拡大縮小される（非対称なパーツは左右対のペア）。設定は `project.generator` に残るので同じ seed で再現できる
- シート 100 / 150 / 200 / 300 mm 角とカスタム、加工制約と材料プリセット（紙・プラ板・MDF・アクリル）
- SVG 書き出し（mm 単位・viewBox・transform なし・閉じた compound path・重複除去・メタデータにプロジェクト JSON）
- JSON 保存／読込、URL 共有、自動保存、Undo / Redo
- 計算は Web Worker で行い、ジオメトリ → 検証の順に結果が届くので操作が止まりません

## 使い方

1. 「プリセット」で **Dense Floral Stencil** などを開くか、「生成」で密度と seed を指定して自動生成します。気に入った要素・リングは Inspector の「パーツ保存」で登録し、「マイパーツ」から別のプロジェクトへ挿入できます。
2. 左ツリーでリングや要素を選び、右インスペクタで編集します。キャンバスの青い扇形が選択中のセクタ、オレンジの線がミラー軸です。
3. 「材料」ビューで残る材料、「抜き」ビューでカットラインを確認します。黄／赤のハイライトは加工チェックの指摘です。
4. 「SVG出力」でレーザー加工用 SVG を保存します。

キーボード: `⌘Z` / `⌘⇧Z` 元に戻す・やり直し、`N` リング追加、`Delete` 削除、`S` ビュー切替、`P` 加工プレビュー、`G` グリッド、`F` 全体表示、`+` / `-` ズーム。

**キャンバス操作**: ホイールでズーム（右下のボタンでスクロールに切替可、⌘/Ctrl+ホイールは常にズーム、Shift+ホイールは常にスクロール）。選択した要素には位置（□）・長さ（■ 先端）・幅（■ 横）・回転（橙 ○）のハンドル、リングには半径ハンドルが出ます（Shift でスナップ）。矢印キーで移動、`[` `]` で回転、`<` `>` で拡大縮小。

**軽量化**: 変更されたリングだけ幾何を再計算（リング単位のキャッシュ）、計算中に届いた中間状態は捨てて最新だけを Worker に送り、検証は入力が落ち着いてから実行します。

**加工プレビュー**（ツールバー ✂ / `P`）は TypeFab と同じく、書き出される SVG と同じパス生成（最適化・重複除去込み）で作ったカットラインだけを赤線で表示します。ガイド・要素の塗り・ハイライトは消え、ブリッジは線の切れ目として見えます。

> 加工チェックは形状上の問題を見つけるためのものです。材料強度や切断後の完全性を保証するものではありません。

## 開発

Node.js 22 以上。

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

`GALLERY=1 npx vitest run scripts` でプリセットと生成結果のギャラリー HTML（`scripts/gallery.test.ts`）とプロファイルを出力できます。

設計ドキュメントは [docs/](docs/) にあります。

- [docs/architecture.md](docs/architecture.md) — 全体構成、TypeFab から引き継いだ知見、ライブラリ選定
- [docs/data-model.md](docs/data-model.md) — プロジェクト JSON（v2）とセクタ／要素のデータモデル
- [docs/geometry-model.md](docs/geometry-model.md) — 座標系、Bezier モチーフ、セクタ組み立て、ブーリアン、島検出、ブリッジ、検証
- [docs/mvp-scope.md](docs/mvp-scope.md) — 範囲と将来の拡張
- [docs/implementation-plan.md](docs/implementation-plan.md) — 実装計画と進捗

## 公開（GitHub Pages）

`main` への push で `.github/workflows/pages.yml` が `npm ci` → `npm test` → `npm run build` → Pages デプロイを行います。`vite.config.ts` の `base: "/MandalaFab/"` は Pages のパスに合わせています。

## ライセンス

MIT
