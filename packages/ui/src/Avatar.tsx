// Avatar displays one of the 12 doodle avatars, or a dashed "open seat" when id is null.
import type { CSSProperties } from "react";
import type { AvatarId } from "@opg/protocol";
import { AVATAR_FILLS, renderAvatar } from "./avatar-art";
import { Icon } from "./Icon";

export interface AvatarProps {
  id: AvatarId | null;
  size?: number;
  style?: CSSProperties;
  /** Dim the doodle (e.g. an avatar already taken by another player). */
  faded?: boolean;
  /** Accessible label; when omitted the avatar is decorative and hidden from AT. */
  alt?: string;
}

export function Avatar({
  id,
  size = 72,
  style,
  faded = false,
  alt,
}: AvatarProps) {
  const props = {
    role: alt ? "img" : undefined,
    "aria-label": alt,
    "aria-hidden": alt ? undefined : true,
  } as const;

  if (!id) {
    return (
      <div
        {...props}
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "3px dashed var(--opg-muted)",
          borderRadius: "50%",
          color: "var(--opg-ink-secondary)",
          ...style,
        }}
      >
        <Icon
          name="plus"
          size={Math.round(size * 0.4)}
          color="var(--opg-muted)"
        />
      </div>
    );
  }

  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ flexShrink: 0, opacity: faded ? 0.4 : 1, ...style }}
    >
      {renderAvatar(id, size >= 90 ? 4 : 5)}
    </svg>
  );
}

export { AVATAR_FILLS };
