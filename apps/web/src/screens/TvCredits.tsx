// design/TVCredits.dc.html — route /credits.
import { Card, Highlight, Marker, TvHeader } from "@opg/ui";
import { TvPage } from "./shared";

interface CreditCard {
  title: string;
  lines: string[];
  note?: string;
  variant: "M" | "Malt";
  tilt: number;
}

const CARDS: CreditCard[] = [
  {
    title: "Game design & code",
    lines: ["The OpenPartyGames contributors"],
    variant: "M",
    tilt: -1,
  },
  {
    title: "Music",
    lines: ["No music tracks yet"],
    note: "CC0 or CC BY only",
    variant: "Malt",
    tilt: 1,
  },
  {
    title: "Sound effects",
    lines: ["No sound effects yet"],
    note: "CC0 or CC BY only",
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
