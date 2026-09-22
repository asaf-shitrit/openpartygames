import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en, he, LocaleProvider } from "@opg/i18n";
import {
  detectHostDevice,
  guideSections,
  ShowOnTvChip,
  ShowOnTvGuide,
  type HostDevice,
} from "./ShowOnTv";
import type { ShowOnTvGuideProps } from "./ShowOnTv";

function renderGuide(props: ShowOnTvGuideProps) {
  return render(
    <LocaleProvider>
      <ShowOnTvGuide {...props} />
    </LocaleProvider>,
  );
}

function renderChip() {
  return render(
    <LocaleProvider>
      <ShowOnTvChip />
    </LocaleProvider>,
  );
}

const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const LINUX_FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0";

afterEach(cleanup);

describe("detectHostDevice", () => {
  const cases: Array<[string, string, number, HostDevice]> = [
    ["Mac Safari", MAC_SAFARI, 0, "mac"],
    ["Mac Chrome", MAC_CHROME, 0, "mac"],
    ["iPad in desktop mode", MAC_SAFARI, 5, "ios"],
    ["iPhone Safari", IPHONE_SAFARI, 5, "ios"],
    ["iPhone Chrome", IPHONE_CHROME, 5, "ios"],
    ["Windows Chrome", WINDOWS_CHROME, 0, "chrome"],
    ["Windows Edge", WINDOWS_EDGE, 0, "chrome"],
    ["Android Chrome", ANDROID_CHROME, 5, "chrome"],
    ["Linux Firefox", LINUX_FIREFOX, 0, "other"],
  ];

  it.each(cases)("%s -> %s", (_label, ua, points, expected) => {
    expect(detectHostDevice(ua, points)).toBe(expected);
  });
});

describe("guideSections", () => {
  it("uses the default order and flags nothing for other devices", () => {
    const sections = guideSections("other", "openpartygames.org", en.landing);
    expect(sections.map((section) => section.id)).toEqual([
      "mac",
      "ios",
      "chrome",
      "tv-browser",
      "hdmi",
    ]);
    expect(sections.every((section) => !section.onThisDevice)).toBe(true);
  });

  it.each(["mac", "ios", "chrome"] as const)(
    "puts the %s section first and flags it",
    (device) => {
      const sections = guideSections(device, "openpartygames.org", en.landing);
      expect(sections.find((section) => section.onThisDevice)).toMatchObject({
        id: device,
      });
      expect(sections.slice(1).every((section) => !section.onThisDevice)).toBe(
        true,
      );
    },
  );

  it("shows the host address in the TV-browser steps", () => {
    const sections = guideSections("other", "openpartygames.org", en.landing);
    const tvBrowser = sections.find((section) => section.id === "tv-browser");
    expect(tvBrowser?.steps).toContain("Go to openpartygames.org.");
  });

  it("translates the section titles and steps into Hebrew", () => {
    const sections = guideSections("mac", "openpartygames.org", he.landing);
    expect(sections[0]).toMatchObject({
      id: "mac",
      title: "מ-Mac ל-Apple TV או טלוויזיית AirPlay",
    });
    const tvBrowser = sections.find((section) => section.id === "tv-browser");
    expect(tvBrowser?.steps).toContain("גשו אל openpartygames.org.");
  });
});

describe("ShowOnTvGuide", () => {
  it("names the dialog for screen readers", () => {
    renderGuide({ device: "mac", host: "openpartygames.org", onClose: () => {} });
    expect(
      screen.getByRole("dialog", { name: "Show this on your TV" }),
    ).toBeTruthy();
  });

  it("puts the current device's section first with a badge", () => {
    renderGuide({ device: "ios", host: "openpartygames.org", onClose: () => {} });
    expect(screen.getByText("On this device")).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.at(0)?.textContent).toBe(
      "iPad or iPhone to Apple TV or AirPlay TV",
    );
  });

  it("focuses Done on mount", () => {
    renderGuide({ device: "mac", host: "openpartygames.org", onClose: () => {} });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Done" }),
    );
  });

  it("renders in Hebrew when the locale is Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    try {
      renderGuide({ device: "mac", host: "openpartygames.org", onClose: () => {} });
      expect(
        screen.getByRole("dialog", { name: "הציגו את זה בטלוויזיה שלכם" }),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "סיום" })).toBeTruthy();
    } finally {
      window.localStorage.removeItem("opg:locale");
    }
  });

  it("calls onClose when Done is clicked", async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    renderGuide({ device: "mac", host: "openpartygames.org", onClose });
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn<() => void>();
    renderGuide({ device: "mac", host: "openpartygames.org", onClose });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("removes the Escape listener on unmount", () => {
    const onClose = vi.fn<() => void>();
    const { unmount } = renderGuide({
      device: "mac",
      host: "openpartygames.org",
      onClose,
    });
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ShowOnTvChip", () => {
  it("renders a Show on TV button", () => {
    renderChip();
    expect(screen.getByRole("button", { name: "Show on TV" })).toBeTruthy();
  });

  it("opens the guide when clicked", async () => {
    const user = userEvent.setup();
    renderChip();
    await user.click(screen.getByRole("button", { name: "Show on TV" }));
    expect(
      screen.getByRole("dialog", { name: "Show this on your TV" }),
    ).toBeTruthy();
  });

  it("closes on Done and returns focus to the chip", async () => {
    const user = userEvent.setup();
    renderChip();
    const chip = screen.getByRole("button", { name: "Show on TV" });
    await user.click(chip);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderChip();
    await user.click(screen.getByRole("button", { name: "Show on TV" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
