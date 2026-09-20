/**
 * Share a project through the URL hash: `#z=<base64url(deflate-raw(json))>` when
 * CompressionStream is available, otherwise `#p=<base64url(json)>`.
 */
import type { Project } from "../model/project";
import { normalizeProject } from "../model/validate";

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const pair = stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  const source = new Blob([bytes as BlobPart]).stream() as ReadableStream<Uint8Array>;
  const buf = await new Response(source.pipeThrough(pair)).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeShareHash(project: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(project));
  if (typeof CompressionStream !== "undefined") {
    try {
      const z = await pipe(json, new CompressionStream("deflate-raw"));
      return `#z=${bytesToBase64Url(z)}`;
    } catch {
      /* fall through */
    }
  }
  return `#p=${bytesToBase64Url(json)}`;
}

export async function decodeShareHash(hash: string): Promise<Project | null> {
  const m = hash.match(/^#?(z|p)=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    let bytes = base64UrlToBytes(m[2]!);
    if (m[1] === "z") {
      if (typeof DecompressionStream === "undefined") return null;
      bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    }
    return normalizeProject(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
