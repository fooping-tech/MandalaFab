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
