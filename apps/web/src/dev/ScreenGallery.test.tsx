import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { ScreenGallery } from "./ScreenGallery";
import { SCREENS } from "./screens";

function renderGallery(search: string) {
  return render(
    <LocaleProvider>
      <ScreenGallery search={search} />
    </LocaleProvider>,
  );
}

const firstPhone = SCREENS.find((each) => each.surface === "phone");
const firstHost = SCREENS.find((each) => each.surface === "host");

describe("ScreenGallery", () => {
  it("lists every screen when no id is given", () => {
    renderGallery("");
    const index = screen.getByTestId("screen-index");
    expect(index.querySelectorAll("li")).toHaveLength(SCREENS.length);
  });

  it("renders a phone screen's own game UI", () => {
    expect(firstPhone).toBeDefined();
    renderGallery(`?id=${firstPhone?.id ?? ""}`);
    expect(screen.queryByTestId("screen-missing")).toBeNull();
    expect(document.body.textContent).not.toBe("");
  });

  it("renders a host screen inside the TV stage", () => {
    expect(firstHost).toBeDefined();
    renderGallery(`?id=${firstHost?.id ?? ""}`);
    expect(screen.queryByTestId("screen-missing")).toBeNull();
    expect(document.querySelector(".opg-grid-tv")).not.toBeNull();
  });

  it("says so when the id matches nothing", () => {
    renderGallery("?id=imposter/9999");
    expect(screen.getByTestId("screen-missing").textContent).toContain("imposter/9999");
  });

  it("marks the body with the screen it is showing, which is what the suite waits for", () => {
    expect(firstPhone).toBeDefined();
    renderGallery(`?id=${firstPhone?.id ?? ""}`);
    expect(document.body.dataset.screen).toBe(firstPhone?.id);
  });
});
