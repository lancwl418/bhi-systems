import { describe, expect, it } from "vitest";
import { classifyCaseType } from "./case-types";

describe("classifyCaseType", () => {
  it.each([
    [
      "BHI-T17-12K115V-US delivered via FedEx damaged - dented/deformed cabinet, crushed foam",
      "shipping_damage",
    ],
    [
      "Warranty claim #315715420 (First American): refrigerant leak at the coil connection",
      "warranty_claim",
    ],
    [
      "She is asking for replacement part numbers to give the warranty company",
      "parts_request",
    ],
    ["Requests a full refund of $138.05 for the returned unit", "refund_return"],
    [
      "Compressor noise getting louder, pressure rises to about 400psi then the unit shuts off",
      "technical_support",
    ],
    ["Asking for tracking on the replacement shipment", "order_status"],
    [
      "Callback for warranty registration + app setup on the new unit",
      "registration",
    ],
    ["General question about product availability", "other"],
  ])("%s → %s", (summary, expected) => {
    expect(classifyCaseType(summary)).toBe(expected);
  });
});
