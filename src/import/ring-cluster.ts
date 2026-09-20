/**
 * Step 8: 1D clustering of centroid radii into rings. Gaps larger than a
 * threshold (relative to the design radius) separate clusters. Elements whose
 * radial extent spans more than one cluster are "free" (cross-ring) elements.
 */
export interface RadialItem {
  index: number;
  radius: number;
  /** Radial extent of the shape (max radius - min radius). */
  span: number;
}

export interface RingCluster {
  radius: number;
  min: number;
  max: number;
  members: number[];
}

export interface RingClustering {
  rings: RingCluster[];
  /** Indices of cross-ring (free) items. */
  free: number[];
}

export function clusterRings(items: readonly RadialItem[], maxRadius: number, gapFactor = 0.06): RingClustering {
  const sorted = items.slice().sort((a, b) => a.radius - b.radius);
  const gap = Math.max(2, maxRadius * gapFactor);
  const clusters: RingCluster[] = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && it.radius - last.max <= gap) {
      last.members.push(it.index);
      last.max = it.radius;
    } else clusters.push({ radius: it.radius, min: it.radius, max: it.radius, members: [it.index] });
  }
  for (const c of clusters) {
    const rs = c.members.map((i) => items.find((x) => x.index === i)!.radius);
    c.radius = rs.reduce((a, b) => a + b, 0) / rs.length;
  }
  // Free items: radial span far larger than the typical spacing between rings.
  const spacing = clusters.length > 1 ? (clusters[clusters.length - 1]!.radius - clusters[0]!.radius) / (clusters.length - 1) : maxRadius;
  const free: number[] = [];
  for (const it of items) {
    if (it.span > spacing * 1.4 && it.span > 8) {
      free.push(it.index);
      for (const c of clusters) c.members = c.members.filter((m) => m !== it.index);
    }
  }
  return { rings: clusters.filter((c) => c.members.length > 0), free };
}
