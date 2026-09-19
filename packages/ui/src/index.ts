// @opg/ui — the Doodle Notebook UI kit.
export { Stage, PhoneScreen } from "./layout";
export { SR_ONLY } from "./sr-only";
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

export { prefersReducedMotion, useReducedMotion } from "./reduced-motion";

export {
  CUE_GRACE_MS,
  anchorAt,
  beatIndexAt,
  beatIndexOf,
  isFreshEntry,
  msUntilNextBeat,
  spacedBeats,
} from "./moment/timeline";
export type { Beat, SpacedBeatsOptions } from "./moment/timeline";
export { reached, useMoment } from "./moment/useMoment";
export type { Moment } from "./moment/useMoment";
export { useBeatEntries } from "./moment/useBeatEntries";
export { EyesOnTv } from "./moment/EyesOnTv";
export type { EyesOnTvProps } from "./moment/EyesOnTv";

export {
  HAPTIC_PATTERNS,
  HEARTBEAT_MS,
  buzz,
  canVibrate,
  pulse,
  useBuzz,
  useHeartbeat,
} from "./haptics";
export type { HapticName, HeartbeatTempo } from "./haptics";

export { fxSpec, playFx } from "./fx/animate";
export type { FxPreset, FxSpec } from "./fx/animate";
export { SlamStamp } from "./fx/SlamStamp";
export type { SlamStampProps } from "./fx/SlamStamp";
export { TallyScratch } from "./fx/TallyScratch";
export type { TallyScratchProps } from "./fx/TallyScratch";
export { Spotlight, spotlightMaskCircles } from "./fx/Spotlight";
export type { SpotlightProps, SpotlightTarget } from "./fx/Spotlight";
export { FxIn } from "./fx/FxIn";
export type { FxInProps } from "./fx/FxIn";
export { StickerBurst } from "./fx/StickerBurst";
export type { StickerBurstProps } from "./fx/StickerBurst";
export { LetterTiles, tileSizeFor } from "./fx/LetterTiles";
export type { LetterTilesProps } from "./fx/LetterTiles";
export { countAt, easeOutCubic, formatPoints } from "./fx/count-up";
export { CountUp } from "./fx/CountUp";
export type { CountUpProps } from "./fx/CountUp";
export { flipOffsets, rankChanges } from "./fx/flip";
export type { RankChanges, RowBox } from "./fx/flip";
export { useFlipList } from "./fx/useFlipList";
export type { UseFlipList, UseFlipListOptions } from "./fx/useFlipList";
export { arrivalsBetween, useArrivals } from "./fx/useArrivals";
export { FlipCard } from "./fx/FlipCard";
export type { FlipCardProps } from "./fx/FlipCard";
export { Confetti } from "./fx/Confetti";
export type { ConfettiOrigin, ConfettiProps } from "./fx/Confetti";
export { CONFETTI_CAP } from "./fx/confetti-physics";
export { Suspense } from "./fx/Suspense";
export type { SuspenseProps, SuspenseVariant } from "./fx/Suspense";

export { CUE_IDS, MUSIC_IDS, SILENT_ENGINE, SILENT_HANDLE } from "./audio/types";
export type {
  CueHandle,
  CueId,
  CueOptions,
  MusicId,
  SoundEngine,
  SoundStatus,
} from "./audio/types";
export {
  SoundProvider,
  useCue,
  useMusic,
  useSound,
} from "./audio/SoundProvider";
export type {
  SoundContextValue,
  SoundProviderProps,
} from "./audio/SoundProvider";
export {
  DUCKING_CUES,
  createBrowserSoundEngine,
  createSoundEngine,
} from "./audio/engine";
export { AUDIO_CREDITS, MUSIC_CREDITS } from "./audio/credits";
export type { AudioCredit, AudioLicense, MusicCredit } from "./audio/credits";

export { Crown, Tally } from "./marks";
export type { CrownProps, TallyProps } from "./marks";

export { Icon } from "./Icon";
export type { IconName, IconProps } from "./Icon";

export { Avatar, AVATAR_FILLS } from "./Avatar";
export type { AvatarProps } from "./Avatar";

export { Timer, TIMER_URGENT_MS } from "./Timer";
export {
  msUntilNextSecond,
  ringFraction,
  secondsLeft,
  timerStage,
} from "./timer-stage";
export type { TimerStage } from "./timer-stage";
export type { TimerProps } from "./Timer";

export { TvHeader, PhoneStrip, PlayerChip, HeaderChip } from "./chrome";
export type {
  TvHeaderProps,
  PhoneStripProps,
  PlayerChipProps,
  HeaderChipProps,
} from "./chrome";

export {
  CLOCK_SAMPLE_WINDOW,
  clockOffsetFrom,
  createServerClock,
  nextClockSamples,
} from "./clock";

export { useFullscreen, useScreenWakeLock } from "./screen";
export type { FullscreenControl } from "./screen";

export type { ServerClock, GameUi } from "./game-ui";

export {
  GAP_MS_CAP,
  GRID,
  MAX_POINTS_PER_DOODLE,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_DOODLE,
  MIN_STEP,
  RDP_EPSILON,
  REPLAY_MS,
  STROKE_MS_CAP,
  TICK_MS,
  emptyDoodle,
} from "./doodle/types";
export type { Doodle, GridPoint, InkIndex, Stroke } from "./doodle/types";
export { DOODLE_INK_NAMES, DOODLE_INKS } from "./doodle/inks";
export {
  deltaDecode,
  deltaEncode,
  doodleBounds,
  gridPointOf,
  simplifyStroke,
} from "./doodle/geometry";
export type { ClientRectLike, DoodleBounds } from "./doodle/geometry";
export { captureDuration, captureGap, finalizeStroke } from "./doodle/capture";
export { paintDoodle } from "./doodle/paint";
export type { DoodleBox, DoodleCanvasContext, DoodleUpTo } from "./doodle/paint";
export { replaySchedule, replayStateAt } from "./doodle/replay";
export type { ReplayState, StrokeWindow } from "./doodle/replay";
export { DoodlePad } from "./doodle/DoodlePad";
export type { DoodlePadProps } from "./doodle/DoodlePad";
export { DoodleView } from "./doodle/DoodleView";
export type { DoodleReplay, DoodleViewProps } from "./doodle/DoodleView";
