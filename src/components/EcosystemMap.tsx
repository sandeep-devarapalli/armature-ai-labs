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
const pointLayerId = "ecosystem-points";

function localFaviconUrl(website: string | undefined) {
  if (!website) return null;
  try {
    const url = new URL(website);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && ["armatureailabs.com", "www.armatureailabs.com", "armaturelab.org", "www.armaturelab.org"].includes(url.hostname)
      ? "/brand/editorial-2026-09/logos/icon-dark-48.svg" : null;
  } catch {
    return null;
  }
}

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

function guidePadding(map: maplibregl.Map) {
  return window.innerWidth <= 700
    ? { top: 148, right: 28, bottom: Math.round(map.getContainer().clientHeight * 0.48) + 20, left: 28 }
    : { top: 52, right: 52, bottom: 52, left: Math.min(500, window.innerWidth * 0.4) + 32 };
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
  const previousCameraRef = useRef<maplibregl.JumpToOptions | null>(null);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const selected = entities.find((item) => item.slug === selectedSlug);
  const selectedName = selected?.name;
  const selectedFavicon = localFaviconUrl(selected?.websiteUrl);
  const longitude = selected?.coordinates?.[0];
  const latitude = selected?.coordinates?.[1];

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
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

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
        id: pointLayerId,
        type: "circle",
        source: sourceId,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": sectorColor,
          "circle-radius": 7,
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

      window.requestAnimationFrame(() => {
        if (mapRef.current !== map) return;
        map.resize();
        map.triggerRepaint();
      });
      setReady(true);
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

    map.setFilter(pointLayerId, selectedSlug
      ? ["all", ["!", ["has", "point_count"]], ["!=", ["get", "slug"], selectedSlug]]
      : ["!", ["has", "point_count"]]);
  }, [ready, selectedSlug]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedName || longitude === undefined || latitude === undefined) return;
    const element = document.createElement("div");
    element.className = "ecosystem-selected-marker";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `Selected place: ${selectedName}`);
    const label = document.createElement("span");
    label.className = "ecosystem-marker-label";
    label.textContent = selectedName;
    const pin = document.createElement("span");
    pin.className = "ecosystem-favicon-pin";
    pin.setAttribute("aria-hidden", "true");
    const fallback = document.createElement("span");
    fallback.className = "ecosystem-pin-fallback";
    fallback.textContent = "•";
    pin.append(fallback);
    if (selectedFavicon) {
      const icon = document.createElement("img");
      icon.alt = "";
      icon.width = 28;
      icon.height = 28;
      icon.hidden = true;
      icon.onload = () => { icon.hidden = false; fallback.hidden = true; };
      icon.onerror = () => { icon.remove(); };
      icon.src = selectedFavicon;
      pin.append(icon);
    }
    element.append(label, pin);
    const marker = new maplibregl.Marker({ element, anchor: "bottom", offset: [0, 0] })
      .setLngLat([longitude, latitude]).addTo(map);
    return () => { marker.remove(); };
  }, [ready, selectedSlug, selectedName, selectedFavicon, longitude, latitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!selectedSlug) {
      if (previousCameraRef.current) {
        const camera = previousCameraRef.current;
        previousCameraRef.current = null;
        map.easeTo({ ...camera, duration: reducedMotion() ? 0 : 380 });
      }
      return;
    }
    if (!previousCameraRef.current) {
      previousCameraRef.current = {
        center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing(),
        pitch: map.getPitch(), padding: { ...map.getPadding() }
      };
    }
    if (longitude === undefined || latitude === undefined) return;
    const camera = {
      center: [longitude, latitude] as [number, number],
      zoom: Math.max(map.getZoom(), 13.1),
      padding: guidePadding(map)
    };
    if (reducedMotion()) {
      map.jumpTo(camera);
    } else {
      map.easeTo({ ...camera, duration: 380 });
    }
  }, [ready, selectedSlug, longitude, latitude]);

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds([
      [...bengaluruBounds[0]],
      [...bengaluruBounds[1]]
    ], {
      padding: guidePadding(map),
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
        aria-label="Interactive map of the Bengaluru robotics, hardware and builder ecosystem"
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
