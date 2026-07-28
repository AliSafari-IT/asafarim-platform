import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  closeTestDb,
  getTestDb,
  migrateTestDb,
  resetTestDb,
} from "../db/testUtils";
import { createApp } from "../repositories/apps";
import { addCollaborator } from "../repositories/collaborators";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors";
import {
  cancelCustomDomainRequest,
  createCustomDomainRequest,
  CustomDomainsDisabledError,
  getCustomDomainRequestForActor,
} from "./requests";

const db = getTestDb();
const owner = { principalId: "domain-owner", roles: [] };
const editor = { principalId: "domain-editor", roles: [] };
const unrelated = { principalId: "domain-unrelated", roles: [] };

beforeAll(async () => {
  await migrateTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

afterEach(() => {
  delete process.env.APPBUILDER_CUSTOM_DOMAINS_ENABLED;
});

afterAll(async () => {
  await closeTestDb();
});

describe("custom domain readiness requests", () => {
  it("refuses without acknowledgement while the platform flag is off (default)", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App", slug: "domain-app" },
      "domain-key"
    );
    await expect(
      createCustomDomainRequest(db, owner, app.id, {
        requestedHost: "shop.example.com",
        acknowledgeNotEnabled: false,
      })
    ).rejects.toBeInstanceOf(CustomDomainsDisabledError);
  });

  it("records the request as readiness data when the caller acknowledges it is not yet enabled", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 2", slug: "domain-app-2" },
      "domain-key-2"
    );
    const request = await createCustomDomainRequest(db, owner, app.id, {
      requestedHost: "Shop.Example.com",
      acknowledgeNotEnabled: true,
    });

    expect(request.requestedHost).toBe("shop.example.com"); // normalized
    expect(request.status).toBe("pending_verification");
    expect(request.tlsState).toBe("not_started");
    expect(request.verificationToken).toMatch(/^asafarim-verify-/);
  });

  it("never blocks the request once the platform flag is actually on", async () => {
    process.env.APPBUILDER_CUSTOM_DOMAINS_ENABLED = "true";
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 3", slug: "domain-app-3" },
      "domain-key-3"
    );
    const request = await createCustomDomainRequest(db, owner, app.id, {
      requestedHost: "shop2.example.com",
      acknowledgeNotEnabled: false,
    });
    expect(request.status).toBe("pending_verification");
  });

  it("rejects an invalid hostname", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 4", slug: "domain-app-4" },
      "domain-key-4"
    );
    await expect(
      createCustomDomainRequest(db, owner, app.id, {
        requestedHost: "not a host",
        acknowledgeNotEnabled: true,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("prevents collisions — the same host cannot be requested twice", async () => {
    const app1 = await createApp(
      db,
      owner,
      { name: "Domain App 5", slug: "domain-app-5" },
      "domain-key-5"
    );
    const app2 = await createApp(
      db,
      owner,
      { name: "Domain App 6", slug: "domain-app-6" },
      "domain-key-6"
    );
    await createCustomDomainRequest(db, owner, app1.id, {
      requestedHost: "shared.example.com",
      acknowledgeNotEnabled: true,
    });

    await expect(
      createCustomDomainRequest(db, owner, app2.id, {
        requestedHost: "shared.example.com",
        acknowledgeNotEnabled: true,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("only allows one pending request per app at a time", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 7", slug: "domain-app-7" },
      "domain-key-7"
    );
    await createCustomDomainRequest(db, owner, app.id, {
      requestedHost: "one.example.com",
      acknowledgeNotEnabled: true,
    });
    await expect(
      createCustomDomainRequest(db, owner, app.id, {
        requestedHost: "two.example.com",
        acknowledgeNotEnabled: true,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires owner — an editor cannot create or cancel a request", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 8", slug: "domain-app-8" },
      "domain-key-8"
    );
    await addCollaborator(db, owner, app.id, editor.principalId, "editor");

    await expect(
      createCustomDomainRequest(db, editor, app.id, {
        requestedHost: "x.example.com",
        acknowledgeNotEnabled: true,
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an unrelated actor cannot discover or manage the request (NotFoundError)", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 9", slug: "domain-app-9" },
      "domain-key-9"
    );
    const request = await createCustomDomainRequest(db, owner, app.id, {
      requestedHost: "hidden.example.com",
      acknowledgeNotEnabled: true,
    });

    await expect(
      getCustomDomainRequestForActor(db, unrelated, app.id)
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      cancelCustomDomainRequest(db, unrelated, app.id, request.id)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cancelling frees the host for a new request", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 10", slug: "domain-app-10" },
      "domain-key-10"
    );
    const request = await createCustomDomainRequest(db, owner, app.id, {
      requestedHost: "recyclable.example.com",
      acknowledgeNotEnabled: true,
    });
    await cancelCustomDomainRequest(db, owner, app.id, request.id);

    const second = await createCustomDomainRequest(db, owner, app.id, {
      requestedHost: "recyclable.example.com",
      acknowledgeNotEnabled: true,
    });
    expect(second.status).toBe("pending_verification");
  });

  it("cancelling is idempotent", async () => {
    const app = await createApp(
      db,
      owner,
      { name: "Domain App 11", slug: "domain-app-11" },
      "domain-key-11"
    );
    const request = await createCustomDomainRequest(db, owner, app.id, {
      requestedHost: "idempotent.example.com",
      acknowledgeNotEnabled: true,
    });
    await cancelCustomDomainRequest(db, owner, app.id, request.id);
    const again = await cancelCustomDomainRequest(
      db,
      owner,
      app.id,
      request.id
    );
    expect(again.status).toBe("cancelled");
  });
});
