import { useEffect, useRef, useState } from "react";
import type { ModelViewerElement } from "@google/model-viewer";

type Props = { src: string; poster: string; label: string };

export default function BuildingModelViewer({ src, poster, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const model = useRef<ModelViewerElement | null>(null);
  const [status, setStatus] = useState("Loading 3D model…");

  useEffect(() => {
    let disposed = false;
    let element: ModelViewerElement | undefined;
    import("@google/model-viewer").then(() => {
      if (disposed || !host.current) return;
      element = document.createElement("model-viewer");
      element.setAttribute("src", src);
      element.setAttribute("poster", poster);
      element.setAttribute("alt", `${label}, interactive Blender-derived planning model`);
      element.setAttribute("camera-controls", "");
      element.setAttribute("touch-action", "pan-y");
      element.setAttribute("camera-orbit", "0deg 35deg auto");
      element.setAttribute("field-of-view", "30deg");
      element.setAttribute("shadow-intensity", "0");
      element.setAttribute("environment-image", "neutral");
      element.setAttribute("interaction-prompt", "none");
      element.addEventListener("load", () => setStatus("3D model ready"));
      element.addEventListener("error", () => setStatus("3D could not load. The preview and downloads remain available below."));
      host.current.append(element);
      model.current = element;
    }).catch(() => {
      if (!disposed) setStatus("Viewer could not load. Use the preview or download the model below.");
    });
    return () => { disposed = true; element?.remove(); model.current = null; };
  }, [src, poster, label]);

  function camera(orbit: string) {
    if (!model.current) return;
    model.current.cameraTarget = "auto auto auto";
    model.current.cameraOrbit = orbit;
    model.current.fieldOfView = "30deg";
    model.current.jumpCameraToGoal();
  }

  return <>
    <div className="building-model-canvas" ref={host} />
    <div className="building-model-controls" aria-label="3D camera controls">
      <button type="button" onClick={() => camera("0deg 35deg auto")}>Reset view</button>
      <button type="button" onClick={() => camera("0deg 0deg auto")}>Top view</button>
      <button type="button" onClick={() => camera("90deg 55deg auto")}>Side view</button>
    </div>
    <p role="status">{status}</p>
    <p className="building-model-help">Drag to orbit · scroll or pinch to zoom · right-drag to pan. Keyboard: focus the model and use arrow keys.</p>
  </>;
}
