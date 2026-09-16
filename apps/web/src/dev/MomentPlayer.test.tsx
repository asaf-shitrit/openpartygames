import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { imposterPreviews } from "@opg/game-imposter/preview";
import {
  MomentPlayer,
  devMoments,
  elapsedAt,
  phoneFixturesFor,
  secondsLabel,
  toPreviewFixtures,
} from "./MomentPlayer";
import type { DevMoment, HostPreview } from "./MomentPlayer";

afterEach(cleanup);

const FIXTURES = toPreviewFixtures(imposterPreviews);
const HOST_PREVIEWS = FIXTURES.filter(
  (fixture): fixture is HostPreview => fixture.surface === "host",
);

function hostFixture(index: number): HostPreview {
  const fixture = HOST_PREVIEWS[index];
  if (!fixture) throw new Error(`no host preview at index ${index}`);
  return fixture;
}

function momentOf(
  fixture: HostPreview,
  chip: string,
  kind: DevMoment["kind"],
  durationMs: number,
): DevMoment {
  return { id: fixture.label, chip, fixture, kind, durationMs };
}

const TWO_MOMENTS = [
  momentOf(hostFixture(0), "a", "reveal", 12_000),
  momentOf(hostFixture(1), "b", "reveal", 12_000),
];

function renderMoments(moments: readonly DevMoment[]) {
  render(<MomentPlayer moments={moments} />);
}

/** Scrubs the shared reveal slider, in ms. */
function scrubTo(ms: number): void {
  fireEvent.change(screen.getByLabelText("Scrub the reveal"), {
    target: { value: String(ms) },
  });
}

/** The TV surface's text with whitespace collapsed. */
function tvText(): string {
  return (document.querySelector(".opg-grid-tv")?.textContent ?? "").replace(
    /\s+/gu,
    " ",
  );
}

const DEV_MOMENTS = devMoments(FIXTURES);

/** The moment the dev table gives this chip, e.g. the caught and wrong reveals. */
function momentForChip(chip: string): DevMoment {
  const found = DEV_MOMENTS.find((moment) => moment.chip === chip);
  if (found === undefined) throw new Error(`no moment with chip ${chip}`);
  return found;
}

const CAUGHT_REVEAL = momentForChip("caught");
const WRONG_REVEAL = momentForChip("wrong");

describe("elapsedAt", () => {
  it("holds the base value while paused", () => {
    expect(elapsedAt(null, 3000, 9999, 12_000)).toBe(3000);
  });

  it("advances from the play start and clamps to the duration", () => {
    expect(elapsedAt(1000, 0, 1500, 12_000)).toBe(500);
    expect(elapsedAt(1000, 500, 1500, 12_000)).toBe(1000);
    expect(elapsedAt(1000, 11_800, 1500, 12_000)).toBe(12_000);
    expect(elapsedAt(1000, 0, 400, 12_000)).toBe(0);
  });
});

describe("devMoments", () => {
  it("picks the reveal, last-chance and result host fixtures with short chips", () => {
    const moments = devMoments(FIXTURES);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments.some((moment) => moment.kind === "reveal")).toBe(true);
    expect(moments.some((moment) => moment.kind === "last-chance")).toBe(
      true,
    );
    expect(moments.some((moment) => moment.kind === "result")).toBe(true);
    expect(moments.some((moment) => moment.chip === "caught")).toBe(true);
    expect(moments.some((moment) => moment.chip === "typing")).toBe(true);
    expect(moments.some((moment) => moment.chip === "got it")).toBe(true);
  });

  it("gives every moment its own phase duration", () => {
    const moments = devMoments(FIXTURES);
    const reveal = moments.find((moment) => moment.kind === "reveal");
    const lastChance = moments.find(
      (moment) => moment.kind === "last-chance",
    );
    const result = moments.find((moment) => moment.kind === "result");
    expect(reveal?.durationMs).toBe(12_000);
    expect(lastChance?.durationMs).toBe(15_000);
    expect(result?.durationMs).toBeGreaterThan(0);
  });
});

describe("phoneFixturesFor", () => {
  it("picks reveal phones for a reveal moment", () => {
    const phones = phoneFixturesFor("reveal", FIXTURES);
    expect(phones.length).toBeGreaterThan(0);
    expect(
      phones.every((phone) => phone.label.toLowerCase().includes("reveal")),
    ).toBe(true);
  });

  it("picks result phones for a result moment", () => {
    const phones = phoneFixturesFor("result", FIXTURES);
    expect(phones.length).toBeGreaterThan(0);
    expect(
      phones.every((phone) => phone.label.toLowerCase().includes("result")),
    ).toBe(true);
  });
});

describe("secondsLabel", () => {
  it("shows one decimal", () => {
    expect(secondsLabel(0)).toBe("0.0s");
    expect(secondsLabel(5500)).toBe("5.5s");
  });
});

describe("MomentPlayer", () => {
  it("renders a chip per moment and marks the selected one", () => {
    renderMoments(TWO_MOMENTS);
    expect(screen.getByRole("button", { name: "✓ a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "b" })).toBeTruthy();
  });

  it("has no stray chip showing the raw fixture label", () => {
    renderMoments(TWO_MOMENTS);
    expect(screen.queryByText(TWO_MOMENTS[0]?.fixture.label ?? "")).toBeNull();
  });

  it("switches the TV content when another moment is picked", async () => {
    const user = userEvent.setup();
    renderMoments([CAUGHT_REVEAL, WRONG_REVEAL]);

    // Between the verdict (8s) and the unmask (9s): the caught reveal has stamped.
    scrubTo(8500);
    expect(tvText()).toContain("Imposter!");
    expect(tvText()).not.toContain("Not the imposter");

    await user.click(screen.getByRole("button", { name: WRONG_REVEAL.chip }));
    expect(
      screen.getByRole("button", { name: `✓ ${WRONG_REVEAL.chip}` }),
    ).toBeTruthy();
    scrubTo(0);
    scrubTo(8500);

    // The wrong-vote reveal replaced it, verdict and all.
    expect(tvText()).toContain("Not the imposter");
    expect(tvText()).not.toContain("Imposter!");
  });

  it("restarts the clock after a scrub", () => {
    renderMoments(TWO_MOMENTS);
    const slider = screen.getByLabelText("Scrub the reveal");
    fireEvent.change(slider, { target: { value: "5000" } });
    expect(screen.getByText("5.0s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByText("0.0s")).toBeTruthy();
  });

  it("starts over from 0 when Play is pressed at the end", () => {
    renderMoments(TWO_MOMENTS);
    const slider = screen.getByLabelText("Scrub the reveal");
    fireEvent.change(slider, { target: { value: slider.getAttribute("max") } });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("0.0s")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("shows an empty state when there are no moments", () => {
    renderMoments([]);
    expect(screen.getByText("No moments found.")).toBeTruthy();
  });
});
