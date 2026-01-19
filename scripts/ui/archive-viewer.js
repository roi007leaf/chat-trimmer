/**
 * Archive Viewer Application
 */
export class ArchiveViewer extends Application {
    constructor(archiveManager, options = {}) {
        super(options);
        this.archiveManager = archiveManager;
        this.currentSession = "current";
        this.currentFilter = "all";
        this.searchQuery = "";
        this.expandedEntries = new Set();
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "chat-trimmer-viewer",
            template: "modules/chat-trimmer/templates/archive-viewer.hbs",
            title: game.i18n.localize("CHATTRIMMER.ArchiveViewer.Title"),
            width: 700,
            height: 800,
            resizable: true,
            classes: ["chat-trimmer-viewer"],
        });
    }

    async getData() {
        const data = await super.getData();

        console.log("Archive Viewer | Getting data...");

        // Get all archives
        const archives = await this.archiveManager.getAllArchives();
        console.log(`Archive Viewer | Found ${archives.length} archives`);

        // Get current archive
        let currentArchive;
        if (this.currentSession === "current") {
            currentArchive = await this.archiveManager.getCurrentArchive();
        } else if (this.currentSession === "all") {
            currentArchive = null;
        } else {
            currentArchive = await this.archiveManager.getArchive(
                parseInt(this.currentSession),
            );
        }

        // Get entries
        let entries = [];
        if (this.currentSession === "all") {
            console.log("Archive Viewer | Loading entries from all archives");
            for (const archive of archives) {
                const archiveEntries = archive.getFlag("chat-trimmer", "entries") || [];
                console.log(
                    `Archive Viewer | Archive "${archive.name}" has ${archiveEntries.length} entries`,
                );
                entries.push(
                    ...archiveEntries.map((e) => ({
                        ...e,
                        sessionNumber: archive.getFlag("chat-trimmer", "sessionNumber"),
                    })),
                );
            }
        } else if (currentArchive) {
            entries = currentArchive.getFlag("chat-trimmer", "entries") || [];
            console.log(
                `Archive Viewer | Current archive has ${entries.length} entries`,
            );
        } else {
            console.log("Archive Viewer | No current archive selected");
        }

        console.log(
            `Archive Viewer | Total entries before filters: ${entries.length}`,
        );

        // Apply filter
        if (this.currentFilter !== "all") {
            entries = entries.filter((e) => e.type === this.currentFilter);
        }

        // Apply search
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            entries = entries.filter((e) => {
                const searchText = JSON.stringify(e).toLowerCase();
                return searchText.includes(query);
            });
        }

        // Add expanded state
        entries = entries.map((e) => ({
            ...e,
            expanded: this.expandedEntries.has(e.id),
        }));

        // Get statistics
        let statistics = null;
        if (currentArchive) {
            statistics = {
                originalCount: currentArchive.getFlag(
                    "chat-trimmer",
                    "originalMessageCount",
                ),
                compressedCount: currentArchive.getFlag(
                    "chat-trimmer",
                    "compressedEntryCount",
                ),
                compressionRatio: currentArchive.getFlag(
                    "chat-trimmer",
                    "compressionRatio",
                ),
                ...currentArchive.getFlag("chat-trimmer", "statistics"),
            };
        }

        return {
            ...data,
            archives,
            currentArchive,
            currentSession: this.currentSession,
            currentFilter: this.currentFilter,
            searchQuery: this.searchQuery,
            entries,
            statistics,
            hasEntries: entries.length > 0,
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Session selector
        html.find("#archive-session-select").change((ev) => {
            this.currentSession = ev.target.value;
            this.render();
        });

        // Filter buttons
        html.find(".filter-button").click((ev) => {
            this.currentFilter = ev.currentTarget.dataset.filter;
            html.find(".filter-button").removeClass("active");
            ev.currentTarget.classList.add("active");
            this.render();
        });

        // Search
        html.find("#archive-search").on("input", (ev) => {
            this.searchQuery = ev.target.value;
            this.render();
        });

        // Expand/collapse entries
        html.find(".entry-header").click((ev) => {
            const entryId =
                ev.currentTarget.closest(".archive-entry").dataset.entryId;
            if (this.expandedEntries.has(entryId)) {
                this.expandedEntries.delete(entryId);
            } else {
                this.expandedEntries.add(entryId);
            }
            this.render();
        });

        // View original button
        html.find(".view-original-btn").click(async (ev) => {
            ev.stopPropagation();
            const entryId =
                ev.currentTarget.closest(".archive-entry").dataset.entryId;
            await this.showOriginalMessages(entryId);
        });
    }

    async showOriginalMessages(entryId) {
        // Find the entry
        const archives = await this.archiveManager.getAllArchives();
        let entry = null;

        for (const archive of archives) {
            const entries = archive.getFlag("chat-trimmer", "entries") || [];
            entry = entries.find((e) => e.id === entryId);
            if (entry) break;
        }

        if (!entry) return;

        // Show dialog with original messages
        new Dialog({
            title: "Original Messages",
            content: `
        <div class="original-messages">
          <p><strong>${entry.displayText}</strong></p>
          <p>${entry.originalMessageIds.length} original messages</p>
          <hr>
          <div class="message-list">
            ${entry.originalMessage
                    ? this.formatOriginalMessage(entry.originalMessage)
                    : "<p>Original messages have been deleted. Only the summary remains.</p>"
                }
          </div>
        </div>
      `,
            buttons: {
                close: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Close",
                },
            },
        }).render(true);
    }

    formatOriginalMessage(msg) {
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();
        return `
      <div class="original-message">
        <div class="message-header">
          <strong>${msg.speaker?.alias || "Unknown"}</strong>
          <span class="timestamp">${timestamp}</span>
        </div>
        <div class="message-content">${msg.content}</div>
      </div>
    `;
    }
}
