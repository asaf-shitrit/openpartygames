// /privacy — short, plain-language privacy page (TV-style).
import { GITHUB_URL } from "../links";
import { Card, Highlight, Marker, TvHeader } from "@opg/ui";
import { TvPage } from "./shared";

const POINTS = [
  {
    title: "No account, no profile",
    body: "You type a nickname and pick a doodle. That's it. We never ask for an email or a password.",
  },
  {
    title: "No cookies, no ad trackers",
    body: "We don't set cookies and we don't use advertising trackers. Page counts come from cookieless Cloudflare Web Analytics.",
  },
  {
    title: "Anonymous game stats",
    body: "We count games started and finished, how many players joined, and how long a game ran. No names, no personal information.",
  },
  {
    title: "Your name and answers stay in the room",
    body: "Player text is only shown to people in your room while you play, and it is never saved.",
  },
  {
    title: "Room codes and rate limits",
    body: "When a room is created and when someone joins, we briefly count requests per IP address to stop abuse.",
  },
  {
    title: "Questions or fixes",
    body: "The code is open source. Privacy questions are welcome as GitHub issues.",
    link: true,
  },
];

export function Privacy() {
  return (
    <TvPage>
      <TvHeader variant="brand" />
      <Highlight
        style={{ alignSelf: "flex-start", marginTop: 12, padding: "0 14px" }}
      >
        <Marker size={96}>Privacy</Marker>
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
              size={38}
              color="var(--opg-marker)"
              style={{ lineHeight: 1.15 }}
            >
              {point.title}
            </Marker>
            <div style={{ fontSize: 30, lineHeight: 1.35 }}>{point.body}</div>
            {point.link ? (
              <a
                className="opg-link"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 30, fontWeight: 700 }}
              >
                Open source on GitHub
              </a>
            ) : null}
          </Card>
        ))}
      </div>
    </TvPage>
  );
}
