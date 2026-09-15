// Kicked from the room.
import type { AvatarId } from "@opg/protocol";
import { Avatar, Button, Card, Marker, PhoneScreen } from "@opg/ui";
import { navigate } from "../router";

export interface PhoneKickedProps {
  name?: string;
  avatar?: AvatarId | null;
}

export function PhoneKicked({ name, avatar = null }: PhoneKickedProps) {
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
          <Marker size={40}>You were removed</Marker>
          <div style={{ fontSize: 20, lineHeight: 1.4 }}>
            {name
              ? `${name}, the VIP removed you from the room.`
              : "The VIP removed you from the room."}
          </div>
          <Button size="lg" fullWidth onClick={() => navigate("/")}>
            <span>Join a new room</span>
          </Button>
        </Card>
      </div>
    </PhoneScreen>
  );
}
