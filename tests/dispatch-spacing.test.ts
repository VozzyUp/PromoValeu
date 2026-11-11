import { describe, expect, it } from "vitest";
import { canSendNow, minGapMs } from "../lib/dispatch/spacing";

describe("minGapMs", () => {
  it("sem intervalo definido, divide a hora pelo limite", () => {
    expect(minGapMs(20, null)).toBe(180_000);
    expect(minGapMs(6, undefined)).toBe(600_000);
    expect(minGapMs(60, null)).toBe(60_000);
  });
  it("intervalo definido vale mais que a conta automática", () => {
    expect(minGapMs(20, 5)).toBe(300_000);
    expect(minGapMs(1, 1)).toBe(60_000);
  });
  it("limite inválido não divide por zero", () => {
    expect(minGapMs(0, null)).toBe(3600_000);
  });
});

describe("canSendNow", () => {
  const last = "2026-11-11T12:00:00.000Z";
  const after = (ms: number) => new Date(Date.parse(last) + ms);
  const gap = 180_000;

  it("sem envio anterior, pode", () => {
    expect(canSendNow(null, after(0), gap)).toBe(true);
    expect(canSendNow(undefined, after(0), gap)).toBe(true);
  });
  it("2 min depois com intervalo de 3 min, espera", () => {
    expect(canSendNow(last, after(120_000), gap)).toBe(false);
  });
  it("2 min 55 s depois passa, pela folga de 5 s", () => {
    expect(canSendNow(last, after(175_000), gap)).toBe(true);
    expect(canSendNow(last, after(174_000), gap)).toBe(false);
  });
  it("3 min ou mais depois, pode", () => {
    expect(canSendNow(last, after(180_000), gap)).toBe(true);
    expect(canSendNow(last, after(600_000), gap)).toBe(true);
  });
  it("data ilegível não trava o canal", () => {
    expect(canSendNow("xx", after(0), gap)).toBe(true);
  });
});
