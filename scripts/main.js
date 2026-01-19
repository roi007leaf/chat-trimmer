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
 * Add button to journal sidebar
 */
Hooks.on("renderJournalDirectory", (app, html, data) => {
    const $html = $(html);

    // Find the header actions
    const headerActions = $html.find(".directory-header .header-actions");

    if (
        headerActions.length > 0 &&
        !headerActions.find(".view-chat-archives").length
    ) {
        const archiveBtn = $(`
            <button class="view-chat-archives" title="${game.i18n.localize("CHAT_TRIMMER.Buttons.ViewArchives")}">
                <i class="fas fa-archive"></i> ${game.i18n.localize("CHAT_TRIMMER.Buttons.ChatArchives")}
            </button>
        `);

        headerActions.prepend(archiveBtn);
        archiveBtn.click(onViewArchives);
    }
});

/**
 * Add trim buttons to chat log
 */
Hooks.on("renderChatLog", (app, html, data) => {
    // Ensure html is a jQuery object
    const $html = $(html);

    // Add trim controls to chat
    const controls = $html.find("#chat-controls");

    if (controls.length > 0 && !controls.find(".chat-trimmer-controls").length) {
        const trimmerControls = $(`
      <div class="chat-trimmer-controls">
        <button class="chat-trimmer-btn" id="trim-chat-btn" title="Trim chat and create archive">
          <i class="fas fa-compress-alt"></i> ${game.i18n.localize("CHATTRIMMER.Buttons.TrimChat")}
        </button>
        <button class="chat-trimmer-btn" id="view-archives-btn" title="View chat archives">
          <i class="fas fa-archive"></i> ${game.i18n.localize("CHATTRIMMER.Buttons.ViewArchives")}
        </button>
      </div>
    `);

        controls.append(trimmerControls);

        // Bind events
        trimmerControls.find("#trim-chat-btn").click(onTrimChat);
        trimmerControls.find("#view-archives-btn").click(onViewArchives);
    }
});

/**
 * Monitor chat messages for auto-trim
 */
Hooks.on("createChatMessage", (message, options, userId) => {
    // Check if we should auto-trim
    if (game.settings.get("chat-trimmer", "autoTrimEnable")) {
        const threshold = game.settings.get("chat-trimmer", "messageThreshold");
        const messageCount = game.messages.size;

        if (messageCount >= threshold) {
            console.log(
                `Chat Trimmer | Message threshold reached (${messageCount}/${threshold})`,
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

    // Confirm with user
    const confirmed = await Dialog.confirm({
        title: "Trim Chat",
        content: `
      <p>This will compress your chat messages into a searchable archive.</p>
      <p><strong>Current messages:</strong> ${game.messages.size}</p>
      <p>The original messages will be deleted, but preserved in the archive.</p>
      <p>Are you sure you want to continue?</p>
    `,
        yes: () => true,
        no: () => false,
    });

    if (!confirmed) return;

    // Perform trim
    await chatTrimmer.trim();
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
    if (!game.settings.get("chat-trimmer", "autoTrimEnable")) return;

    const messageCount = game.messages.size;
    const messageThreshold = game.settings.get(
        "chat-trimmer",
        "messageThreshold",
    );

    // Check message count threshold
    if (messageCount >= messageThreshold) {
        console.log(
            `Chat Trimmer | Auto-trim triggered by message count (${messageCount}/${messageThreshold})`,
        );
        await performAutoTrim();
        return;
    }

    // Check time threshold
    const lastTrimTime = game.settings.get("chat-trimmer", "lastTrimTime");
    const timeThreshold =
        game.settings.get("chat-trimmer", "timeThreshold") * 60 * 60 * 1000; // Convert to ms
    const timeSinceLastTrim = Date.now() - lastTrimTime;

    if (
        lastTrimTime > 0 &&
        timeSinceLastTrim >= timeThreshold &&
        messageCount > 50
    ) {
        console.log(`Chat Trimmer | Auto-trim triggered by time threshold`);
        await performAutoTrim();
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
        return date.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        });
    });

    // JSON stringify helper
    Handlebars.registerHelper("json", function (context, indent) {
        return JSON.stringify(context, null, indent);
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
};

console.log("Chat Trimmer | Module loaded. Access via window.ChatTrimmer");
