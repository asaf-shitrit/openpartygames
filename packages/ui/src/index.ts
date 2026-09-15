// @opg/ui — the Doodle Notebook UI kit.
export { Stage, PhoneScreen } from "./layout";
export type { StageProps, PhoneScreenProps } from "./layout";

export {
  Card,
  StickyNote,
  LinedCard,
  Tape,
  Highlight,
  Marker,
  Stamp,
  Button,
  Chip,
  Switch,
  TextInput,
  PRESSABLE_CLASS,
} from "./primitives";
export type {
  CardProps,
  CardVariant,
  StickyNoteProps,
  LinedCardProps,
  TapeProps,
  HighlightProps,
  MarkerProps,
  StampProps,
  ButtonProps,
  ButtonSize,
  ChipProps,
  SwitchProps,
  TextInputProps,
} from "./primitives";

export { PhaseEnter } from "./motion";
export type { PhaseEnterProps } from "./motion";

export { Crown, Tally } from "./marks";
export type { CrownProps, TallyProps } from "./marks";

export { Icon } from "./Icon";
export type { IconName, IconProps } from "./Icon";

export { Avatar, AVATAR_FILLS } from "./Avatar";
export type { AvatarProps } from "./Avatar";

export { Timer, TIMER_URGENT_MS } from "./Timer";
export type { TimerProps } from "./Timer";

export { TvHeader, PhoneStrip, PlayerChip, HeaderChip } from "./chrome";
export type {
  TvHeaderProps,
  PhoneStripProps,
  PlayerChipProps,
  HeaderChipProps,
} from "./chrome";

export { useServerClock, useSoundSetting } from "./clock";
export type { SoundSetting } from "./clock";

export { useFullscreen, useScreenWakeLock } from "./screen";
export type { FullscreenControl } from "./screen";

export type { ServerClock, GameUi } from "./game-ui";
