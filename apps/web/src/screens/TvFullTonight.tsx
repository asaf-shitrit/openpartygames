// design/TVFullTonight.dc.html — shown when the daily room cap is hit.
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { GITHUB_LABEL, GITHUB_URL } from "../links";
import { Card, Icon, Marker, Tape, TvHeader } from "@opg/ui";
import { TvPage } from "./shared";

function SadCloud() {
  return (
    <svg
      width="170"
      height="170"
      viewBox="0 0 100 100"
      style={{ flexShrink: 0, transform: "rotate(6deg)" }}
      aria-hidden="true"
    >
      <path
        d="M28 84c-12 0-20-8-20-19 0-10 7-17 16-18 1-15 12-27 27-27 12 0 22 8 25 19 10 1 18 9 18 20 0 14-9 25-22 25z"
        fill="#A3CCFF"
        stroke="#2B2B2B"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M35 60q6 5 12 0M57 60q6 5 12 0"
        fill="none"
        stroke="#2B2B2B"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="52" cy="72" r="4" fill="#2B2B2B" />
    </svg>
  );
}

function TonightOptions({ t }: { t: Dictionary }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 40,
      }}
    >
      <Card
        variant="M"
        style={{
          padding: "32px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "var(--opg-paper)",
        }}
      >
        <Marker size={46}>{t.status.comeBackHeading}</Marker>
        <div style={{ fontSize: 32, lineHeight: 1.3 }}>
          {t.status.comeBackBody}
        </div>
      </Card>
      <Card
        variant="Malt"
        style={{
          padding: "32px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: "var(--opg-paper)",
        }}
      >
        <Marker size={46}>{t.status.runOwnCopyHeading}</Marker>
        <div style={{ fontSize: 32, lineHeight: 1.3 }}>
          {t.status.runOwnCopyBody}
        </div>
        <a
          className="opg-link"
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.3 }}
        >
          {GITHUB_LABEL}
        </a>
      </Card>
    </div>
  );
}

export function TvFullTonight() {
  const { t } = useLocale();
  return (
    <TvPage>
      <TvHeader variant="brand" />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Card
          variant="L"
          tilt={-1}
          style={{
            width: 1320,
            padding: "60px 68px 52px",
            display: "flex",
            flexDirection: "column",
            gap: 32,
          }}
        >
          <Tape left={560} top={-26} width={200} height={50} rotate={-3} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Marker size={96}>{t.status.fullTonightHeading}</Marker>
              <div style={{ maxWidth: 900, fontSize: 40, lineHeight: 1.3 }}>
                {t.status.fullTonightBody}
              </div>
            </div>
            <SadCloud />
          </div>

          <TonightOptions t={t} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 30,
              fontWeight: 700,
              color: "var(--opg-ink-secondary)",
            }}
          >
            <Icon name="check" size={30} color="var(--opg-ink-secondary)" />
            <div>{t.status.roomsKeepGoing}</div>
          </div>
        </Card>
      </div>
    </TvPage>
  );
}