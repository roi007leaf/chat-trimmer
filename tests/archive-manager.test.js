import { ArchiveManager } from "../scripts/archive-manager.js";

describe("ArchiveManager.generateSessionSummary", () => {
  test("adds entry ids to generated fallback key events", async () => {
    const manager = new ArchiveManager();
    const archive = {
      getFlag: jest.fn((scope, key) => {
        const values = {
          sessionName: "Session 1",
          sessionNumber: 1,
          archiveDate: "2026-04-22T10:00:00.000Z",
          originalMessageCount: 1,
          compressionRatio: 50,
        };
        return values[key];
      }),
    };

    const entries = [
      {
        id: "entry-1",
        timestamp: 1000,
        speaker: "Goblin",
        category: "combat",
        displayText: "Goblin takes damage",
        content: "HP: 0/25 after 12 damage",
        originalMessage: {
          rolls: [{ constructor: { name: "DamageRoll" }, total: 12 }],
          flags: {
            pf2e: {
              context: {},
            },
          },
        },
      },
    ];

    const summary = await manager.generateSessionSummary(archive, entries);

    expect(summary.keyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entryId: "entry-1",
          text: expect.stringContaining("reduced to 0 HP"),
        }),
      ]),
    );
  });
});
