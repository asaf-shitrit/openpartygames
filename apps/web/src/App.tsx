// Pathname routing for the two surfaces.
import { Suspense, lazy, useState } from "react";
import {
  SILENT_ENGINE,
  SoundProvider,
  Stage,
  createBrowserSoundEngine,
} from "@opg/ui";
import type { SoundEngine } from "@opg/ui";
import { matchRoute, routeSurface, type Route, type Surface } from "./routes";
import { usePathname } from "./router";
import { HostApp } from "./screens/HostApp";
import { PhoneJoinRoute } from "./screens/PhoneJoinRoute";
import { PlayerApp } from "./screens/PlayerApp";
import { Privacy } from "./screens/Privacy";
import { TvCredits } from "./screens/TvCredits";
import { TvLanding } from "./screens/TvLanding";

/** Dev-only pages, dropped from production builds with the dead branch below. */
const DevRoute = import.meta.env.DEV
  ? lazy(() => import("./dev/DevRoute"))
  : null;

function isNarrowTouch(): boolean {
  try {
    return window.matchMedia("(max-width: 700px) and (pointer: coarse)")
      .matches;
  } catch {
    return window.innerWidth <= 700;
  }
}

function DevPage({ mode }: { mode: "sounds" | "moments" }) {
  if (DevRoute === null) return null;
  return (
    <Suspense fallback={null}>
      <DevRoute mode={mode} />
    </Suspense>
  );
}

function pageRoute(route: Route) {
  if (route.kind === "credits")
    return (
      <Stage>
        <TvCredits />
      </Stage>
    );
  if (route.kind === "privacy") return <Privacy />;
  if (route.kind === "dev-sounds") return <DevPage mode="sounds" />;
  if (route.kind === "dev-moments") return <DevPage mode="moments" />;
  return null;
}

function RouteView({ route }: { route: Route }) {
  const page = pageRoute(route);
  if (page !== null) return page;
  if (route.kind === "host") return <HostApp code={route.code} />;
  if (route.kind === "join") return <PhoneJoinRoute />;
  if (route.kind === "player") return <PlayerApp code={route.code} />;
  if (isNarrowTouch()) return <PhoneJoinRoute />;
  return (
    <Stage>
      <TvLanding />
    </Stage>
  );
}

export interface AppProps {
  /** Test seam: the engine the TV surface uses. Defaults to a browser engine. */
  engine?: SoundEngine;
}

/** Builds the engine on first use, so a surface that never asks for it never opens an AudioContext. */
export function lazyEngine(create: () => SoundEngine): () => SoundEngine {
  let engine: SoundEngine | null = null;
  return () => {
    engine ??= create();
    return engine;
  };
}

/**
 * One engine for the TV surface, created the first time a TV route renders so phones never open
 * an AudioContext. It lives for the app's lifetime, so the landing page's unlock carries over.
 */
function useSurfaceEngine(surface: Surface, injected?: SoundEngine): SoundEngine {
  const [tvEngine] = useState(() =>
    lazyEngine(() => injected ?? createBrowserSoundEngine()),
  );
  return surface === "tv" ? tvEngine() : SILENT_ENGINE;
}

export function App({ engine }: AppProps = {}) {
  const route = matchRoute(usePathname());
  const surface = routeSurface(route, isNarrowTouch());
  const surfaceEngine = useSurfaceEngine(surface, engine);
  return (
    // The key remounts the provider when the surface changes, so it swaps engines.
    <SoundProvider key={surface} engine={surfaceEngine}>
      <RouteView route={route} />
    </SoundProvider>
  );
}
