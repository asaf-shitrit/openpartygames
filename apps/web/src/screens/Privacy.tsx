// /privacy — short, plain-language privacy page (TV-style).
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { GITHUB_URL } from "../links";
import { Card, Highlight, Marker, TvHeader } from "@opg/ui";
import { TvPage } from "./shared";

type PrivacyCopy = Dictionary["privacy"];

interface PrivacyPoint {
  title: keyof PrivacyCopy;
  body: keyof PrivacyCopy;
  link?: boolean;
}

const POINTS: readonly PrivacyPoint[] = [
  { title: "accountTitle", body: "accountBody" },
  { title: "cookiesTitle", body: "cookiesBody" },
  { title: "statsTitle", body: "statsBody" },
  { title: "roomTextTitle", body: "roomTextBody" },
  { title: "rateLimitsTitle", body: "rateLimitsBody" },
  { title: "questionsTitle", body: "questionsBody", link: true },
];

export function Privacy() {
  const { t } = useLocale();
  return (
    <TvPage>
      <TvHeader variant="brand" />
      <Highlight
        style={{ alignSelf: "flex-start", marginTop: 12, padding: "0 14px" }}
      >
        <Marker level={1} size={96}>
          {t.landing.privacy}
        </Marker>
      </Highlight>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "36px 40px",
          marginTop: 16,
        }}
      >
        {POINTS.map((point, index) => (
          <Card
            key={point.title}
            variant={index % 2 === 0 ? "M" : "Malt"}
            tilt={index % 2 === 0 ? -1 : 1}
            style={{
              padding: "30px 34px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <Marker
              level={2}
              size={38}
              color="var(--opg-marker)"
              style={{ lineHeight: 1.15 }}
            >
              {t.privacy[point.title]}
            </Marker>
            <div style={{ fontSize: 30, lineHeight: 1.35 }}>{t.privacy[point.body]}</div>
            {point.link ? (
              <a
                className="opg-link"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 30, fontWeight: 700 }}
              >
                {t.landing.openSourceOnGitHub}
              </a>
            ) : null}
          </Card>
        ))}
      </div>
    </TvPage>
  );
}
