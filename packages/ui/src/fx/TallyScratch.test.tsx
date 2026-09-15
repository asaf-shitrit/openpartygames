import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TallyScratch } from "./TallyScratch";

afterEach(cleanup);

describe("TallyScratch", () => {
  it("renders only the drawn marks but sizes the svg for the full count", () => {
    const { container } = render(<TallyScratch count={5} drawn={2} />);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("100");
  });

  it("renders marks present at mount without the draw class", () => {
    const { container } = render(<TallyScratch count={5} drawn={2} />);
    const paths = container.querySelectorAll("path");
    expect(paths[0]?.getAttribute("class")).toBeNull();
    expect(paths[0]?.getAttribute("pathLength")).toBeNull();
    expect(paths[1]?.getAttribute("class")).toBeNull();
  });

  it("draws marks that appear after mount", () => {
    const { container, rerender } = render(
      <TallyScratch count={5} drawn={1} />,
    );
    rerender(<TallyScratch count={5} drawn={3} />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(3);
    expect(paths[0]?.getAttribute("class")).toBeNull();
    expect(paths[1]?.getAttribute("class")).toBe("opg-draw");
    expect(paths[2]?.getAttribute("class")).toBe("opg-draw");
    expect(paths[1]?.getAttribute("pathLength")).toBe("1");
  });

  it("labels the tally with the drawn count by default", () => {
    render(<TallyScratch count={5} drawn={2} />);
    expect(screen.getByLabelText("2 votes")).toBeTruthy();
  });

  it("uses a caller label when given", () => {
    render(<TallyScratch count={5} drawn={2} label="Two votes so far" />);
    expect(screen.getByLabelText("Two votes so far")).toBeTruthy();
  });

  it("clamps drawn to the count", () => {
    const { container } = render(<TallyScratch count={3} drawn={9} />);
    expect(container.querySelectorAll("path")).toHaveLength(3);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe(
      "3 votes",
    );
  });

  it("renders nothing drawn for a negative count of marks", () => {
    const { container } = render(<TallyScratch count={3} drawn={-2} />);
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });

  it("uses the requested stroke color", () => {
    const { container } = render(
      <TallyScratch count={2} drawn={1} color="#D7372B" />,
    );
    expect(container.querySelector("svg")?.getAttribute("stroke")).toBe(
      "#D7372B",
    );
  });
});
