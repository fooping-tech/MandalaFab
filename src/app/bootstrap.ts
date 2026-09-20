import { decodeShareHash } from "../export/share";
import { loadLocal } from "../editor/persist";
import { initStore, type EditorStore } from "../editor/store";
import { loadPreset } from "../presets";

/** Pick the initial project: shared URL → autosave → default preset. */
export async function bootstrap(): Promise<EditorStore> {
  let project = null;
  let fromUrl = false;
  if (location.hash.length > 3) {
    project = await decodeShareHash(location.hash);
    fromUrl = project !== null;
  }
  if (!project) project = loadLocal();
  if (!project) project = loadPreset("flower");
  const store = initStore(project);
  if (fromUrl) {
    history.replaceState(null, "", location.pathname + location.search);
    store.notify("URLから作品を読み込みました。", "success");
  }
  return store;
}
