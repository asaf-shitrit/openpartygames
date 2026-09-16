// /dev/sounds — audition every cue as a sample or as raw synth. Dev-only.
import { useState } from "react";
import {
  AUDIO_CREDITS,
  Button,
  CUE_IDS,
  Card,
  Chip,
  Marker,
  TvHeader,
  createBrowserSoundEngine,
  useSound,
} from "@opg/ui";
import type { AudioCredit, CueId, SoundEngine, SoundStatus } from "@opg/ui";
import { TvPage } from "../screens/shared";

export interface SoundBoardProps {
  /** Builds the never-preloaded engine behind the "Synth" buttons. */
  createSynthEngine?: () => SoundEngine;
}

function creditFor(cue: CueId): AudioCredit | null {
  return AUDIO_CREDITS.find((credit) => credit.cue === cue) ?? null;
}

function creditLine(cue: CueId): string | null {
  const credit = creditFor(cue);
  if (credit === null) return null;
  return `${credit.title} — ${credit.author}, ${credit.license}`;
}

function CueCard({
  cue,
  onSample,
  onSynth,
}: {
  cue: CueId;
  onSample: () => void;
  onSynth: () => void;
}) {
  const credit = creditLine(cue);
  return (
    <Card
      variant="M"
      style={{
        padding: "20px 22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Marker size={40}>{cue}</Marker>
      <div
        style={{
          fontSize: 26,
          lineHeight: 1.25,
          color: credit === null ? "var(--opg-ink-secondary)" : undefined,
        }}
      >
        {credit ?? "Synth only"}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: "auto" }}>
        <Button size="md" onClick={onSample}>
          Sample
        </Button>
        <Button size="md" variant="secondary" onClick={onSynth}>
          Synth
        </Button>
      </div>
    </Card>
  );
}

const STATUS_NAMES = {
  locked: "Engine: locked — tap Unlock sound",
  running: "Engine: running",
  unsupported: "Engine: not supported here",
} satisfies Record<SoundStatus, string>;

function statusCopy(status: SoundStatus, muted: boolean): string {
  const name = STATUS_NAMES[status];
  return muted ? `${name} · muted` : name;
}

export function SoundBoard({
  createSynthEngine = createBrowserSoundEngine,
}: SoundBoardProps) {
  const { engine, status, muted, unlock } = useSound();
  const [synth, setSynth] = useState<SoundEngine | null>(null);

  function playSample(cue: CueId): void {
    engine.play(cue);
  }

  function playSynth(cue: CueId): void {
    const target = synth ?? createSynthEngine();
    if (synth === null) setSynth(target);
    target.unlock();
    target.play(cue);
  }

  return (
    <TvPage>
      <TvHeader variant="brand" />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Marker size={64}>Sound board</Marker>
        <Chip height={56} fontSize={28}>
          {statusCopy(status, muted)}
        </Chip>
        <Button size="md" onClick={unlock}>
          Unlock sound
        </Button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 24,
        }}
      >
        {CUE_IDS.map((cue) => (
          <CueCard
            key={cue}
            cue={cue}
            onSample={() => playSample(cue)}
            onSynth={() => playSynth(cue)}
          />
        ))}
      </div>
    </TvPage>
  );
}
