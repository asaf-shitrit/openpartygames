// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import type { ImposterHostView } from "../../state";
import { imposterPreviews } from "../preview";
import { StageVote } from "./Vote";

afterEach(cleanup);

function hostVoteView(): ImposterHostView {
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === "Host: vote",
  );
  if (preview === undefined) throw new Error("no Host: vote preview");
  const view = preview.view;
  if (!("votedIds" in view)) throw new Error("not a host view");
  return view;
}

describe("StageVote", () => {
  it("shows how many have voted", () => {
    const view = hostVoteView();
    render(<StageVote view={view} players={[]} />,
      { wrapper: LocaleProvider },
    );
    expect(
      screen.getByText(`${view.votedIds.length} of ${view.playerIds.length}`),
    ).toBeTruthy();
  });

  it("marks one avatar per voter, never their target", () => {
    const view = hostVoteView();
    render(<StageVote view={view} players={[]} />,
      { wrapper: LocaleProvider },
    );
    expect(screen.getAllByTestId("stage-vote-voted")).toHaveLength(
      view.votedIds.length,
    );
  });

  it("marks nobody voted when votedIds is empty", () => {
    const view = { ...hostVoteView(), votedIds: [] };
    render(<StageVote view={view} players={[]} />,
      { wrapper: LocaleProvider },
    );
    expect(screen.queryAllByTestId("stage-vote-voted")).toHaveLength(0);
    expect(screen.getByText(`0 of ${view.playerIds.length}`)).toBeTruthy();
  });
});
