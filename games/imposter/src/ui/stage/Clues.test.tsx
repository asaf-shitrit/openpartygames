// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ImposterHostView } from "../../state";
import { imposterPreviews } from "../preview";
import { StageClues } from "./Clues";

afterEach(cleanup);

function hostCluesView(): ImposterHostView {
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === "Host: clues",
  );
  if (preview === undefined) throw new Error("no Host: clues preview");
  const view = preview.view;
  if (!("votedIds" in view)) throw new Error("not a host view");
  return view;
}

describe("StageClues", () => {
  it("renders one avatar per player in the clue order", () => {
    const view = hostCluesView();
    render(<StageClues view={view} players={[]} />);
    expect(screen.getByText("CLUE ORDER")).toBeTruthy();
  });

  it("marks the current speaker and struck-through spoken players separately", () => {
    const view = hostCluesView();
    render(<StageClues view={view} players={[]} />);
    expect(screen.getAllByTestId("stage-clues-speaking")).toHaveLength(1);
    expect(screen.getAllByTestId("stage-clues-spoken")).toHaveLength(
      view.doneSpeakerIds.length,
    );
  });

  it("marks nobody as speaking once the round has no current speaker", () => {
    const view = { ...hostCluesView(), currentSpeakerId: null };
    render(<StageClues view={view} players={[]} />);
    expect(screen.queryAllByTestId("stage-clues-speaking")).toHaveLength(0);
  });
});
