// design/TVLanding.dc.html — the host landing screen.
import { useState } from "react";
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

const STEPS = [
  { n: "1", text: "Start a room on this screen", tilt: -1.5 },
  { n: "2", text: "Everyone scans the code with their phone", tilt: 1 },
  { n: "3", text: "The first player to join picks a game", tilt: -0.5 },
];

function LandingHero({
  busy,
  error,
  onStart,
}: {
  busy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Marker size={84} style={{ lineHeight: 1.12 }}>
          Party games for
        </Marker>
        <Highlight style={{ alignSelf: "flex-start", padding: "0 14px" }}>
          <Marker size={84} style={{ lineHeight: 1.12 }}>
            your TV and phones
          </Marker>
        </Highlight>
      </div>
      <div style={{ maxWidth: 900, fontSize: 38, lineHeight: 1.35 }}>
        Free, open source, no app. This screen hosts; everyone plays on their
        phone.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <Button
          size="hero"
          onClick={busy ? undefined : onStart}
          disabled={busy}
        >
          <span>{busy ? "Starting…" : "Start a room"}</span>
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

function GameShowcase() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {LANDING_GAMES.map((game, index) => (
        <Card
          key={game.id}
          variant={index === 0 ? "L" : "Malt"}
          tilt={index === 0 ? -1.5 : 1}
          style={{
            padding: "24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
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
            <Marker size={56}>{game.name}</Marker>
            <Avatar id={game.avatar} size={76} />
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.3 }}>{game.blurb}</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--opg-ink-secondary)",
            }}
          >
            {game.minPlayers}–{game.maxPlayers} players · about {game.minutes}{" "}
            min
          </div>
        </Card>
      ))}
    </div>
  );
}

function StepsRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 32,
      }}
    >
      {STEPS.map((step) => (
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

function LandingFooter() {
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
        Open source on GitHub
      </a>
      <div style={{ color: "var(--opg-muted)" }}>·</div>
      <Link to="/privacy" className="opg-link">
        Privacy
      </Link>
      <div style={{ color: "var(--opg-muted)" }}>·</div>
      <Link to="/credits" className="opg-link">
        Credits
      </Link>
    </div>
  );
}

export function TvLanding() {
  const { unlock } = useSound();
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const { code, hostToken } = await createRoom();
      try {
        localStorage.setItem(`opg:host:${code}`, hostToken);
      } catch {
        setError(
          "This browser blocked local storage, so the room cannot be hosted here.",
        );
        return;
      }
      navigate(`/host/${code}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "full-tonight") {
        setFull(true);
      } else {
        setError("Could not start a room. Try again in a moment.");
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
        <LandingHero busy={busy} error={error} onStart={handleStart} />
        <GameShowcase />
      </div>

      <StepsRow />

      <LandingFooter />
    </TvPage>
  );
}
