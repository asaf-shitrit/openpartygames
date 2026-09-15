// The 12 doodle avatars from design/AVATARS.md. viewBox 0 0 100 100.
import type { ReactNode } from "react";
import type { AvatarId } from "@opg/protocol";

/** Body fill color per avatar id (used for player color accents elsewhere too). */
export const AVATAR_FILLS = {
  blob: "#FFA8A8",
  toast: "#FFBE7A",
  drop: "#93E3C9",
  cloud: "#A3CCFF",
  star: "#FFE45C",
  cat: "#CDB8FF",
  ghost: "#F5C2E7",
  bean: "#B8E986",
  robot: "#C9D3DD",
  mushroom: "#FF9E80",
  egg: "#FFF1B8",
  sun: "#FFD36E",
} satisfies Record<AvatarId, string>;

const INK = "#2B2B2B";
const WHITE = "#FFFFFF";

/** Shared outline props. `sw` is 4 at >= 90px render size, 5 below 90px. */
function outline(sw: number) {
  return {
    stroke: INK,
    strokeWidth: sw,
    strokeLinejoin: "round" as const,
  };
}

function blob(sw: number): ReactNode {
  return (
    <>
      <path
        d="M50 8c24 0 40 18 40 42s-14 42-40 42S10 74 10 50 26 8 50 8z"
        fill={AVATAR_FILLS.blob}
        {...outline(sw)}
      />
      <circle cx="38" cy="46" r="5" fill={INK} />
      <circle cx="62" cy="46" r="5" fill={INK} />
      <path
        d="M37 62q13 12 26 0"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function toast(sw: number): ReactNode {
  return (
    <>
      <path
        d="M22 30c0-14 12-20 28-20s28 6 28 20c0 4-3 7-6 8v44c0 5-3 8-8 8H36c-5 0-8-3-8-8V38c-3-1-6-4-6-8z"
        fill={AVATAR_FILLS.toast}
        {...outline(sw)}
      />
      <circle cx="41" cy="55" r="4.5" fill={INK} />
      <circle cx="59" cy="55" r="4.5" fill={INK} />
      <path
        d="M33 44l10 4M67 44l-10 4M44 71h12"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function drop(sw: number): ReactNode {
  return (
    <>
      <path
        d="M50 6c6 10 34 30 34 56 0 18-15 30-34 30S16 80 16 62C16 36 44 16 50 6z"
        fill={AVATAR_FILLS.drop}
        {...outline(sw)}
      />
      <circle
        cx="50"
        cy="58"
        r="13"
        fill={WHITE}
        stroke={INK}
        strokeWidth={sw}
      />
      <circle cx="53" cy="59" r="5.5" fill={INK} />
      <path
        d="M42 81q8 5 16 0"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function cloud(sw: number): ReactNode {
  return (
    <>
      <path
        d="M28 84c-12 0-20-8-20-19 0-10 7-17 16-18 1-15 12-27 27-27 12 0 22 8 25 19 10 1 18 9 18 20 0 14-9 25-22 25z"
        fill={AVATAR_FILLS.cloud}
        {...outline(sw)}
      />
      <path
        d="M35 60q6 5 12 0M57 60q6 5 12 0"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle cx="52" cy="72" r="4" fill={INK} />
    </>
  );
}

function star(sw: number): ReactNode {
  return (
    <>
      <path
        d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z"
        fill={AVATAR_FILLS.star}
        {...outline(sw)}
      />
      <circle cx="43" cy="50" r="4" fill={INK} />
      <circle cx="57" cy="50" r="4" fill={INK} />
      <path
        d="M44 59q6 9 12 0z"
        fill={INK}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </>
  );
}

function cat(sw: number): ReactNode {
  return (
    <>
      <path
        d="M20 36L18 10l20 14c4-1 8-2 12-2s8 1 12 2l20-14-2 26c6 7 10 16 10 26 0 20-18 30-40 30S10 82 10 62c0-10 4-19 10-26z"
        fill={AVATAR_FILLS.cat}
        {...outline(sw)}
      />
      <circle cx="38" cy="58" r="4.5" fill={INK} />
      <circle cx="62" cy="58" r="4.5" fill={INK} />
      <path
        d="M44 70l6 5 6-5"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function ghost(sw: number): ReactNode {
  return (
    <>
      <path
        d="M50 10c19 0 32 15 32 34v46l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6V44c0-19 13-34 32-34z"
        fill={AVATAR_FILLS.ghost}
        {...outline(sw)}
      />
      <circle cx="41" cy="44" r="5" fill={INK} />
      <circle cx="59" cy="44" r="5" fill={INK} />
      <circle cx="50" cy="60" r="4" fill={INK} />
    </>
  );
}

function bean(sw: number): ReactNode {
  return (
    <>
      <path
        d="M34 12c16-6 30 2 38 18 10 20 14 40 8 54-5 11-18 14-30 10C34 90 20 78 16 58 12 38 18 18 34 12z"
        fill={AVATAR_FILLS.bean}
        {...outline(sw)}
      />
      <circle cx="44" cy="44" r="4" fill={INK} />
      <circle cx="60" cy="40" r="4" fill={INK} />
      <path
        d="M44 60q10 8 20-2"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function robot(sw: number): ReactNode {
  return (
    <>
      <path
        d="M50 30V17"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle
        cx="50"
        cy="13"
        r="4"
        fill="#FFE45C"
        stroke={INK}
        strokeWidth="3"
      />
      <path
        d="M22 30h56a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H22a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6z"
        fill={AVATAR_FILLS.robot}
        {...outline(sw)}
      />
      <circle cx="38" cy="54" r="6" fill={INK} />
      <circle cx="62" cy="54" r="6" fill={INK} />
      <path
        d="M38 72h24"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function mushroom(sw: number): ReactNode {
  return (
    <>
      <path
        d="M34 52h32v28c0 6-5 10-10 10H44c-5 0-10-4-10-10z"
        fill="#FFF3DC"
        {...outline(sw)}
      />
      <path
        d="M12 52C12 28 30 12 50 12s38 16 38 40z"
        fill={AVATAR_FILLS.mushroom}
        {...outline(sw)}
      />
      <circle cx="36" cy="34" r="5" fill={WHITE} />
      <circle cx="62" cy="30" r="6" fill={WHITE} />
      <circle cx="44" cy="66" r="3.5" fill={INK} />
      <circle cx="56" cy="66" r="3.5" fill={INK} />
      <path
        d="M46 76q4 4 8 0"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function egg(sw: number): ReactNode {
  return (
    <>
      <path
        d="M50 8c20 0 36 30 36 52 0 20-16 32-36 32S14 80 14 60C14 38 30 8 50 8z"
        fill={AVATAR_FILLS.egg}
        {...outline(sw)}
      />
      <circle cx="40" cy="56" r="4.5" fill={INK} />
      <circle cx="60" cy="56" r="4.5" fill={INK} />
      <path
        d="M44 70q6 5 12 0"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

function sun(sw: number): ReactNode {
  return (
    <>
      <path
        d="M50 6v12M50 82v12M6 50h12M82 50h12M19 19l8 8M73 73l8 8M19 81l8-8M73 27l8-8"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="26" fill={AVATAR_FILLS.sun} {...outline(sw)} />
      <circle cx="42" cy="46" r="4" fill={INK} />
      <circle cx="58" cy="46" r="4" fill={INK} />
      <path
        d="M40 58q10 10 20 0"
        fill="none"
        stroke={INK}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </>
  );
}

const RENDERERS = {
  blob,
  toast,
  drop,
  cloud,
  star,
  cat,
  ghost,
  bean,
  robot,
  mushroom,
  egg,
  sun,
} satisfies Record<AvatarId, (sw: number) => ReactNode>;

/** Renders the doodle for an avatar id. */
export function renderAvatar(id: AvatarId, sw: number): ReactNode {
  return RENDERERS[id](sw);
}
