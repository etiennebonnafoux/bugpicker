import { describe, expect, it } from "vitest";
import { toDeviceRect } from "../src/shared/crop-math";

describe("toDeviceRect", () => {
  it("keeps CSS pixels at DPR 1", () => {
    expect(toDeviceRect({ x: 10, y: 20, width: 100, height: 50 }, { width: 800, height: 600 }, { width: 800, height: 600 }, 1)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it("doubles at DPR 2", () => {
    expect(toDeviceRect({ x: 10, y: 20, width: 100, height: 50 }, { width: 800, height: 600 }, { width: 1600, height: 1200 }, 2)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 100,
    });
  });

  it("rounds edges at DPR 1.5", () => {
    // left 15, top 15, right round(166.5) = 167, bottom round(91.5) = 92
    expect(toDeviceRect({ x: 10, y: 10, width: 101, height: 51 }, { width: 800, height: 600 }, { width: 1200, height: 900 }, 1.5)).toEqual({
      x: 15,
      y: 15,
      width: 152,
      height: 77,
    });
  });

  it("uses the bitmap scale rather than the reported DPR (browser zoom)", () => {
    const rect = toDeviceRect({ x: 100, y: 100, width: 200, height: 100 }, { width: 1000, height: 600 }, { width: 2500, height: 1500 }, 2);
    expect(rect).toEqual({ x: 250, y: 250, width: 500, height: 250 });
  });

  it("clamps a rectangle that touches or crosses the edges", () => {
    expect(toDeviceRect({ x: -5, y: -5, width: 20, height: 20 }, { width: 100, height: 100 }, { width: 200, height: 200 }, 2)).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 30,
    });
    expect(toDeviceRect({ x: 90, y: 80, width: 50, height: 50 }, { width: 100, height: 100 }, { width: 200, height: 200 }, 2)).toEqual({
      x: 180,
      y: 160,
      width: 20,
      height: 40,
    });
  });

  it("returns an empty rectangle when fully outside", () => {
    const rect = toDeviceRect({ x: 200, y: 200, width: 10, height: 10 }, { width: 100, height: 100 }, { width: 100, height: 100 }, 1);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  it("falls back to the DPR when the viewport width is unknown", () => {
    expect(toDeviceRect({ x: 1, y: 1, width: 2, height: 2 }, { width: 0, height: 0 }, { width: 100, height: 100 }, 2)).toEqual({
      x: 2,
      y: 2,
      width: 4,
      height: 4,
    });
  });
});
