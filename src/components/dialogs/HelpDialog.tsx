import { Dialog } from "./Dialog";

const rows: [string, string][] = [
  ["⌘Z / ⌘⇧Z", "元に戻す / やり直し"],
  ["⌘S / ⌘⇧S", "JSON保存 / SVG書き出し"],
  ["⌘O", "JSON または MandalaFab SVG を開く"],
  ["N", "リングを追加"],
  ["Delete", "選択中のリングを削除"],
  ["S", "デザイン / ステンシル表示の切替"],
  ["G", "グリッド"],
  ["F", "全体表示"],
  ["+ / −", "ズーム"],
  ["Esc", "選択解除"],
];

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="MandalaFab の使い方">
      <div className="grid gap-4 text-[12px] leading-relaxed">
        <section>
          <h3 className="mb-1 font-semibold">考え方</h3>
          <p>
            曼荼羅は <b>中心 → リング → モチーフ</b> の階層で作ります。各リングは1つのモチーフを円周上に複製（Radial Repeat）したものです。
            ステンシルでは描いた形が「切り抜かれる穴」になるので、穴に囲まれた材料（島）は脱落します。MandalaFabは島を検出し、<b>ブリッジ</b>（切らずに残す帯）で外側へ自動接続します。
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">表示</h3>
          <p>
            <b>デザイン表示</b>はリングごとの形（赤 = 脱落する島）、<b>ステンシル表示</b>は結合・ブリッジ後の最終的な切り抜き（= 書き出されるSVG）です。
            黄色/赤の塗りは加工チェックで見つかった領域です。
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
