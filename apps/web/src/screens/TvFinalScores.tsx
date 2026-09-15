// design/TVFinalScores.dc.html — lobby results screen after a game.
import type { HostRoomView, PlayerSummary } from "@opg/protocol";
import {
  Avatar,
  Card,
  Crown,
  Highlight,
  Marker,
  Tape,
  Tally,
  TvHeader,
} from "@opg/ui";
import { PointArrow, TvPage } from "./shared";

interface RankedRow {
  player: PlayerSummary;
  score: number;
}

function formatScore(score: number): string {
  return score.toLocaleString("en-US");
}

/** Highest score first. ES2022 has no Array#toSorted, so sort by hand. */
function sortByScore(rows: readonly RankedRow[]): RankedRow[] {
  const remaining = [...rows];
  const sorted: RankedRow[] = [];
  while (remaining.length > 0) {
    const best = Math.max(...remaining.map((row) => row.score));
    const at = remaining.findIndex((row) => row.score === best);
    sorted.push(...remaining.splice(at, 1));
  }
  return sorted;
}

function crownLabel(
  winners: string[],
  players: PlayerSummary[],
  topName: string,
): string {
  if (winners.length <= 1) {
    return `${topName} wins the crown!`;
  }
  const names = winners.map(
    (id) => players.find((p) => p.id === id)?.name ?? "Someone",
  );
  return `${names.join(" and ")} win the crown!`;
}

function EmptyFinalScores({ code }: { code: string }) {
  return (
    <TvPage>
      <TvHeader variant="brand" roomCode={code} />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Marker size={64}>Waiting for final scores</Marker>
      </div>
    </TvPage>
  );
}

function WinnerCard({ top, label }: { top?: RankedRow; label: string }) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        marginTop: 22,
        padding: "44px 48px 48px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      <Tape left={250} top={-24} width={200} height={48} rotate={-3} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Crown
          size={170}
          strokeWidth={1.1}
          style={{
            transform: "rotate(-8deg)",
            marginBottom: -34,
            position: "relative",
          }}
        />
        <Avatar id={top?.player.avatar ?? null} size={260} />
      </div>
      <Highlight style={{ padding: "0 12px" }}>
        <Marker size={76} style={{ lineHeight: 1.15, textAlign: "center" }}>
          {label}
        </Marker>
      </Highlight>
      <div style={{ fontSize: 40, fontWeight: 700 }}>
        {formatScore(top?.score ?? 0)} points
      </div>
    </Card>
  );
}

function ScoreRow({
  row,
  index,
  winner,
}: {
  row: RankedRow;
  index: number;
  winner: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "8px 28px",
        background:
          index === 0 ? "var(--opg-highlight-soft)" : "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius:
          index % 2 === 0
            ? "var(--opg-radius-m)"
            : "var(--opg-radius-m-alt)",
      }}
    >
      <div
        className="opg-marker"
        style={{
          width: 56,
          fontSize: 48,
          lineHeight: 1,
          color: index === 0 ? "var(--opg-marker)" : "var(--opg-ink)",
        }}
      >
        {index + 1}
      </div>
      <Avatar id={row.player.avatar} size={72} />
      <div style={{ flexGrow: 1, fontSize: 40, fontWeight: 700 }}>
        {row.player.name}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {row.player.crowns > 0 ? (
          <Tally count={row.player.crowns} size={40} />
        ) : null}
        {winner ? (
          <div
            className="opg-marker"
            style={{
              fontSize: 28,
              lineHeight: 1,
              color: "var(--opg-marker)",
              transform: "rotate(-6deg)",
            }}
          >
            new!
          </div>
        ) : null}
      </div>
      <div
        style={{
          width: 170,
          textAlign: "right",
          fontSize: 40,
          fontWeight: 700,
        }}
      >
        {formatScore(row.score)}
      </div>
    </div>
  );
}

function ScoresList({
  rows,
  winners,
}: {
  rows: RankedRow[];
  winners: string[];
}) {
  const winnerSet = new Set(winners);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Marker size={64}>Final scores</Marker>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((row, index) => (
          <ScoreRow
            key={row.player.id}
            row={row}
            index={index}
            winner={winnerSet.has(row.player.id)}
          />
        ))}
      </div>
    </div>
  );
}

function FinalScoresFooter({ top }: { top?: RankedRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        fontSize: 38,
        fontWeight: 700,
      }}
    >
      <PointArrow />
      {top ? (
        <>
          <Highlight style={{ padding: "0 6px" }}>
            <span>{top.player.name}</span>
          </Highlight>
          <div>picks the next game from their phone</div>
        </>
      ) : (
        <div>picks the next game from their phone</div>
      )}
    </div>
  );
}

export function TvFinalScores({ view }: { view: HostRoomView }) {
  const result = view.lastResult;
  if (!result) return <EmptyFinalScores code={view.code} />;

  const winners = result.winnerIds;
  const rows = sortByScore(
    view.players.map((player) => ({
      player,
      score: result.scores[player.id] ?? 0,
    })),
  );
  const top = rows[0];
  const gameName =
    view.games.find((g) => g.id === result.gameId)?.name ?? "Final scores";
  const label = crownLabel(
    winners,
    view.players,
    top?.player.name ?? "Someone",
  );

  return (
    <TvPage>
      <TvHeader
        variant="game"
        gameName={gameName}
        progress="Final scores"
        roomCode={view.code}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "700px minmax(0, 1fr)",
          gap: 64,
          flexGrow: 1,
          alignItems: "start",
        }}
      >
        <WinnerCard top={top} label={label} />
        <ScoresList rows={rows} winners={winners} />
      </div>

      <FinalScoresFooter top={top} />
    </TvPage>
  );
}