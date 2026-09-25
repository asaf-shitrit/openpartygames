// design/PhoneReconnecting.dc.html — overlay while reconnecting.
import type { AvatarId } from "@opg/protocol";
import { useLocale } from "@opg/i18n";
import { Button, Highlight, Marker, PhoneScreen, PlayerChip } from "@opg/ui";
import { Icon } from "@opg/ui";

export interface PhoneReconnectingProps {
  name?: string;
  avatar?: AvatarId | null;
  onReload?: () => void;
}

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
