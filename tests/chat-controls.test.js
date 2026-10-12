/** @jest-environment node */
import fs from "fs";
import { chromium } from "playwright";

describe("chat controls rendered layout", () => {
  let browser, page, renderChatLog;

  beforeAll(async () => {
    global.window = {};
    global.Hooks = { on: jest.fn(), once: jest.fn() };
    class Application {}
    foundry.applications = {
      api: {
        ApplicationV2: Application,
        DialogV2: Application,
        HandlebarsApplicationMixin: (Base) => Base,
      },
    };
    require("../scripts/main.js");
    renderChatLog = Hooks.on.mock.calls
      .find(([name]) => name === "renderChatLog")[1]
      .toString();
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    await browser?.close();
    delete global.Hooks;
    delete global.window;
  });

  test.each([
    [334, true, false, false],
    [280, true, true, true],
    [200, true, false, true],
    [334, false, true, false],
    [200, false, false, true],
    [500, true, true, false],
  ])(
    "buttons stay clickable at %ipx (GM=%s, Fate after render=%s, popout=%s)",
    async (width, isGM, fateAfter, popout) => {
      // Foundry's toolbar has a non-wrapping message-mode group and a GM group.
      await page.setContent(`
        <style>
          * { box-sizing: border-box; }
          .chat-sidebar { width: ${width}px; }
          .chat-sidebar #chat-controls { display: flex; justify-content: space-between; }
          .split-button, .chat-sidebar #chat-controls .control-buttons { display: flex; gap: 4px; }
          button { flex: none; width: 36px; height: 36px; padding: 0; }
          #message-modes { flex: none; }
          .chat-input { height: 80px; background: #222; }
        </style>
        <section class="chat-sidebar" ${popout ? 'id="chat-popout"' : ""}>
          <div id="chat-controls">
            <div id="message-modes" class="split-button">
              ${Array.from({ length: 5 }, (_, i) => `<button>${i}</button>`).join("")}
            </div>
            ${isGM ? '<div class="control-buttons"><button>Save</button><button>Clear</button></div>' : ""}
          </div>
          <div class="chat-input">Enter message</div>
        </section>
      `);
      await page.addStyleTag({
        content: fs.readFileSync("styles/archive-viewer.css", "utf8"),
      });
      await page.evaluate(
        ({ hook, isGM, fateAfter, popout }) => {
          window.game = { user: { isGM }, i18n: { localize: (key) => key } };
          window.archiveClicks = 0;
          window.fateClicks = 0;
          window.onViewArchives = () => window.archiveClicks++;
          window.onSetSession =
            window.onTrimChat =
            window.onNewSession =
              () => {};
          const root = document.querySelector(".chat-sidebar");
          const controls = root.querySelector("#chat-controls");
          const addFate = () => {
            const fate = document.createElement("button");
            fate.id = "roll-of-fate";
            fate.textContent = "Fate";
            fate.onclick = () => window.fateClicks++;
            controls.append(fate);
          };
          if (!fateAfter) addFate();
          const render = new Function(`return (${hook})`)();
          render({ element: root }, popout ? [root] : root, {});
          if (fateAfter) addFate();
          render({ element: root }, root, {});
        },
        { hook: renderChatLog, isGM, fateAfter, popout },
      );
      const layout = await page.evaluate(() => {
        const controls = document.querySelector("#chat-controls");
        const bounds = controls.getBoundingClientRect();
        const buttons = [...controls.querySelectorAll("button, a")];
        return {
          count: controls.querySelectorAll("#chat-trimmer-menu-btn").length,
          problems: buttons.flatMap((button) => {
            const r = button.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
            return r.left < bounds.left - 1 ||
              r.right > bounds.right + 1 ||
              r.bottom > bounds.bottom + 1 ||
              !button.contains(hit)
              ? [button.id || button.textContent]
              : [];
          }),
          inputBelow:
            document.querySelector(".chat-input").getBoundingClientRect().top >=
            bounds.bottom,
        };
      });
      expect(layout).toEqual({ count: 1, problems: [], inputBelow: true });
      await page.locator("#roll-of-fate").click();
      await page.locator("#chat-trimmer-menu-btn").click();
      expect(
        await page.evaluate(() => [window.fateClicks, window.archiveClicks]),
      ).toEqual([1, 1]);
      await page.locator("#chat-trimmer-menu-btn").click({ button: "right" });
      await page.locator("#chat-trimmer-dropdown.show").waitFor();
      expect(
        await page.locator("#chat-trimmer-dropdown .menu-item").count(),
      ).toBe(3);
    },
  );
});
