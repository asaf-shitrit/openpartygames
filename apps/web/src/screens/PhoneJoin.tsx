// design/PhoneJoin.dc.html — code + name join form.
import { useState } from "react";
import { normalizeRoomCode, ROOM_CODE_LENGTH } from "@opg/protocol";
import type { RoomInfoResponse } from "@opg/protocol";
import {
  Button,
  Card,
  Icon,
  Marker,
  PhoneScreen,
  Tape,
  TextInput,
} from "@opg/ui";
import { ApiError, getRoomInfo } from "../api";

export interface PhoneJoinProps {
  initialCode?: string;
  initialName?: string;
  busy?: boolean;
  error?: string | null;
  onJoin: (code: string, name: string) => void;
}

function BrandHeader() {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        position: "relative",
        padding: "0 6px",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 3,
          height: 12,
          background: "var(--opg-highlight)",
          borderRadius: 4,
          transform: "rotate(-1deg)",
        }}
      />
      <div
        className="opg-marker"
        style={{ position: "relative", fontSize: 24, lineHeight: 1.2 }}
      >
        OpenPartyGames
      </div>
    </div>
  );
}

function CodeCells({ code }: { code: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: ROOM_CODE_LENGTH }, (_, index) => (
        <div
          key={index}
          style={{
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--opg-paper)",
            border: "4px solid var(--opg-ink)",
            borderRadius:
              index % 2 === 0
                ? "var(--opg-radius-m)"
                : "var(--opg-radius-m-alt)",
            fontFamily: "var(--opg-font-marker)",
            fontSize: 44,
            lineHeight: 1,
          }}
        >
          {code[index] ?? ""}
        </div>
      ))}
    </div>
  );
}

function CodeField({
  code,
  onChange,
}: {
  code: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label
        htmlFor="opg-room-code"
        style={{
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--opg-ink-secondary)",
        }}
      >
        Room code
      </label>
      <div className="opg-code-field" style={{ position: "relative" }}>
        <CodeCells code={code} />
        <input
          id="opg-room-code"
          value={code}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          inputMode="text"
          maxLength={ROOM_CODE_LENGTH}
          aria-label="Room code"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 17,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        <Icon name="monitor" size={22} color="var(--opg-ink-secondary)" />
        <div>Ask someone in the room</div>
      </div>
    </div>
  );
}

interface JoinErrorResult {
  message: string;
  hint?: string;
}

function ErrorLine({ error }: { error: JoinErrorResult }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: "var(--opg-marker)" }}>
        {error.message}
      </div>
      {error.hint ? (
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {error.hint}
        </div>
      ) : null}
    </div>
  );
}

interface JoinFormProps {
  code: string;
  name: string;
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  shownError: JoinErrorResult | null;
  pending: boolean;
  onSubmit: () => void;
}

function JoinForm({
  code,
  name,
  onCodeChange,
  onNameChange,
  shownError,
  pending,
  onSubmit,
}: JoinFormProps) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        padding: "30px 22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <Tape left={110} top={-20} width={150} height={40} rotate={-3} />
      <Marker size={40}>Join a game</Marker>
      <CodeField code={code} onChange={onCodeChange} />
      <TextInput
        label="Your name"
        value={name}
        onChange={onNameChange}
        maxLength={12}
        placeholder="Your name"
      />
      {shownError ? <ErrorLine error={shownError} /> : null}
      <Button size="lg" fullWidth disabled={pending} onClick={onSubmit}>
        <span>{pending ? "Joining…" : "Join"}</span>
        <Icon name="arrow-right" size={24} color="var(--opg-paper)" />
      </Button>
    </Card>
  );
}

const JOIN_ERRORS = {
  code: "Enter the 4-letter room code.",
  name: "Enter a name.",
  missing: "That room code doesn't exist.",
  full: "That room is full or locked.",
  unreachable: "Could not reach the room. Check your connection.",
  rateLimited: "Too many tries. Wait a moment and try again.",
} as const;

const SOUNDS_ALIKE_HINT =
  "Sounds alike: B/D/P/T/V/Z, M/N, S/F. Ask them to say it again.";

/** The room code wasn't found, with a hint for the most likely reason why. */
function missingRoomError(): JoinErrorResult {
  return { message: JOIN_ERRORS.missing, hint: SOUNDS_ALIKE_HINT };
}

/** Problems the player can fix in the form itself. */
function localJoinError(code: string, name: string): JoinErrorResult | null {
  if (code.length !== ROOM_CODE_LENGTH) return { message: JOIN_ERRORS.code };
  if (name.length === 0) return { message: JOIN_ERRORS.name };
  return null;
}

/** Maps a room lookup onto the message to show, or null when the join can proceed. */
function roomJoinError(info: RoomInfoResponse): JoinErrorResult | null {
  if (!info.exists) return missingRoomError();
  if (!info.joinable && !info.inGame) return { message: JOIN_ERRORS.full };
  return null;
}

async function joinError(
  cleanCode: string,
  cleanName: string,
): Promise<JoinErrorResult | null> {
  const local = localJoinError(cleanCode, cleanName);
  if (local) return local;
  try {
    return roomJoinError(await getRoomInfo(cleanCode));
  } catch (err) {
    if (err instanceof ApiError && err.code === "not-found") {
      return missingRoomError();
    }
    if (err instanceof ApiError && err.code === "rate-limited") {
      return { message: JOIN_ERRORS.rateLimited };
    }
    return { message: JOIN_ERRORS.unreachable };
  }
}

export function PhoneJoin({
  initialCode = "",
  initialName = "",
  busy = false,
  error = null,
  onJoin,
}: PhoneJoinProps) {
  const [code, setCode] = useState(
    normalizeRoomCode(initialCode).slice(0, ROOM_CODE_LENGTH),
  );
  const [name, setName] = useState(initialName);
  const [localError, setLocalError] = useState<JoinErrorResult | null>(null);
  const [checking, setChecking] = useState(false);

  const setCodeInput = (value: string) => {
    const letters = value
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, ROOM_CODE_LENGTH);
    setCode(letters);
    setLocalError(null);
  };

  const submit = async () => {
    const cleanCode = normalizeRoomCode(code);
    const cleanName = name.trim();
    setChecking(true);
    setLocalError(null);
    const message = await joinError(cleanCode, cleanName);
    setChecking(false);
    if (message) {
      setLocalError(message);
      return;
    }
    onJoin(cleanCode, cleanName);
  };

  const shownError = localError ?? (error ? { message: error } : null);
  const pending = busy || checking;
  const handleSubmit = () => {
    void submit();
  };

  return (
    <PhoneScreen>
      <BrandHeader />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <JoinForm
          code={code}
          name={name}
          onCodeChange={setCodeInput}
          onNameChange={(value) => {
            setName(value);
            setLocalError(null);
          }}
          shownError={shownError}
          pending={pending}
          onSubmit={handleSubmit}
        />
        <div
          style={{
            textAlign: "center",
            fontSize: 17,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          No account needed.
        </div>
      </div>
    </PhoneScreen>
  );
}
