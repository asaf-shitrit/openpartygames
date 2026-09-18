// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import type { MltHostView } from "../../state";
import { mostLikelyToPreviews } from "../preview";
import { StageVote } from "./Vote";

afterEach(cleanup);

function hostVoteView(): MltHostView {
  const preview = mostLikelyToPreviews.find(
    (candidate) => candidate.label === "Host: vote",
  );
  if (preview === undefined) throw new Error("no Host: vote preview");
  const view = preview.view;
  if (!("votedIds" in view)) throw new Error("not a host view");
  return view;
}

describe("StageVote", () => {
  it("shows the prompt and the voted count", () => {
    const view = hostVoteView();
    render(<StageVote view={view} players={[]} />);
    expect(
      screen.getByText(`Voted so far (${view.votedIds.length} of ${view.playerIds.length})`),
    ).toBeTruthy();
  });

  it("renders one placeholder per player who has not voted yet", () => {
    const view = hostVoteView();
    render(<StageVote view={view} players={[]} />);
    const placeholders = screen.getAllByTestId("stage-vote-pending");
    expect(placeholders.length).toBe(
      view.playerIds.length - view.votedIds.length,
    );
  });

  it("shows nobody voted yet when votedIds is empty", () => {
    const view = { ...hostVoteView(), votedIds: [] };
    render(<StageVote view={view} players={[]} />);
    expect(
      screen.getByText(`Voted so far (0 of ${view.playerIds.length})`),
    ).toBeTruthy();
  });
});
