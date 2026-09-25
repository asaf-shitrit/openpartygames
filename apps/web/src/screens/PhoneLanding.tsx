// design/PhoneNoTvLanding.dc.html — phone landing: start a room, or join one.
import { useState } from "react";
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { ApiError, createRoom } from "../api";
import { navigate } from "../router";
import { Button, Icon, Marker, PhoneScreen, PRESSABLE_CLASS } from "@opg/ui";

function BrandHeader({ brand }: { brand: string }) {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        position: "relative",
        padding: "0 6px",
        maxWidth: "100%",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          insetInlineStart: 0,
          insetInlineEnd: 0,
          bottom: 3,
          height: 12,
          background: "var(--opg-highlight)",
          borderRadius: 4,
          transform: "rotate(-1deg)",
        }}
      />
      <div
        className="opg-marker"
        style={{
          position: "relative",
          fontSize: 24,
          lineHeight: 1.2,
          overflowWrap: "anywhere",
        }}
      >
        {brand}
      </div>
    </div>
  );
}

function Hero({ t }: { t: Dictionary["landing"] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Marker size={40} style={{ lineHeight: 1.15 }}>
        {t.heroLine1}
      </Marker>
      <div style={{ alignSelf: "flex-start", position: "relative", padding: "0 10px" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            top: "44%",
            height: "50%",
            background: "var(--opg-highlight)",
            borderRadius: 8,
            transform: "rotate(-2deg)",
          }}
        />
        <Marker size={40} style={{ position: "relative", lineHeight: 1.15 }}>
          {t.heroPhones}
        </Marker>
      </div>
    </div>
  );
}

function JoinButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
      onClick={() => navigate("/join")}
      style={{
        height: 64,
        padding: "0 26px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "var(--opg-paper)",
        border: "4px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-l)",
        fontSize: 21,
        fontWeight: 700,
      }}
    >
      <Icon name="arrow-right" size={24} />
      <span>{label}</span>
    </button>
  );
}

interface StartSectionProps {
  busy: boolean;
  error: string | null;
  onStart: () => void;
  t: Dictionary["landing"];
}

function StartSection({ busy, error, onStart, t }: StartSectionProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
      <Button size="lg" fullWidth disabled={busy} onClick={onStart}>
        <Icon name="plus" size={24} color="var(--opg-paper)" />
        <span>{busy ? t.starting : t.startRoom}</span>
      </Button>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
          textAlign: "center",
          marginTop: -6,
        }}
      >
        {t.codeToReadOut}
      </div>

      <JoinButton label={t.joinRoom} />

      {error ? (
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--opg-marker)",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function TvHintNote({ hint }: { hint: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        background: "var(--opg-paper)",
        border: "3px solid var(--opg-ink-secondary)",
        borderRadius: "var(--opg-radius-l)",
      }}
    >
      <Icon name="monitor" size={24} color="var(--opg-ink-secondary)" />
      <div style={{ fontSize: 16, lineHeight: 1.3, color: "var(--opg-ink-secondary)" }}>
        {hint}
      </div>
    </div>
  );
}

export function PhoneLanding() {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code, hostToken } = await createRoom(false, locale);
      try {
        localStorage.setItem(`opg:host:${code}`, hostToken);
      } catch {
        setError(t.landing.errorStorageBlocked);
        return;
      }
      navigate(`/${code}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "full-tonight") {
        setError(t.landing.errorFullTonight);
      } else {
        setError(t.landing.errorGeneric);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () => {
    void startRoom();
  };

  return (
    <PhoneScreen>
      <BrandHeader brand={t.join.brand} />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 22,
        }}
      >
        <Hero t={t.landing} />
        <div style={{ fontSize: 19, lineHeight: 1.4, color: "var(--opg-ink)" }}>
          {t.landing.phoneTagline}
        </div>
        <StartSection busy={busy} error={error} onStart={handleStart} t={t.landing} />
      </div>
      <TvHintNote hint={t.landing.tvHint} />
    </PhoneScreen>
  );
}
