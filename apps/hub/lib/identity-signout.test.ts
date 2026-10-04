import { describe, expect, it } from "vitest";
import { endIdentitySessions, identitySignOutEnabled } from "./identity-signout";

describe("Hub sign-out → identity end-session stub (#782)", () => {
  it("is off unless HUB_IDENTITY_SIGNOUT_ENABLED=true, and only a stub when on", async () => {
    expect(identitySignOutEnabled({})).toBe(false);
    expect(await endIdentitySessions("u1", {})).toBe("disabled");
    expect(await endIdentitySessions("u1", { HUB_IDENTITY_SIGNOUT_ENABLED: "1" })).toBe("disabled");
    expect(await endIdentitySessions("u1", { HUB_IDENTITY_SIGNOUT_ENABLED: "true" })).toBe("pending_p2_3");
  });
});
