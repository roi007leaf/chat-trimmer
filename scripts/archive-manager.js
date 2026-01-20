/**
 * Archive manager for creating and managing chat archives
 */
export class ArchiveManager {
    constructor() {
        this.folderName = "Chat Archives";
        this.folder = null;
    }

    /**
     * Initialize the archive folder
     */
    async initialize() {
        // Find or create the Chat Archives folder
        this.folder = game.folders.find(
            (f) => f.name === this.folderName && f.type === "JournalEntry",
        );

        if (!this.folder) {
            this.folder = await Folder.create({
                name: this.folderName,
                type: "JournalEntry",
                parent: null,
            });
        }

        return this.folder;
    }

    /**
     * Delete a specific archive
     * @param {string} archiveId - The ID of the archive to delete
     */
    async deleteArchive(archiveId) {
        const journal = game.journal.get(archiveId);
        if (!journal) {
            console.warn(`Archive Manager | Archive ${archiveId} not found`);
            return;
        }

        console.log(`Archive Manager | Deleting archive: ${journal.name}`);
        await journal.delete();
    }

    /**
     * Delete all archives in the Chat Archives folder
     */
    async deleteAllArchives() {
        await this.initialize();

        const archives = await this.getAllArchives();
        console.log(`Archive Manager | Deleting ${archives.length} archives`);

        for (const archive of archives) {
            await archive.delete();
        }
    }

    /**
     * Create a new archive
     * @param {Object} data - Archive data
     * @returns {JournalEntry} Created archive journal entry
     */
    async create(data) {
        console.log("Archive Manager | Creating new archive");
        console.log(
            `Archive Manager | Entries: ${data.entries.length}, Original messages: ${data.originalMessageCount}`,
        );

        await this.initialize();

        const sessionNumber = await this.getNextSessionNumber();
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
        const timeStr = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        });
        const archiveName = `Chat Archive - ${dateStr} ${timeStr}`;

        // Determine storage type
        const storageType = game.settings.get("chat-trimmer", "storageType") || "journal";

        // Calculate compression ratio
        const compressionRatio = Math.round(
            ((data.originalMessageCount - data.compressedEntryCount) /
                data.originalMessageCount) *
            100,
        );

        // Prep metadata
        const metadata = {
            isArchive: true,
            sessionNumber,
            sessionName: game.settings.get("chat-trimmer", "currentSessionName"),
            archiveDate: now.toISOString(),
            originalMessageCount: data.originalMessageCount,
            compressedEntryCount: data.compressedEntryCount,
            compressionRatio,
            searchIndex: data.searchIndex,
            statistics: data.stats,
        };

        // Handle external storage (No Journal)
        if (storageType === "external") {
            try {
                const filename = `archive-${sessionNumber}.json`;
                // Store full data in file
                const fileData = {
                    ...metadata,
                    name: archiveName,
                    entries: data.entries
                };

                const filePath = await this._saveToExternalFile(fileData, filename);
                console.log(`Archive Manager | Saved to external file: ${filePath}`);

                // Create Index Entry (Lightweight)
                const indexEntry = {
                    id: foundry.utils.randomID(),
                    name: archiveName,
                    ...metadata,
                    storageType: "external",
                    filePath: filePath,
                    entries: [] // Empty in index
                };

                // Save to Settings Index
                const index = game.settings.get("chat-trimmer", "archiveIndex") || [];
                index.push(indexEntry);
                await game.settings.set("chat-trimmer", "archiveIndex", index);

                ui.notifications.info(`${archiveName} created successfully (External JSON).`);
                return new VirtualArchive(indexEntry);

            } catch (err) {
                console.error("Archive Manager | Failed to save to external file, falling back to journal:", err);
                ui.notifications.warn("Failed to save archive to file. Falling back to Journal storage.");
                // Fallthrough to journal
            }
        }

        // Journal fallback / default
        // Build formatted content for journal pages
        const summaryContent = this.buildSummaryPage(
            data,
            compressionRatio,
            dateStr,
            timeStr,
        );
        const entriesContent = this.buildEntriesPage(data.entries);

        // Create journal entry with pages
        const journal = await JournalEntry.create({
            name: archiveName,
            folder: this.folder.id,
            pages: [
                {
                    name: "Summary",
                    type: "text",
                    text: {
                        content: summaryContent,
                        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
                    },
                },
                {
                    name: "Archive Entries",
                    type: "text",
                    text: {
                        content: entriesContent,
                        format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
                    },
                },
            ],
            flags: {
                "chat-trimmer": {
                    ...metadata,
                    entries: data.entries,
                    storageType: "journal"
                },
            },
        });

        console.log(
            `Archive Manager | Journal entry created successfully: ${journal.id}`,
        );

        return journal;
    }

    /**
     * Helper to save array to external JSON file
     */
    async _saveToExternalFile(data, filename) {
        const path = `worlds/${game.world.id}/chat-trimmer-archives`;

        // Ensure directory exists
        try {
            await FilePicker.browse("data", path);
        } catch (e) {
            await FilePicker.createDirectory("data", path);
        }

        const file = new File([JSON.stringify(data)], filename, { type: "application/json" });
        await FilePicker.upload("data", path, file);

        return `${path}/${filename}`;
    }

    /**
     * Retrieve entries for an archive (handling specific storage types)
     */
    async getArchiveEntries(archive) {
        if (!archive) return [];

        const type = archive.getFlag("chat-trimmer", "storageType");

        if (type === "external") {
            const filePath = archive.getFlag("chat-trimmer", "filePath");
            if (!filePath) return [];

            try {
                // Must fetch the file
                // Use cache busting?
                const response = await fetch(filePath);
                if (!response.ok) throw new Error("File not found");
                const json = await response.json();
                return json.entries || [];
            } catch (e) {
                console.error("Archive Manager | Error fetching external archive:", e);
                ui.notifications.error(`Could not load archive file: ${filePath}`);
                return [];
            }
        }

        return archive.getFlag("chat-trimmer", "entries") || [];
    }

    /**
     * Get next session number
     */
    async getNextSessionNumber() {
        const archives = await this.getAllArchives();
        let maxSession = 0;

        for (const archive of archives) {
            const sessionNum = archive.getFlag("chat-trimmer", "sessionNumber");
            if (sessionNum && sessionNum > maxSession) {
                maxSession = sessionNum;
            }
        }

        return maxSession + 1;
    }

    /**
     * Get all archives
     */
    async getAllArchives() {
        await this.initialize();

        // Get Journals
        const journals = game.journal.filter(
            (j) => j.getFlag("chat-trimmer", "isArchive") === true,
        );

        // Get Virtual Archives from Settings
        const index = game.settings.get("chat-trimmer", "archiveIndex") || [];
        const virtualArchives = index.map(data => new VirtualArchive(data));

        return [...journals, ...virtualArchives];
    }

    /**
     * Get archive by session number
     */
    async getArchive(sessionNumber) {
        const archives = await this.getAllArchives();
        return archives.find(
            (a) => a.getFlag("chat-trimmer", "sessionNumber") === sessionNumber,
        );
    }

    /**
     * Get current (most recent) archive
     */
    async getCurrentArchive() {
        const archives = await this.getAllArchives();
        if (archives.length === 0) return null;

        // Sort by session number descending
        archives.sort((a, b) => {
            const aNum = a.getFlag("chat-trimmer", "sessionNumber") || 0;
            const bNum = b.getFlag("chat-trimmer", "sessionNumber") || 0;
            return bNum - aNum;
        });

        return archives[0];
    }

    /**
     * Search archives
     * @param {Object} options - Search options
     * @returns {Array} Matching entries
     */
    async search(options = {}) {
        const {
            query = "",
            type = null,
            sessionNumber = null,
            actor = null,
            scene = null,
        } = options;

        let archives;
        if (sessionNumber) {
            const archive = await this.getArchive(sessionNumber);
            archives = archive ? [archive] : [];
        } else {
            archives = await this.getAllArchives();
        }

        const results = [];

        for (const archive of archives) {
            const entries = await this.getArchiveEntries(archive);
            const searchIndex = archive.getFlag("chat-trimmer", "searchIndex") || {};

            for (const entry of entries) {
                let matches = true;

                // Filter by type
                if (type && entry.type !== type) {
                    matches = false;
                }

                // Filter by actor
                if (
                    actor &&
                    searchIndex.actors &&
                    !searchIndex.actors.includes(actor)
                ) {
                    matches = false;
                }

                // Filter by scene
                if (
                    scene &&
                    searchIndex.scenes &&
                    !searchIndex.scenes.includes(scene)
                ) {
                    matches = false;
                }

                // Search query
                if (query) {
                    const queryLower = query.toLowerCase();
                    const searchText = JSON.stringify(entry).toLowerCase();
                    if (!searchText.includes(queryLower)) {
                        matches = false;
                    }
                }

                if (matches) {
                    results.push({
                        archive,
                        entry,
                        sessionNumber: archive.getFlag("chat-trimmer", "sessionNumber"),
                    });
                }
            }
        }

        return results;
    }

    /**
     * Build summary page content
     */
    buildSummaryPage(data, compressionRatio, dateStr, timeStr) {
        const stats = data.stats || {};

        return `
            <h1>Chat Archive Summary</h1>
            <p><strong>Archive Date:</strong> ${dateStr} ${timeStr}</p>
            
            <h2>Compression Statistics</h2>
            <ul>
                <li><strong>Original Messages:</strong> ${data.originalMessageCount}</li>
                <li><strong>Compressed Entries:</strong> ${data.compressedEntryCount}</li>
                <li><strong>Compression Ratio:</strong> ${compressionRatio}% reduction</li>
            </ul>
            
            <h2>Session Statistics</h2>
            <ul>
                <li><strong>Combat Encounters:</strong> ${stats.totalCombats || 0}</li>
                <li><strong>Total Rolls:</strong> ${stats.totalRolls || 0}</li>
                <li><strong>Critical Hits:</strong> ${stats.criticalHits || 0}</li>
                <li><strong>Critical Failures:</strong> ${stats.criticalFails || 0}</li>
            </ul>
            
            <p><em>View the "Archive Entries" page for detailed chat history.</em></p>
        `;
    }

    /**
     * Build entries page content
     */
    buildEntriesPage(entries) {
        if (entries.length === 0) {
            return "<p><em>No entries in this archive.</em></p>";
        }

        let html = "<h1>Archive Entries</h1>\n";

        for (const entry of entries) {
            const timestamp = new Date(entry.timestamp).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });

            html += `<div style="margin-bottom: 1em; padding: 0.5em; border-left: 3px solid #7a7971;">\n`;
            html += `<p><strong>${timestamp}</strong> - ${entry.displayText}</p>\n`;

            // Add detailed content based on type
            if (entry.type === "combat" && entry.summary) {
                html += this.formatCombatSummary(entry.summary);
            } else if (entry.originalMessage) {
                const content = entry.originalMessage.content || "";
                // Strip some HTML but keep structure
                const cleanContent = content.replace(
                    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
                    "",
                );
                html += `<div style="margin-left: 1em; font-size: 0.9em;">${cleanContent}</div>\n`;
            }

            html += `</div>\n`;
        }

        return html;
    }

    /**
     * Format combat summary for journal page
     */
    formatCombatSummary(combat) {
        let html = '<div style="margin-left: 1em; font-size: 0.9em;">\n';

        html += `<p><strong>Location:</strong> ${combat.location || "Unknown"}</p>\n`;
        html += `<p><strong>Duration:</strong> ${combat.duration || "Unknown"}</p>\n`;
        html += `<p><strong>Outcome:</strong> ${combat.outcome || "Unknown"}</p>\n`;

        if (combat.participants) {
            html += "<p><strong>Participants:</strong><br>\n";
            if (combat.participants.allies && combat.participants.allies.length > 0) {
                html += `Allies: ${combat.participants.allies.join(", ")}<br>\n`;
            }
            if (
                combat.participants.enemies &&
                combat.participants.enemies.length > 0
            ) {
                html += `Enemies: ${combat.participants.enemies.join(", ")}<br>\n`;
            }
            html += "</p>\n";
        }

        if (combat.keyMoments && combat.keyMoments.length > 0) {
            html += "<p><strong>Key Moments:</strong></p>\n<ul>\n";
            combat.keyMoments.forEach((moment) => {
                html += `<li>${moment}</li>\n`;
            });
            html += "</ul>\n";
        }

        if (combat.stats) {
            html += "<p><strong>Statistics:</strong><br>\n";
            html += `Damage Dealt: ${combat.stats.totalDamageDealt || 0}<br>\n`;
            html += `Damage Taken: ${combat.stats.totalDamageTaken || 0}<br>\n`;
            html += `Critical Hits: ${combat.stats.criticalHits || 0}\n`;
            html += "</p>\n";
        }

        html += "</div>\n";
        return html;
    }

    /**
     * Delete an archive
     */
    async deleteArchive(sessionNumber) {
        const archive = await this.getArchive(sessionNumber);
        if (archive) {
            await archive.delete();
        }
    }

    /**
     * Export archive as text
     */
    async exportAsText(sessionNumber) {
        const archive = await this.getArchive(sessionNumber);
        if (!archive) return null;

        const entries = await this.getArchiveEntries(archive);
        const stats = archive.getFlag("chat-trimmer", "statistics") || {};

        let text = `# ${archive.name}\n\n`;
        text += `## Statistics\n`;
        text += `- Original Messages: ${archive.getFlag("chat-trimmer", "originalMessageCount")}\n`;
        text += `- Compressed Entries: ${archive.getFlag("chat-trimmer", "compressedEntryCount")}\n`;
        text += `- Compression Ratio: ${archive.getFlag("chat-trimmer", "compressionRatio")}%\n`;
        text += `- Combats: ${stats.totalCombats || 0}\n`;
        text += `- Dialogues: ${stats.totalDialogues || 0}\n\n`;

        text += `## Entries\n\n`;

        for (const entry of entries) {
            const timestamp = new Date(entry.timestamp).toLocaleTimeString();
            text += `### [${timestamp}] ${entry.displayText}\n\n`;

            if (entry.summary) {
                text += `${JSON.stringify(entry.summary, null, 2)}\n\n`;
            }

            text += `---\n\n`;
        }

        return text;
    }
}

/**
 * Virtual Archive class to access index-stored archives consistently
 */
class VirtualArchive {
    constructor(data) {
        this.data = data;
        this.id = data.id;
        this.name = data.name;
    }

    /**
     * Mimic getFlag from Foundry Document
     */
    getFlag(scope, key) {
        if (scope !== "chat-trimmer") return undefined;
        return this.data[key];
    }

    /**
     * Delete self from index
     */
    async delete() {
        console.log(`Archive Manager | Deleting virtual archive ${this.id}`);
        // Remove from settings
        const index = game.settings.get("chat-trimmer", "archiveIndex") || [];
        const newIndex = index.filter(i => i.id !== this.id);
        await game.settings.set("chat-trimmer", "archiveIndex", newIndex);

        ui.notifications.info(game.i18n.localize("CHATTRIMMER.Notifications.ArchiveDeleted"));
    }
}
