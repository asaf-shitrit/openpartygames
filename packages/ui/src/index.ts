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

export { Crown, Tally } from "./marks";
export type { CrownProps, TallyProps } from "./marks";

export { Icon } from "./Icon";
export type { IconName, IconProps } from "./Icon";

export { Avatar, AVATAR_FILLS } from "./Avatar";
export type { AvatarProps } from "./Avatar";

export { Timer } from "./Timer";
export type { TimerProps } from "./Timer";

export { TvHeader, PhoneStrip, PlayerChip } from "./chrome";
export type { TvHeaderProps, PhoneStripProps, PlayerChipProps } from "./chrome";

export { useServerClock, useSoundSetting } from "./clock";
export type { SoundSetting } from "./clock";

export type { ServerClock, GameUi } from "./game-ui";
