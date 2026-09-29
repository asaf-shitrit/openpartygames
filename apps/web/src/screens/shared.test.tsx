// `QrCode` loads the `qrcode` library on demand, so only the two screens that draw one pay for
// it. What matters about the wait: it must hold the QR's footprint, carry no words (the layout
// suite would measure words and call them a screen), and carry the loading mark the gallery
// waits on. The QR drawing itself is covered in `QrCodeSvg.test.tsx`.
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { LOADING_ATTRIBUTE } from "../loading";
import { QrCode } from "./shared";

afterEach(cleanup);

function renderQr() {
  return render(
    <LocaleProvider>
      <QrCode value="https://example.test/BKTZ" size={132} />
    </LocaleProvider>,
  );
}

describe("QrCode", () => {
  it("holds a wordless square of the QR's size, marked as loading, until the library arrives", () => {
    const { container } = renderQr();
    const placeholder = container.querySelector(`[${LOADING_ATTRIBUTE}]`);
    if (!(placeholder instanceof HTMLElement)) throw new Error("no loading placeholder");
    expect(placeholder.style.width).toBe("132px");
    expect(placeholder.style.height).toBe("132px");
    expect(placeholder.textContent).toBe("");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("swaps in the QR svg, and drops the loading mark, once loaded", async () => {
    const { container } = renderQr();
    await waitFor(() => expect(container.querySelector("svg.opg-qr")).not.toBeNull());
    expect(container.querySelector("svg.opg-qr")?.getAttribute("width")).toBe("132");
    expect(container.querySelector("svg title")?.textContent).toContain("/BKTZ");
    expect(container.querySelector(`[${LOADING_ATTRIBUTE}]`)).toBeNull();
  });
});
