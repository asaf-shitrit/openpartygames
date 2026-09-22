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
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { ApiError, getRoomInfo } from "../api";
import { LanguagePicker } from "../LanguagePicker";

export interface PhoneJoinProps {
  initialCode?: string;
  initialName?: string;
  busy?: boolean;
  error?: string | null;
  onJoin: (code: string, name: string) => void;
}

function BrandHeader({ t }: { t: Dictionary }) {
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
          insetInline: 0,
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
        {t.join.brand}
      </div>
    </div>
  );
}

/** The brand mark and the language choice share the top line. */
function ScreenHeader({ t }: { t: Dictionary }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <BrandHeader t={t} />
      <LanguagePicker t={t} />
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
  t,
}: {
  code: string;
  onChange: (value: string) => void;
  t: Dictionary;
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
        {t.join.roomCodeLabel}
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
          aria-label={t.join.roomCodeLabel}
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
        <div>{t.join.askSomeone}</div>
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
  t: Dictionary;
}

function JoinForm({
  code,
  name,
  onCodeChange,
  onNameChange,
  shownError,
  pending,
  onSubmit,
  t,
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
      <Marker size={40}>{t.join.heading}</Marker>
      <CodeField code={code} onChange={onCodeChange} t={t} />
      <TextInput
        label={t.join.yourNameLabel}
        value={name}
        onChange={onNameChange}
        maxLength={12}
        placeholder={t.join.yourNamePlaceholder}
      />
      {shownError ? <ErrorLine error={shownError} /> : null}
      <Button size="lg" fullWidth disabled={pending} onClick={onSubmit}>
        <span>{pending ? t.join.joining : t.join.join}</span>
        <Icon
          name="arrow-right"
          size={24}
          color="var(--opg-paper)"
        />
      </Button>
    </Card>
  );
}

/** The room code wasn't found, with a hint for the most likely reason why. */
function missingRoomError(t: Dictionary): JoinErrorResult {
  return { message: t.join.errorMissing, hint: t.join.soundsAlikeHint };
}

/** Problems the player can fix in the form itself. */
function localJoinError(
  t: Dictionary,
  code: string,
  name: string,
): JoinErrorResult | null {
  if (code.length !== ROOM_CODE_LENGTH) return { message: t.join.errorCode };
  if (name.length === 0) return { message: t.join.errorName };
  return null;
}

/** Maps a room lookup onto the message to show, or null when the join can proceed. */
function roomJoinError(
  t: Dictionary,
  info: RoomInfoResponse,
): JoinErrorResult | null {
  if (!info.exists) return missingRoomError(t);
  if (!info.joinable && !info.inGame) return { message: t.join.errorFull };
  return null;
}

async function joinError(
  t: Dictionary,
  cleanCode: string,
  cleanName: string,
): Promise<JoinErrorResult | null> {
  const local = localJoinError(t, cleanCode, cleanName);
  if (local) return local;
  try {
    return roomJoinError(t, await getRoomInfo(cleanCode));
  } catch (err) {
    if (err instanceof ApiError && err.code === "not-found") {
      return missingRoomError(t);
    }
    if (err instanceof ApiError && err.code === "rate-limited") {
      return { message: t.join.errorRateLimited };
    }
    return { message: t.join.errorUnreachable };
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
  const { t } = useLocale();

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
    const message = await joinError(t, cleanCode, cleanName);
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
      <ScreenHeader t={t} />
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
          t={t}
        />
        <div
          style={{
            textAlign: "center",
            fontSize: 17,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {t.join.noAccount}
        </div>
      </div>
    </PhoneScreen>
  );
}
