// design/PhoneAvatarPicker.dc.html — shown once right after joining.
import type { AvatarId, PlayerRoomView, PlayerSummary } from "@opg/protocol";
import { AVATARS } from "@opg/protocol";
import {
  Avatar,
  Button,
  Icon,
  Marker,
  PhoneScreen,
  PRESSABLE_CLASS,
  Stamp,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";

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
  t,
}: {
  id: AvatarId;
  owner: string;
  radius: TileRadius;
  t: Dictionary;
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
      <Avatar
        id={id}
        size={52}
        faded
        alt={format(t.avatarPicker.takenAlt, { id, owner })}
      />
      <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.15 }}>
        {t.avatarPicker.taken}
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

function IdleArt({ id, t }: { id: AvatarId; t: Dictionary }) {
  return <Avatar id={id} size={72} alt={format(t.avatarPicker.chooseAlt, { id })} />;
}

function PickedArt({ id, t }: { id: AvatarId; t: Dictionary }) {
  return (
    <>
      <Icon
        name="check"
        size={26}
        color="var(--opg-marker)"
        style={{ position: "absolute", insetInlineEnd: 6, top: 6 }}
      />
      <Avatar id={id} size={66} alt={format(t.avatarPicker.chooseAlt, { id })} />
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-marker)",
        }}
      >
        {t.avatarPicker.picked}
      </div>
    </>
  );
}

function PickTile({
  id,
  picked,
  radius,
  onPick,
  t,
}: {
  id: AvatarId;
  picked: boolean;
  radius: TileRadius;
  onPick: (avatar: AvatarId) => void;
  t: Dictionary;
}) {
  const look = pickTileLook(picked);
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
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
      {picked ? <PickedArt id={id} t={t} /> : <IdleArt id={id} t={t} />}
    </button>
  );
}

function AvatarGrid({
  taken,
  picked,
  onPick,
  t,
}: {
  taken: Map<AvatarId, string>;
  picked: AvatarId | null;
  onPick: (avatar: AvatarId) => void;
  t: Dictionary;
}) {
  return (
    <div
      style={{
        // The grid is what scrolls, not the page: "That's me" has to stay on screen, and
        // a basis of 0 is what lets the grid give up the space to keep it there.
        flex: "1 1 0",
        minHeight: 0,
        overflowY: "auto",
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 12,
        alignContent: "start",
      }}
    >
      {AVATARS.map((id, index) => {
        const owner = taken.get(id);
        const radius: TileRadius =
          index % 2 === 0 ? "var(--opg-radius-m)" : "var(--opg-radius-m-alt)";

        if (owner) {
          return <TakenTile key={id} id={id} owner={owner} radius={radius} t={t} />;
        }
        return (
          <PickTile
            key={id}
            id={id}
            picked={picked === id}
            radius={radius}
            onPick={onPick}
            t={t}
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

function ScrollHint({ t }: { t: Dictionary }) {
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
      <div>{t.avatarPicker.scrollHint}</div>
    </div>
  );
}

function playerName(player: PlayerSummary | null, fallback: string): string {
  return player?.name ?? fallback;
}

function playerAvatar(player: PlayerSummary | null): AvatarId | null {
  return player?.avatar ?? null;
}

function PickerHeading({ name, t }: { name: string; t: Dictionary }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Marker size={34} style={{ lineHeight: 1.15 }}>
        {t.avatarPicker.heading}
      </Marker>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {format(t.avatarPicker.greeting, { name })}
      </div>
    </div>
  );
}

export function PhoneAvatarPicker({
  view,
  onPick,
  onDone,
}: PhoneAvatarPickerProps) {
  const { t } = useLocale();
  const me = view.players.find((p) => p.id === view.you) ?? null;
  const taken = buildTaken(view);
  const greeting = playerName(me, t.avatarPicker.fallbackPlayer);
  const stamp = playerName(me, t.avatarPicker.fallbackYou);

  return (
    <PhoneScreen fit>
      <PickerHeading name={greeting} t={t} />

      <AvatarGrid taken={taken} picked={playerAvatar(me)} onPick={onPick} t={t} />

      <ScrollHint t={t} />

      <div style={{ marginTop: "auto" }}>
        <Button size="lg" fullWidth onClick={onDone}>
          <span>{t.avatarPicker.done}</span>
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
