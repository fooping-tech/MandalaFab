# Reference Image Import

手描き／画像の曼荼羅を、編集可能な MandalaFab プロジェクト（center + rings[] + elements[]）に変換する機能。単なる画像貼り付けや SVG トレースではなく、Sector / Element モデルへ正規化する。

## パイプライン（`src/import/`、React 非依存・Web Worker で実行）

| ステップ | モジュール | 内容 |
| --- | --- | --- |
| 1 Crop / Preprocess | `preprocess.ts` | グレースケール → contrast → box blur ×2 → しきい値（Otsu 自動 / 手動 / 適応（局所平均））→ 背景の明暗を縁 2 % から判定して常に ink = 1 → invert → morphological open+close（denoise） |
| 2 Center | `center-detect.ts` | インク重心（モーメント）・外接矩形中心を初期値に、180° 回転の自己相似スコア（偶数 fold の曼荼羅は必ず点対称）を粗→密探索で最大化。UI でドラッグ修正可 |
| 3 Symmetry | `symmetry-detect.ts` | **極座標展開**（角度 720 列 × 半径行、細線が消えないよう ±2° / ±2 行でぼかす）の上で、360/n 列ずらした 2D 相関を候補 n ごとに計算。上位に並ぶ n のうち最大のもの（約数はすべて高相関になるため）。中心は「相関を最大にする位置」を格子探索 + 山登りで同時最適化（`refineCenterPolar`）。ミラー軸は展開画像の列反転相関をセクタ内で走査。**帯ごとの対称数**（`detectSymmetryBands`）も推定し、帯ごとに n が違う曼荼羅（中心 8・葉 16・花 12・外周 16 など）はリングごとに repeat を変えて変換する |
| 4 Sector | `sector-extract.ts` | 各輪郭を重心角でセクタに割り当て、セクタ 0 へ回転。n 個のコピーが重なるので重心距離・面積が近いものをクラスタ化し中央値の 1 つを代表に。**コピーが ceil(n/3) 個未満しか揃わない形は対称とみなさず、元の位置のまま（repeat 1 の "Unmatched shapes (world)" リング）保持**する — 誤ったセクタ化で形を壊すより忠実さを優先。ミラーがあれば relDeg ≥ 0 の半分のみ |
| 5 Vectorize | `contours.ts`, `bezier-fit.ts` | marching squares（iso 0.5、外周にパディング）で閉ループ抽出、包含の偶奇で穴判定。Douglas–Peucker → 60° 以上の角で分割 → Schneider の 3 次 Bézier フィット（Newton 再パラメータ化） |
| 6 Recognize | `primitive-recognition.ts` | 主軸（PCA）と伸びから circle / dot / teardrop / leaf / petal / paisley の候補を実際に生成し、元輪郭との IoU を confidence にする。IoU ≥ 0.88 で採用、それ以外は Bézier のまま保持 |
| 7 Convert | `project-converter.ts` | 中心を含む形は Center リング（repeat 1）、それ以外は代表セクタ → リングへ。要素はセクタ座標（`instanceTransform(0)` の逆変換）に置き、Bézier は重心相対の点列、認識形は length / width / rotation。穴は `keep` の子要素 |
| 8 Ring | `ring-cluster.ts` | 重心半径の 1D クラスタリング（ギャップ ≥ 6 %）。複数リングにまたがる要素は Free elements リング |
| 9 Stencilize | `project-converter.ts`, `contours.ts` | Mode B（塗り形状）: 最小穴径未満の形を除去、細い線は最小形状幅まで太らせる、自動ブリッジ ON。**Mode B′ cells（線画）**: マスクを反転して「線で囲まれた紙の領域」をセルとして抽出（`traceCells`、外枠に接する背景と巨大領域は除外）し、セルを抜く形にする。線が材料の網として残り、線幅 < 最小間隔ならセルを縮めて網を太くする。推定線幅（2A/P の中央値）が最小形状幅より細ければウィザードが自動で cells を選ぶ。Mode A（Trace Only）は忠実にベクタ化しブリッジ OFF。DP / Bézier の許容誤差は線幅に応じて自動で小さくする（`autoTolerances`） |

## UI

- ツールバー「参照画像」→ `ImportReferenceDialog`（Crop → Threshold → Center → Symmetry → Sector → Vectorize → Convert → Validate）。解析は `import.worker.ts`（`ImportClient` 経由）で行い、2048 px 以下に縮小して処理する。
- 取り込むとプロジェクトが置き換わり（Undo 可）、切り抜いた画像が **Reference Layer** として残る。インスペクタ（プロジェクト選択時）で visibility / opacity / scale(mm) / rotation / x・y、Difference View（reference only / generated only / overlap）を切り替えられる。
- 認識した要素は `imported: { detectedType, confidence }` を持ち、confidence < 0.7 はツリーに ⚠、インスペクタに警告を表示する。

## 受け入れテスト（`tests/import.test.ts`）

Composition Engine で作った 12 回対称の曼荼羅を 600 px にラスタ化し、前処理（明背景・暗背景）→ 中心（±4 px）→ 対称数 12 とミラー軸 → 輪郭（面積誤差 < 10 %）→ Bézier（誤差内）→ 認識（teardrop / circle / それ以外は bezier）→ 変換（symmetry 12、repeat 12 のリング、mirrorLocal、要素 > 5、再生成の IoU > 0.6、SVG 書き出し）→ Stencilize（島 0）まで検証する。

## 実画像での結果（886 px の線画・帯ごとに 8 / 16 / 12 / 16 回対称）

- 前処理: 背景明・Otsu 0.62・インク 11 %。既定 denoise は 0（3 px の線を消さないため）。
- 中心: 大きな円輪郭の重心 → 極座標相関で微調整（437.9, 458.9）。
- 対称数: 全体では 16 が最上位だが帯ごとに異なる（64–104 px: 32-fold 0.96、261–301 px: 16-fold 0.75 …）。相関 0.5 未満の帯は全体値にフォールバック。
- cells モード: 803 セル → 248 要素・4 リング（うち 220 は対称に揃わず元位置で保持）、島 0（自動ブリッジ 583）、ジオメトリ 367 ms + 検証 409 ms で編集可能。SVG 書き出し可。
- Trace Only: 線画を忠実に再現（線 = 細い帯）。

## 限界

- 線画のセル化では、線だけで浮いている形（円の間に描かれた花など）は材料の島になり自動ブリッジで接続される。ブリッジの位置は自動なので、意匠として置き直す場合は手動編集が必要。
- 帯ごとに対称数が違う画像では、多くの形が「対称に揃わない」と判定され元位置で保持される（編集は Bézier 単位）。同じ帯の中で n を正しく判定できた形だけがセクタ化される。
- 認識は塗り形状に対してのみ有効（線画の輪郭帯は Bézier として保持される）。
- セクタの代表は「重心がセクタ内にある形」なので、境界をまたぐ大きな形は隣セクタと二重になる場合がある。
