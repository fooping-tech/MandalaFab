# PLANS

## MandalaFab 新規開発（2026-09-20）

### 要求

- TypeFab（https://github.com/fooping-tech/TypeFab）を調査し、UI/UX・設計思想・SVG 生成・プレビュー・データ構造を参考に、曼荼羅ステンシル向けに最適化した Web アプリ MandalaFab を新規開発する。
- 中心 → リング → モチーフの階層、Radial Repeat、11 モチーフ（レジストリ構造）、Stencil Validation、自動 Bridge（対称性維持）、対称数 4..32 + 任意、CAD 風 UI（左ツリー／中央キャンバス／右インスペクタ／上ツールバー／下ステータス）、キャンバス機能（zoom/pan/grid/guides/ruler/selection/hover）、ライブプレビュー、プリセット 8 種（JSON）、URL/JSON 共有、Random Generate（seed）、シートサイズ、加工制約と材料プリセットへの拡張性、レーザー投入可能な SVG 書き出し、Undo/Redo、UI と geometry engine の分離、ジオメトリのユニットテスト。
- まず docs に architecture / data model / geometry model / MVP scope / implementation plan を整理し、最小 MVP → Stencil Validation → Bridge Generator の順に実装する。
- TypeFab と同じように GitHub Pages にデプロイする。

### 完了条件

- `npm test` と `npm run build` が通る。
- 8 プリセットすべてで島が残らず、エラーなしで SVG を書き出せる。
- GitHub Pages で公開され HTTP 200 を返す。

### 実装

- 技術: Vite 8 + React 19 + TypeScript 7 + Tailwind CSS 4 + Vitest 4 + clipper-lib 6.4.2。
- TypeFab 調査の要点と引き継ぎは `docs/architecture.md` に表でまとめた。
- ジオメトリ: `src/geometry`（types, vec, boolean/clipper, motifs, radial, stencil）、`src/validation`、`src/export`、`src/generate`、`src/model`、`src/presets`。すべて React 非依存。
- UI: `src/editor`（store, commands, pipeline, actions, persist）と `src/components`。
- 書き出し SVG: mm、`viewBox 0 0 W H`、transform なし、evenodd の compound path 1 本（+ 任意の外形）、重複 subpath 除去、3 桁、`<metadata>` にプロジェクト JSON。

### 結果

- テスト: `npm test` 6 ファイル 41 件すべて成功（Radial Repeat、座標変換、モチーフ、島検出、対称ブリッジ、ブリッジ幅検証、細い材料検出、重複/小穴、SVG 生成と閉路、生成の決定性、8 プリセット）。
- ビルド: `npm run build` 成功（tsc 型チェック込み、JS 約 403 kB / gzip 123 kB）。
- ブラウザ確認: Playwright（headless Chromium）で初期画面（Flower）、デザイン表示、プリセットダイアログ、Sacred Geometry のブリッジ表示、リング選択時のインスペクタをスクリーンショットで確認。コンソールエラーなし。
- 未検証: 実機でのレーザー加工。手動ブリッジ配置 UI は未実装（データ構造のみ）。モバイル表示は対象外。
- 公開: GitHub Pages を `build_type=workflow` で有効化し、`main` へ push。Actions 実行 https://github.com/fooping-tech/MandalaFab/actions/runs/35502150047 が成功し、https://fooping-tech.github.io/MandalaFab/ が HTTP 200 を返すことを確認した。

## Sector モデルへの再設計と参考画像級の曼荼羅（2026-09-20）

### 要求

- 参考画像（市販のレース調ステンシル 36 種と高密度の花柄ステンシル）程度の複雑さ・密度・有機的曲線を生成できるように geometry engine を再設計する。
- 基本単位を Ring から Sector Motif に変更。`MandalaProject { symmetry, canvas, sectors/rings, centerMotif }`、`SectorElement` = Bezier / Teardrop / Leaf / Petal / Spiral / SCurve / Arc / Dot / Circle / Connector、各要素に position / rotation / scaleX / scaleY / mirror / width / control points / boolean mode / radial orientation。
- Cubic Bézier を第一級に。Teardrop / Leaf / S-Curve / Curl / Paisley を Bézier で新規実装（指定パラメータ付き）。
- Compound Motif、入れ子の Radial Repeat、Sector の mirrorLocal、Layered Rings（Ring → CompoundMotif → Sector Elements）、Center Motif ジェネレータ（radial petals / sunflower / starburst / circular petals）。
- プリセット Floral Lace / Paisley Mandala / Lotus Lace / Ornamental Arabesque / Dense Floral Stencil（単純な circle/petal だけのプリセットは禁止、最低でも Bezier・Teardrop・Leaf・S-Curve・Curl/Paisley を組み合わせる）。
- complexity ではなく density (0..1) パラメータ。Material View / Cutout View。
- 受け入れ基準: Dense Floral Stencil を選ぶだけで参考画像程度の complexity / density / organic curvature / radial symmetry / ornamental feeling があり、SVG に 100 個程度以上の shape/path が含まれ、Stencil Validation を pass する。

### 実装

- モデル v2（`src/model/project.ts`, `validate.ts`）: Ring = セクタ、SectorElement 14 種、CompoundMotif、CenterMotif、GeneratorParams { symmetry, density, seed }。v1 JSON は `normalizeProject` が自動移行。
- `geometry/bezier.ts`、`geometry/elements/builders.ts`（有機モチーフ）、`geometry/elements/sector.ts`（要素変換、局所リピート、ミラー、cut/keep、compound、inset/stem）、`geometry/center.ts`。
- `generate/generator.ts` を density ベースの 7 テンプレート（teardropCluster, paisleyPair, curlPair, lotusBordered, scurveLattice, fanLeaves, petalRow）+ 区切り帯に置き換え。
- プリセット 5 種を JSON で新規作成（旧 8 種は削除。旧形式のファイルは移行で読める）。
- UI: ツリー（中心・リング・要素）、要素インスペクタ（種類別パラメータ、Bezier 制御点表、局所リピート、複合モチーフ化）、キャンバスの材料／抜き／デザイン 3 ビュー、セクタ扇形とミラー軸のガイド、選択要素の位置ハンドルと Bezier 制御点ハンドル（最初のコピー）をドラッグ編集、Web Worker による段階計算。
- 修正: Clipper アダプタが `RegionNode.children` を投入していなかったため、大きな環の穴の内側にある中心部がブリッジ適用で消えていた。面積 0.05 mm² 未満の hole を無視（渦巻き帯の自己接触ノイズ）。
- 検証: 頂点を 0.1 mm で間引いてからモルフォロジー検査（Dense Floral: 2.9 s → 0.63 s）。くびれ／壁の判定閾値を面積 ≥ 0.8·w²・長さ ≥ 2w に引き上げ、穴側は消える形状のみ警告。

### 結果

- テスト: `npm test` 8 ファイル 63 件成功（radial, transform, motifs, bezier, sector, stencil, svg, generator/presets/migration）。受け入れテスト `Dense Floral Stencil is ornate …` が type 5 種の使用、565 パス（≥ 100）、島 0、エラー 0 を確認。
- ビルド: `npm run build` 成功（メイン 450 kB / gzip 136 kB、Worker 133 kB）。
- ブラウザ確認（Playwright, headless Chromium）: Dense Floral Stencil の材料ビュー／抜きビュー、リング選択時のセクタガイド、Bezier 要素の追加とハンドル表示・ドラッグ、コンソールエラーなし。フッター表示: パス 565、ブリッジ 0、警告 1（細い材料のくびれ）、ジオメトリ 54 ms + 検証 634 ms。
- ギャラリー（`GALLERY=1 npx vitest run scripts`）で 5 プリセットと density 0.4 / 0.9 の生成結果を目視確認。
- 未検証: 実機加工。手動ブリッジ UI、要素の回転・スケールのハンドル操作は未実装。警告「細い材料のくびれ」は角の先端を含む場合がある（判定は面積・長さの閾値による）。

## Ornamental Composition Engine（2026-09-20）

### 要求

- 機能追加ではなく「市販の高密度な曼荼羅ステンシルのような意匠品質」の実現。まず `docs/design-gap.md` に現状分析を書く。
- Ornament Grammar（Primary 1 / Secondary 2〜5 / Flow 2〜6 / Filler 複数 / Boundary connection）で sector を生成。Flow Field（primary から伸びる Bezier spine に沿って leaf / curl / teardrop / dot を配置）。
- 新曲線: C-Curve / Hook / Vine / Double Curl / Opposed Curl / Tendril（線幅を持つ ornamental band）。True Paisley（outer contour, inward curling tip, asymmetric belly, inner contour, inner teardrop, internal curl; length / width / belly / curlRadius / curlAmount / tipSharpness / innerInset / innerCurl）。
- Nested Ornament（inset の同形コピーではなく異なる内部モチーフ）。Boundary-aware（境界端点・接線連続・ミラー連続）。Interlocking Rings。Sector Composition Template 6 種（10〜25 primitive）。Dense Floral Stencil を全面的に作り直す。
- 新しい受け入れ基準: 1 sector に意味のある ornamental primitive 10 以上、nested motif 2 種以上、flow curve 3 本以上、sector boundary connection 1 以上、ring-to-ring interlock 2 箇所以上。既存の Sector geometry / Bezier / Clipper / Validation / SVG export は活用し、全面書き換えはしない。

### 実装

- `docs/design-gap.md`: v0.2 生成器（Band Template の乱択・独立配置・帯間関係なし・境界無視・一様幅の線・剪断だけの paisley・同形 inset のみ・小要素の増加による密度）が届かない理由と対策表、実装結果表。
- `src/geometry/elements/builders.ts`: `taperedBand`（可変幅・非対称・丸キャップ）、`cleanBand`（自己交差の解消）、`buildCCurve` / `buildHook` / `buildVine` / `buildDoubleCurl` / `buildOpposedCurl`（共有の茎）/ `buildTendril`、`spineFrames` / `sweepAlongSpine`、`buildTruePaisley`（直線の雫を巻き込む背骨にスイープ、belly、innerInset、innerCurl）、`bezier` の `taper`。
- `src/model/project.ts` / `validate.ts`: 要素型 6 種追加、`role`、`children`（再帰的に検証、深さ 3）。`src/geometry/elements/sector.ts`: 帯型の扱い、builder の inner cuts、`children` の cut / keep 合成。
- `src/generate/compose.ts`（新規）: `SectorContext`（座標ヘルパー、`fits()` による衝突回避 = gap 付き offset の交差・両境界・予約ゾーン・自分のミラー像・前の帯の障害物、ずらし／縮小／破棄）、`spine` / `boundarySpine` / `placeOnSpine`、primary（縁取り雫 + 内側モチーフ、paisley の向かい合うペア）、`shoulderVine`（境界接続）、`baseScroll` / `tipCurl` / `tipLeaf` / `ensureFlows` / `ensureSecondaries` / `wedgeFillers` / `outlineDots` / `fillFreeSpace`、6 テンプレート、`layoutBands`（interlock、交互位相、狭い最内帯は repeat 半減）、`obstaclesFor`、`composeMandala`、`compositionStats` / `bandInterlocks`。`generator.ts` はこれに委譲。
- `src/geometry/stencil/bridges.ts`: 周辺の島は 16 方向のうち最短スパン（+90° 以上離れた 2 本目）を選ぶ（細い帯を渡る短い橋になる）。
- `scripts/`: `sector-view.test.ts`（1 セクタ拡大・役割別色分け・島の赤表示）、`paisley-view.test.ts`、`debug-islands.test.ts`、`make-presets.test.ts`（プリセット再生成）。プリセット 5 種を全面再生成。
- UI: ツリーに役割バッジと入れ子の子要素行、インスペクタに「内部モチーフ」（子の追加・削除・選択）、新要素型のアイコン。`commands.ts` は入れ子を再帰的に更新。
- テスト `tests/compose.test.ts`: Dense Floral の受け入れ基準（各帯 primitive ≥ 10・primary 1・secondary ≥ 1・flow ≥ 3・boundary ≥ 1、nested 2 種以上、interlock ≥ 2、島 0、エラー 0、はみ出しなし）、全テンプレートの文法、パッキングの非融合、境界接続（端点距離 = gap/2、接線 = 境界法線、反射で C1 連続）、決定性と density、True Paisley（丸い根元・非対称・巻き込み）、inset + 内部渦の茎接続、テーパー帯の幅、hook の自己交差除去、children の cut / keep。

### 結果

- テスト: `npm test` 9 ファイル 73 件成功（vitest の testTimeout を 120 s に）。Dense Floral Stencil: 4 帯（最内帯は 6 分割、他は 12 分割）、帯ごとの primitive 11〜13、flow 3〜4、boundary 2、nested 1 種（帯ごと、プロジェクト全体で 2 種以上）、interlock 3、島 0、検証エラー 0。
- ギャラリー（`GALLERY=presets npx vitest run scripts/gallery.test.ts`）: 5 プリセットとも islandsBefore ≤ 24、島 0、ブリッジは蔓を渡る短いものだけ。目視でレース／フィリグリー／アラベスクの印象を確認（帯をまたぐ蔓、縁取り雫の中の雫、向かい合うペイズリー）。
- ビルド成功。ブラウザ確認（Playwright）: 初期表示が新しい Dense Floral Stencil、ツリーに役割バッジと子要素、要素選択でインスペクタの「内部モチーフ」表示、コンソールエラーなし。
- 未検証・限界: 実機加工は未検証。`fillFreeSpace` は格子候補からの充填で、密度を上げるとドットが目立つ。曲線の「接線接触」は材料ギャップ（boundaryGap）を挟む表現。12 分割の最内帯は幅不足のため分割数を半分にしている。

## Reference Image Import（2026-09-20）

### 要求

- 手描き／画像の曼荼羅（PNG / JPG / WebP / SVG）をアップロードし、Sector / Element モデルへ変換する Import Wizard（Crop → Threshold → Center → Symmetry → Sector → Vectorize → Convert → Validate）。前処理（threshold / invert / blur / denoise / contrast、背景の明暗両対応）、中心推定（ドラッグ修正可）、対称数推定（上位 3 候補、手動変更可）、ミラー検出と半セクタ化、ブラウザ内ベクタ化（simplify / Douglas–Peucker / cubic Bézier）、プリミティブ認識（自信がなければ Bézier 保持、confidence 表示）、リング検出（半径クラスタリング）、Trace Only / Stencilize、Reference overlay（visibility / opacity / scale / rotation / offset）、Difference View、Web Worker 実行。受け入れ: 12 回対称の手描き画像 → 12-fold・30° セクタ・Bézier 化・repeat=12 復元・overlay と概ね一致・SVG 書き出し・編集可能。
- 追加依頼: 提供された画像 `7822A586-…_1_105_c.jpeg`（886 px の線画曼荼羅）でテストする。

### 実装

- `src/import/`: `preprocess.ts`（Otsu / 適応しきい値 / 背景判定 / モルフォロジー）、`center-detect.ts`（モーメント・外接矩形・大円輪郭の重心・180° 自己相似の微調整）、`symmetry-detect.ts`（極座標展開 + ぼかし + 360/n 列シフトの 2D 相関、中心の同時最適化、帯ごとの対称数とミラー軸）、`contours.ts`（marching squares、穴の包含判定、線画の cells 抽出、線幅推定）、`bezier-fit.ts`（DP、角分割、Schneider フィット、長い輪郭のチャンク分割）、`primitive-recognition.ts`（候補形状を生成して IoU、採用 0.88）、`ring-cluster.ts`、`sector-extract.ts`（コピーのクラスタ化と代表選択、揃わない形は world 保持）、`project-converter.ts`（中心リング・Unmatched リング・帯ごとの n によるセクタリング、穴は keep 子要素、Trace / Stencilize / cells、線幅に応じた許容誤差）、`raster.ts`、`import.worker.ts` + `client.ts`。
- モデル: `SectorElement.imported { detectedType, confidence }`。UI: ツールバー「参照画像」、`ImportReferenceDialog`（8 ステップ、crop / center ドラッグ、帯ごとの対称数表示、3 モード、線画自動判定、Worker での検証）、Reference Layer と Canvas の overlay / Difference View、インスペクタの参照画像パネル、低 confidence の警告。
- スクリプト: `scripts/user-image.test.ts`（BMP からパイプライン一式を実行）、`scripts/debug-polar.test.ts`（極座標展開の可視化）、`scripts/make-sample.test.ts`。

### 結果

- テスト: `npm test` 10 ファイル 84 件成功。`tests/import.test.ts` は合成 12 回対称画像で 前処理（明背景・暗背景で IoU > 0.98）→ 中心（±4 px）→ 対称数 12 とミラー軸 → 輪郭（面積誤差 < 10 %）→ DP / Bézier の誤差 → 認識（teardrop 35° 回転・circle・非対称形は bezier）→ リング分割 → 変換（symmetry 12、repeat 12 のリング、mirrorLocal、再生成の IoU > 0.6、SVG 書き出し）→ Stencilize（島 0）を検証。
- 提供画像（線画、帯ごとに 8 / 16 / 12 / 16 回対称）: Playwright でウィザードを最後まで実行（コンソールエラーなし）。線幅 0.73 mm を検出して cells モードを自動選択、803 セル → 248 要素・4 リング（220 は対称に揃わず元位置で保持）・自動ブリッジ 583・島 0、取り込み後のジオメトリ 367 ms + 検証 409 ms、SVG 書き出し可。Trace Only では線画を忠実に再現。
- 途中で判明し修正した点: 既定 denoise=1 と多数決ダウンスケールが 3 px の線を消していた／回転差分の比率は細線・同心円で判別できなかった（極座標相関へ変更）／線画では全体が 1 つの輪郭（穴 27 個）になりセクタ化が効かない（揃わない形は world 保持へ）／長い輪郭の Bézier フィットが破綻していた（チャンク分割・失敗時は直線保持）／Otsu の境界が 2 値画像で上限側に張り付いていた。
- 未達・限界: 提供画像は帯ごとに対称数が異なるため「30° セクタ 1 つに縮約」はできず、帯ごとの repeat（16 / 10 など）で部分的にセクタ化し残りは元位置で保持した。認識は塗り形状向けで、線画では Bézier 保持が中心。実機加工は未検証。

## 加工プレビュー（2026-09-21）

### 要求

- TypeFab と同様の「加工プレビュー」ボタンを追加する。

### 実装

- `ViewMode` に `preview` を追加。`store.togglePreview()` で直前の表示モードと往復（ツールバー ✂「加工プレビュー」、キー `P`）。
- `computeStaged` が書き出しと同じ `regionsPathData`（CleanPolygon・共線点除去・重複 subpath 除去、3 桁）で `exportPath` / `exportSubpaths` を生成し、キャンバスはそれを赤線（fill none）で描く。外形出力が ON ならシート外形も赤線。グリッド・ガイド・要素の塗り・ブリッジ矩形・検証ハイライト・ハンドルは非表示。
- ヘルプのショートカット一覧と README を更新。

### 結果

- テスト 84 件成功、ビルド成功。Playwright でボタン押下 → 赤いカットラインのみの表示、`P` で元の材料ビューへ戻ることを確認（コンソールエラーなし）。

## 拡大縮小・回転の操作性と軽量化（2026-09-21）

### 要求

- エディタで拡大縮小・回転をやりやすくする。動作が重いので軽くする。

### 実装

- キャンバスのハンドル: 選択要素に位置（□）・長さ（■ 軸先端）・幅（■ 横）・回転（橙 ○、Shift で 15° スナップ）、選択リングに半径ハンドル。セクタ座標へ逆変換して `updateElement` / `updateRing` を発行。
- キーボード: 矢印キーで移動（0.5 mm、Shift 2 mm）／リング半径、`[` `]` で回転（5°、Shift 15°）／リング位相、`<` `>` で 5 % 拡大縮小。ヘルプに追記。
- ホイール = ズーム（既定、約 1.3 倍/ノッチ、カーソル位置固定）。右下ボタンでスクロールに切替（localStorage に保存）。⌘/Ctrl+ホイールは常にズーム、Shift+ホイールは常にスクロール。
- 軽量化: `generateMandala` にリング単位の WeakMap キャッシュ（リング参照・compounds・minFeatureWidth が同じなら再利用、中心も同様）／`useRender` は Worker に 1 件だけ in-flight とし、計算中に届いた中間状態は捨てて最新のみ送信／Worker の検証は 250 ms 落ち着いてから実行／要素パスを `memo` 化してホバー・選択時の再描画を最小化。

### 結果

- テスト 84 件成功、ビルド成功。Playwright: ホイール 4 ノッチで 197 %、回転ハンドルのドラッグで 0° → 38.9°、矢印キー 10 回の連打が 1.9 s で完了（Dense Floral、ジオメトリ約 80〜300 ms/回、検証は落ち着いた後に 1 回）。コンソールエラーなし。
- 限界: 検証（細い材料のモルフォロジー）は依然 0.4〜1 s かかるが入力を止めるまで走らない。取り込んだ線画（要素 248・ブリッジ 583）は再計算が 0.4 s 程度。

## 文様プリセット（アーチ・スカラップ・アイヌ文様・エスニック帯）（2026-09-21）

### 要求

- 参考画像 4 枚（ドゥードル風のアーチの重ね、スカラップ縁のレース、アイヌ文様の表、エスニックな帯柄）のような模様をプリセットで用意する。

### 実装

- 要素タイプ追加: `arch`（`pointed`）、`fan`（`spokes` / `spokeWidth` / `eye` / `rim`、アーチから放射スポークと眼を引く）、`zigzag`（テーパー帯、`waves`）。`ELEMENT_TYPES`・`newElement` 既定値・パラメータ定義・ツリーのアイコン・Inspector の線状判定に追加。
- モチーフ追加 `src/geometry/motifs/ainu.ts`: `morew`（渦巻き、`thorn` で棘、`gap` で渦の隙間を保証する帯幅の自動制限、根元を円で丸める）、`urenmorew`（両渦巻き）。
- プリセット 4 種を JSON で追加し登録（計 9 種）: Arch Lace（扇アーチ・縁取りアーチ + 内側の扇・ビーズ・尖頭アーチ）、Scallop Fan Lace（スカラップ・扇・ドット列）、Ainu Morew（シク眼・ウレンモレウ・棘付きモレウ・内側に渦を持つハート・棘の縁）、Ethnic Border（三角・バー・葉脈付きの葉（keep の connector 子要素）・ジグザグ・ドット付きアーチ・縁取り太陽花・格子）。
- 調整の経緯: 初版は渦の帯幅がピッチより太く塊になり自己交差警告と島 49 個が出た → 帯幅をピッチ − gap に制限して解消。ハートは葉側（−x）から茎を出すと切れ込みに当たり内側が島になった → 180° 回転して先端から入れ、`keep` の connector で確実に繋ぐ。ミラー付きセクタで軸上に非対称な渦を置くと自己鏡映で融合する → 非対称要素は軸から離して配置し、軸上は対称形のみ。
- ギャラリーに `GALLERY_ONLY=<id,…>` フィルタ、`scripts/ring-islands.test.ts`（リングごとの島数）、`scripts/pattern-view.test.ts`（ビルダーの単体表示）を追加。テスト `tests/pattern-builders.test.ts`（arch/fan/zigzag/morew/urenmorew と 4 プリセットの島 0・検証合格）。

### 結果

- テスト 95 件成功、ビルド成功。Playwright でプリセットダイアログから 4 種を読み込み、コンソールエラーなし。パス数 / ブリッジ: Arch Lace 445 / 0、Scallop Fan Lace 505 / 8、Ainu Morew 153 / 28、Ethnic Border 265 / 24（いずれも島 0、警告は細い材料・細い形状のみ）。
- 限界: 参考画像と比べると密度は控えめで、Ainu Morew のハートには中心以外にブリッジが残る（隣接要素で閉じる袋）。渦の巻き数を増やすほど帯が細くなるので、小さい要素では `turns` 1 以下が実用的。

## マイパーツ: 自分のプリセットパーツを作成・登録（2026-09-21）

### 要求

- 自分でプリセットパーツを作成して登録できるようにする。

### 実装

- `src/model/library.ts`（純粋 TS）: パーツの種類 `element` / `ring` / `project`。`partFromElement` / `partFromRing` / `partFromProject` は参照している複合モチーフを再帰的に同梱し、深いコピーを保存。`freshIds` で挿入時に id を振り直し（複合モチーフの `ref` も付け替え）。`parseLibrary` / `serializeLibrary` / `normalizeLibraryItem` で `mandalafab.parts.json`（`format: "mandalafab-parts"`, `version: 1`）を読み書き。壊れた項目は捨てる。
- `src/editor/library-store.ts`: `localStorage["mandalafab-parts-v1"]` に保存する外部ストア（`useSyncExternalStore`）。保存失敗（容量・プライベートモード）は false を返し、UI が通知する。
- コマンド `insertPartElement` / `insertPartRing`（不足している複合モチーフだけ追加してから要素 / リングを追加）。アクション `actionSavePart`（選択中の要素 / リング、未選択ならプロジェクト全体。名前は prompt）、`actionInsertPart`（要素 → 選択中または最後のリング、リングがなければ空のリングを作る。リング → 新しいリング。プロジェクト → 置き換え）、`actionImportParts` / `actionExportParts`。
- UI: ツールバー「マイパーツ」。プリセットダイアログをタブ化（組み込み / マイパーツ）。マイパーツはサムネイル（要素は 1 セクタ、リングは全周、プロジェクトはステンシル）・種類バッジ・日付、挿入 / 名前 / 書き出し / 削除、種類フィルタ、読み込み・書き出し・「選択中を保存」。Inspector の要素・リングの「操作」に「パーツ保存」、プロジェクトに「マイパーツに保存」。ヘルプに節を追加。
- テスト `tests/library.test.ts`（同梱・id 振り直し・往復・不正データ・挿入コマンド・ストア）。README / docs/data-model.md を更新。

### 結果

- テスト 102 件成功、ビルド成功。Playwright: Floral Lace の要素 → リング → プロジェクトを保存（localStorage に 3 件）、ダイアログにカード 3 枚、リングを追加（リング 3 → 4）、要素を挿入、名前変更、削除、プロジェクトを開く、リロード後もカードが残ることを確認。コンソールエラーなし。
- 限界: パーツはブラウザごとの保存で、複数のブラウザや端末では JSON の書き出し / 読み込みが必要。名前入力はブラウザの prompt。リングのパーツは保存時の半径・繰り返し数のまま追加されるので、挿入後に Inspector で調整する。

## 自動生成でマイパーツの使用頻度を調整（2026-09-21）

### 要求

- 自動生成でマイパーツの使用頻度を調整できるようにする。

### 実装

- `GeneratorParams` に `partsFrequency`（0..1）と `partWeights`（パーツ id → 重み）を追加し、`normalizeProject` で検証。`generateProject(params, base, elementParts)` がライブラリの要素パーツを `PartsSettings`（候補 + 頻度）へ変換（重み 0 は除外）。
- Composition Engine（`src/generate/compose.ts`）: `ComposeSettings.parts` / `compounds`。`SectorContext.pickPart()` は各枠で「頻度の確率で試す → 重みで候補を選ぶ」。パーツを設定していないときは乱数を消費しないので従来の生成結果は変わらない（テストで同一性を確認）。`partSize()` がパーツの外接寸法と軸対称性を計算し、`partElement()` が `scaleX/scaleY` で枠の大きさに合わせて id を振り直す。`place()` を `add()` から分離してパーツにも衝突判定・ずらし（入れ子パーツは縮小を scale で行う `resized()`）を適用。
- 使う枠: 主モチーフ（`primaryFor` → `primaryPart`。非対称なパーツはペイズリーと同様に y > 0 側に置いて鏡映ペア、入らなければ組み込みへフォールバック。パーツ主モチーフでは attach 曲線を衝突判定付きにして内部を切り裂かない）、蔓の上と先端の副モチーフ（`placeOnSpine` / `tipLeaf`）、`ensureSecondaries`（パーツ分の枠 `round(1 + 2·頻度)` を追加）、`wedgeFillers` と `fillFreeSpace`（パーツを先に試す）。複合モチーフを参照するパーツは `regionsOf` が `buildSector` で解決し、その複合モチーフは生成プロジェクトへ取り込む。
- UI: 生成ダイアログに「マイパーツを使う」節（使用頻度スライダー、要素パーツ一覧のチェックと重み 低 / 標準 / 高 / 最高）。設定は `project.generator` に保存され、ダイアログを開き直すと復元される。通知に使用した種類数と頻度を表示。
- テスト `tests/compose-parts.test.ts`（頻度 0 / 重み 0 で従来と同一、頻度 1 で主・副・フィラーに使われ設定が残りステンシルが組める、重みの偏り、複合モチーフの同梱、頻度 0.3 < 1.0 の使用数）。`scripts/parts-view.test.ts` で目視確認。README / docs/data-model.md を更新。

### 結果

- テスト 108 件成功、ビルド成功。Playwright: パーツなしでは案内文、Ethnic Border の「sun」をパーツ保存 → 生成ダイアログに一覧が出る → 重み「高」・頻度 1 で生成 → 生成結果にパーツ 14 個、`generator.partsFrequency = 1` / `partWeights` が保存され、開き直すと頻度 1 が復元。コンソールエラーなし。
- 目視（12 回対称・密度 0.8・葉パーツ + 星パーツ）: 頻度 1 で全帯の主モチーフがパーツ（葉は縁取り付きのまま拡大、星は副モチーフとフィラー）、頻度 0.5 で組み込みのペイズリー・蓮弁と混在。
- 限界: パーツの形によっては隣の帯との間に材料の袋（島）ができ、ブリッジで繋がれる（例では 12 回対称で島 12〜24）。凹んだ形（星など）は袋を作りやすい。リング・プロジェクトのパーツは生成の対象外。

## 矩形範囲選択・Shift 複数選択・グループ化・右クリックメニュー（2026-09-21）

### 要求

- エディタ内で矩形範囲をマウスで選択して範囲内を選択状態にする。左の一覧のオブジェクトを Shift を押しながら複数選択する。グループ化する。エディタ内で右クリックして操作メニューを出す。

### 実装

- ストア: `Selection` に `multi`（`{ ringId, elementId }[]`）を追加。`selectedItems()` / `selectionOf()`（0 → project、1 → element、複数 → multi）、`store.selectMany()`、`store.toggleSelect()`（Shift+クリック）。削除された要素は選択から自動的に外れる。
- コマンド: `removeElements` / `duplicateElements`（複数を 1 回の undo に）、`ungroupCompound`（複合モチーフをメンバーに戻す。scale → mirror → rotate → translate を各メンバーに適用して見た目の位置を保ち、どこからも参照されなくなった複合モチーフは削除）。グループ化は既存の `makeCompound`。
- アクション: `actionDeleteSelected` / `actionDuplicateSelected` が multi に対応、`actionSelectAll`（⌘A）、`actionGroupSelected`（⌘G。同じリング直下の要素 2 つ以上、できないときは通知）、`actionUngroupSelected`（⌘⇧G）。
- キャンバス: 空白からの左ドラッグで矩形選択（破線の矩形を表示、Shift で追加）。パンは中ボタン / Alt / Space / タッチ / 形の上からのドラッグ。要素ごとのコピーの外接矩形（`ElementPath.boxes`、パイプラインで算出）に矩形が触れた要素を選択。Shift/⌘/Ctrl+クリックで追加・解除。右クリックで `ContextMenu`（クリックした要素が未選択なら先に選択。要素: 複製 / グループ化 / グループ解除 / パーツ保存 / cut・keep 切替 / 反転 / 表示切替 / リング選択 / リングの要素をすべて選択 / 削除、リング: 複製 / パーツ保存 / 要素をすべて選択 / ミラー / 表示 / 削除、空白: リング追加 / 全選択 / プロジェクトをパーツ保存 / 全体表示 / 元に戻す）。外側クリック・Esc・ホイールで閉じる。
- ツリー: Shift / ⌘ / Ctrl + クリックで追加選択、複数選択の行をハイライト、`select-none` で文字選択を防止。Inspector に「N 要素を選択中」パネル（一覧・個別に外す・グループ化・複製・削除・選択解除）。ヘルプに操作を追記。
- テスト `tests/commands.test.ts`（選択の合成・トグル・削除連動、複数削除 / 複製と undo、全選択、グループ化 → 移動・回転・拡大・反転 → 解除で位置が保たれる、リングをまたぐ / 入れ子の拒否、参照が残る複合モチーフの保持）。

### 結果

- テスト 113 件成功、ビルド成功。Playwright（Ethnic Border）: ツリーで leaf を選び dot を Shift+クリック → 「2 要素を選択中」、キャンバス上部を矩形ドラッグ → 破線の矩形が出て「8 要素を選択中」、Alt+ドラッグでパンしても選択は維持、要素を右クリック → メニューから「このリングの要素をすべて選択」→ ⌘G で 2 要素が複合モチーフ 1 つに（compounds 1）→ 右クリック「グループ解除」で元の 2 要素に戻り compounds 0、空白の右クリックで「リングを追加 / すべての要素を選択 / …」。コンソールエラーなし。
- 限界: 矩形選択は各コピーの外接矩形で判定するので、斜めの細い形は少し外れた矩形でも選ばれることがある。グループ化は同じリング直下の要素のみ（入れ子・リングをまたぐ選択は不可）。左ドラッグの既定がパンから範囲選択に変わったので、パンは Alt / Space / 中ボタン。

## マイパーツ登録を右クリックメニューに追加（2026-09-21）

### 要求

- マイパーツ登録を右クリックメニューに追加する。

### 実装

- 右クリックメニューの項目名を「マイパーツに登録…」（要素）「N 要素をマイパーツに登録…」（複数選択）「リングをマイパーツに登録…」「プロジェクトをマイパーツに登録…」に統一。Inspector のボタンも「マイパーツに登録」に揃えた。
- 複数選択の登録: `partFromElements()`（`src/model/library.ts`）が同じリング直下の要素を重心を原点とする新しい複合モチーフに束ね、複合モチーフ要素 1 つのパーツとして保存する（プロジェクトは変更しない。参照している複合モチーフも同梱）。挿入すると 1 つのグループとして入る。`actionSavePart` が multi 選択に対応し、リングをまたぐ選択・入れ子のみの選択は通知で断る。Inspector の複数選択パネルにも「マイパーツに登録」を追加。
- テスト（`tests/library.test.ts`）: 2 要素 → 複合モチーフパーツ（重心 (0,3)、メンバー ±3）、複合モチーフの同梱、multi 選択からの登録 → 空プロジェクトへ挿入してステンシルが組めること。

### 結果

- テスト 114 件成功、ビルド成功。Playwright（Ethnic Border）: 要素を右クリック → 「マイパーツに登録…」→ 保存通知、メニューで「このリングの要素をすべて選択」→ 右クリック「2 要素をマイパーツに登録…」→ ライブラリに `compound` 型のパーツ（複合モチーフ 1 件同梱）、マイパーツダイアログにカード 2 枚。コンソールエラーなし。

## スマホ対応（2026-09-21）

### 要求

- スマホで使えるようにする。

### 実装

- `src/app/use-media.ts`: `useMediaQuery` / `useIsMobile`（max-width 860px）/ `useCoarsePointer`（pointer: coarse）。
- `App.tsx`: モバイルでは `main` を 1 カラムにし、キャンバスを全面に、ツリーと Inspector は下からのシート（高さ 62%、✕ で閉じる）として重ねる。`MobileBar`（ツリー / 編集（選択中の名前をバッジ表示）/ 表示切替 / プレビュー / 全体）を最下部に置き、ステータスバーはデスクトップのみ。`#root` は `100dvh`、下部バーに `safe-area-inset-bottom`、`viewport-fit=cover`。
- ツールバー: 860px 以下はアイコンのみ・横スクロール（`.toolbar`、ラベルを非表示、44px ボタン）。タイトルの副題とプロジェクト名は狭い画面で非表示。ステータスバーの座標・計算時間・ズームは狭い画面で非表示。
- ダイアログ: `width: min(指定, 100vw − 16px)`、本文は `100dvh − 90px` までスクロール。参照画像ダイアログのグリッドは 1 カラムに折り返し。入力欄とスライダーのつまみをタッチ向けに大きく。
- キャンバス（タッチ）: 長押し 550 ms で右クリックメニュー（指の下の要素を先に選択）、「範囲選択」ボタンで 1 本指ドラッグを矩形選択に、2 本指は中点の移動でパン + ピンチズーム、ハンドルは coarse pointer で 1.8 倍。ヒント表示とホイール切替ボタンはモバイルで非表示。合成イベント向けに `setPointerCapture` を try/catch。
- バグ修正: キャンバスの初期サイズを 800×600 の仮値ではなく計測後に fit するようにした（スマホで 70% のまま溢れていた）。pointer capture により pointerup の `target` が svg になり、クリックした要素の id が取れず選択できないことがあったため、pointerdown 時のヒット要素を drag 状態に記録して使うようにした（デスクトップにも効く修正）。

### 結果

- テスト 114 件成功、ビルド成功。Playwright（iPhone 13 エミュレーション 390×664、タッチあり）: 横スクロールなし（scrollWidth 390）、ツールバーのラベル非表示、プリセットダイアログが 374px に収まる、下部バー「ツリー」でシートが開き leaf をタップ → 「編集」バッジに leaf、Inspector シートで要素の設定が編集できる、タップで要素選択（マウス・タッチとも）、長押しで要素の操作メニュー、「範囲選択」ON で 1 本指ドラッグ → 6 要素選択、生成ダイアログも画面内。デスクトップ（1500px）の既存ウォークスルー（範囲選択・グループ化・解除）も従来どおり。コンソールエラーなし。
- 限界: 実機（iOS Safari / Android Chrome）では未確認。キーボードショートカットは使えず、ファイルの保存はブラウザのダウンロード扱いになる。ツリーや Inspector はシート内でスクロールするが、参照画像インポートのウィザードは小さい画面では窮屈。

## 向きの修正・ツールバー溢れ・タッチ操作・手描き・軽量化・空のリング（2026-09-21）

### 要求

- マイパーツ登録でパーツの向きが変わるので修正。メニューが見切れて SVG 書き出しボタンが押せないので溢れ処理を入れる。スワイプで横移動、ピンチでズーム。タッチペンでベジェ曲線を描けるように。動作が重いので改善。リング追加時に teardrop が初期追加されるのをやめる。

### 実装

- **向き**: パーツの挿入自体はセクタ座標をそのまま使うので向きは変わらないが、マイパーツのサムネイルがセクタ座標（+x 右）で描かれ、曼荼羅の上部（+x 上）と 90° ずれて見えていた。要素パーツのサムネイルを −90° 回転して +x を上に（`PresetDialog` の `rotate`）。
- **ツールバー**: `Toolbar` を項目配列 + 優先度に変更し、`ResizeObserver` で幅を測って入り切らないボタンを「⋯ その他」メニューへ畳む（プリセット・生成・リング・戻す は最後まで残り、グリッド・ガイド・拡大縮小・共有 から畳まれる）。ボタン幅を 64px 固定（ラベルは省略記号）、「SVG出力」は右端に固定。横スクロールは廃止。
- **タッチ**: `touchmove` / 2 本指 `touchstart` / `gesturestart` を非 passive で `preventDefault`（iOS Safari のページズーム・スクロール抑止）、svg にも `touch-action: none`。合成イベント向けに `setPointerCapture` を try/catch。
- **手描き**: キャンバス右下「✎ 描く」。pointer（ペン・指・マウス）のストロークを設計座標で集め、`simplifyPolyline` → `fitCurve`（閉じるときは `fitClosedPolygon`）で 3 次 Bézier に変換し、描いた位置のセクタコピー k（`pointAngleDeg` と `phase` から算出）へ `invertTransform` で写して、重心を要素位置とする `bezier` 要素を選択中のリング（なければ最後のリング、リングがなければ描いた半径の新しいリング）に追加。長さ 8 mm 超で始点に戻れば閉じた形（塗り）、それ以外は帯（幅は最小形状幅 × 1.5）。描画モード中はハンドルより描画を優先。
- **軽量化**: 検証を専用 Worker（`validation.worker.ts`、`computeValidation`）へ分離。ジオメトリ Worker はステンシルだけを計算するので、ドラッグ中に検証（Dense Floral で 1.3〜8 秒）に待たされない。検証は最後の編集から 450 ms 後に最新のプロジェクトだけを 1 回実行し、表示中のプロジェクトと違う結果は捨てる。初回描画も検証を同期実行しなくなった。プロファイル: Dense Floral の生成 0〜76 ms・ステンシル 60〜210 ms に対し検証 1.3〜8 s（`scripts/prof-stages.test.ts`）。
- **空のリング**: `nextRing` は要素なしで作る。

### 結果

- テスト 114 件成功、ビルド成功。Playwright（1000px デスクトップ）: ツールバーは 12 ボタン + ⋯ + SVG出力（右端 992px ≤ 1000）で、⋯ に 参照画像・抜き・グリッド・ガイド・問題・ブリッジ・拡大・縮小・全体・共有URL・ヘルプ。Dense Floral 読込直後はジオメトリ 155 ms で表示され「検証中…」、約 1.4 s 後に警告表示。手描き: 上部（角度 0）半径 60 mm に描いた線 → Band 1 に `bezier`（x 25.9 ≒ 60 − 35.3、y 0）、輪を描くと `closed: true`（7 点）。iPhone 13 エミュレーション: ⋯ と SVG出力が画面内、タッチのストロークが最後のリングに追加され、描いた位置に現れる。コンソールエラーなし。
- 限界: 実機でのスワイプ・ピンチは未確認（エミュレーションではコード経路のみ確認）。手描きの線は他の要素を横切ると材料を分断して島が増える（ブリッジで対応）。ツールバーの幅計算は固定幅前提。

## iPad で描くボタンが押せない・線をなめらかに・数値入力 UI（2026-09-21）

### 要求

- iPad で「描く」ボタンが押せない。描いた線はなめらかなベクトル線にしてほしい。Inspector の数値入力はバーのドラッグか上下ボタンで変えられる UI にしてほしい。

### 実装

- **ボタンが押せない原因**: キャンバス左下のヒント文（`md:block` なので iPad 幅では表示）が横に長く、右下のボタン列の上に重なってタップを奪っていた（`elementFromPoint` がヒント div を返した）。両ヒントを `pointer-events: none` にし、幅を制限（下は `max-width: calc(100% − 360px)` + truncate）。
- **なめらかな線**: `src/geometry/stroke.ts` に `resample`（等間隔）/ `smooth`（ガウス、開いた線は端点固定・閉じた線は循環）/ `conditionStroke` を追加。`finishStroke` は DP 簡略化をやめ、間隔 0.35〜1 mm でリサンプリング → 半径 1〜4 点のガウス平滑を 2 回 → 許容誤差 0.3〜0.8 mm（長さに応じる）で `fitCurve` / `fitClosedPolygon`（角検出 75°）。
- **数値入力**: `NumberField` を作り直し。min/max があれば塗りつぶしトラック + 22 px つまみのスライダー（`--pct` で塗り）、その下に [グリップ][−][値][＋] の行。− / ＋ は長押しで 400 ms 後から 60 ms 間隔で連続、Shift で 10 倍。グリップは左右ドラッグ 6 px ごとに 1 step（pointer capture）。入力欄は `inputMode="decimal"`、↑↓ キーで step。モバイルでは高さ 36 px・文字 16 px（iOS のフォーカスズーム回避）。
- テスト `tests/stroke.test.ts`（リサンプリングの等間隔と端点、平滑化で揺れが減り端点が保たれ閉曲線は循環、条件付けした波が 6 セグメント以下で収まる、退化入力）。

### 結果

- テスト 118 件成功、ビルド成功。Playwright（iPad gen 7 エミュレーション 810×1080）: 「描く」を touchscreen.tap で ON/OFF、揺れを加えた 60 点のペン線 → `bezier` 7 点（2 セグメント）、Inspector（シート）の x フィールドで ＋ → −52.5 → −52、− → −52.5、スライダーの中央から 70% へドラッグ → 25、グリップを 60 px ドラッグ → 30（10 step）。コンソールエラーなし。
- 限界: 実機の Apple Pencil は未確認（合成 pointer イベントで確認）。長押しの連続変更はボタン外へ指が出ると止まる。

## Output Polarity: Stencil / Positive（2026-09-21）

### 要求

- 曼荼羅を抜くステンシルに加えて、曼荼羅そのものを切り残す Positive / Silhouette モードを追加する。design / material / cut ジオメトリの分離、連結成分・分離部品の検出、自動コネクタ、外周生成、Positive 専用の検証（分離、くびれ、孤立した飾り、細い先端、細すぎる材料、浮いた島、隙間。最小接続幅を設定可能）、UI の切替、極性に応じた SVG 書き出し、インポートでの Positive Cutout。

### 実装

- モデル: `Project.output = { polarity, minConnectionWidth, autoConnect, maxConnectorSpan }`（`normalizeProject` で補完・クランプ、既存 JSON は stencil）。コマンド `updateOutput`。
- ジオメトリ `src/geometry/stencil/output.ts`: `buildOutput()` が `OutputGeometry { designGeometry, materialGeometry, cutGeometry, stencil, connectors, componentsBefore, components }` を返す。Stencil は従来の `buildStencil` を包み、material = sheet − final。Positive は design を部品に分け（`materialComponents`、入れ子は `nested`）、`generateConnectors()`（union-find + 最近傍、曲線の帯、最後に union 1 回）で繋ぎ、material = design ∪ connectors、cut = material の境界。
- 検証: `validateStencil` は `output` が Positive のとき `validatePositive`（`src/validation/positive.ts`）へ委譲。分離部品 / 孤立した飾り / 浮いた材料 / 部品間の狭い隙間（0.2 mm 問題）/ くびれ / 細い先端 / 細すぎる材料 / 材料同士の狭い隙間 / 小さい内部カット。`erosionCheck` に join・arcTolerance・clean オプションを追加（Stencil は従来どおり square）。
- パイプライン: `computeStaged` / `computeValidation` が `buildOutput` を使い、`StencilRender` に `polarity` / `materialPath` / `wastePath` / `connectorPath` / `strayPath` と部品数・コネクタ数を追加。書き出しは `output.cutGeometry`（SVG の title / desc / path id が極性を示す）。
- UI: ツールバーに「Stencil / Positive」トグル、Inspector に「出力（Output Polarity）」（切替、最小接続幅、自動コネクタ、最大長。ブリッジ節は Stencil のみ）、加工チェックの見出し（分離部品・コネクタ・残る材料の面積）、ステータスバー（コネクタ・部品）。キャンバス: Positive の材料ビューは残る曼荼羅を白・除去部を背景色、抜きビューは除去領域を黒 + カットライン、コネクタを緑、分離部品を赤破線で表示。ヒント文も極性に応じる。
- インポート: `ImportMode` に `positive`（黒い模様を残す材料として取り込み、`output.polarity = positive`、ブリッジなし）。ダイアログに「C: Positive Cutout」。
- 性能: 初版は Dense Floral（649 部品）で コネクタ 33 s・検証 69 s。コネクタを union-find に変えて 1.4 s、検証は square join の erosion が 43 s と極端に遅かったので round join（arcTolerance 0.3、0.25 mm に粗く）にして 5 s。
- テスト `tests/polarity.test.ts`（Stencil: material = sheet − cut、Positive: material = design ∪ connectors・cut = material 境界・9 部品 → 1、両極性の SVG 書き出し、正規化、`closestPoints` と 2 正方形の接続、穴の中の部品の接続、自動コネクタ OFF で `disconnected` → ON で合格、0.2 mm 隙間の `narrow-gap`、0.6 mm ネックの `thin-neck`、`isolated-ornament` / `unsupported-island`、Dense Floral が Positive で 1 部品になり書き出せる）。`scripts/polarity-view.test.ts` / `scripts/prof-positive.test.ts`。

### 結果

- テスト 127 件成功（全体 280 s。並列実行で CPU が詰まると 120 s タイムアウトに掛かる重いテストがあるので、失敗したら単独で再実行）、ビルド成功。
- Playwright（Ethnic Border）: ツールバー「Stencil」→「Positive」で パス 265 / ブリッジ 24 → パス 4 / コネクタ 243 · 部品 1、材料ビューが「残る曼荼羅が白」、コネクタ表示、Inspector に出力節（ブリッジ節は非表示）、検証で くびれ 40 / 細い先端 40 の警告、Inspector の Stencil ボタンで戻り、リロード後も Positive を保持。コンソールエラーなし。目視: Ethnic Border / Dense Floral の両方で 1 部品（コネクタ 243 / 648）、書き出しパス 4 / 10。
- 限界: コネクタは最短距離の曲線帯で、既存の蔓・カール要素の形を流用するところまでは至っていない（要素として `connector` / `vine` を手で足すことはできる）。細い装飾が多いデザインでは くびれ・細い先端の警告が多く出る。Positive の検証で「材料同士の狭い隙間」は大きなデザインでは件数のみ。

## オブジェクトのロックと非表示（2026-09-21）

### 要求

- オブジェクトのロック機能と非表示機能。左側のリストで切替でき、エディタ内の右クリックでの選択にも対応する。

### 実装

- モデル: `Ring.locked` / `ElementBase.locked`（省略可、`normalizeProject` で `locked === true` のみ真）。非表示は既存の `visible`。
- コマンド `updateElements(items, patch)`（複数要素の一括更新）、アクション `actionSetLockedSelected` / `actionSetVisibleSelected`（要素・複数・リング）。`isLocked(project, ringId, elementId)` はリングのロックを要素に波及させる。
- キャンバス: ロックされた要素は pointerdown のヒットから除外（クリックしても選ばれずパンになる）、範囲選択と ⌘A から除外、右クリック・長押しでは「ロックされた要素です」と通知して選択しない（メニューは現在の選択に対して出る）、選択中でもハンドルとリング半径ハンドルを出さず、矢印キー・[ ]・< > も無効。
- ツリー: リング行・要素行に 🔓 / 🔒（ロック中は常時表示、そうでなければホバーで表示）を ◉ / ○ の隣に追加。ロック中でもツリーから選択・解除できる。
- 右クリックメニュー: 要素に「ロック / ロック解除」「非表示にする / 表示する」、複数選択に「N 要素を非表示 / ロック / ロック解除」、リングに「リングをロック / 解除」、空白に「すべてのロックを解除」（ロックがあるときのみ）。Inspector の要素・リング節にロックのトグルと注意書き、複数選択パネルにロック / 解除 / 非表示 / 表示ボタン。ヘルプに追記。
- テスト（`tests/commands.test.ts`）: リングのロックが要素に波及、`updateElements` が入れ子にも効く、複数選択のロック / 非表示、JSON 往復で保持、既定は false。

### 結果

- テスト 128 件成功、ビルド成功。Playwright（Ethnic Border）: leaf をクリックで選択 → ツリーの 🔓 でロック → 同じ場所をクリックしても選択されない、右クリックで通知 + 空白メニュー（「すべてのロックを解除」あり）、ツリーからは選択でき Inspector に注意書き・ハンドルなし、解除後の右クリックメニューに「ロック（選択・移動を禁止）」があり実行で `locked: true`、リングの 🔒 で半径ハンドルが消える、⌘A → 右クリックで「9 要素を非表示 / ロック / ロック解除」、非表示を実行して 9 要素が `visible: false`。コンソールエラーなし。

## Positive の補強で対称性を保つ・右上の「？」ヘルプ（2026-09-21）

### 要求

- Positive で補強するとき対称性を失わないようにする。エディタ右上に「？」アイコンを追加し、特にファイルの開く・保存・SVG の保存を重点的に説明する。

### 実装

- 対称性: `detectSymmetry(project)` がリングの繰り返し数（と中心モチーフの花弁数）の gcd から回転対称の次数を、全リングが `mirrorLocal` で各リングのセクタ軸が最初のリングの位相と揃う（位相差が 180/repeat の倍数）ときに鏡映軸を求める。中心の円だけのリング（radius 0 の dot / circle）は対称性を制限しない。`generateConnectors` はコネクタを 1 本決めるたびに対称群の像（回転 × 鏡映）を `orbitOf` でまとめて追加し、各像の端点が乗る部品を `pieceAt`（元の輪郭の外接矩形で絞り込み → 境界距離）で求めて union-find で結合する。像の端点が材料に乗らないとき（シートで切り取られている等）はその像だけ捨てるので、想定より対称性が低いデザインでも浮いた帯はできない。像で結合済みの部品は以降スキップされるので、対称な位置に重複したコネクタは付かない。
- 見つけた不具合: 部品の外接矩形を間引き輪郭から計算していたため大きな部品で像の端点が絞り込みから漏れ、像が落ちていた（元の輪郭で計算するよう修正）。
- ヘルプ: ツールバー右端（SVG出力の左）に常時表示の丸い「？」ボタン（`.help-btn`、溢れメニューに畳まれない）。`HelpDialog` を作り直し、先頭に「ファイルの開く・保存・SVG 書き出し」の 5 ステップ（ブラウザ自動保存の注意、⬇ 保存 = `.mandala.json`、⌂ 開く = JSON / MandalaFab SVG、右上の ⬢ SVG出力 = mm・閉じたパス・プレビューで確認・Stencil と Positive の違い・外形出力・加工チェックの赤、共有 URL）を置き、考え方・ステンシルの扱い・ショートカットと操作（ロック / 表示・Positive・数値入力・描くを含む）・注意を続ける。
- テスト（`tests/polarity.test.ts`）: `detectSymmetry`（8 花弁 + 中心円 → 8、mirrorLocal で鏡映軸、Dense Floral は 6（6 回のバンドがある）、非対称なリングを足すと 1）、Ethnic Border（8）と Dense Floral（6 + 鏡映）で全コネクタの回転像・鏡映像がコネクタ集合に存在（シート 240 mm でクリップなし）。

### 結果

- テスト 130 件成功（ロック・対称性・ヘルプを含む全体）、ビルド成功。Playwright: 1200px で「？」が右上（SVG出力の左、y < 60）にあり、クリックでダイアログ先頭が「ファイルの開く・保存・SVG 書き出し」、`.mandala.json` / ⌘O / SVG出力 の記述あり。iPhone 幅でも「？」が画面内でダイアログは 390px に収まる。コンソールエラーなし。

## 位置ハンドルのセクタ軸スナップ（2026-09-21）

### 要求

- ミラー付きリングで要素の位置ハンドル（白い四角）を左右に動かすと 2 つに分かれるが、1 つのまま中心に置きたいことがあるので、中心（セクタ軸）にスナップする。

### 実装

- `Canvas` の origin ハンドルのドラッグで、セクタ座標の |y| が 8 px（タッチ端末は 14 px）未満なら y = 0 に吸着。Alt 押下で無効。ヘルプに追記。

### 結果

- ビルド成功。Playwright（Dense Floral の large teardrop）: 5 px 横にドラッグ → y = 0 のまま、40 px → y = 9.7、軸の近くへ戻す → y = 0。コンソールエラーなし。
