// Kicked from the room.
import type { AvatarId } from "@opg/protocol";
import { format, useLocale } from "@opg/i18n";
import { Avatar, Button, Card, Marker, PhoneScreen } from "@opg/ui";
import { navigate } from "../router";

export interface PhoneKickedProps {
  name?: string;
  avatar?: AvatarId | null;
}

export function PhoneKicked({ name, avatar = null }: PhoneKickedProps) {
  const { t } = useLocale();
  return (
    <PhoneScreen>
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
            padding: "30px 22px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            textAlign: "center",
          }}
        >
          <Avatar id={avatar} size={96} />
          <Marker size={40}>{t.status.removedHeading}</Marker>
          <div style={{ fontSize: 20, lineHeight: 1.4 }}>
            {name
              ? format(t.status.removedByNamed, { name })
              : t.status.removedByAnon}
          </div>
          <Button size="lg" fullWidth onClick={() => navigate("/")}>
            <span>{t.status.joinNewRoom}</span>
          </Button>
        </Card>
      </div>
    </PhoneScreen>
  );
}
