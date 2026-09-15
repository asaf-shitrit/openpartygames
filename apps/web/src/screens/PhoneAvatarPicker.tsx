// design/PhoneAvatarPicker.dc.html — shown once right after joining.
import type { AvatarId, PlayerRoomView, PlayerSummary } from "@opg/protocol";
import { AVATARS } from "@opg/protocol";
import { Avatar, Button, Icon, Marker, PhoneScreen, Stamp } from "@opg/ui";

export interface PhoneAvatarPickerProps {
  view: PlayerRoomView;
  onPick: (avatar: AvatarId) => void;
  onDone: () => void;
}

type TileRadius = "var(--opg-radius-m)" | "var(--opg-radius-m-alt)";

function TakenTile({
  id,
  owner,
  radius,
}: {
  id: AvatarId;
  owner: string;
  radius: TileRadius;
}) {
  return (
    <div
      style={{
        height: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        border: "3px dashed var(--opg-muted)",
        borderRadius: radius,
        color: "var(--opg-ink-secondary)",
      }}
    >
      <Avatar id={id} size={52} faded alt={`${id} avatar, taken by ${owner}`} />
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.15 }}>
        Taken
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.15 }}>
        {owner}
      </div>
    </div>
  );
}

function pickTileLook(picked: boolean): { background: string; border: string } {
  return picked
    ? {
        background: "var(--opg-highlight-soft)",
        border: "4px solid var(--opg-ink)",
      }
    : { background: "var(--opg-card)", border: "3px solid var(--opg-ink)" };
}

function IdleArt({ id }: { id: AvatarId }) {
  return <Avatar id={id} size={72} alt={`Choose the ${id} avatar`} />;
}

function PickedArt({ id }: { id: AvatarId }) {
  return (
    <>
      <Icon
        name="check"
        size={26}
        color="var(--opg-marker)"
        style={{ position: "absolute", right: 6, top: 6 }}
      />
      <Avatar id={id} size={66} alt={`Choose the ${id} avatar`} />
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-marker)",
        }}
      >
        Picked
      </div>
    </>
  );
}

function PickTile({
  id,
  picked,
  radius,
  onPick,
}: {
  id: AvatarId;
  picked: boolean;
  radius: TileRadius;
  onPick: (avatar: AvatarId) => void;
}) {
  const look = pickTileLook(picked);
  return (
    <button
      type="button"
      className="opg-reset"
      onClick={() => onPick(id)}
      aria-pressed={picked}
      style={{
        position: "relative",
        height: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        ...look,
        borderRadius: radius,
      }}
    >
      {picked ? <PickedArt id={id} /> : <IdleArt id={id} />}
    </button>
  );
}

function AvatarGrid({
  taken,
  picked,
  onPick,
}: {
  taken: Map<AvatarId, string>;
  picked: AvatarId | null;
  onPick: (avatar: AvatarId) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 12,
      }}
    >
      {AVATARS.map((id, index) => {
        const owner = taken.get(id);
        const radius: TileRadius =
          index % 2 === 0 ? "var(--opg-radius-m)" : "var(--opg-radius-m-alt)";

        if (owner) {
          return <TakenTile key={id} id={id} owner={owner} radius={radius} />;
        }
        return (
          <PickTile
            key={id}
            id={id}
            picked={picked === id}
            radius={radius}
            onPick={onPick}
          />
        );
      })}
    </div>
  );
}

function buildTaken(view: PlayerRoomView): Map<AvatarId, string> {
  const taken = new Map<AvatarId, string>();
  for (const player of view.players) {
    if (player.id !== view.you && player.avatar)
      taken.set(player.avatar, player.name);
  }
  return taken;
}

function ScrollHint() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontSize: 17,
        fontWeight: 700,
        color: "var(--opg-ink-secondary)",
      }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 5v13M6 12l6 6 6-6" />
      </svg>
      <div>Scroll for more doodles</div>
    </div>
  );
}

function playerName(player: PlayerSummary | null, fallback: string): string {
  return player?.name ?? fallback;
}

function playerAvatar(player: PlayerSummary | null): AvatarId | null {
  return player?.avatar ?? null;
}

function PickerHeading({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Marker size={34} style={{ lineHeight: 1.15 }}>
        Pick your doodle
      </Marker>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Hi, {name}!</div>
    </div>
  );
}

export function PhoneAvatarPicker({
  view,
  onPick,
  onDone,
}: PhoneAvatarPickerProps) {
  const me = view.players.find((p) => p.id === view.you) ?? null;
  const taken = buildTaken(view);
  const greeting = playerName(me, "player");
  const stamp = playerName(me, "You");

  return (
    <PhoneScreen>
      <PickerHeading name={greeting} />

      <AvatarGrid taken={taken} picked={playerAvatar(me)} onPick={onPick} />

      <ScrollHint />

      <div style={{ marginTop: "auto" }}>
        <Button size="lg" fullWidth onClick={onDone}>
          <span>That's me</span>
          <Icon name="check" size={24} color="var(--opg-paper)" />
        </Button>
      </div>
      <Stamp
        size={20}
        tilt={-4}
        style={{ alignSelf: "center", borderWidth: 3, padding: "2px 12px" }}
      >
        {stamp}
      </Stamp>
    </PhoneScreen>
  );
}
