import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { user: { id: "u1", name: "Eve", email: "eve@x.test" } } as null | {
    user: { id: string; name: string; email: string };
  },
  active: true,
  verdict: { outcome: "clean", scanner: "test" } as {
    outcome: string;
    scanner: string;
    signature?: string;
    detail?: string;
  },
  stored: 0,
  created: 0,
  mails: [] as { html: string; attachments?: unknown }[],
}));

vi.mock("@asafarim/auth", () => ({ auth: async () => state.session }));
vi.mock("@asafarim/auth/mailer", () => ({
  createTransport: async () => ({
    from: "f@x.test",
    bcc: undefined,
    transporter: {
      sendMail: async (m: { html: string; attachments?: unknown }) =>
        void state.mails.push(m),
    },
  }),
}));
vi.mock("@asafarim/db", () => ({
  prisma: {
    user: { findUnique: async () => ({ isActive: state.active }) },
    contactMessage: {
      create: async ({
        data,
      }: {
        data: { attachments: { create: unknown[] } };
      }) => {
        state.created++;
        return {
          id: "m1",
          subject: null,
          bodyHtml: "",
          bodyText: "",
          status: "sent",
          createdAt: new Date(),
          attachments: data.attachments.create,
        };
      },
      update: async () => ({}),
    },
  },
}));
vi.mock("@asafarim/storage", () => ({
  buildKey: () => "k",
  putObjectBytes: async () => void state.stored++,
}));
vi.mock("../../../lib/contact/scanner", () => ({
  createScanner: () => ({ name: "t", scan: async () => state.verdict }),
}));

const { POST } = await import("./route");

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const send = (
  files: { name: string; bytes: Buffer }[] = [],
  body = "<p>hello</p>"
) => {
  const form = new FormData();
  form.set("bodyHtml", body);
  for (const f of files)
    form.append("files", new File([new Uint8Array(f.bytes)], f.name));
  return POST(
    new Request("http://x/api/contact", { method: "POST", body: form })
  );
};

let n = 0;
beforeEach(() => {
  state.session = { user: { id: `u${++n}`, name: "Eve", email: "eve@x.test" } };
  state.active = true;
  state.verdict = { outcome: "clean", scanner: "test" };
  state.stored = state.created = 0;
  state.mails = [];
});

describe("POST /api/contact", () => {
  it("rejects an inactive account even with a valid session", async () => {
    state.active = false;
    expect((await send([{ name: "a.pdf", bytes: PDF }])).status).toBe(403);
    expect(state.stored + state.created).toBe(0);
  });
  it("accepts a clean PDF, stores it, and does not attach it to the e-mail", async () => {
    expect((await send([{ name: "a.pdf", bytes: PDF }])).status).toBe(200);
    expect(state.stored).toBe(1);
    expect(state.mails[0]!.attachments).toBeUndefined();
  });
  it("rejects an infected file and stores and sends nothing", async () => {
    state.verdict = { outcome: "infected", scanner: "t", signature: "Eicar" };
    expect((await send([{ name: "a.pdf", bytes: PDF }])).status).toBe(422);
    expect(state.stored + state.created + state.mails.length).toBe(0);
  });
  it("fails closed when the scanner is down", async () => {
    state.verdict = { outcome: "unavailable", scanner: "t", detail: "timeout" };
    expect((await send([{ name: "a.pdf", bytes: PDF }])).status).toBe(503);
    expect(state.stored + state.created).toBe(0);
  });
  it("still allows a message without files while the scanner is down", async () => {
    state.verdict = { outcome: "unavailable", scanner: "t", detail: "timeout" };
    expect((await send([])).status).toBe(200);
  });
  it("rejects a PDF with a script before the scanner is even asked", async () => {
    const evil = Buffer.from(
      "%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (x) >> >>\n%%EOF\n"
    );
    expect((await send([{ name: "a.pdf", bytes: evil }])).status).toBe(422);
    expect(state.stored).toBe(0);
  });
  it("rejects a renamed executable and unsupported types", async () => {
    expect(
      (await send([{ name: "a.pdf", bytes: Buffer.from("MZ\x90\x00") }])).status
    ).toBe(422);
    expect(
      (await send([{ name: "a.svg", bytes: Buffer.from("<svg/>") }])).status
    ).toBe(415);
  });
  it("needs a signed-in user", async () => {
    state.session = null;
    expect((await send()).status).toBe(401);
  });
});
