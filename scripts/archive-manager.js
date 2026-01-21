/**
 * Archive manager for creating and managing chat archives
 */
export class ArchiveManager {
    constructor() {
        this.folderName = "Chat Archives";
        this.folder = null;
        this.indexCache = null; // Map cache for O(1) archiveIndex lookups
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
     * Get or build the archive index cache for O(1) lookups
     * @returns {Map<string, Object>} Map of archive ID to index entry
     */
    getIndexCache() {
        if (!this.indexCache) {
            const index = game.settings.get("chat-trimmer", "archiveIndex") || [];
            this.indexCache = new Map(index.map(entry => [entry.id, entry]));
        }
        return this.indexCache;
    }

    /**
     * Invalidate the index cache (call this whenever archiveIndex is modified)
     */
    invalidateIndexCache() {
        this.indexCache = null;
    }

    /**
     * Get an archive index entry by ID with O(1) lookup
     * @param {string} archiveId - The archive ID to look up
     * @returns {Object|null} The index entry or null if not found
     */
    getIndexEntry(archiveId) {
        return this.getIndexCache().get(archiveId) || null;
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
     * Create a new archive or append to existing session archive
     * @param {Object} data - Archive data
     * @returns {JournalEntry} Created or updated archive
     */
    async create(data) {
        console.log("Archive Manager | Creating or appending to archive");
        console.log(
            `Archive Manager | New entries: ${data.entries.length}, Original messages: ${data.originalMessageCount}`,
        );

        await this.initialize();

        // Get current session number from settings
        const sessionNumber = game.settings.get("chat-trimmer", "currentSessionNumber");

        // Check if archive for this session already exists
        const existingArchive = await this.getArchive(sessionNumber);

        if (existingArchive) {
            console.log(`Archive Manager | Found existing archive for session ${sessionNumber}, appending entries`);
            return await this.appendToArchive(existingArchive, data);
        }

        console.log(`Archive Manager | Creating new archive for session ${sessionNumber}`);
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
                this.invalidateIndexCache(); // Invalidate cache after modification

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
     * Append entries to an existing archive
     * @param {Object} archive - Existing archive (journal or virtual)
     * @param {Object} data - New data to append
     * @returns {Object} Updated archive
     */
    async appendToArchive(archive, data) {
        const storageType = archive.getFlag("chat-trimmer", "storageType");

        // Get existing entries
        const existingEntries = await this.getArchiveEntries(archive);

        // Merge new entries with existing (maintain chronological order)
        const allEntries = [...existingEntries, ...data.entries];
        allEntries.sort((a, b) => a.timestamp - b.timestamp);

        // Update statistics
        const existingOriginalCount = archive.getFlag("chat-trimmer", "originalMessageCount") || 0;
        const existingStats = archive.getFlag("chat-trimmer", "statistics") || {};

        const newOriginalCount = existingOriginalCount + data.originalMessageCount;
        const newCompressedCount = allEntries.length;
        const newCompressionRatio = Math.round(
            ((newOriginalCount - newCompressedCount) / newOriginalCount) * 100,
        );

        // Merge statistics
        const newStats = {
            totalCombats: (existingStats.totalCombats || 0) + (data.stats?.totalCombats || 0),
            totalDialogues: (existingStats.totalDialogues || 0) + (data.stats?.totalDialogues || 0),
            totalSkillChecks: (existingStats.totalSkillChecks || 0) + (data.stats?.totalSkillChecks || 0),
            totalRolls: (existingStats.totalRolls || 0) + (data.stats?.totalRolls || 0),
            criticalHits: (existingStats.criticalHits || 0) + (data.stats?.criticalHits || 0),
            criticalFails: (existingStats.criticalFails || 0) + (data.stats?.criticalFails || 0),
            itemsTransferred: (existingStats.itemsTransferred || 0) + (data.stats?.itemsTransferred || 0),
            xpAwarded: (existingStats.xpAwarded || 0) + (data.stats?.xpAwarded || 0),
        };

        // Merge search index
        const existingSearchIndex = archive.getFlag("chat-trimmer", "searchIndex") || {};
        const newSearchIndex = {
            keywords: [...(existingSearchIndex.keywords || []), ...(data.searchIndex?.keywords || [])],
            actors: [...new Set([...(existingSearchIndex.actors || []), ...(data.searchIndex?.actors || [])])],
            scenes: [...new Set([...(existingSearchIndex.scenes || []), ...(data.searchIndex?.scenes || [])])],
        };

        const metadata = {
            isArchive: true,
            sessionNumber: archive.getFlag("chat-trimmer", "sessionNumber"),
            sessionName: archive.getFlag("chat-trimmer", "sessionName"),
            archiveDate: archive.getFlag("chat-trimmer", "archiveDate"),
            originalMessageCount: newOriginalCount,
            compressedEntryCount: newCompressedCount,
            compressionRatio: newCompressionRatio,
            searchIndex: newSearchIndex,
            statistics: newStats,
        };

        // Handle external storage
        if (storageType === "external") {
            const filePath = archive.getFlag("chat-trimmer", "filePath");
            if (!filePath) {
                console.error("Archive Manager | External archive has no file path");
                return archive;
            }

            try {
                // Extract filename from path
                const filename = filePath.split('/').pop();

                // Save updated data to file
                const fileData = {
                    ...metadata,
                    name: archive.name,
                    entries: allEntries
                };

                await this._saveToExternalFile(fileData, filename);
                console.log(`Archive Manager | Updated external file: ${filePath}`);

                // Update index entry using O(1) lookup
                const indexEntry = this.getIndexEntry(archive.id);
                if (indexEntry) {
                    Object.assign(indexEntry, metadata);
                    const index = game.settings.get("chat-trimmer", "archiveIndex") || [];
                    await game.settings.set("chat-trimmer", "archiveIndex", index);
                    this.invalidateIndexCache(); // Invalidate cache after modification
                }

                ui.notifications.info(`Archive updated: ${data.originalMessageCount} messages added`);
                return new VirtualArchive({...indexEntry, entries: []});

            } catch (err) {
                console.error("Archive Manager | Failed to update external archive:", err);
                ui.notifications.error("Failed to update archive file.");
                return archive;
            }
        }

        // Handle journal storage
        console.log(`Archive Manager | Updating journal archive`);

        // Rebuild journal pages
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

        const summaryContent = this.buildSummaryPage(
            { ...data, entries: allEntries, originalMessageCount: newOriginalCount, compressedEntryCount: newCompressedCount, stats: newStats },
            newCompressionRatio,
            dateStr,
            timeStr,
        );
        const entriesContent = this.buildEntriesPage(allEntries);

        // Update existing journal
        await archive.update({
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
                    entries: allEntries,
                    storageType: "journal"
                },
            },
        });

        console.log(`Archive Manager | Journal archive updated successfully`);
        ui.notifications.info(`Archive updated: ${data.originalMessageCount} messages added`);

        return archive;
    }

    /**
     * Helper to save array to external JSON file
     */
    async _saveToExternalFile(data, filename) {
        const path = `worlds/${game.world.id}/chat-trimmer-archives`;
        const FilePickerImpl = foundry.applications.apps.FilePicker.implementation;

        // Ensure directory exists
        try {
            await FilePickerImpl.browse("data", path);
        } catch (e) {
            await FilePickerImpl.createDirectory("data", path);
        }

        const file = new File([JSON.stringify(data)], filename, { type: "application/json" });
        await FilePickerImpl.upload("data", path, file);

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
     * Generate session summary with key events (in chronological order)
     * @param {Object} archive - The archive to summarize
     * @param {Array} entriesParam - Optional pre-loaded entries array (for multi-archive sessions)
     * @returns {Object} Session summary
     */
    async generateSessionSummary(archive, entriesParam = null) {
        // Use provided entries or fetch from archive
        const entries = entriesParam || await this.getArchiveEntries(archive);
        const sessionName = archive.getFlag("chat-trimmer", "sessionName");
        const sessionNumber = archive.getFlag("chat-trimmer", "sessionNumber");
        const archiveDate = new Date(archive.getFlag("chat-trimmer", "archiveDate"));
        const sessionStartTime = game.settings.get("chat-trimmer", "currentSessionStartTime");

        // Calculate duration
        const startTime = entries.length > 0 ? entries[0].timestamp : sessionStartTime;
        const endTime = entries.length > 0 ? entries[entries.length - 1].timestamp : Date.now();
        const durationMs = endTime - startTime;
        const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
        const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const duration = `${durationHours}h ${durationMinutes}m`;

        // Extract participants (unique actors)
        const participants = new Set();
        entries.forEach(entry => {
            if (entry.speaker && entry.speaker !== "Unknown" && entry.speaker !== "Combat") {
                participants.add(entry.speaker);
            }
        });

        // Recalculate statistics from entries (don't trust stored stats)
        const stats = {
            totalCombats: 0,
            totalRolls: 0,
            criticalHits: 0,
            criticalFails: 0
        };

        entries.forEach(entry => {
            // Count combat entries
            if (entry.category === "combat" || entry.type === "combat") {
                stats.totalCombats++;
            }

            // Count rolls (entries with rollData or category "rolls")
            if (entry.rollData || entry.category === "rolls") {
                stats.totalRolls++;
            }

            // Count critical hits and fails from content
            const content = (entry.content || "").toLowerCase();
            const displayText = (entry.displayText || entry.displaySummary || "").toLowerCase();
            const searchText = `${content} ${displayText}`;

            if (searchText.includes("critical")) {
                if (searchText.includes("success") || searchText.includes("hit")) {
                    stats.criticalHits++;
                } else if (searchText.includes("fail") || searchText.includes("miss") || searchText.includes("fumble")) {
                    stats.criticalFails++;
                }
            }
        });

        // Extract key events in chronological order
        const keyEvents = [];

        console.log(`Archive Manager | Generating key events from ${entries.length} entries`);
        if (entries.length > 0) {
            console.log(`Archive Manager | Sample entry:`, {
                category: entries[0].category,
                type: entries[0].type,
                displayText: entries[0].displayText,
                speaker: entries[0].speaker
            });
        }

        entries.forEach(entry => {
            const displayText = entry.displayText || entry.displaySummary || "";
            const content = entry.content || "";
            const lowerText = displayText.toLowerCase();
            const lowerContent = content.toLowerCase();
            const combinedText = `${lowerText} ${lowerContent}`;

            // Check for death from damage (HP reaching 0)
            // Look for damage messages and check if target HP reached 0
            if (entry.originalMessage && (lowerText.includes("damage") || lowerContent.includes("damage"))) {
                // Try to extract target actor from the message
                const msg = entry.originalMessage;

                // Check PF2e-specific flags for target
                const targetUuid = msg?.flags?.pf2e?.context?.target?.actor;
                let targetActor = null;

                if (targetUuid) {
                    try {
                        targetActor = fromUuidSync(targetUuid);
                    } catch (e) {
                        // Actor might not exist anymore
                    }
                }

                // If we found a target actor, check their HP
                if (targetActor && targetActor.system?.attributes?.hp) {
                    const currentHP = targetActor.system.attributes.hp.value;

                    // If HP is 0 or below, this is a death event
                    if (currentHP <= 0) {
                        // Try to extract damage amount from the message
                        let damageAmount = null;

                        // Try to get damage from rolls first
                        if (msg.rolls && msg.rolls.length > 0) {
                            const damageRoll = msg.rolls.find(r => r.constructor?.name === "DamageRoll" || r.formula);
                            if (damageRoll && damageRoll.total !== undefined) {
                                damageAmount = Math.floor(damageRoll.total);
                            }
                        }

                        // Fallback: parse from content (e.g., "15 damage", "deals 20 damage")
                        if (damageAmount === null) {
                            const damageMatch = content.match(/(\d+)\s*(?:points?\s*of\s*)?damage/i);
                            if (damageMatch) {
                                damageAmount = parseInt(damageMatch[1]);
                            }
                        }

                        const damageText = damageAmount !== null ? ` (took ${damageAmount} damage)` : "";
                        keyEvents.push({
                            timestamp: entry.timestamp,
                            icon: "💀",
                            text: `${targetActor.name} was reduced to 0 HP!${damageText}`,
                            importance: "high"
                        });
                    }
                }

                // Fallback: try to parse HP from content (e.g., "HP: 0/25")
                const hpMatch = content.match(/HP:\s*0+\s*\/\s*\d+/i) || content.match(/\b0\s*\/\s*\d+\s*HP/i);
                if (hpMatch && !targetActor) {
                    // HP reached 0 based on content
                    const actorName = entry.speaker || "Unknown";

                    // Try to extract damage amount
                    let damageAmount = null;
                    if (entry.originalMessage?.rolls && entry.originalMessage.rolls.length > 0) {
                        const damageRoll = entry.originalMessage.rolls.find(r => r.constructor?.name === "DamageRoll" || r.formula);
                        if (damageRoll && damageRoll.total !== undefined) {
                            damageAmount = Math.floor(damageRoll.total);
                        }
                    }

                    if (damageAmount === null) {
                        const damageMatch = content.match(/(\d+)\s*(?:points?\s*of\s*)?damage/i);
                        if (damageMatch) {
                            damageAmount = parseInt(damageMatch[1]);
                        }
                    }

                    const damageText = damageAmount !== null ? ` (took ${damageAmount} damage)` : "";
                    keyEvents.push({
                        timestamp: entry.timestamp,
                        icon: "💀",
                        text: `${actorName} was reduced to 0 HP!${damageText}`,
                        importance: "high"
                    });
                }
            }

            // Attack rolls
            if (entry.category === "combat" && lowerText.includes("attack")) {
                keyEvents.push({
                    timestamp: entry.timestamp,
                    icon: "⚔️",
                    text: displayText,
                    importance: "medium"
                });
            }
            // Critical hits/successes - check content more thoroughly
            else if (combinedText.includes("critical")) {
                if (combinedText.includes("success") || combinedText.includes("hit")) {
                    keyEvents.push({
                        timestamp: entry.timestamp,
                        icon: "💥",
                        text: `${entry.speaker}: Critical Hit!`,
                        importance: "medium"
                    });
                }
                // Critical failures
                else if (combinedText.includes("fail") || combinedText.includes("miss") || combinedText.includes("fumble")) {
                    keyEvents.push({
                        timestamp: entry.timestamp,
                        icon: "💢",
                        text: `${entry.speaker}: Critical Failure`,
                        importance: "medium"
                    });
                }
            }
            // High damage rolls (20+ damage)
            else if (entry.category === "combat" && lowerText.includes("damage")) {
                const damageMatch = displayText.match(/\((\d+)\)/);
                if (damageMatch && parseInt(damageMatch[1]) >= 20) {
                    keyEvents.push({
                        timestamp: entry.timestamp,
                        icon: "💥",
                        text: displayText,
                        importance: "medium"
                    });
                }
            }
            // Level ups
            else if (lowerText.includes("level") && (lowerText.includes("up") || lowerContent.includes("level up"))) {
                keyEvents.push({
                    timestamp: entry.timestamp,
                    icon: "⭐",
                    text: `${entry.speaker}: Leveled Up`,
                    importance: "high"
                });
            }
            // Death/unconscious
            else if (lowerText.includes("dies") || lowerText.includes("death") || lowerText.includes("unconscious") || lowerText.includes("dying")) {
                keyEvents.push({
                    timestamp: entry.timestamp,
                    icon: "💀",
                    text: displayText,
                    importance: "high"
                });
            }
            // Healing
            else if (lowerText.includes("heal") && entry.category === "healing") {
                keyEvents.push({
                    timestamp: entry.timestamp,
                    icon: "❤️",
                    text: displayText,
                    importance: "low"
                });
            }
            // Important items/loot
            else if ((lowerText.includes("found") || lowerText.includes("discovered") || lowerText.includes("obtained")) &&
                     (lowerText.includes("item") || lowerText.includes("treasure") || lowerText.includes("gold"))) {
                keyEvents.push({
                    timestamp: entry.timestamp,
                    icon: "📦",
                    text: displayText,
                    importance: "medium"
                });
            }
            // Spell casts (major spells only - those marked as important in category)
            else if (entry.category === "important" && displayText.includes("✨")) {
                keyEvents.push({
                    timestamp: entry.timestamp,
                    icon: "✨",
                    text: displayText,
                    importance: "low"
                });
            }
        });

        console.log(`Archive Manager | Found ${keyEvents.length} key events`);

        // Sort by timestamp (chronological order)
        keyEvents.sort((a, b) => a.timestamp - b.timestamp);

        return {
            sessionName,
            sessionNumber,
            duration,
            archiveDate: archiveDate.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
            }),
            participants: Array.from(participants),
            totalMessages: archive.getFlag("chat-trimmer", "originalMessageCount") || 0,
            totalEntries: entries.length,
            compressionRatio: archive.getFlag("chat-trimmer", "compressionRatio") || 0,
            statistics: {
                combats: stats.totalCombats || 0,
                dialogues: stats.totalDialogues || 0,
                rolls: stats.totalRolls || 0,
                criticalHits: stats.criticalHits || 0,
                criticalFails: stats.criticalFails || 0,
            },
            keyEvents: keyEvents,
        };
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
            this.invalidateIndexCache(); // Invalidate cache after deletion
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
    }
}
