import { setCurrentSession, startNextSession } from "../scripts/sessions.js";
import { ArchiveManager } from "../scripts/archive-manager.js";

describe("session management", () => {
  let values;
  beforeEach(() => {
    game.user.isGM = true;
    values = {
      currentSessionNumber: 1,
      currentSessionName: "Session 1",
      archiveIndex: [],
      enableArchiving: true,
    };
    game.settings.get.mockImplementation((scope, key) => values[key]);
    game.settings.set
      .mockReset()
      .mockImplementation(async (scope, key, value) => {
        values[key] = value;
      });
    game.messages.contents = [];
  });
  test("sets current number directly without advancing start time", async () => {
    await setCurrentSession(46);
    expect(values.currentSessionNumber).toBe(46);
    expect(values.currentSessionName).toBe("Session 46");
    expect(values.currentSessionStartTime).toBeUndefined();
  });
  test.each([0, -1, 1.5, NaN, Infinity])(
    "rejects invalid number %s",
    async (number) => {
      await expect(setCurrentSession(number)).rejects.toThrow(
        "positive whole number",
      );
      expect(game.settings.set).not.toHaveBeenCalled();
    },
  );
  test("archives all messages under old number before advancing", async () => {
    values.archiveOnNewSession = true;
    game.messages.contents = [{ id: "msg" }];
    const trimmer = {
      trim: jest.fn(async () => {
        expect(values.currentSessionNumber).toBe(1);
        return { archive: { id: "archive" } };
      }),
    };
    await startNextSession(trimmer, 2);
    expect(trimmer.trim).toHaveBeenCalledWith(null, { ignoreKeep: true });
    expect(values.currentSessionNumber).toBe(2);
    expect(values.currentSessionName).toBe("Session 2");
    expect(values.currentSessionStartTime).toBeGreaterThan(0);
  });
  test("failed archive and disabled archiving leave session unchanged", async () => {
    values.archiveOnNewSession = true;
    game.messages.contents = [{ id: "msg" }];
    await expect(
      startNextSession({ trim: async () => null }, 2),
    ).rejects.toThrow("Session unchanged");
    values.enableArchiving = false;
    const trim = jest.fn();
    await expect(startNextSession({ trim }, 2)).rejects.toThrow(
      "Enable archiving",
    );
    expect(trim).not.toHaveBeenCalled();
    expect(game.settings.set).not.toHaveBeenCalled();
  });
  test("non-GM cannot change sessions or load hidden archives", async () => {
    game.user.isGM = false;
    values.hideArchivesFromPlayers = true;
    await expect(setCurrentSession(46)).rejects.toThrow("Only GMs");
    const manager = new ArchiveManager();
    expect(await manager.getAllArchives()).toEqual([]);
    expect(await manager.getArchiveEntries({})).toEqual([]);
    await expect(manager.renumberSession("Session 1", 46)).rejects.toThrow(
      "Only GMs",
    );
  });
  test("renumbers journal segments and rejects collisions", async () => {
    const manager = new ArchiveManager();
    const make = (number) => ({
      name: "Archive",
      getFlag: (scope, key) =>
        ({
          sessionName: `Session ${number}`,
          sessionNumber: number,
          storageType: "journal",
        })[key],
      update: jest.fn(),
    });
    const first = make(1),
      second = make(1),
      other = make(2);
    manager.getAllArchives = jest.fn(async () => [first, second, other]);
    await expect(manager.renumberSession("Session 1", 2)).rejects.toThrow(
      "already uses",
    );
    expect(first.update).not.toHaveBeenCalled();
    expect(await manager.renumberSession("Session 1", 46)).toBe("Session 46");
    for (const archive of [first, second])
      expect(archive.update).toHaveBeenCalledWith({
        "flags.chat-trimmer.sessionNumber": 46,
        "flags.chat-trimmer.sessionName": "Session 46",
      });
  });
  test("external renumber preserves file path and contents", async () => {
    values.archiveIndex = [
      {
        id: "ext",
        storageType: "external",
        filePath: "worlds/test/chat-trimmer-archives/archive-1.json",
        sessionNumber: 1,
        sessionName: "Session 1",
      },
    ];
    const manager = new ArchiveManager();
    const record = values.archiveIndex[0];
    manager.getAllArchives = async () => [
      { id: "ext", getFlag: (scope, key) => record[key] },
    ];
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ entries: [{ id: "secret" }], sessionNumber: 1 }),
    }));
    manager._saveToExternalFile = jest.fn();
    await manager.renumberSession("Session 1", 46);
    expect(manager._saveToExternalFile).toHaveBeenCalledWith(
      {
        entries: [{ id: "secret" }],
        sessionNumber: 46,
        sessionName: "Session 46",
      },
      "archive-1.json",
    );
    expect(values.archiveIndex[0].filePath).toBe(record.filePath);
    expect(values.archiveIndex[0].sessionNumber).toBe(46);
  });
  test("external append failures cannot report successful archiving", async () => {
    const manager = new ArchiveManager();
    const archive = {
      id: "ext",
      getFlag: (scope, key) =>
        ({ storageType: "external", filePath: "archive.json" })[key],
    };
    global.fetch = jest.fn(async () => ({ ok: false }));
    manager._saveToExternalFile = jest.fn();
    await expect(
      manager.appendToArchive(archive, {
        entries: [],
        originalMessageCount: 1,
      }),
    ).rejects.toThrow("File not found");
    expect(manager._saveToExternalFile).not.toHaveBeenCalled();
    manager.getArchiveEntries = async () => [];
    manager._saveToExternalFile.mockRejectedValue(new Error("Upload failed"));
    await expect(
      manager.appendToArchive(archive, {
        entries: [],
        originalMessageCount: 1,
      }),
    ).rejects.toThrow("Upload failed");
  });
  test("player access can be restored while respecting journal visibility", async () => {
    game.user.isGM = false;
    values.hideArchivesFromPlayers = false;
    const manager = new ArchiveManager();
    const publicJournal = { visible: true, getFlag: () => true };
    const privateJournal = { visible: false, getFlag: () => true };
    game.journal = [publicJournal, privateJournal];
    expect(await manager.getAllArchives()).toEqual([publicJournal]);
  });
});
