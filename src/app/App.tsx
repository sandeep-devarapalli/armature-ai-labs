import { Suspense } from "react";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { PwaUpdatePrompt } from "../components/PwaUpdatePrompt";
import { routes } from "./routes";

export const router = createBrowserRouter(routes);

export function App() {
  return (
    <>
      <Suspense fallback={<div className="route-loading mono">Loading floor plan…</div>}>
        <RouterProvider router={router} />
      </Suspense>
      <PwaUpdatePrompt />
    </>
  );
}
