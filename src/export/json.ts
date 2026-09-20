import type { Project } from "../model/project";

export function exportJSON(project: Project): string {
  return JSON.stringify(project, null, 2);
}
