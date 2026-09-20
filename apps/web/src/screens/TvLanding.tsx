// design/TVLanding.dc.html — the host landing screen.
import { useState } from "react";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { ApiError, createRoom } from "../api";
import { LANDING_GAMES } from "../games";
import { GITHUB_URL } from "../links";
import { Link, navigate } from "../router";
import {
  Avatar,
  Button,
  Card,
  Highlight,
  Marker,
  StickyNote,
  Tape,
  TvHeader,
  useSound,
} from "@opg/ui";
import { TvPage } from "./shared";
import { ShowOnTvChip } from "./ShowOnTv";
import { TvFullTonight } from "./TvFullTonight";

function steps(t: Dictionary["landing"]) {
  return [
    { n: "1", text: t.step1, tilt: -1.5 },
    { n: "2", text: t.step2, tilt: 1 },
    { n: "3", text: t.step3, tilt: -0.5 },
  ];
}

function LandingHero({
  busy,
  error,
  onStart,
  t,
}: {
  busy: boolean;
  error: string | null;
  onStart: () => void;
  t: Dictionary["landing"];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Marker size={84} style={{ lineHeight: 1.12 }}>
          {t.heroLine1}
        </Marker>
        <Highlight style={{ alignSelf: "flex-start", padding: "0 14px" }}>
          <Marker size={84} style={{ lineHeight: 1.12 }}>
            {t.heroTvAndPhones}
          </Marker>
        </Highlight>
      </div>
      <div style={{ maxWidth: 900, fontSize: 38, lineHeight: 1.35 }}>
        {t.tvTagline}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <Button
          size="hero"
          onClick={busy ? undefined : onStart}
          disabled={busy}
        >
          <span>{busy ? t.starting : t.startRoom}</span>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FBF8F1"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </Button>
        <Avatar id="star" size={110} style={{ transform: "rotate(8deg)" }} />
      </div>
      {error ? (
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--opg-marker)",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function GameShowcase({ playersRangeTemplate }: { playersRangeTemplate: string }) {
  const compact = LANDING_GAMES.length > 2;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 16 : 28,
      }}
    >
      {LANDING_GAMES.map((game, index) => (
        <Card
          key={game.id}
          variant={index === 0 ? "L" : "Malt"}
          tilt={index === 0 ? -1.5 : 1}
          style={{
            padding: compact ? "16px 24px" : "24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: compact ? 6 : 10,
          }}
        >
          {index === 0 ? (
            <Tape left={230} top={-22} width={180} height={44} rotate={-3} />
          ) : null}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <Marker size={compact ? 42 : 56}>{game.name}</Marker>
            <Avatar id={game.avatar} size={compact ? 52 : 76} />
          </div>
          <div style={{ fontSize: compact ? 28 : 30, lineHeight: 1.3 }}>
            {game.blurb}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--opg-ink-secondary)",
            }}
          >
            {format(playersRangeTemplate, {
              min: game.minPlayers,
              max: game.maxPlayers,
              minutes: game.minutes,
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}

function StepsRow({ t }: { t: Dictionary["landing"] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 32,
      }}
    >
      {steps(t).map((step) => (
        <StickyNote
          key={step.n}
          tilt={step.tilt}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "22px 28px",
          }}
        >
          <Marker size={64} style={{ lineHeight: 1 }}>
            {step.n}
          </Marker>
          <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.25 }}>
            {step.text}
          </div>
        </StickyNote>
      ))}
    </div>
  );
}

function LandingFooter({ t }: { t: Dictionary["landing"] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        fontSize: 30,
        fontWeight: 700,
      }}
    >
      <a
        className="opg-link"
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
      >
        {t.openSourceOnGitHub}
      </a>
      <div style={{ color: "var(--opg-muted)" }}>·</div>
      <Link to="/privacy" className="opg-link">
        {t.privacy}
      </Link>
      <div style={{ color: "var(--opg-muted)" }}>·</div>
      <Link to="/credits" className="opg-link">
        {t.credits}
      </Link>
    </div>
  );
}

export function TvLanding() {
  const { t } = useLocale();
  const { unlock } = useSound();
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code, hostToken } = await createRoom(true);
      try {
        localStorage.setItem(`opg:host:${code}`, hostToken);
      } catch {
        setError(t.landing.errorStorageBlocked);
        return;
      }
      navigate(`/host/${code}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "full-tonight") {
        setFull(true);
      } else {
        setError(t.landing.errorGeneric);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStart = () => {
    // Inside the gesture: resumes the audio context before the async room call.
    unlock();
    void startRoom();
  };

  if (full) return <TvFullTonight />;

  return (
    <TvPage>
      <TvHeader variant="brand" actions={<ShowOnTvChip />} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1000px minmax(0, 1fr)",
          gap: 72,
          flexGrow: 1,
          alignItems: "center",
        }}
      >
        <LandingHero busy={busy} error={error} onStart={handleStart} t={t.landing} />
        <GameShowcase playersRangeTemplate={t.lobby.playersRange} />
      </div>

      <StepsRow t={t.landing} />

      <LandingFooter t={t.landing} />
    </TvPage>
  );
}
