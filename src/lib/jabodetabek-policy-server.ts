import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  JABODETABEK_CLUSTER_CODE,
  OUTSIDE_JABODETABEK_MESSAGE,
} from "@/lib/jabodetabek-policy";
import {
  findClusterForCoords,
  loadActiveOperationalClusters,
  resolveClusterIdForCoords,
  type OperationalCluster,
} from "@/lib/operational-cluster";

export type JabodetabekPickupCheck =
  | {
      ok: true;
      clusterId: string;
      clusterCode: string;
      clusterName: string;
    }
  | { ok: false; message: string };

export async function resolveJabodetabekCluster(
  admin: SupabaseClient
): Promise<OperationalCluster | null> {
  const clusters = await loadActiveOperationalClusters(admin);
  return (
    clusters.find(
      (c) =>
        c.code === JABODETABEK_CLUSTER_CODE ||
        c.slug === "jabodetabek" ||
        c.name.toUpperCase().includes("JABODETABEK")
    ) ?? null
  );
}

/** Pick-up harus berada di cluster JABODETABEK — tujuan boleh lintas kota/provinsi (AKAP). */
export async function assertPickupInJabodetabekCluster(
  admin: SupabaseClient,
  lat: number,
  lng: number
): Promise<JabodetabekPickupCheck> {
  const jabodetabek = await resolveJabodetabekCluster(admin);
  const clusterId = await resolveClusterIdForCoords(admin, lat, lng);

  if (!clusterId) {
    return { ok: false, message: OUTSIDE_JABODETABEK_MESSAGE };
  }

  if (jabodetabek && clusterId !== jabodetabek.id) {
    const clusters = await loadActiveOperationalClusters(admin);
    const hit = clusters.find((c) => c.id === clusterId);
    if (hit?.code !== JABODETABEK_CLUSTER_CODE) {
      return { ok: false, message: OUTSIDE_JABODETABEK_MESSAGE };
    }
  }

  const clusters = await loadActiveOperationalClusters(admin);
  const cluster =
    clusters.find((c) => c.id === clusterId) ??
    (jabodetabek && findClusterForCoords([jabodetabek], lat, lng));

  if (!cluster) {
    return { ok: false, message: OUTSIDE_JABODETABEK_MESSAGE };
  }

  const inJabodetabek =
    cluster.code === JABODETABEK_CLUSTER_CODE ||
    cluster.slug === "jabodetabek" ||
    cluster.name.toUpperCase().includes("JABODETABEK");

  if (!inJabodetabek) {
    return { ok: false, message: OUTSIDE_JABODETABEK_MESSAGE };
  }

  return {
    ok: true,
    clusterId: cluster.id,
    clusterCode: cluster.code,
    clusterName: cluster.name,
  };
}
