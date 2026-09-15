// "Show this on your TV" guide dialog for the host screen.
import type { CSSProperties, JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, HeaderChip, Marker, StickyNote } from "@opg/ui";

export type HostDevice = "mac" | "ios" | "chrome" | "other";

const IOS_UA = /iPhone|iPad|iPod/;
const MAC_UA = /Macintosh/;
const CHROME_UA = /Chrome\/|Edg\//;

/** Best guess at the device showing the host screen, from navigator.userAgent and navigator.maxTouchPoints. */
export function detectHostDevice(
  userAgent: string,
  maxTouchPoints: number,
): HostDevice {
  if (IOS_UA.test(userAgent)) return "ios";
  if (MAC_UA.test(userAgent)) return maxTouchPoints > 1 ? "ios" : "mac";
  if (CHROME_UA.test(userAgent)) return "chrome";
  return "other";
}

export type GuideId = "mac" | "ios" | "chrome" | "tv-browser" | "hdmi";

export interface GuideSection {
  id: GuideId;
  title: string;
  steps: string[];
  /** This is the device the page is open on. */
  onThisDevice: boolean;
}

const GUIDE_ORDER: GuideId[] = ["mac", "ios", "chrome", "tv-browser", "hdmi"];

function guideTitle(id: GuideId): string {
  if (id === "mac") return "Mac to Apple TV or AirPlay TV";
  if (id === "ios") return "iPad or iPhone to Apple TV or AirPlay TV";
  if (id === "chrome") return "Chrome to Chromecast or Google TV";
  if (id === "tv-browser") return "Your TV's web browser";
  return "HDMI cable";
}

function guideSteps(id: GuideId, host: string): string[] {
  if (id === "mac") {
    return [
      "Open Control Center in the menu bar.",
      "Click Screen Mirroring and pick your TV.",
      "Click Full screen at the top right.",
    ];
  }
  if (id === "ios") {
    return [
      "Open Control Center.",
      "Tap Screen Mirroring and pick your TV.",
      "Turn it sideways so the game fills the TV.",
    ];
  }
  if (id === "chrome") {
    return [
      "Open the ⋮ menu at the top right of Chrome.",
      "Choose Cast… and pick your TV.",
      "Click Full screen at the top right.",
    ];
  }
  if (id === "tv-browser") {
    return [
      "Open the web browser app on your TV.",
      `Go to ${host}.`,
      "Start the room there. Phones join the same way.",
    ];
  }
  return [
    "Plug this computer into the TV.",
    "Switch the TV to that input.",
    "Click Full screen at the top right.",
  ];
}

/** The ways to get this screen onto a TV, with the current device's way first. */
export function guideSections(
  device: HostDevice,
  host: string,
): GuideSection[] {
  const order =
    device === "other"
      ? GUIDE_ORDER
      : [device, ...GUIDE_ORDER.filter((id) => id !== device)];
  return order.map((id) => ({
    id,
    title: guideTitle(id),
    steps: guideSteps(id, host),
    onThisDevice: id === device,
  }));
}

export interface ShowOnTvGuideProps {
  device: HostDevice;
  /** window.location.host, shown in the TV-browser steps. */
  host: string;
  onClose: () => void;
}

const DIALOG_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  margin: 0,
  width: "100%",
  height: "100%",
  maxWidth: "none",
  maxHeight: "none",
  border: "none",
  padding: 0,
  background: "rgba(43,43,43,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 10,
};

const PANEL_STYLE: CSSProperties = {
  width: 1600,
  padding: "48px 56px",
  display: "flex",
  flexDirection: "column",
  gap: 28,
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 24,
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 28,
};

const ENTRY_STYLE: CSSProperties = {
  padding: "22px 26px 26px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const BADGE_STYLE: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
};

const STEPS_STYLE: CSSProperties = {
  fontSize: 28,
  lineHeight: 1.3,
  paddingLeft: 36,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

function GuideEntryBody({ section }: { section: GuideSection }) {
  return (
    <>
      <h3 style={{ margin: 0, fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>
        {section.title}
      </h3>
      <ol style={STEPS_STYLE}>
        {section.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </>
  );
}

function GuideEntry({
  section,
  index,
}: {
  section: GuideSection;
  index: number;
}) {
  if (section.onThisDevice) {
    return (
      <StickyNote tilt={-1} style={ENTRY_STYLE}>
        <div style={BADGE_STYLE}>On this device</div>
        <GuideEntryBody section={section} />
      </StickyNote>
    );
  }
  const even = index % 2 === 0;
  return (
    <Card
      variant={even ? "M" : "Malt"}
      tilt={even ? 0.5 : -0.5}
      style={ENTRY_STYLE}
    >
      <GuideEntryBody section={section} />
    </Card>
  );
}

function GuideHeader({ onClose }: { onClose: () => void }) {
  return (
    <div style={HEADER_STYLE}>
      <h2 id="show-on-tv-title" style={{ margin: 0 }}>
        <Marker size={64}>Show this on your TV</Marker>
      </h2>
      <HeaderChip icon="check" label="Done" onClick={onClose} />
    </div>
  );
}

function focusChipButton(span: HTMLSpanElement | null): void {
  span?.querySelector<HTMLButtonElement>("button")?.focus();
}

/** Header chip that opens the ways to put this screen on a TV. */
export function ShowOnTvChip(): JSX.Element {
  const chipRef = useRef<HTMLSpanElement>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    focusChipButton(chipRef.current);
  }, []);

  const openGuide = useCallback(() => setGuideOpen(true), []);

  return (
    <>
      <span ref={chipRef} style={{ display: "contents" }}>
        <HeaderChip icon="monitor" label="Show on TV" onClick={openGuide} />
      </span>
      {guideOpen ? (
        <ShowOnTvGuide
          device={detectHostDevice(
            navigator.userAgent,
            navigator.maxTouchPoints,
          )}
          host={window.location.host}
          onClose={closeGuide}
        />
      ) : null}
    </>
  );
}

export function ShowOnTvGuide({
  device,
  host,
  onClose,
}: ShowOnTvGuideProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sections = guideSections(device, host);

  useEffect(() => {
    dialogRef.current?.querySelector("button")?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      open
      aria-labelledby="show-on-tv-title"
      style={DIALOG_STYLE}
    >
      <Card variant="L" tilt={-0.5} style={PANEL_STYLE}>
        <GuideHeader onClose={onClose} />
        <div style={{ fontSize: 32 }}>
          Mirror this screen to your TV. Everyone still plays on their phone.
        </div>
        <div style={GRID_STYLE}>
          {sections.map((section, index) => (
            <GuideEntry key={section.id} section={section} index={index} />
          ))}
        </div>
      </Card>
    </dialog>
  );
}
