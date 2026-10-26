import { describe, expect, it } from "vitest";
import { en } from "@opg/i18n";
import { avatarOf, linkLabel, nameOf, sourceOf, statusLabel } from "./common";
import { sketchPhoneHostPreviews } from "./preview";
import type { SketchLinkView } from "../state";

const players = [
  { id: "maya", name: "Maya", avatar: "star", connected: true, isVip: true, crowns: 0, waitingForNextGame: false },
] as const;

describe("nameOf and avatarOf", () => {
  it("finds the player the id names", () => {
    expect(nameOf(players, "maya", "Someone")).toBe("Maya");
    expect(avatarOf(players, "maya")).toBe("star");
  });

  it("falls back when the player has left the room", () => {
    expect(nameOf(players, "gone", "Someone")).toBe("Someone");
    expect(avatarOf(players, "gone")).toBeNull();
  });
});

describe("linkLabel", () => {
  it("says whose words or drawing it is", () => {
    expect(linkLabel(en, "words", "Maya")).toBe("Maya's words");
    expect(linkLabel(en, "drawing", "Maya")).toBe("Maya's drawing");
  });
});

describe("statusLabel", () => {
  it("names what a player still working is doing, and nothing once the round is over", () => {
    expect(statusLabel(en, "write")).toBe("Writing…");
    expect(statusLabel(en, "draw")).toBe("Drawing…");
    expect(statusLabel(en, "describe")).toBe("Describing…");
    expect(statusLabel(en, "replay")).toBeNull();
    expect(statusLabel(en, "vote")).toBeNull();
    expect(statusLabel(en, "favourite")).toBeNull();
  });
});

const link = (id: string, kind: SketchLinkView["kind"], text = id): SketchLinkView => ({
  id,
  kind,
  authorId: "maya",
  text: kind === "words" ? text : null,
  doodle: null,
});

describe("sourceOf", () => {
  const links = [link("c0s0", "words"), link("c0s1", "drawing"), link("c0s2", "words"), link("c0s3", "drawing")];

  it("walks back to the words a drawing came from", () => {
    expect(sourceOf(links, "c0s1")?.id).toBe("c0s0");
    expect(sourceOf(links, "c0s3")?.id).toBe("c0s2");
  });

  it("is null for the chain's seed, for no favourite, and for an id not in the chain", () => {
    expect(sourceOf(links, "c0s0")).toBeNull();
    expect(sourceOf(links, null)).toBeNull();
    expect(sourceOf(links, "c9s9")).toBeNull();
  });

  it("finds nothing when every earlier link was dropped", () => {
    expect(sourceOf([link("c0s0", "drawing")], "c0s0")).toBeNull();
  });
});

describe("the favourite host preview", () => {
  it("always has a source to credit, so the 'it came from' line is measured", () => {
    const favourite = sketchPhoneHostPreviews.find((preview) => preview.label === "Host: favourite");
    expect(favourite).toBeDefined();
    const links = favourite?.view.links ?? [];
    expect(sourceOf(links, favourite?.view.favouriteId ?? null)).not.toBeNull();
  });
});
