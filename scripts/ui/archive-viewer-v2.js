/**
 * Archive Viewer Application (V2)
 * Modern Foundry ApplicationV2 implementation
 */
export class ArchiveViewerV2 extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2,
) {
    constructor(archiveManager, options = {}) {
        super(options);
        this.archiveManager = archiveManager;
        this.currentSession = null; // Will default to most recent archive
        this.currentFilter = "all";
        this.searchQuery = "";
        this.expandedEntries = new Set();
    }

    static DEFAULT_OPTIONS = {
        id: "chat-trimmer-viewer",
        classes: ["chat-trimmer-viewer"],
        tag: "div",
        window: {
            title: "CHATTRIMMER.ArchiveViewer.Title",
            icon: "fa-solid fa-archive",
            resizable: true,
            minimizable: true,
        },
        position: {
            width: 700,
            height: 800,
        },
        form: {
            handler: undefined,
            submitOnChange: false,
            closeOnSubmit: false,
        },
        actions: {
            toggleEntry: ArchiveViewerV2.prototype.onToggleEntry,
            viewOriginal: ArchiveViewerV2.prototype.onViewOriginal,
        },
    };

    static PARTS = {
        form: {
            template: "modules/chat-trimmer/templates/archive-viewer-v2.hbs",
        },
    };

    _onRender(context, options) {
        super._onRender(context, options);

        // Attach event listeners for select elements
        const sessionSelect = this.element.querySelector(".archive-select");
        const filterSelect = this.element.querySelector(".category-filter");
        const searchInput = this.element.querySelector(".archive-search");

        if (sessionSelect) {
            sessionSelect.addEventListener("change", (e) => {
                this.currentSession = e.target.value;
                this.render();
            });
        }

        if (filterSelect) {
            filterSelect.addEventListener("change", (e) => {
                this.currentFilter = e.target.value;
                this.render();
            });
        }

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value;
                clearTimeout(this._searchTimeout);
                this._searchTimeout = setTimeout(() => {
                    this.render();
                }, 300);
            });
        }
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        console.log("Archive Viewer | Getting data...");

        // Get all archives
        const allArchives = await this.archiveManager.getAllArchives();
        console.log(`Archive Viewer | Found ${allArchives.length} archives`);

        // Format archives for dropdown with proper structure
        const archives = allArchives.map((archive) => ({
            id: archive.id,
            label: archive.name,
            selected: this.currentSession === archive.id,
        }));

        // Add "All Sessions" option at the beginning
        archives.unshift({
            id: "all",
            label: "All Sessions",
            selected: this.currentSession === "all",
        });

        // Get current archive
        let currentArchive;
        if (this.currentSession === "all") {
            currentArchive = null;
        } else {
            currentArchive = allArchives.find((a) => a.id === this.currentSession);
            if (!currentArchive && allArchives.length > 0) {
                // Default to most recent archive
                currentArchive = allArchives[allArchives.length - 1];
                this.currentSession = currentArchive.id;
            }
        }

        // Get entries
        let entries = [];
        if (this.currentSession === "all") {
            console.log("Archive Viewer | Loading entries from all archives");
            for (const archive of allArchives) {
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
                `Archive Viewer | Current archive "${currentArchive.name}" has ${entries.length} entries`,
            );
        } else {
            console.log("Archive Viewer | No current archive selected");
        }

        console.log(
            `Archive Viewer | Total entries before filters: ${entries.length}`,
        );

        // Debug: Log first entry structure if available
        if (entries.length > 0) {
            console.log("Archive Viewer | Sample entry structure:", {
                keys: Object.keys(entries[0]),
                category: entries[0].category,
                type: entries[0].type,
                icon: entries[0].icon,
            });
        }

        const totalEntries = entries.length;

        // Apply filter - check both 'category' and 'type' properties
        if (this.currentFilter !== "all") {
            entries = entries.filter((e) => {
                const entryCategory = e.category || e.type || "all";
                return entryCategory === this.currentFilter;
            });
            console.log(
                `Archive Viewer | After category filter '${this.currentFilter}': ${entries.length} entries`,
            );
        }

        // Apply search
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            entries = entries.filter((e) => {
                const searchText =
                    `${e.displaySummary} ${e.displayText} ${e.content}`.toLowerCase();
                return searchText.includes(query);
            });
            console.log(
                `Archive Viewer | After search '${this.searchQuery}': ${entries.length} entries`,
            );
        }

        // Add expanded state
        entries = entries.map((e) => ({
            ...e,
            expanded: this.expandedEntries.has(e.id),
        }));

        // Calculate compression ratio
        let compressionRatio = 0;
        if (currentArchive) {
            const originalCount =
                currentArchive.getFlag("chat-trimmer", "originalMessageCount") || 0;
            const compressedCount =
                currentArchive.getFlag("chat-trimmer", "compressedEntryCount") ||
                totalEntries;

            if (originalCount > 0) {
                compressionRatio = Math.round(
                    ((originalCount - compressedCount) / originalCount) * 100,
                );
            }
        }

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
            ...context,
            archives,
            currentArchive,
            currentSession: this.currentSession,
            currentFilter: this.currentFilter,
            searchQuery: this.searchQuery,
            filteredEntries: entries,
            totalEntries,
            compressionRatio,
            statistics,
            hasEntries: entries.length > 0,
        };
    }

    async onToggleEntry(event, target) {
        event.preventDefault();
        event.stopPropagation();
        const entryId = target.closest("[data-entry-id]").dataset.entryId;
        if (this.expandedEntries.has(entryId)) {
            this.expandedEntries.delete(entryId);
        } else {
            this.expandedEntries.add(entryId);
        }
        this.render();
    }

    async onViewOriginal(event, target) {
        event.stopPropagation();
        const entryId = target.closest("[data-entry-id]").dataset.entryId;
        await this.showOriginalMessages(entryId);
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
            ${entry.originalMessage ? this.formatOriginalMessage(entry.originalMessage) : "<p>Original messages have been deleted. Only the summary remains.</p>"}
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
