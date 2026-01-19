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

        // Calculate compression ratio
        const compressionRatio = Math.round(
            ((data.originalMessageCount - data.compressedEntryCount) /
                data.originalMessageCount) *
            100,
        );

        console.log(
            `Archive Manager | Archive name: Chat Archive - ${dateStr} ${timeStr}`,
        );
        console.log(`Archive Manager | Compression ratio: ${compressionRatio}%`);
        console.log(`Archive Manager | Entries to store:`, data.entries.length);
        console.log(`Archive Manager | First entry:`, data.entries[0]);

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
            name: `Chat Archive - ${dateStr} ${timeStr}`,
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
                    isArchive: true,
                    sessionNumber,
                    archiveDate: now.toISOString(),
                    originalMessageCount: data.originalMessageCount,
                    compressedEntryCount: data.compressedEntryCount,
                    compressionRatio,
                    entries: data.entries,
                    searchIndex: data.searchIndex,
                    statistics: data.stats,
                },
            },
        });

        console.log(
            `Archive Manager | Journal entry created successfully: ${journal.id}`,
        );
        console.log(
            `Archive Manager | Stored entries:`,
            journal.getFlag("chat-trimmer", "entries")?.length,
        );

        return journal;
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

        return game.journal.filter(
            (j) => j.getFlag("chat-trimmer", "isArchive") === true,
        );
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
            const entries = archive.getFlag("chat-trimmer", "entries") || [];
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

        const entries = archive.getFlag("chat-trimmer", "entries") || [];
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
