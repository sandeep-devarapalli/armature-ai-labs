import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TactileIllustration } from "../../src/components/TactileIllustration";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Tactile illustration", () => {
  it("keeps a labelled native image when canvas is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const { container } = render(<TactileIllustration />);
    const image = screen.getByRole("img", { name: /Concept illustration of a copper robotic arm/ });
    expect(image).toHaveAttribute("src", "/media/illustrations/tactile-machine.webp");
    Object.defineProperty(image, "naturalWidth", { value: 1440 });
    Object.defineProperty(container.querySelector("canvas"), "clientWidth", { value: 640 });
    fireEvent.load(image);
    expect(container.querySelector("canvas")).not.toHaveClass("is-ready");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("coalesces input into one frame, stays idle afterwards and supports keyboard button activation", () => {
    let callback: FrameRequestCallback = () => {};
    const request = vi.fn((next: FrameRequestCallback) => { callback = next; return 1; });
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      return { setTransform: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4).fill(120) })
      } as unknown as CanvasRenderingContext2D;
    });
    const { container, unmount } = render(<TactileIllustration />);
    const image = screen.getByRole("img");
    const canvas = container.querySelector("canvas")!;
    Object.defineProperty(image, "naturalWidth", { value: 1440 });
    Object.defineProperty(canvas, "clientWidth", { value: 640 });
    fireEvent.load(image);
    expect(canvas).toHaveClass("is-ready");
    expect(request).not.toHaveBeenCalled();
    const control = screen.getByRole("button", { name: "Illuminate gripper" });
    control.focus();
    fireEvent.click(control);
    expect(screen.getByRole("button", { name: "Reset illumination" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerLeave(canvas);
    expect(request).toHaveBeenCalledTimes(1);
    callback(16);
    expect(request).toHaveBeenCalledTimes(1);
    fireEvent.click(control);
    expect(control).toHaveAttribute("aria-pressed", "false");
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(cancel).toHaveBeenCalledWith(1);
  });
});
