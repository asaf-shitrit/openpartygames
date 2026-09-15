// Pathname routing for the two surfaces.
import { matchRoute, type Route } from "./routes";
import { usePathname } from "./router";
import { HostApp } from "./screens/HostApp";
import { PhoneJoinRoute } from "./screens/PhoneJoinRoute";
import { PlayerApp } from "./screens/PlayerApp";
import { Privacy } from "./screens/Privacy";
import { TvCredits } from "./screens/TvCredits";
import { TvLanding } from "./screens/TvLanding";

function isNarrowTouch(): boolean {
  try {
    return window.matchMedia("(max-width: 700px) and (pointer: coarse)")
      .matches;
  } catch {
    return window.innerWidth <= 700;
  }
}

function RouteView({ route }: { route: Route }) {
  if (route.kind === "credits") return <TvCredits />;
  if (route.kind === "privacy") return <Privacy />;
  if (route.kind === "host") return <HostApp code={route.code} />;
  if (route.kind === "join") return <PhoneJoinRoute />;
  if (route.kind === "player") return <PlayerApp code={route.code} />;
  return isNarrowTouch() ? <PhoneJoinRoute /> : <TvLanding />;
}

export function App() {
  return <RouteView route={matchRoute(usePathname())} />;
}