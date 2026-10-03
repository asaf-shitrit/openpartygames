// design/PhoneReconnecting.dc.html — the reconnect state, as a whole screen and as a banner.
import { useLayoutEffect, useRef } from "react";
import type { AvatarId } from "@opg/protocol";
import { useLocale } from "@opg/i18n";
import { Button, Highlight, Marker, PhoneScreen, PlayerChip } from "@opg/ui";
import { Icon } from "@opg/ui";

/**
 * The reconnect state for a phone that already has a game on screen. It rides above that
 * screen instead of replacing it — the way `TvReconnecting` rides above the TV stage — because
 * every in-progress draft on a phone is local `useState`: the imposter's vote, a half-typed
 * guess, the lie a player is still wording. Mobile browsers close the socket whenever the tab
 * goes to the background, so unmounting the game here would cost a player their round for
 * glancing at a text message. It takes no taps, and the screen under it starts below it, so it covers nothing.
 */
export function PhoneReconnectingBanner() {
  const { t } = useLocale();
  const ref = useRef<HTMLOutputElement | null>(null);
  // Publish the banner's height so every PhoneScreen can start below it (see layout.tsx); the
  // banner stays fixed, so showing or hiding it moves the screen once and nothing else.
  useLayoutEffect(() => {
    const banner = ref.current;
    if (banner === null) return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--opg-banner-h", `${banner.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--opg-banner-h");
    };
  }, []);
  return (
    <output
      ref={ref}
      aria-live="polite"
      style={{
        position: "fixed",
        insetBlockStart: 0,
        insetInline: 0,
        zIndex: 10,
        display: "flex",
        justifyContent: "center",
        padding: "8px 12px",
        // Everything underneath stays live: the point of the banner is that play continues.
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          maxWidth: 456,
          padding: "8px 14px",
          background: "var(--opg-paper)",
          border: "4px solid var(--opg-ink)",
          borderRadius: "var(--opg-radius-l)",
          fontSize: 17,
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        <Icon name="reload" size={22} style={{ flexShrink: 0 }} />
        <span>{t.status.reconnectingBanner}</span>
      </div>
    </output>
  );
}

export interface PhoneReconnectingProps {
  name?: string;
  avatar?: AvatarId | null;
  onReload?: () => void;
}

/**
 * The whole-screen reconnect state, for a phone that has nothing to keep mounted yet: it holds
 * a seat (a saved token, or a join already sent) but has not been handed a view. Once a view
 * has arrived, `PhoneReconnectingBanner` takes over so the game stays where it is.
 */
export function PhoneReconnecting({
  name,
  avatar = null,
  onReload,
}: PhoneReconnectingProps) {
  const { t } = useLocale();
  return (
    <PhoneScreen>
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          textAlign: "center",
        }}
      >
        <svg width="170" height="170" viewBox="0 0 78 78" aria-hidden="true">
          <path
            d="M40 5c19 1 33 15 33 34 0 19-15 34-35 33C19 71 5 57 6 38 7 20 22 5 42 6"
            fill="#FFFFFF"
            stroke="#2B2B2B"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="7 6"
          />
          <path
            d="M35 1l8 5-6 7"
            fill="none"
            stroke="#2B2B2B"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <Highlight style={{ padding: "0 10px", maxWidth: "100%" }}>
          <Marker
            level={1}
            size={40}
            style={{
              lineHeight: 1.15,
              maxWidth: "100%",
              overflowWrap: "anywhere",
            }}
          >
            {t.status.phoneReconnectingHeading}
          </Marker>
        </Highlight>
        <div style={{ maxWidth: 300, fontSize: 21, lineHeight: 1.4 }}>
          {t.status.phoneReconnectingBody}
        </div>
        <PlayerChip name={name ?? t.status.youFallback} avatar={avatar} size={50} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            fontSize: 17,
            lineHeight: 1.35,
            color: "var(--opg-ink-secondary)",
            textAlign: "center",
          }}
        >
          {t.status.reconnectingStuckHint}
        </div>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          onClick={onReload ?? (() => window.location.reload())}
        >
          <Icon name="reload" size={24} />
          <span>{t.status.reload}</span>
        </Button>
      </div>
    </PhoneScreen>
  );
}
