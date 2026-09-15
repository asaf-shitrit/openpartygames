import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Button,
  Card,
  Chip,
  Highlight,
  LinedCard,
  Marker,
  Stamp,
  StickyNote,
  Switch,
  Tape,
  TextInput,
} from "./primitives";

afterEach(cleanup);

function firstChild(container: HTMLElement): HTMLElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error("expected an element");
  return node;
}

describe("Card", () => {
  it("renders children with the default L radius", () => {
    const { container } = render(<Card>hello</Card>);
    const card = firstChild(container);
    expect(card.textContent).toBe("hello");
    expect(card.getAttribute("style")).toContain("var(--opg-radius-l)");
  });

  it("uses the requested variant radius and background", () => {
    const { container, rerender } = render(
      <Card variant="M" background="#fff">
        a
      </Card>,
    );
    const card = firstChild(container);
    expect(card.getAttribute("style")).toContain("var(--opg-radius-m)");
    expect(card.getAttribute("style")).toContain("#fff");
    rerender(<Card variant="Malt">a</Card>);
    expect(card.getAttribute("style")).toContain("var(--opg-radius-m-alt)");
  });

  it("omits transform without a tilt and applies rotation with one", () => {
    const { container, rerender } = render(<Card>a</Card>);
    const card = firstChild(container);
    expect(card.style.transform).toBe("");
    rerender(<Card tilt={3}>a</Card>);
    expect(card.style.transform).toBe("rotate(3deg)");
  });

  it("passes className and style through", () => {
    const { container } = render(
      <Card className="mine" style={{ opacity: 0.5 }}>
        a
      </Card>,
    );
    const card = firstChild(container);
    expect(card.className).toBe("mine");
    expect(card.style.opacity).toBe("0.5");
  });
});

describe("StickyNote", () => {
  it("uses the default tilt and highlight background", () => {
    const { container } = render(<StickyNote>note</StickyNote>);
    const el = firstChild(container);
    expect(el.style.transform).toBe("rotate(-1.5deg)");
    expect(el.getAttribute("style")).toContain("var(--opg-highlight)");
  });

  it("honors a custom tilt and className", () => {
    const { container } = render(
      <StickyNote tilt={4} className="s">
        note
      </StickyNote>,
    );
    const el = firstChild(container);
    expect(el.style.transform).toBe("rotate(4deg)");
    expect(el.className).toBe("s");
  });
});

describe("LinedCard", () => {
  it("adds the lined class and default tilt", () => {
    const { container } = render(<LinedCard>lines</LinedCard>);
    const el = firstChild(container);
    expect(el.className).toContain("opg-lined");
    expect(el.style.transform).toBe("rotate(1deg)");
    expect(el.style.paddingLeft).toBe("56px");
  });

  it("merges an extra className", () => {
    const { container } = render(
      <LinedCard className="extra">lines</LinedCard>,
    );
    expect(firstChild(container).className).toBe("opg-lined extra");
  });
});

describe("Tape", () => {
  it("hides the strip from assistive tech with default geometry", () => {
    const { container } = render(<Tape />);
    const el = firstChild(container);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.style.top).toBe("-22px");
    expect(el.style.width).toBe("180px");
    expect(el.style.height).toBe("44px");
    expect(el.style.transform).toBe("rotate(-3deg)");
  });

  it("accepts position, rotation and color overrides", () => {
    const { container } = render(
      <Tape left="10%" right="5%" top={0} rotate={9} color="#abcdef" />,
    );
    const el = firstChild(container);
    expect(el.style.left).toBe("10%");
    expect(el.style.right).toBe("5%");
    expect(el.style.top).toBe("0px");
    expect(el.style.transform).toBe("rotate(9deg)");
    expect(el.getAttribute("style")).toContain("#abcdef");
  });
});

describe("Highlight", () => {
  it("renders the swipe behind the children", () => {
    const { container } = render(<Highlight>word</Highlight>);
    expect(screen.getByText("word")).toBeTruthy();
    const swipe = container.querySelector('[aria-hidden="true"]');
    if (!(swipe instanceof HTMLElement)) throw new Error("missing swipe");
    expect(swipe.getAttribute("style")).toContain("var(--opg-highlight)");
  });

  it("honors a custom color and className", () => {
    const { container } = render(
      <Highlight color="#f0f" className="hl">
        word
      </Highlight>,
    );
    expect(firstChild(container).className).toBe("hl");
    expect(container.innerHTML).toContain("#f0f");
  });
});

describe("Marker", () => {
  it("renders sized marker text", () => {
    const { container } = render(<Marker>Title</Marker>);
    const el = firstChild(container);
    expect(el.className).toBe("opg-marker");
    expect(el.style.fontSize).toBe("56px");
    expect(el.textContent).toBe("Title");
  });

  it("supports size, color, className and style", () => {
    const { container } = render(
      <Marker size={30} color="#111" className="m" style={{ marginTop: 4 }}>
        T
      </Marker>,
    );
    const el = firstChild(container);
    expect(el.style.fontSize).toBe("30px");
    expect(el.getAttribute("style")).toContain("#111");
    expect(el.className).toBe("opg-marker m");
    expect(el.style.marginTop).toBe("4px");
  });
});

describe("Stamp", () => {
  it("draws a stamp with the marker color by default", () => {
    const { container } = render(<Stamp>REAL</Stamp>);
    const el = firstChild(container);
    expect(el.textContent).toBe("REAL");
    expect(el.className).toBe("opg-marker");
    expect(el.style.fontSize).toBe("38px");
    expect(el.style.transform).toBe("rotate(-6deg)");
    expect(el.getAttribute("style")).toContain("var(--opg-marker)");
  });

  it("accepts custom size, color and tilt", () => {
    const { container } = render(
      <Stamp size={20} color="#c00" tilt={2}>
        NAH
      </Stamp>,
    );
    const el = firstChild(container);
    expect(el.style.fontSize).toBe("20px");
    expect(el.style.transform).toBe("rotate(2deg)");
    expect(el.getAttribute("style")).toContain("#c00");
  });
});

describe("Button", () => {
  it("renders a native button with the default primary look", () => {
    render(<Button>Go</Button>);
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("style")).toContain("var(--opg-ink)");
  });

  it("renders the secondary variant on the card background", () => {
    render(<Button variant="secondary">Back</Button>);
    const btn = screen.getByRole("button", { name: "Back" });
    expect(btn.getAttribute("style")).toContain("var(--opg-card)");
  });

  it("fires onClick when enabled", async () => {
    const onClick = vi.fn<() => void>();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("blocks clicks and explains why when disabled", async () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button disabled disabledReason="Waiting for host" onClick={onClick}>
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn).toHaveProperty("disabled", true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByText("Waiting for host")).toBeTruthy();
  });

  it("hides the reason when disabled has no reason", () => {
    render(
      <Button disabled onClick={vi.fn<() => void>()}>
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn).toHaveProperty("disabled", true);
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("scales to full width and hero size", () => {
    render(
      <Button fullWidth size="hero">
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Go" });
    expect(btn.style.width).toBe("100%");
    expect(btn.style.fontSize).toBe("44px");
    expect(btn.style.height).toBe("96px");
  });

  it("forwards className, aria-label and style", () => {
    render(
      <Button className="b" aria-label="custom" style={{ marginTop: 2 }}>
        Go
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "custom" });
    expect(btn.className).toBe("b");
    expect(btn.style.marginTop).toBe("2px");
  });

  it("supports every size preset", () => {
    for (const size of ["md", "lg", "xl", "hero"] as const) {
      const { unmount } = render(<Button size={size}>S</Button>);
      expect(screen.getByRole("button", { name: "S" })).toBeTruthy();
      unmount();
    }
  });
});

describe("Chip", () => {
  it("renders with the default height and padding", () => {
    const { container } = render(<Chip>tag</Chip>);
    const el = firstChild(container);
    expect(el.style.height).toBe("48px");
    expect(el.style.padding).toBe("0px 22px");
    expect(el.style.fontSize).toBe("18px");
  });

  it("scales padding with height", () => {
    const { container } = render(
      <Chip height={100} fontSize={20}>
        tag
      </Chip>,
    );
    const el = firstChild(container);
    expect(el.style.height).toBe("100px");
    expect(el.style.padding).toBe("0px 45px");
  });
});

describe("Switch", () => {
  it("reports its off state as text and aria-checked", () => {
    render(<Switch checked={false} label="Sound" />);
    const sw = screen.getByRole("switch", { name: "Sound" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("reports its on state and custom labels", () => {
    render(<Switch checked label="Sound" onLabel="Yes" offLabel="No" />);
    const sw = screen.getByRole("switch", { name: "Sound" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Yes")).toBeTruthy();
  });

  it("asks for the flipped value on click", async () => {
    const onChange = vi.fn<(value: boolean) => void>();
    render(<Switch checked={false} label="Sound" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does nothing when there is no onChange handler", async () => {
    render(<Switch checked={false} label="Sound" />);
    await userEvent.click(screen.getByRole("switch", { name: "Sound" }));
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("blocks interaction when disabled", async () => {
    const onChange = vi.fn<(value: boolean) => void>();
    render(
      <Switch checked={false} disabled label="Sound" onChange={onChange} />,
    );
    const sw = screen.getByRole("switch", { name: "Sound" });
    expect(sw).toHaveProperty("disabled", true);
    await userEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("scales the track with size and enforces a 44px hit area", () => {
    render(<Switch checked label="Sound" size={30} />);
    const sw = screen.getByRole("switch", { name: "Sound" });
    expect(sw.style.minHeight).toBe("44px");
    const track = firstChild(sw);
    expect(track.style.width).toBe(`${Math.round(30 * 1.9)}px`);
    expect(track.style.height).toBe("30px");
  });
});

describe("TextInput", () => {
  it("associates its label and renders the value", () => {
    render(
      <TextInput
        value="Ada"
        onChange={vi.fn<(v: string) => void>()}
        label="Name"
      />,
    );
    const input = screen.getByLabelText("Name");
    expect(input).toHaveProperty("value", "Ada");
  });

  it("renders without a label", () => {
    render(
      <TextInput
        value=""
        onChange={vi.fn<(v: string) => void>()}
        placeholder="Room code"
      />,
    );
    expect(screen.getByPlaceholderText("Room code")).toBeTruthy();
  });

  it("emits the new value on typing", async () => {
    const onChange = vi.fn<(v: string) => void>();
    render(<TextInput value="" onChange={onChange} label="Name" />);
    await userEvent.type(screen.getByLabelText("Name"), "abc");
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("forwards input attributes", () => {
    render(
      <TextInput
        value="x"
        onChange={vi.fn<(v: string) => void>()}
        id="room"
        name="room"
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={5}
        placeholder="code"
      />,
    );
    const input = document.getElementById("room");
    if (!(input instanceof HTMLInputElement)) throw new Error("missing input");
    expect(input.name).toBe("room");
    expect(input.type).toBe("tel");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");
    expect(input.getAttribute("maxlength")).toBe("5");
    expect(input.placeholder).toBe("code");
  });

  it("disables the input", () => {
    render(
      <TextInput
        value=""
        onChange={vi.fn<(v: string) => void>()}
        disabled
        label="Name"
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveProperty("disabled", true);
  });

  it("shows a hint when there is no error", () => {
    render(
      <TextInput
        value=""
        onChange={vi.fn<(v: string) => void>()}
        hint="4 letters"
      />,
    );
    expect(screen.getByText("4 letters")).toBeTruthy();
  });

  it("prefers the error over the hint", () => {
    render(
      <TextInput
        value=""
        onChange={vi.fn<(v: string) => void>()}
        hint="4 letters"
        error="Too short"
      />,
    );
    expect(screen.getByText("Too short")).toBeTruthy();
    expect(screen.queryByText("4 letters")).toBeNull();
  });

  it("focuses the input when autoFocus is set", () => {
    // Spread so the lint rule targets real DOM autoFocus attributes only.
    const autoFocusProps = { autoFocus: true };
    render(
      <TextInput
        value=""
        onChange={vi.fn<(v: string) => void>()}
        label="Name"
        {...autoFocusProps}
      />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));
  });

  it("does not steal focus by default", () => {
    render(
      <div>
        <button type="button">first</button>
        <TextInput
          value=""
          onChange={vi.fn<(v: string) => void>()}
          label="Name"
        />
      </div>,
    );
    expect(screen.getByLabelText("Name")).not.toBe(document.activeElement);
  });
});
