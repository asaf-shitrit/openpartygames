// design/TVCredits.dc.html — route /credits.
import {
  AUDIO_CREDITS,
  Card,
  Highlight,
  Marker,
  MUSIC_CREDITS,
  TvHeader,
} from "@opg/ui";
import type { AudioCredit, AudioLicense, MusicCredit } from "@opg/ui";
import { TvPage } from "./shared";

export interface SoundCreditLine {
  author: string;
  licenses: readonly AudioLicense[];
}

/** One line per author, with every license that author's samples carry. */
export function soundCreditLines(
  credits: readonly AudioCredit[],
): SoundCreditLine[] {
  const byAuthor = new Map<string, Set<AudioLicense>>();
  for (const credit of credits) {
    const licenses = byAuthor.get(credit.author) ?? new Set<AudioLicense>();
    licenses.add(credit.license);
    byAuthor.set(credit.author, licenses);
  }
  return [...byAuthor].map(([author, licenses]) => ({
    author,
    licenses: [...licenses],
  }));
}

const LICENSE_LABELS = {
  "CC0-1.0": "CC0",
  "CC-BY-3.0": "CC BY 3.0",
  "CC-BY-4.0": "CC BY 4.0",
} satisfies Record<AudioLicense, string>;

function licenseNote(lines: readonly SoundCreditLine[]): string {
  const labels = new Set<string>();
  for (const line of lines) {
    for (const license of line.licenses) labels.add(LICENSE_LABELS[license]);
  }
  return [...labels].join(" · ");
}

/** One line per music file: title, author and exact license, so CC-BY attribution is precise. */
export function musicCreditLines(credits: readonly MusicCredit[]): string[] {
  return credits.map(
    (credit) =>
      `${credit.title} — ${credit.author} (${LICENSE_LABELS[credit.license]})`,
  );
}

interface CreditCard {
  title: string;
  lines: string[];
  note?: string;
  variant: "M" | "Malt";
  tilt: number;
}

const SOUND_LINES = soundCreditLines(AUDIO_CREDITS);
const MUSIC_LINES = musicCreditLines(MUSIC_CREDITS);

const CARDS: CreditCard[] = [
  {
    title: "Game design & code",
    lines: ["The OpenPartyGames contributors"],
    variant: "M",
    tilt: -1,
  },
  {
    title: "Music",
    lines: MUSIC_LINES,
    variant: "Malt",
    tilt: 1,
  },
  {
    title: "Sound effects",
    lines: SOUND_LINES.map((line) => line.author),
    note: licenseNote(SOUND_LINES),
    variant: "M",
    tilt: -0.5,
  },
  {
    title: "Facts",
    lines: ["Wikipedia “Did you know”", "Open Trivia DB"],
    note: "CC BY-SA 4.0",
    variant: "Malt",
    tilt: 1,
  },
  {
    title: "Fonts",
    lines: ["Permanent Marker", "Atkinson Hyperlegible"],
    variant: "M",
    tilt: -1,
  },
  {
    title: "License",
    lines: ["Code licensed under AGPL-3.0"],
    variant: "Malt",
    tilt: 0.5,
  },
];

export function TvCredits() {
  return (
    <TvPage>
      <TvHeader variant="brand" />
      <Highlight
        style={{ alignSelf: "flex-start", marginTop: 12, padding: "0 14px" }}
      >
        <Marker size={96}>Credits</Marker>
      </Highlight>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "44px 40px",
          marginTop: 16,
        }}
      >
        {CARDS.map((card) => (
          <Card
            key={card.title}
            variant={card.variant}
            tilt={card.tilt}
            style={{
              padding: "32px 36px 36px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <Marker
              size={40}
              color="var(--opg-marker)"
              style={{ lineHeight: 1.15 }}
            >
              {card.title}
            </Marker>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {card.lines.map((line) => (
                <div key={line} style={{ fontSize: 34, lineHeight: 1.3 }}>
                  {line}
                </div>
              ))}
              {card.note ? (
                <div
                  style={{
                    fontSize: 30,
                    lineHeight: 1.3,
                    color: "var(--opg-ink-secondary)",
                  }}
                >
                  {card.note}
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </TvPage>
  );
}
