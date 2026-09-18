import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderChip, PhoneStrip, PlayerChip, TvHeader } from "./chrome";
import { SoundProvider } from "./audio/SoundProvider";
import { FakeSoundEngine } from "./fixtures/audio";

type PropertyOwner = Document | HTMLElement;

const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenEnabled",
);
const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenElement",
);
const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
  document.documentElement,
  "requestFullscreen",
);

function defineValue(
  target: PropertyOwner,
  key: string,
  value: PropertyDescriptor["value"],
): void {
  Object.defineProperty(target, key, { configurable: true, value });
}

function restoreValue(
  target: PropertyOwner,
  key: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, key);
    return;
  }
  Object.defineProperty(target, key, descriptor);
}

function stubFullscreen(enabled: boolean, request?: () => Promise<void>): void {
  defineValue(document, "fullscreenEnabled", enabled);
  if (request)
    defineValue(document.documentElement, "requestFullscreen", request);
}

function precedes(first: Element, second: Element): boolean {
  return (
    (first.compareDocumentPosition(second) &
      Node.DOCUMENT_POSITION_FOLLOWING) !==
    0
  );
}

function noop(): void {}

beforeEach(() => {
  localStorage.clear();
  defineValue(document, "fullscreenElement", null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreValue(document, "fullscreenEnabled", fullscreenEnabledDescriptor);
  restoreValue(document, "fullscreenElement", fullscreenElementDescriptor);
  restoreValue(
    document.documentElement,
    "requestFullscreen",
    requestFullscreenDescriptor,
  );
});

describe("TvHeader", () => {
  it("renders the brand variant with the sound chip", () => {
    render(<TvHeader variant="brand" />);
    expect(screen.getByText("OpenPartyGames")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sound on" })).toBeTruthy();
    expect(screen.queryByText("Room")).toBeNull();
  });

  it("shows the room chip when a code is present", () => {
    render(<TvHeader variant="brand" roomCode="ABCD" />);
    expect(screen.getByText("Room")).toBeTruthy();
    expect(screen.getByText("ABCD")).toBeTruthy();
  });

  it("renders the game variant with name and progress", () => {
    render(
      <TvHeader
        variant="game"
        gameName="Quip Clash"
        progress="Word 1 of 3"
        roomCode="WXYZ"
      />,
    );
    expect(screen.getByText("Quip Clash")).toBeTruthy();
    expect(screen.getByText("Word 1 of 3")).toBeTruthy();
    expect(screen.getByText("WXYZ")).toBeTruthy();
  });

  it("omits progress and room code when they are absent", () => {
    render(<TvHeader variant="game" gameName="Quip Clash" />);
    expect(screen.getByText("Quip Clash")).toBeTruthy();
    expect(screen.queryByText("Room")).toBeNull();
  });

  it("renders an empty game title when no name is given", () => {
    const { container } = render(<TvHeader variant="game" />);
    expect(container.querySelector(".opg-marker")?.textContent).toBe("");
  });

  it("toggles the sound setting from the chip", async () => {
    render(<TvHeader variant="brand" />);
    await userEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(screen.getByText("Sound off")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Sound off" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("starts muted when the stored setting says so", () => {
    localStorage.setItem("opg:muted", "1");
    render(<TvHeader variant="brand" />);
    expect(screen.getByText("Sound off")).toBeTruthy();
  });

  it("renders actions before the chips in the brand variant", () => {
    render(
      <TvHeader variant="brand" roomCode="ABCD" actions={<span>Help</span>} />,
    );
    expect(precedes(screen.getByText("Help"), screen.getByText("Room"))).toBe(
      true,
    );
  });

  it("renders actions before the chips in the game variant", () => {
    render(
      <TvHeader
        variant="game"
        gameName="Quip Clash"
        roomCode="ABCD"
        actions={<span>Help</span>}
      />,
    );
    expect(precedes(screen.getByText("Help"), screen.getByText("Room"))).toBe(
      true,
    );
  });
});

describe("full screen chip", () => {
  it("is hidden when fullscreen is unsupported", () => {
    stubFullscreen(false);
    render(<TvHeader variant="brand" />);
    expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
  });

  it("is shown when fullscreen is supported", () => {
    stubFullscreen(true);
    render(<TvHeader variant="brand" />);
    expect(screen.getByRole("button", { name: "Full screen" })).toBeTruthy();
  });

  it("requests fullscreen when clicked", async () => {
    const request = vi.fn<() => Promise<void>>(() => Promise.resolve());
    stubFullscreen(true, request);
    render(<TvHeader variant="brand" />);
    await userEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("hides once the page is full screen", () => {
    stubFullscreen(true);
    render(<TvHeader variant="brand" />);
    act(() => {
      defineValue(document, "fullscreenElement", document.createElement("div"));
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
  });
});

describe("HeaderChip", () => {
  it("carries the shared pressable class", () => {
    render(<HeaderChip icon="check" label="Do it" onClick={noop} />);
    expect(screen.getByRole("button", { name: "Do it" }).className).toBe(
      "opg-reset opg-pressable",
    );
  });

  it("renders the label and calls onClick", async () => {
    const onClick = vi.fn<() => void>();
    render(<HeaderChip icon="check" label="Do it" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Do it" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("only sets aria-pressed when pressed is given", () => {
    const { rerender } = render(
      <HeaderChip icon="check" label="Plain" onClick={noop} />,
    );
    expect(
      screen
        .getByRole("button", { name: "Plain" })
        .getAttribute("aria-pressed"),
    ).toBeNull();
    rerender(<HeaderChip icon="check" label="Plain" onClick={noop} pressed />);
    expect(
      screen
        .getByRole("button", { name: "Plain" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});

describe("PhoneStrip", () => {
  it("renders the game name, progress and right slot", () => {
    render(
      <PhoneStrip
        gameName="Quip Clash"
        progress="Round 2"
        right={<span>timer</span>}
      />,
    );
    expect(screen.getByText("Quip Clash")).toBeTruthy();
    expect(screen.getByText("Round 2")).toBeTruthy();
    expect(screen.getByText("timer")).toBeTruthy();
  });

  it("renders without progress or right slot", () => {
    render(<PhoneStrip gameName="Solo" />);
    expect(screen.getByText("Solo")).toBeTruthy();
  });

  it("shows the room code when given, for the rejoin path in a no-TV room", () => {
    render(<PhoneStrip gameName="Quip Clash" roomCode="BKTZ" />);
    expect(screen.getByText("Room BKTZ")).toBeTruthy();
  });

  it("omits the room code line on a shared screen", () => {
    render(<PhoneStrip gameName="Quip Clash" />);
    expect(screen.queryByText(/^Room /)).toBeNull();
  });
});

describe("PlayerChip", () => {
  it("labels the avatar and shows the player name", () => {
    render(<PlayerChip name="Nia" avatar="cat" />);
    expect(screen.getByText("Nia")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Nia's avatar" })).toBeTruthy();
  });

  it("renders a decorative avatar when there is no avatar id", () => {
    render(<PlayerChip name="Nia" avatar={null} />);
    expect(screen.getByText("Nia")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("sound chip", () => {
  it("says Sound on while running and mutes on click", () => {
    const engine = new FakeSoundEngine("running");
    render(
      <SoundProvider engine={engine}>
        <TvHeader variant="brand" />
      </SoundProvider>,
    );
    const on = screen.getByRole("button", { name: "Sound on" });
    expect(on.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(on);
    expect(screen.getByText("Sound off")).toBeTruthy();
    expect(engine.muteHistory).toContain(true);
  });

  it("says Sound off while muted, and one click unmutes and unlocks", () => {
    localStorage.setItem("opg:muted", "1");
    const engine = new FakeSoundEngine("locked");
    render(
      <SoundProvider engine={engine}>
        <TvHeader variant="brand" />
      </SoundProvider>,
    );
    const off = screen.getByRole("button", { name: "Sound off" });
    expect(off.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(off);
    // The click is the gesture that resumes audio, so no second tap is needed.
    expect(engine.unlockCount).toBe(1);
    expect(engine.muteHistory).toContain(false);
  });

  it("says Tap for sound while locked and unlocks on click", () => {
    const engine = new FakeSoundEngine("locked");
    render(
      <SoundProvider engine={engine}>
        <TvHeader variant="brand" />
      </SoundProvider>,
    );
    const locked = screen.getByRole("button", { name: "Tap for sound" });
    expect(locked.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(locked);
    // The chip unlocks, and so does the provider's page-wide click listener; resuming twice is harmless.
    expect(engine.unlockCount).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Sound on" })).toBeTruthy();
  });
});
