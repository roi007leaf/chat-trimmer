/**
 * Chat Trimmer & Summarizer - Main Module
 */

import { ArchiveManager } from "./archive-manager.js";
import { ChatTrimmer } from "./trimmer.js";
import { ArchiveViewerV2 } from "./ui/archive-viewer-v2.js";
import { SettingsPanel } from "./ui/settings-panel.js";

// Module globals
let chatTrimmer;
let archiveManager;
let archiveViewer;

/**
 * Initialize module
 */
Hooks.once("init", () => {
  console.log("Chat Trimmer | Initializing");

  // Register settings
  SettingsPanel.register();

  // Register Handlebars helpers
  registerHandlebarsHelpers();
});

/**
 * Setup module after Foundry is ready
 */
Hooks.once("ready", async () => {
  console.log("Chat Trimmer | Ready");

  // Initialize managers
  chatTrimmer = new ChatTrimmer();
  archiveManager = new ArchiveManager();
  await archiveManager.initialize();

  // Check for auto-trim conditions
  checkAutoTrim();

  // Setup periodic auto-trim check
  const timeThreshold = game.settings.get("chat-trimmer", "timeThreshold");
  setInterval(checkAutoTrim, timeThreshold * 60 * 60 * 1000); // Convert hours to ms
});

/**
 * Add trim buttons to chat log
 */
Hooks.on("renderChatLog", (app, html, data) => {
  const root = html?.[0] ?? html;
  if (!root?.querySelector) return;

  const controls = root.querySelector("#chat-controls");
  if (!controls) return;

  // Only init once
  if (controls.querySelector("#chat-trimmer-menu-btn")) return;

  const ensureMenu = () => {
    let menu = document.querySelector("#chat-trimmer-dropdown");
    if (menu) return menu;

    menu = document.createElement("div");
    menu.id = "chat-trimmer-dropdown";
    menu.className = "chat-trimmer-dropdown";
    menu.style.display = "none";

    const mkItem = (action, iconClass, label) => {
      const item = document.createElement("div");
      item.className = "menu-item";
      item.dataset.action = action;
      item.innerHTML = `<i class="${iconClass}"></i><span>${label}</span>`;
      return item;
    };

    menu.append(
      mkItem(
        "trim",
        "fas fa-compress-alt",
        game.i18n.localize("CHATTRIMMER.Buttons.TrimChat"),
      ),
      mkItem(
        "new-session",
        "fas fa-plus-circle",
        game.i18n.localize("CHATTRIMMER.Buttons.NewSession"),
      ),
    );

    menu.addEventListener("click", (e) => {
      const item = e.target?.closest?.(".menu-item");
      if (!item || !menu.contains(item)) return;
      e.preventDefault();
      e.stopPropagation();

      const action = item.dataset.action;

      menu.classList.remove("show");
      menu.classList.add("hide");
      setTimeout(() => (menu.style.display = "none"), 150);

      switch (action) {
        case "trim":
          onTrimChat({ preventDefault: () => { } });
          break;
        case "new-session":
          onNewSession({ preventDefault: () => { } });
          break;
      }
    });

    document.body.appendChild(menu);
    return menu;
  };

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  };

  const hideMenu = (menu) => {
    if (!menu || !isVisible(menu)) return;
    menu.classList.remove("show");
    menu.classList.add("hide");
    setTimeout(() => (menu.style.display = "none"), 150);
  };

  const trimmerButton = document.createElement("a");
  trimmerButton.className = "chat-control-icon chat-trimmer-menu-btn";
  trimmerButton.id = "chat-trimmer-menu-btn";
  trimmerButton.role = "button";
  trimmerButton.dataset.tooltip = "Chat Trimmer (Right-click for menu)";
  trimmerButton.setAttribute("aria-label", "Chat Trimmer");
  trimmerButton.innerHTML = '<i class="fas fa-archive"></i>';
  controls.appendChild(trimmerButton);

  trimmerButton.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const menu = ensureMenu();
    const buttonRect = trimmerButton.getBoundingClientRect();

    menu.style.position = "fixed";
    menu.style.display = "block";
    menu.style.visibility = "hidden";
    menu.classList.remove("show", "hide");

    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width;
    const menuHeight = menuRect.height;
    menu.style.visibility = "visible";

    let left = buttonRect.right - menuWidth;
    let top = buttonRect.top - menuHeight;

    const padding = 5;
    if (left < padding) left = padding;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    if (top < padding) top = buttonRect.bottom + padding;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    requestAnimationFrame(() => menu.classList.add("show"));
  });

  trimmerButton.addEventListener("click", (event) => {
    event.preventDefault();
    onViewArchives(event);
  });

  if (!window._chatTrimmerDocClick) {
    window._chatTrimmerDocClick = (event) => {
      const menu = document.querySelector("#chat-trimmer-dropdown");
      const btn = document.querySelector("#chat-trimmer-menu-btn");
      if (!menu || !btn) return;
      const target = event.target;
      if (menu.contains(target) || btn.contains(target)) return;
      hideMenu(menu);
    };
    document.addEventListener("click", window._chatTrimmerDocClick);
  }
});

/**
 * Monitor chat messages for auto-trim
 */
Hooks.on("createChatMessage", (message, options, userId) => {
  // Check if we should auto-trim based on message count
  const autoTrimMethod = game.settings.get("chat-trimmer", "autoTrimMethod");

  if (autoTrimMethod === "messageCount") {
    const messagesToKeep = game.settings.get("chat-trimmer", "messagesToKeep");
    const messageThreshold = game.settings.get(
      "chat-trimmer",
      "messageThreshold",
    );
    const messageCount = game.messages.size;

    // Simple logic: trim when total messages = keep + threshold
    // Example: keep=3, threshold=5 → trim at 8 messages
    const trimAt = messagesToKeep + messageThreshold;

    if (messageCount >= trimAt) {
      console.log(
        `Chat Trimmer | Message threshold reached (${messageCount}/${trimAt} = ${messagesToKeep} keep + ${messageThreshold} buffer)`,
      );
      // Auto-trim on next tick to avoid blocking message creation
      setTimeout(() => performAutoTrim(), 100);
    }
  }
});

/**
 * Handle trim chat button click
 */
async function onTrimChat(event) {
  event.preventDefault();

  const msgCount = game.messages.size;

  // AppV2 Dialog
  new foundry.applications.api.DialogV2({
    window: {
      title: game.i18n.localize("CHATTRIMMER.Buttons.TrimChat"),
    },
    content: `
         <form>
             <p>This will compress <strong>all ${msgCount} chat messages</strong> into a searchable archive.</p>
             <p><small>The original messages will be deleted from chat, but preserved in the archive.</small></p>
             <p>Are you sure you want to continue?</p>
         </form>
      `,
    buttons: [
      {
        action: "trim",
        label: "Trim All",
        icon: "fa-solid fa-compress-alt",
        default: true,
        callback: async () => {
          // Always trim all messages when manually triggered
          await chatTrimmer.trim(null, { ignoreKeep: true });
        },
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-times",
      },
    ],
  }).render({ force: true });
}

/**
 * Handle new session button click
 */
async function onNewSession(event) {
  event.preventDefault();

  // Only GM can create new sessions
  if (!game.user.isGM) {
    ui.notifications.warn("Only GMs can start new sessions.");
    return;
  }

  const currentSession = game.settings.get(
    "chat-trimmer",
    "currentSessionName",
  );
  let currentNumber = game.settings.get("chat-trimmer", "currentSessionNumber");

  // Check archive index for the actual highest session number
  const archiveIndex = game.settings.get("chat-trimmer", "archiveIndex") || [];
  if (archiveIndex.length > 0) {
    const highestArchiveSession = Math.max(
      ...archiveIndex.map((a) => a.sessionNumber || 0),
    );
    // Use whichever is higher: the setting or the actual archives
    currentNumber = Math.max(currentNumber, highestArchiveSession);
  }

  // AppV2 Dialog
  new foundry.applications.api.DialogV2({
    window: {
      title: game.i18n.localize("CHATTRIMMER.Prompts.NewSessionTitle"),
    },
    content: `
      <form>
        <p>Current session: <strong>${currentSession}</strong></p>
        <p>Next session will be: <strong>Session ${currentNumber + 1}</strong></p>
        <p>${game.i18n.localize("CHATTRIMMER.Prompts.NewSessionContent")}</p>
      </form>
    `,
    buttons: [
      {
        action: "confirm",
        label: "Start New Session",
        icon: "fa-solid fa-check",
        default: true,
        callback: async () => {
          // Increment session
          const newNumber = currentNumber + 1;
          const newName = `Session ${newNumber}`;

          await game.settings.set(
            "chat-trimmer",
            "currentSessionNumber",
            newNumber,
          );
          await game.settings.set(
            "chat-trimmer",
            "currentSessionName",
            newName,
          );
          await game.settings.set(
            "chat-trimmer",
            "currentSessionStartTime",
            Date.now(),
          );

          ui.notifications.info(
            game.i18n.format("CHATTRIMMER.Notifications.NewSessionStarted", {
              sessionName: newName,
            }),
          );
        },
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-times",
      },
    ],
  }).render({ force: true });
}

/**
 * Handle view archives button click
 */
function onViewArchives(event) {
  event.preventDefault();

  // Open archive viewer using ApplicationV2
  if (!archiveViewer) {
    archiveViewer = new ArchiveViewerV2(archiveManager);
  }

  archiveViewer.render({ force: true });
}

/**
 * Check if auto-trim should be triggered
 */
async function checkAutoTrim() {
  const autoTrimMethod = game.settings.get("chat-trimmer", "autoTrimMethod");

  if (autoTrimMethod === "disabled") return;

  const messageCount = game.messages.size;

  // Check message count method
  if (autoTrimMethod === "messageCount") {
    const messagesToKeep = game.settings.get("chat-trimmer", "messagesToKeep");
    const messageThreshold = game.settings.get(
      "chat-trimmer",
      "messageThreshold",
    );
    const trimAt = messagesToKeep + messageThreshold;

    if (messageCount >= trimAt) {
      console.log(
        `Chat Trimmer | Auto-trim triggered by message count (${messageCount}/${trimAt} = ${messagesToKeep} keep + ${messageThreshold} buffer)`,
      );
      await performAutoTrim();
    }
    return;
  }

  // Check time-based method
  if (autoTrimMethod === "time") {
    // Check if we should pause the timer when game is paused
    const pauseTimerWithGame = game.settings.get(
      "chat-trimmer",
      "pauseTimerWithGame",
    );
    if (pauseTimerWithGame && game.paused) {
      console.log(
        "Chat Trimmer | Time-based auto-trim skipped (game is paused)",
      );
      return;
    }

    const timeThresholdHours = game.settings.get(
      "chat-trimmer",
      "timeThreshold",
    );
    const lastTrimTime = game.settings.get("chat-trimmer", "lastTrimTime");
    const timeThreshold = timeThresholdHours * 60 * 60 * 1000; // Convert to ms
    const timeSinceLastTrim = Date.now() - lastTrimTime;

    if (lastTrimTime > 0 && timeSinceLastTrim >= timeThreshold) {
      console.log(
        `Chat Trimmer | Auto-trim triggered by time threshold (${(timeSinceLastTrim / (60 * 60 * 1000)).toFixed(1)} hours elapsed)`,
      );
      await performAutoTrim();
    }
  }
}

/**
 * Perform automatic trim
 */
async function performAutoTrim() {
  // Only GM can auto-trim
  if (!game.user.isGM) return;

  console.log("Chat Trimmer | Performing auto-trim");

  try {
    await chatTrimmer.trim();
    await game.settings.set("chat-trimmer", "lastTrimTime", Date.now());
  } catch (error) {
    console.error("Chat Trimmer | Auto-trim failed:", error);
  }
}

/**
 * Register Handlebars helpers
 */
function registerHandlebarsHelpers() {
  // Equality helper
  Handlebars.registerHelper("eq", function (a, b) {
    return a === b;
  });

  // Join array helper
  Handlebars.registerHelper("join", function (array, separator) {
    if (!Array.isArray(array)) return "";
    return array.join(separator);
  });

  // Format timestamp helper
  Handlebars.registerHelper("formatTime", function (timestamp) {
    const date = new Date(timestamp);
    const use24h = game.settings.get("chat-trimmer", "use24hTime");

    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: !use24h,
    });
  });

  // Remove duplicate speaker name from display text
  Handlebars.registerHelper("removeDuplicateSpeaker", function (text, speaker) {
    if (!text || !speaker) return text || "";

    // Check if text starts with "SpeakerName: " or "SpeakerName "
    const colonPattern = `${speaker}: `;
    const spacePattern = `${speaker} `;

    if (text.startsWith(colonPattern)) {
      return text.substring(colonPattern.length);
    } else if (text.startsWith(spacePattern)) {
      return text.substring(spacePattern.length);
    }

    return text;
  });

  // JSON stringify helper
  Handlebars.registerHelper("json", function (context, indent) {
    return JSON.stringify(context, null, indent);
  });

  // Greater than helper (for pagination)
  Handlebars.registerHelper("gt", function (a, b) {
    return a > b;
  });

  // Register partials
  Handlebars.registerPartial(
    "combatEntry",
    "modules/chat-trimmer/templates/partials/combat-entry.hbs",
  );
}

// Export for console access
window.ChatTrimmer = {
  trimmer: () => chatTrimmer,
  archiveManager: () => archiveManager,
  viewer: () => archiveViewer,

  // Utility functions
  async manualTrim() {
    if (!game.user.isGM) {
      ui.notifications.warn("Only GMs can trim chat.");
      return;
    }
    return await chatTrimmer.trim();
  },

  async viewArchives() {
    if (!archiveViewer) {
      archiveViewer = new ArchiveViewerV2(archiveManager);
    }
    archiveViewer.render({ force: true });
  },

  async exportArchive(sessionNumber) {
    const text = await archiveManager.exportAsText(sessionNumber);
    if (text) {
      // Create download
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chat-archive-session-${sessionNumber}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  /**
   * Diagnostic tool: Log CSS styles for elements in the Original Message dialog
   * Usage: ChatTrimmer.debugStyles() - then click on elements to see their computed styles
   */
  debugStyles() {
    console.log("Chat Trimmer | CSS Debug Mode activated");
    console.log(
      "Click on any element in an Original Message dialog to log its styles",
    );
    console.log("Run ChatTrimmer.debugStyles() again to disable");

    if (window._chatTrimmerDebugHandler) {
      // Remove existing handler
      document.removeEventListener(
        "click",
        window._chatTrimmerDebugHandler,
        true,
      );
      window._chatTrimmerDebugHandler = null;
      console.log("Chat Trimmer | CSS Debug Mode deactivated");
      return;
    }

    window._chatTrimmerDebugHandler = (event) => {
      const target = event.target;
      const dialog = target.closest(".original-messages-dialog");

      if (!dialog) return; // Only log clicks inside Original Message dialogs

      event.stopPropagation();
      event.preventDefault();

      const computed = window.getComputedStyle(target);
      const classList = Array.from(target.classList);

      console.group(
        `Element: ${target.tagName.toLowerCase()}${classList.length ? "." + classList.join(".") : ""}`,
      );
      console.log("Element:", target);
      console.log("Classes:", classList);
      console.log("Computed color:", computed.color);
      console.log("Computed background:", computed.backgroundColor);
      console.log("Inline style:", target.getAttribute("style"));
      console.log("Text content:", target.textContent?.substring(0, 100));

      // Check parent background
      const parent = target.parentElement;
      if (parent) {
        const parentComputed = window.getComputedStyle(parent);
        console.log("Parent background:", parentComputed.backgroundColor);
      }

      // Log matching CSS rules
      console.log(
        "Matching trait/badge/tag classes:",
        classList.some(
          (c) =>
            c.includes("trait") || c.includes("badge") || c.includes("tag"),
        ),
      );
      console.log("Has flavor-text class:", classList.includes("flavor-text"));

      console.groupEnd();
    };

    document.addEventListener("click", window._chatTrimmerDebugHandler, true);
  },
};

console.log("Chat Trimmer | Module loaded. Access via window.ChatTrimmer");

/**
 * Intercept Return to Setup and prompt for Session End
 */
Hooks.on("renderSettings", (app, html, data) => {
  // Only GM can manage sessions
  if (!game.user.isGM) return;

  const root = html?.[0] ?? html;
  if (!root?.querySelector) return;

  const setupBtn = root.querySelector('button[data-action="setup"]');
  if (setupBtn) {
    // Clone+replace strips existing listeners
    const newBtn = setupBtn.cloneNode(true);
    setupBtn.replaceWith(newBtn);

    newBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const currentSession = game.settings.get(
        "chat-trimmer",
        "currentSessionName",
      );

      // AppV2 Dialog
      new foundry.applications.api.DialogV2({
        window: {
          title: "End Session?",
        },
        content: `
                    <form>
                        <p>You are returning to setup. Is the session <strong>${currentSession}</strong> finished?</p>
                        <p><small>Ending the session will start a new session count for future archives.</small></p>
                    </form>
                `,
        buttons: [
          {
            action: "end",
            label: "Yes, End Session",
            icon: "fa-solid fa-check",
            default: true,
            callback: async () => {
              // Increment session name
              await incrementSessionName(currentSession);
              game.shutDown();
            },
          },
          {
            action: "exit",
            label: "No, Just Exit",
            icon: "fa-solid fa-times",
            callback: () => {
              game.shutDown();
            },
          },
          {
            action: "cancel",
            label: "Cancel",
            icon: "fa-solid fa-ban",
          },
        ],
      }).render({ force: true });
    });
  }
});

/**
 * Helper to increment session name
 */
async function incrementSessionName(current) {
  let nextName = current;
  const match = current.match(/Session (\d+)/i);
  if (match) {
    const num = parseInt(match[1]) + 1;
    nextName = `Session ${num}`;
  } else {
    nextName = `${current} (Next)`;
  }

  await game.settings.set("chat-trimmer", "currentSessionName", nextName);
  ui.notifications.info(`Chat Trimmer | Session advanced to: ${nextName}`);
}
