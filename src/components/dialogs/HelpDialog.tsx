import type React from "react";
import { Dialog } from "./Dialog";

const rows: [string, string][] = [
  ["⌘Z / ⌘⇧Z", "元に戻す / やり直し"],
  ["⌘S / ⌘⇧S", "プロジェクト JSON を保存 / SVG を書き出し"],
  ["⌘O", "JSON または MandalaFab SVG を開く"],
  ["N", "リング（セクタ）を追加"],
  ["Delete", "選択中の要素／リングを削除"],
  ["S", "デザイン → 材料 → 抜き の表示切替"],
  ["P", "加工プレビュー（書き出しと同じカットラインだけを表示）"],
  ["G", "グリッド"],
  ["F", "全体表示"],
  ["+ / −", "ズーム"],
  ["矢印キー", "選択要素を移動（Shift で 2 mm）／リングの半径"],
  ["[ / ]", "選択要素を回転（Shift で 15°）／リングの位相"],
  ["< / >", "選択要素を 5 % 縮小・拡大"],
  ["ハンドル", "位置（□）・長さ（■ 先端）・幅（■ 横）・回転（○ 橙）・リング半径（○ 青）。Shift でスナップ"],
  ["ドラッグ（空白から）", "矩形で範囲選択。Alt / Space / 中ボタン + ドラッグ: パン"],
  ["Shift+クリック", "要素を追加選択（キャンバス・左のツリー）"],
  ["右クリック / 長押し", "操作メニュー（複製・削除・グループ化・マイパーツに登録・ロック・非表示 など）"],
  ["⌘A", "すべての要素を選択"],
  ["⌘G / ⌘⇧G", "グループ化（複合モチーフにまとめる）/ グループ解除"],
  ["⌘D", "選択中の要素／リングを複製"],
  ["✎ 描く", "キャンバス右下。ペン・指・マウスでなぞった線を Bézier 要素にする（始点に戻ると閉じた形）"],
  ["⋯ その他", "ツールバーに入り切らない操作。SVG出力は常に右端に表示"],
  ["出力 Stencil / Positive", "ツールバーか Inspector で切替。Stencil = シートに曼荼羅を抜く、Positive = 曼荼羅そのものを切り残す（離れた図柄はコネクタで自動接続、対称性を保つ）"],
  ["🔒 ロック / ◉ 表示", "左のツリーの各行、右クリックメニュー、Inspector で切替。ロック中はキャンバスで選択・移動できない（ツリーからは選択・解除できる）"],
  ["数値入力", "スライダーのドラッグ / − + ボタン（長押しで連続、Shift で 10 倍）/ 左端グリップの左右ドラッグ / ↑↓ キー / 直接入力"],
  ["Esc", "選択解除"],
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="text-ink-2">{children}</div>
      </div>
    </div>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border border-line bg-panel px-1 font-mono text-[10px]">{children}</kbd>;
const Btn = ({ children }: { children: React.ReactNode }) => <span className="rounded border border-line bg-paper px-1.5 py-0.5 text-[11px]">{children}</span>;

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="MandalaFab の使い方" width={720}>
      <div className="space-y-5 text-[12px] leading-relaxed">
        <section className="rounded-lg border border-accent/40 bg-accent/5 p-3">
          <h3 className="mb-2 font-semibold">ファイルの開く・保存・SVG 書き出し</h3>
          <div className="space-y-3">
            <Step n={1} title="作業内容はブラウザに自動保存されます">
              編集するたびにこのブラウザ（localStorage）へ保存され、次に開いたときに続きから始まります。別の PC やブラウザには引き継がれないので、残したいものは下の「保存」で JSON にしてください。
            </Step>
            <Step n={2} title="保存（プロジェクト JSON）">
              ツールバーの <Btn>⬇ 保存</Btn>（<Kbd>⌘S</Kbd>）で <code>名前.mandala.json</code> がダウンロードされます。リング・要素・設定がすべて入った編集用ファイルです。スマホではブラウザのダウンロード先（iPhone は「ファイル」アプリ）に保存されます。
            </Step>
            <Step n={3} title="開く">
              <Btn>⌂ 開く</Btn>（<Kbd>⌘O</Kbd>）で保存した <code>.mandala.json</code> を選びます。MandalaFab が書き出した SVG も開けます（SVG の中にプロジェクトが埋め込まれているため）。開くと今のプロジェクトは置き換わります（<Kbd>⌘Z</Kbd> で戻せます）。
            </Step>
            <Step n={4} title="SVG 書き出し（レーザー加工用）">
              右上のオレンジの <Btn>⬢ SVG出力</Btn>（<Kbd>⌘⇧S</Kbd>）。単位 mm・閉じたパスだけの SVG で、加工ソフト（LightBurn、xTool、Glowforge、Inkscape など）にそのまま読み込めます。書き出す前に <Btn>✂ プレビュー</Btn> で赤いカットラインを確認してください。表示されている線がそのまま出力されます。
              <ul className="mt-1 list-disc pl-5">
                <li>Stencil: シートに曼荼羅を抜く穴。脱落する島はブリッジ（橙）で繋いだ状態で出ます。</li>
                <li>Positive: 曼荼羅そのものの外周と内部カット。離れた図柄はコネクタ（緑）で繋いだ 1 部品になります。</li>
                <li>「外形も出力する」（Inspector → シート）を ON にするとシートの外形線も入ります。</li>
                <li>Inspector の「加工チェック」に赤（エラー）が残っているときは、そのまま切ると落ちる・折れる部分があります。</li>
              </ul>
            </Step>
            <Step n={5} title="共有 URL">
              <Btn>⇪ 共有URL</Btn> はプロジェクトを URL のハッシュに詰めたリンクです。サーバーには何も送られません。
            </Step>
          </div>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">考え方</h3>
          <p>
            曼荼羅は「中心モチーフ」と「リング」でできています。リングは 1 セクタ（360° ÷ 繰り返し数）のデザインで、その中に要素（涙滴・葉・ペイズリー・Bézier など）をセクタ座標（x: 外向き、y: 接線方向）で置きます。ミラーで左右対称にしてから回転複製されます。プリセットや自動生成から始めて、気に入った要素は「マイパーツに登録」で再利用できます。
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">ステンシルとしての扱い</h3>
          <p>
            Stencil では、切り抜かれる形に囲まれて浮いてしまう材料（島）を自動でブリッジで繋ぎます。Positive では、離れた図柄同士をコネクタで繋いで 1 つの部品にします。「加工チェック」は形状上の問題を検出しますが、材料強度や切断後の完全性を保証するものではありません。
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">ショートカットと操作</h3>
          <table className="w-full">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-line-2">
                  <td className="py-1 pr-4 align-top font-mono text-[11px]">{k}</td>
                  <td className="py-1">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">注意</h3>
          <p>プロジェクトと SVG は外部に送信されません。検証結果は「安全」を保証するものではなく、見つかった問題を示すだけです。</p>
        </section>
      </div>
    </Dialog>
  );
}
