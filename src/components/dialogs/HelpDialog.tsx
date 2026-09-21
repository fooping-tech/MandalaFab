import { Dialog } from "./Dialog";

const rows: [string, string][] = [
  ["⌘Z / ⌘⇧Z", "元に戻す / やり直し"],
  ["⌘S / ⌘⇧S", "JSON保存 / SVG書き出し"],
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
  ["右クリック", "操作メニュー（複製・削除・グループ化・パーツ保存 など）"],
  ["⌘A", "すべての要素を選択"],
  ["⌘G / ⌘⇧G", "グループ化（複合モチーフにまとめる）/ グループ解除"],
  ["⌘D", "選択中の要素／リングを複製"],
  ["✎ 描く", "キャンバス右下。ペン・指・マウスでなぞった線を Bézier 要素にする（始点に戻ると閉じた形）"],
  ["⋯ その他", "ツールバーに入り切らない操作。SVG出力は常に右端に表示"],
  ["数値入力", "スライダーのドラッグ / − + ボタン（長押しで連続、Shift で 10 倍）/ 左端グリップの左右ドラッグ / ↑↓ キー / 直接入力"],
  ["Esc", "選択解除"],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="MandalaFab の使い方">
      <div className="grid gap-4 text-[12px] leading-relaxed">
        <section>
          <h3 className="mb-1 font-semibold">考え方</h3>
          <p>
            曼荼羅は <b>中心モチーフ + リング（セクタ）</b> で作ります。リングは 360°/repeat の角度セクタに要素（涙滴・葉・ペイズリー・S字・渦巻き・Bezier パス…）を配置したもので、
            「セクタ内ミラー」を使えば半分だけデザインして左右対称にし、それが repeat 回だけ回転複製されます。要素には局所リピート（セクタ内での放射複製）、cut/keep のブーリアン、縁取り（inset）も指定できます。
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">ステンシルとしての扱い</h3>
          <p>
            描いた形は「抜ける穴」です。穴に囲まれた材料（島）は脱落するため、MandalaFab は島を検出して <b>ブリッジ</b>（残す帯）で外側へ自動接続します。
            <b>材料ビュー</b>は残る材料を白で、<b>抜きビュー</b>はレーザーで抜ける領域を黒で表示します。どちらも書き出される SVG と同じ形状です。
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">マイパーツ（自分のプリセット）</h3>
          <p>
            要素・リング・プロジェクトを選択して Inspector の「パーツ保存」を押すと、ブラウザ内のライブラリに保存されます。ツールバーの「マイパーツ」から挿入（要素は選択中のリングへ、リングは新しいリングとして、プロジェクトは開く）・名前変更・削除ができます。
            「書き出し」で <code>.parts.json</code> に保存し、別のブラウザや他の人の環境では「読み込み」で取り込めます。要素が使う複合モチーフは一緒に保存されます。
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">ショートカット</h3>
          <table className="w-full">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-line-2">
                  <td className="py-1 pr-4 font-mono text-[11px]">{k}</td>
                  <td className="py-1">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">注意</h3>
          <p>加工チェックは形状上の問題を検出するもので、材料強度や切断後の完全性を保証するものではありません。データはブラウザ内だけで処理され、外部には送信されません。</p>
        </section>
      </div>
    </Dialog>
  );
}
