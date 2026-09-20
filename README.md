# MandalaFab

ブラウザ上で曼荼羅・幾何学模様をデザインし、レーザーカッター／カッティングマシン／CNC で加工できる **ステンシル用 SVG** を生成する Web アプリです。

公開 URL: https://fooping-tech.github.io/MandalaFab/

MandalaFab は単なる曼荼羅ジェネレータではなく、「製造可能性を理解した Generative CAD」を目指しています。
[TypeFab](https://github.com/fooping-tech/TypeFab) が文字を加工可能な形に変換するのと同じように、MandalaFab は放射対称のジェネラティブアートを **一枚のステンシルとして切り出せる形状** に変換します。

## できること

- 中心 → リング → モチーフ の階層で曼荼羅を組み立てる（Radial Repeat）
- リングごとに 半径 / 幅 / サイズ / モチーフ / モチーフ数 / 回転角 / オフセット（位相） / 線幅 / 間隔 / 内向き・外向き を編集
- モチーフ: Circle, Dot, Petal, Leaf, Diamond, Triangle, Arc, Teardrop, Line, Wave, Spiral（TypeScript のレジストリで追加可能）
- **Stencil Validation**: 脱落する島・細すぎるブリッジ／材料・細すぎる形状・小さすぎる穴・自己交差・重複パス・シートからのはみ出し を検出し、キャンバス上でハイライト
- **自動 Bridge 生成**: 島を外側の材料へ接続する橋を対称性を保って生成（ブリッジ幅・中心の島のブリッジ数・島あたりの本数を設定可能）
- 対称数 4 / 6 / 8 / 10 / 12 / 16 / 24 / 32 と任意の値
- プリセット 8 種（Flower, Lotus, Geometric, Sun, Snowflake, Sacred Geometry, Simple Kids, Japanese Pattern）
- Random Generate（対称数・複雑さ・リング数・密度・seed。同じ seed なら同じ結果）
- シート 100 / 150 / 200 / 300 mm 角とカスタム
- 加工制約（最小ブリッジ幅 1.5 mm、最小形状幅 1.0 mm、最小間隔 1.0 mm、最小穴径）と材料プリセット（紙・プラ板・MDF・アクリル）
- SVG 書き出し（mm 単位、正しい viewBox、transform なし、閉じた compound path、重複パス除去、パス最適化、メタデータにプロジェクト JSON を埋め込み）
- JSON プロジェクトの保存／読み込み、URL での共有、ブラウザへの自動保存
- Undo / Redo（Command パターン + スナップショット履歴）
- CAD 風 UI: 左 Ring Tree、中央 SVG キャンバス（ズーム・パン・グリッド・中心／放射ガイド・ルーラー・選択・ホバー）、右 Inspector、上 Toolbar、下 Status Bar

## 使い方

1. 「プリセット」または「生成」で出発点を作ります。
2. 左のツリーでリングを選び、右のインスペクタでパラメータを変えます。キャンバスは即座に再計算されます。
3. 上部の「ステンシル」表示で、結合・ブリッジ後の最終的なカット形状（赤線）を確認します。黄／赤のハイライトは加工チェックで見つかった領域です。
4. 「SVG出力」でレーザー加工用 SVG を保存します。「保存」でプロジェクト JSON、「共有URL」でリンクを作れます。

キーボード: `⌘Z` / `⌘⇧Z` 元に戻す・やり直し、`N` リング追加、`Delete` 削除、`S` 表示切替、`G` グリッド、`F` 全体表示、`+` / `-` ズーム。

## ステンシルの考え方

描いた形は **切り抜かれる穴（aperture）** になります。穴に完全に囲まれた材料は **島** となり、切断後に脱落します。
MandalaFab は結合後の穴の「内側の輪郭」を島として検出し、**ブリッジ**（切らずに残す帯）を穴から差し引くことで島を外側の材料へ接続します。
中心を含む島は対称数に応じた本数の放射状ブリッジ、それ以外の島は放射方向（内側／外側）のブリッジになるため、k 回対称の曼荼羅ではブリッジも k 回対称になります。

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

`npm run dev` で http://127.0.0.1:5173/MandalaFab/ が開きます。`npm test` は Vitest でジオメトリエンジンのユニットテストを実行します。

設計ドキュメントは [docs/](docs/) にあります。

- [docs/architecture.md](docs/architecture.md) — 全体構成、TypeFab から引き継いだ知見、ライブラリ選定
- [docs/data-model.md](docs/data-model.md) — プロジェクト JSON とリングのデータモデル
- [docs/geometry-model.md](docs/geometry-model.md) — 座標系、モチーフ、Radial Repeat、ブーリアン、島検出、ブリッジ、検証
- [docs/mvp-scope.md](docs/mvp-scope.md) — MVP の範囲と将来の拡張
- [docs/implementation-plan.md](docs/implementation-plan.md) — 実装計画と進捗

## 公開（GitHub Pages）

`main` への push で `.github/workflows/pages.yml` が `npm ci` → `npm test` → `npm run build` → Pages デプロイを行います。テストかビルドが失敗するとデプロイされません。`vite.config.ts` の `base: "/MandalaFab/"` は Pages のパスに合わせています。

## ライセンス

MIT
