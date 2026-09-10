import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type {
  GeoJSONSource,
  MapLayerMouseEvent
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  bengaluruBounds,
  bengaluruCenter,
  ecosystemToGeoJson,
  type EcosystemEntity
} from "../data/bengaluruEcosystem";

const sourceId = "bengaluru-ecosystem";
maplibregl.setWorkerUrl(mapWorkerUrl);
const clusterLayerId = "ecosystem-clusters";
const clusterCountLayerId = "ecosystem-cluster-count";
const pointHaloLayerId = "ecosystem-point-halo";
const pointLayerId = "ecosystem-points";

const sectorColor = [
  "match",
  ["get", "sector"],
  "Robotics", "#e89a2c",
  "Physical AI", "#c44a2a",
  "Drones & aerospace", "#1f6f8b",
  "Space hardware", "#6b5ca5",
  "Industrial automation", "#3f5430",
  "Hardware & sensing", "#a06b35",
  "Edge & embedded systems", "#496787",
  "Learning & training", "#667080",
  "#667080"
] as maplibregl.ExpressionSpecification;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function EcosystemMap({
  entities,
  selectedSlug,
  onSelect
}: {
  entities: readonly EcosystemEntity[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [...bengaluruCenter],
      zoom: 9.6,
      minZoom: 8,
      maxZoom: 17,
      attributionControl: false,
      cooperativeGestures: true
    });
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    const visibilityObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        map.resize();
        map.triggerRepaint();
      }
    });
    visibilityObserver.observe(containerRef.current);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    let styleReady = false;
    const failTimer = window.setTimeout(() => {
      if (!styleReady) setLoadFailed(true);
    }, 12_000);

    map.once("style.load", () => {
      styleReady = true;
      window.clearTimeout(failTimer);
      map.addSource(sourceId, {
        type: "geojson",
        data: ecosystemToGeoJson(entities) as unknown as maplibregl.GeoJSONSourceSpecification["data"],
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 44
      });

      map.addLayer({
        id: clusterLayerId,
        type: "circle",
        source: sourceId,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#0a1220",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            6,
            23,
            12,
            29
          ],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fffefa"
        }
      });
      map.addLayer({
        id: clusterCountLayerId,
        type: "symbol",
        source: sourceId,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12
        },
        paint: {
          "text-color": "#fffefa"
        }
      });
      map.addLayer({
        id: pointHaloLayerId,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#e89a2c",
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            19,
            0
          ],
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.3,
            0
          ],
          "circle-radius-transition": { duration: 180 },
          "circle-opacity-transition": { duration: 180 }
        }
      });
      map.addLayer({
        id: pointLayerId,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": sectorColor,
          "circle-radius": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            9,
            7
          ],
          "circle-stroke-color": "#fffefa",
          "circle-stroke-width": 2,
          "circle-radius-transition": { duration: 180 }
        }
      });

      const showPointer = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const clearPointer = () => {
        map.getCanvas().style.cursor = "";
      };
      map.on("mouseenter", clusterLayerId, showPointer);
      map.on("mouseleave", clusterLayerId, clearPointer);
      map.on("mouseenter", pointLayerId, showPointer);
      map.on("mouseleave", pointLayerId, clearPointer);

      map.on("click", clusterLayerId, (event: MapLayerMouseEvent) => {
        const feature = map.queryRenderedFeatures(event.point, {
          layers: [clusterLayerId]
        })[0];
        const clusterId = Number(feature?.properties?.cluster_id);
        const coordinates = feature?.geometry.type === "Point"
          ? feature.geometry.coordinates as [number, number]
          : null;
        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (!source || !coordinates || !Number.isFinite(clusterId)) return;
        void source.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({
            center: coordinates,
            zoom,
            duration: reducedMotion() ? 0 : 420
          });
        });
      });
      map.on("click", pointLayerId, (event: MapLayerMouseEvent) => {
        const slug = event.features?.[0]?.properties?.slug;
        if (typeof slug === "string") onSelectRef.current(slug);
      });

      setReady(true);
      window.requestAnimationFrame(() => {
        map.resize();
        map.jumpTo({ center: [...bengaluruCenter], zoom: 9.6 });
        map.triggerRepaint();
      });
    });

    return () => {
      window.clearTimeout(failTimer);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(
      ecosystemToGeoJson(entities) as unknown as maplibregl.GeoJSONSourceSpecification["data"]
    );
  }, [entities, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (selectedRef.current) {
      map.removeFeatureState({ source: sourceId, id: selectedRef.current });
    }
    if (selectedSlug) {
      map.setFeatureState({ source: sourceId, id: selectedSlug }, { selected: true });
    }
    selectedRef.current = selectedSlug;

    const selected = entities.find((item) => item.slug === selectedSlug);
    if (!selected?.coordinates) return;
    const camera = {
      center: [...selected.coordinates] as [number, number],
      zoom: Math.max(map.getZoom(), 12.6),
      padding: window.innerWidth < 760
        ? { top: 80, right: 28, bottom: 210, left: 28 }
        : { top: 52, right: 280, bottom: 52, left: 52 }
    };
    if (reducedMotion()) {
      map.jumpTo(camera);
    } else {
      map.easeTo({ ...camera, duration: 380 });
    }
  }, [entities, ready, selectedSlug]);

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds([
      [...bengaluruBounds[0]],
      [...bengaluruBounds[1]]
    ], {
      padding: 42,
      duration: reducedMotion() ? 0 : 420
    });
  }

  return (
    <div
      className="ecosystem-map-shell"
      data-map-state={ready ? "ready" : loadFailed ? "error" : "loading"}
    >
      <div
        ref={containerRef}
        className="ecosystem-map"
        role="region"
        aria-label="Interactive map of the Bengaluru robotics and physical AI ecosystem"
      />
      {!ready && !loadFailed && (
        <div className="ecosystem-map-state mono" role="status">
          Loading Bengaluru map…
        </div>
      )}
      {loadFailed && (
        <div className="ecosystem-map-state">
          <strong>Map tiles are unavailable.</strong>
          <span>The organization list is still available.</span>
        </div>
      )}
      <button className="ecosystem-reset mono" type="button" onClick={resetView}>
        Reset view
      </button>
      <div className="ecosystem-map-key mono" aria-label="Map location key">
        <span><i /> Approximate public location</span>
        <span>Organizations without a public locality stay in the list</span>
      </div>
    </div>
  );
}
