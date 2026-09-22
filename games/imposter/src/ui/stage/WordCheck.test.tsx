// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import { StageWordCheck } from "./WordCheck";

afterEach(cleanup);

describe("StageWordCheck", () => {
  it("shows the deliberately empty stage copy", () => {
    render(<StageWordCheck />,
      { wrapper: LocaleProvider },
    );
    expect(
      screen.getByText(
        "Nothing up here right now — everyone's peeking at their own word.",
      ),
    ).toBeTruthy();
  });
});
