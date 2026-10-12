import { installChatCleanup } from "../scripts/utils/chat-cleanup.js";

describe("Foundry Clear Chat Log", () => {
  let messages;
  let confirm;
  let deleteDocuments;

  beforeEach(() => {
    jest.useFakeTimers();
    messages = Array.from({ length: 125 }, (_, i) => ({ id: `m${i}` }));
    deleteDocuments = jest.fn(async (ids, options) => {
      const deleted = options?.deleteAll ? messages.map((m) => m.id) : ids;
      messages = messages.filter((m) => !deleted.includes(m.id));
    });
    game.messages = {
      get contents() {
        return messages;
      },
      get size() {
        return messages.length;
      },
      documentClass: { deleteDocuments },
      flush: async () =>
        confirm({
          yes: { callback: () => deleteDocuments([], { deleteAll: true }) },
        }),
    };
    confirm = jest.fn(async (options) => options.yes.callback());
    foundry.applications = { api: { DialogV2: { confirm } } };
    document.body.innerHTML = '<button class="jump-to-bottom"></button>';
    installChatCleanup();
  });

  afterEach(() => jest.useRealTimers());

  test("bounds deletion work and yields to timers between batches", async () => {
    const heartbeat = jest.fn();
    setTimeout(heartbeat, 0);
    const clearing = game.messages.flush();
    await jest.runAllTimersAsync();
    await clearing;
    expect(deleteDocuments.mock.calls.map(([ids]) => ids.length)).toEqual([
      ...Array(12).fill(10),
      5,
    ]);
    expect(
      deleteDocuments.mock.calls.every(([, options]) => !options?.deleteAll),
    ).toBe(true);
    expect(heartbeat.mock.invocationCallOrder[0]).toBeLessThan(
      deleteDocuments.mock.invocationCallOrder[1],
    );
    expect(messages).toHaveLength(0);
    expect(document.querySelector(".jump-to-bottom").hidden).toBe(true);
  });

  test("keeps native warning and cancellation deletes nothing", async () => {
    confirm.mockImplementationOnce(async () => false);
    await game.messages.flush();
    expect(confirm.mock.calls[0][0]).toMatchObject({
      window: { title: "CHAT.FlushTitle" },
      content: expect.stringContaining("CHAT.FlushWarning"),
    });
    expect(deleteDocuments).not.toHaveBeenCalled();
    expect(messages).toHaveLength(125);
  });

  test("messages posted during cleanup survive", async () => {
    setTimeout(() => messages.push({ id: "new-message" }), 0);
    const clearing = game.messages.flush();
    await jest.runAllTimersAsync();
    await clearing;
    expect(messages).toEqual([{ id: "new-message" }]);
    expect(document.querySelector(".jump-to-bottom").hidden).toBe(false);
  });

  test("repeated clicks share one operation, and installation is idempotent", async () => {
    const flush = game.messages.flush;
    installChatCleanup();
    expect(game.messages.flush).toBe(flush);
    const first = game.messages.flush();
    expect(game.messages.flush()).toBe(first);
    await jest.runAllTimersAsync();
    await first;
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deleteDocuments).toHaveBeenCalledTimes(13);
  });

  test("failure stops remaining batches and releases lock for retry", async () => {
    deleteDocuments.mockRejectedValueOnce(new Error("Permission denied"));
    await expect(game.messages.flush()).rejects.toThrow("Permission denied");
    expect(deleteDocuments).toHaveBeenCalledTimes(1);
    expect(messages).toHaveLength(125);
    const retry = game.messages.flush();
    await jest.runAllTimersAsync();
    await retry;
    expect(messages).toHaveLength(0);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  test("small logs need only one request and invalid document IDs are included", async () => {
    messages = [{ id: "valid" }];
    game.messages.invalidDocumentIds = new Set(["invalid"]);
    await game.messages.flush();
    expect(deleteDocuments).toHaveBeenCalledWith(["valid", "invalid"]);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("empty logs do not send delete-all requests", async () => {
    messages = [];
    await game.messages.flush();
    expect(deleteDocuments).not.toHaveBeenCalled();
  });
});
