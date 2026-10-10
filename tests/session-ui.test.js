import fs from "fs";

describe("session UI", () => {
  let Viewer, dialogOptions;
  beforeAll(() => {
    class Application {
      async _prepareContext() {
        return {};
      }
      render() {}
    }
    foundry.applications = {
      api: {
        ApplicationV2: Application,
        HandlebarsApplicationMixin: (Base) => Base,
        DialogV2: class {
          constructor(options) {
            dialogOptions = options;
          }
          render() {}
        },
      },
    };
    Viewer = require("../scripts/ui/archive-viewer-v2.js").ArchiveViewerV2;
  });
  beforeEach(() => {
    game.user.isGM = true;
    dialogOptions = null;
  });
  test("pencil dialog submits entered number and refreshes selection", async () => {
    const manager = {
      getAllArchives: async () => [
        {
          getFlag: (scope, key) =>
            ({ sessionName: "Session 1", sessionNumber: 1 })[key],
        },
      ],
      renumberSession: jest.fn(async () => "Session 46"),
    };
    const viewer = new Viewer(manager);
    viewer.currentSession = "Session 1";
    viewer.render = jest.fn();
    await viewer.onEditSessionNumber();
    const element = document.createElement("div");
    element.innerHTML = dialogOptions.content;
    element.querySelector("input").value = "46";
    await dialogOptions.buttons[0].callback(null, null, { element });
    expect(manager.renumberSession).toHaveBeenCalledWith("Session 1", 46);
    expect(viewer.currentSession).toBe("Session 46");
    expect(viewer.render).toHaveBeenCalled();
  });
  test("hidden player viewer clears cached entries without loading archives", async () => {
    game.user.isGM = false;
    game.settings.get.mockReturnValue(true);
    const manager = { getAllArchives: jest.fn() };
    const viewer = new Viewer(manager);
    viewer.entryMap = new Map([["secret", {}]]);
    const context = await viewer._prepareContext({});
    expect(context.showArchiveBody).toBe(false);
    expect(viewer.entryMap.size).toBe(0);
    expect(manager.getAllArchives).not.toHaveBeenCalled();
    await viewer.onEditSessionNumber();
    expect(dialogOptions).toBeNull();
  });
  test("management buttons render only inside GM gate", () => {
    const template = fs.readFileSync("templates/archive-viewer-v2.hbs", "utf8");
    const gmBlock = template.split("{{#if isGM}}")[1].split("{{/if}}")[0];
    expect(gmBlock).toContain('data-action="editSessionNumber"');
    expect(gmBlock).toContain('data-action="deleteCurrentArchive"');
    expect(gmBlock).toContain('data-action="deleteAllArchives"');
  });
});
