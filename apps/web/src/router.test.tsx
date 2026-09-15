import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Link, navigate, usePathname } from "./router";

function Pathname() {
  return <div data-testid="path">{usePathname()}</div>;
}

describe("router", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.history.pushState(null, "", "/");
  });

  it("navigate updates the pathname and notifies subscribers", async () => {
    render(<Pathname />);
    expect(screen.getByTestId("path").textContent).toBe("/");
    act(() => navigate("/join"));
    expect(screen.getByTestId("path").textContent).toBe("/join");
    expect(window.location.pathname).toBe("/join");
  });

  it("navigate ignores a navigation to the current path", () => {
    window.history.pushState(null, "", "/join");
    render(<Pathname />);
    navigate("/join");
    expect(screen.getByTestId("path").textContent).toBe("/join");
  });

  it("Link navigates on click without a full page load", async () => {
    const user = userEvent.setup();
    render(
      <Link to="/credits">
        <span>Credits</span>
      </Link>,
    );
    await user.click(screen.getByText("Credits"));
    expect(window.location.pathname).toBe("/credits");
  });

  it("tracks browser back/forward via popstate", () => {
    render(<Pathname />);
    act(() => {
      window.history.pushState(null, "", "/privacy");
      window.dispatchEvent(new Event("popstate"));
    });
    expect(screen.getByTestId("path").textContent).toBe("/privacy");
  });
});