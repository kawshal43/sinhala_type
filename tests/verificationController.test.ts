import { describe, expect, it } from "vitest";
import { VerificationController } from "../src/services/verificationEngine";

describe("VerificationController", () => {
  it("aborts active provider work when stopped", () => {
    const controller = new VerificationController();
    expect(controller.signal.aborted).toBe(false);

    controller.stop();

    expect(controller.isCancelled).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });
});
