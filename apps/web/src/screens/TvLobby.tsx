// design/Main.dc.html — TV lobby with the room code, QR and joined players.
import { useEffect, useMemo, useRef } from "react";
import type { HostRoomView, PlayerSummary } from "@opg/protocol";
import { MAX_PLAYERS } from "@opg/protocol";
import {
  Avatar,
  Card,
  Highlight,
  Icon,
  Marker,
  Tally,
  Tape,
  TvHeader,
  playFx,
  useArrivals,
  useCue,
  useReducedMotion,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { PointArrow, QrCode, ScanArrow, TvPage } from "./shared";
import { ShowOnTvChip } from "./ShowOnTv";

function SeatBadge({ player, t }: { player: PlayerSummary; t: Dictionary }) {
  if (player.isVip) {
    return (
      <div
        className="opg-marker"
        style={{
          height: 46,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          border: "4px solid var(--opg-marker)",
          borderRadius: "var(--opg-radius-button)",
          transform: "rotate(-3deg)",
          fontSize: 28,
          lineHeight: 1,
          color: "var(--opg-marker)",
        }}
      >
        {t.lobby.vip}
      </div>
    );
  }
  if (player.crowns > 0) {
    return <Tally count={player.crowns} size={40} />;
  }
  return null;
}

function Seat({
  player,
  index,
  arrived,
  t,
}: {
  player: PlayerSummary;
  index: number;
  arrived: boolean;
  t: Dictionary;
}) {
  const reduced = useReducedMotion();
  const cue = useCue();
  const seatRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!arrived) return;
    playFx(seatRef.current, "pop", reduced);
    cue("pop");
  }, [arrived, reduced, cue]);
  return (
    <div ref={seatRef}>
      <Card
        variant={index % 2 === 0 ? "M" : "Malt"}
        tilt={[-2, 1.5, -1, 2][index % 4]}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "18px 10px 16px",
        }}
      >
        <Avatar id={player.avatar} size={124} />
        <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.1 }}>
          {player.name}
        </div>
        <div style={{ height: 46, display: "flex", alignItems: "center" }}>
          <SeatBadge player={player} t={t} />
        </div>
      </Card>
    </div>
  );
}

function OpenSeat({
  variant,
  tilt,
  t,
}: {
  variant: "M" | "Malt";
  tilt: number;
  t: Dictionary;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minHeight: 270,
        border: "4px dashed var(--opg-muted)",
        borderRadius:
          variant === "M" ? "var(--opg-radius-m)" : "var(--opg-radius-m-alt)",
        transform: `rotate(${tilt}deg)`,
        color: "var(--opg-ink-secondary)",
      }}
    >
      <Icon name="plus" size={56} color="var(--opg-ink-secondary)" />
      <div style={{ fontSize: 32, fontWeight: 700 }}>{t.lobby.openSeat}</div>
    </div>
  );
}

function QrBlock({ joinUrl, t }: { joinUrl: string; t: Dictionary }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      <div
        style={{
          width: 200,
          height: 200,
          padding: 18,
          background: "var(--opg-card)",
          border: "4px solid var(--opg-ink)",
          borderRadius: "22px 8px 20px 10px / 10px 20px 8px 22px",
        }}
      >
        <QrCode value={joinUrl} size={156} />
      </div>
      <ScanArrow />
      <div
        className="opg-marker"
        style={{
          fontSize: 46,
          lineHeight: 1.1,
          color: "var(--opg-marker)",
          transform: "rotate(-4deg)",
        }}
      >
        {t.lobby.scanMe}
      </div>
    </div>
  );
}

function RoomCodeBlock({ code, t }: { code: string; t: Dictionary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--opg-ink-secondary)",
        }}
      >
        {t.join.roomCodeLabel}
      </div>
      <Highlight style={{ alignSelf: "flex-start", padding: "0 18px" }}>
        <Marker size={176} style={{ lineHeight: 1.05, letterSpacing: "0.06em" }}>
          {code}
        </Marker>
      </Highlight>
    </div>
  );
}

function JoinPanel({
  code,
  joinUrl,
  t,
}: {
  code: string;
  joinUrl: string;
  t: Dictionary;
}) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        marginTop: 18,
        padding: "50px 56px 44px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <Tape left={280} top={-26} width={200} height={50} rotate={-3} />
      <Marker size={56} style={{ lineHeight: 1.15 }}>
        {t.lobby.grabYourPhone}
      </Marker>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 36, lineHeight: 1.2 }}>{t.lobby.goTo}</div>
        <div style={{ fontSize: 50, fontWeight: 700, lineHeight: 1.1 }}>
          {window.location.host}
        </div>
      </div>
      <RoomCodeBlock code={code} t={t} />
      <QrBlock joinUrl={joinUrl} t={t} />
    </Card>
  );
}

function SeatGrid({
  players,
  emptySeats,
  t,
}: {
  players: PlayerSummary[];
  emptySeats: number;
  t: Dictionary;
}) {
  const playerIds = useMemo(() => players.map((player) => player.id), [
    players,
  ]);
  const arrivals = useArrivals(playerIds);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <Marker size={76}>{t.lobby.whosHereTv}</Marker>
        <div style={{ fontSize: 38, fontWeight: 700 }}>
          {format(t.lobby.playersOfMax, { count: players.length, max: MAX_PLAYERS })}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 28,
        }}
      >
        {players.map((player, index) => (
          <Seat
            key={player.id}
            player={player}
            index={index}
            arrived={arrivals.includes(player.id)}
            t={t}
          />
        ))}
        {Array.from({ length: emptySeats }, (_, i) => (
          <OpenSeat
            key={`open-${i}`}
            variant={i % 2 === 0 ? "M" : "Malt"}
            tilt={i % 2 === 0 ? -1 : 1.5}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function LobbyFooter({ vip, t }: { vip: PlayerSummary | null; t: Dictionary }) {
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
      {vip ? (
        <>
          <Highlight style={{ padding: "0 6px" }}>
            <span>{vip.name}</span>
          </Highlight>
          <div>{t.lobby.vipPicksFromPhone}</div>
        </>
      ) : (
        <div>{t.lobby.waitingForFirst}</div>
      )}
    </div>
  );
}

export function TvLobby({ view }: { view: HostRoomView }) {
  const { t } = useLocale();
  const joinUrl = `${window.location.origin}/${view.code}`;
  const emptySeats = Math.max(0, MAX_PLAYERS - view.players.length);
  const vip = view.players.find((p) => p.id === view.vipId) ?? null;

  return (
    <TvPage>
      <TvHeader variant="brand" actions={<ShowOnTvChip />} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "760px minmax(0, 1fr)",
          gap: 64,
          flexGrow: 1,
          alignItems: "start",
        }}
      >
        <JoinPanel code={view.code} joinUrl={joinUrl} t={t} />

        <SeatGrid players={view.players} emptySeats={emptySeats} t={t} />
      </div>

      <LobbyFooter vip={vip} t={t} />
    </TvPage>
  );
}
