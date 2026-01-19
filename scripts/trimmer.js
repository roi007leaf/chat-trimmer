import { CombatDetector } from "./algorithms/combat-detector.js";
import { ArchiveManager } from "./archive-manager.js";
import { KeywordExtractor } from "./utils/keyword-extractor.js";
import { MessageParser } from "./utils/message-parser.js";

/**
 * Main chat trimmer class
 */
export class ChatTrimmer {
    constructor() {
        this.algorithms = {
            combat: new CombatDetector(),
        };
        this.archiveManager = new ArchiveManager();
    }

    /**
     * Main trim operation
     * @param {Array} messages - Messages to trim (optional, defaults to all chat messages)
     * @param {Object} options - Trim options
     * @returns {Object} Archive summary
     */
    async trim(messages = null, options = {}) {
        try {
            console.log("Chat Trimmer | Starting trim operation");

            // Get messages if not provided
            if (!messages) {
                messages = game.messages.contents;
            }

            console.log(`Chat Trimmer | Processing ${messages.length} messages`);

            if (messages.length === 0) {
                console.log("Chat Trimmer | No messages to trim");
                ui.notifications.warn(
                    game.i18n.localize("CHATTRIMMER.Notifications.NoMessages"),
                );
                return null;
            }

            // Show progress notification
            ui.notifications.info(
                game.i18n.localize("CHATTRIMMER.Notifications.TrimmingStart"),
            );

            // 1. Classify messages by type
            const classified = this.classifyMessages(messages);
            console.log("Chat Trimmer | Classification results:", {
                combat: classified.combat.length,
                dialogue: classified.dialogue.length,
                rolls: classified.rolls.length,
                items: classified.items.length,
                system: classified.system.length,
                ooc: classified.ooc.length,
                critical: classified.critical.length,
            });

            // 2. Run pattern detection algorithms
            const detected = {
                combats: [],
            };

            // Run combat detection if enabled
            const enableCombat = game.settings.get(
                "chat-trimmer",
                "enableCombatCompression",
            );
            console.log(`Chat Trimmer | Combat compression enabled: ${enableCombat}`);
            if (enableCombat && classified.combat.length > 0) {
                console.log(
                    `Chat Trimmer | Running combat detection on ${classified.combat.length} messages`,
                );
                detected.combats = await this.algorithms.combat.detect(
                    classified.combat,
                );
                console.log(
                    `Chat Trimmer | Detected ${detected.combats.length} combat encounters`,
                );
            }

            // 3. Create compressed entries
            const entries = this.createArchiveEntries(detected, classified);
            console.log(`Chat Trimmer | Created ${entries.length} archive entries`);
            console.log(
                "Chat Trimmer | Entry types:",
                entries.map((e) => e.type),
            );

            // 4. Build search index
            const searchIndex = KeywordExtractor.buildSearchIndex(entries);
            console.log(
                "Chat Trimmer | Built search index with keywords:",
                searchIndex.keywords.length,
            );

            // 5. Generate statistics
            const stats = this.calculateStatistics(entries, detected);
            console.log("Chat Trimmer | Statistics:", stats);

            // 6. Create archive document
            console.log("Chat Trimmer | Creating archive document...");
            const archive = await this.archiveManager.create({
                entries,
                searchIndex,
                stats,
                originalMessageCount: messages.length,
                compressedEntryCount: entries.length,
            });
            console.log(
                `Chat Trimmer | Archive created: ${archive.name} (ID: ${archive.id})`,
            );

            // 7. Delete original messages (unless keeping originals)
            if (!options.keepOriginals) {
                const messageIds = messages.map((m) => m.id);
                await ChatMessage.deleteDocuments(messageIds);
            }

            // 8. Show completion notification
            const compressionRatio = Math.round(
                ((messages.length - entries.length) / messages.length) * 100,
            );

            ui.notifications.info(
                game.i18n.format("CHATTRIMMER.Notifications.TrimmingComplete", {
                    original: messages.length,
                    compressed: entries.length,
                    ratio: compressionRatio,
                }),
            );

            return {
                archive,
                stats,
                compressionRatio,
            };
        } catch (error) {
            console.error("Chat Trimmer Error:", error);
            ui.notifications.error(
                "An error occurred while trimming chat. Check console for details.",
            );
            return null;
        }
    }

    /**
     * Classify messages by type and importance
     */
    classifyMessages(messages) {
        console.log(`Chat Trimmer | Classifying ${messages.length} messages...`);
        const classified = {
            combat: [],
            dialogue: [],
            rolls: [],
            items: [],
            system: [],
            ooc: [],
            critical: [],
            all: [], // Ensure we capture ALL messages
        };

        for (const msg of messages) {
            // Always add to 'all' category to ensure nothing is lost
            classified.all.push(msg);

            // Check message content and flags
            if (this.isCombatMessage(msg)) {
                classified.combat.push(msg);
            }

            if (this.isDialogueMessage(msg)) {
                classified.dialogue.push(msg);
            }

            if (this.isRollMessage(msg)) {
                classified.rolls.push(msg);
            }

            if (this.isItemMessage(msg)) {
                classified.items.push(msg);
            }

            if (this.isSystemMessage(msg)) {
                classified.system.push(msg);
            }

            if (this.isOOCMessage(msg)) {
                classified.ooc.push(msg);
            }

            // Check if critical (always preserve)
            if (this.isCriticalMessage(msg)) {
                classified.critical.push(msg);
            }
        }

        return classified;
    }

    /**
     * Check if message is combat-related
     */
    isCombatMessage(msg) {
        const content = msg.content.toLowerCase();
        return (
            msg.flags?.core?.initiativeRoll ||
            content.includes("attack") ||
            content.includes("damage") ||
            content.includes("saving throw") ||
            content.includes("combat") ||
            content.includes("initiative")
        );
    }

    /**
     * Check if message is in-character dialogue
     */
    isDialogueMessage(msg) {
        // Use CHAT_MESSAGE_STYLES (v12+) or fall back to old TYPES
        const styles = CONST.CHAT_MESSAGE_STYLES || CONST.CHAT_MESSAGE_TYPES;
        const style = msg.style ?? msg.type;
        return style === styles.IC || style === styles.EMOTE;
    }

    /**
     * Check if message contains a dice roll
     */
    isRollMessage(msg) {
        return MessageParser.isRoll(msg);
    }

    /**
     * Check if message is about item transfers
     */
    isItemMessage(msg) {
        const content = msg.content.toLowerCase();
        return (
            content.includes("receives") ||
            content.includes("gives") ||
            content.includes("takes") ||
            content.includes("gold") ||
            content.includes("item")
        );
    }

    /**
     * Check if message is a system message
     */
    isSystemMessage(msg) {
        // Use CHAT_MESSAGE_STYLES (v12+) or fall back to old TYPES
        const styles = CONST.CHAT_MESSAGE_STYLES || CONST.CHAT_MESSAGE_TYPES;
        const style = msg.style ?? msg.type;
        return style === styles.OTHER;
    }

    /**
     * Check if message is OOC
     */
    isOOCMessage(msg) {
        // Use CHAT_MESSAGE_STYLES (v12+) or fall back to old TYPES
        const styles = CONST.CHAT_MESSAGE_STYLES || CONST.CHAT_MESSAGE_TYPES;
        const style = msg.style ?? msg.type;
        return style === styles.OOC;
    }

    /**
     * Check if message should always be preserved
     */
    isCriticalMessage(msg) {
        const content = msg.content.toLowerCase();
        return (
            content.includes("critical hit") ||
            content.includes("critical miss") ||
            content.includes("death save") ||
            content.includes("level up") ||
            content.includes("xp") ||
            content.includes("dies") ||
            content.includes("unconscious")
        );
    }

    /**
     * Create archive entries from detected patterns
     */
    createArchiveEntries(detected, classified) {
        const entries = [];
        const processedMessageIds = new Set();

        // Add combat summaries
        for (const combat of detected.combats) {
            entries.push({
                id: foundry.utils.randomID(),
                type: "combat",
                category: "combat",
                icon: "⚔️",
                timestamp: combat.startTime,
                summary: combat,
                displayText: this.formatCombatDisplay(combat),
                displaySummary: this.formatCombatDisplay(combat),
                content: this.formatCombatDisplay(combat),
                searchKeywords: KeywordExtractor.extractFromData(combat),
                originalMessageIds: combat.originalMessageIds,
            });

            // Mark messages as processed
            combat.originalMessageIds.forEach((id) => processedMessageIds.add(id));
        }

        // Add critical messages individually (not compressed)
        for (const msg of classified.critical) {
            if (!processedMessageIds.has(msg.id)) {
                const category = this.determineMessageCategory(msg);
                const displayText = this.formatIndividualDisplay(msg);
                const icon = displayText.match(/^([\u{1F300}-\u{1F9FF}])/u)?.[1] || "📝";
                
                entries.push({
                    id: foundry.utils.randomID(),
                    type: "individual",
                    category: category,
                    icon: icon,
                    timestamp: msg.timestamp,
                    originalMessage: msg.toObject(),
                    displayText: displayText,
                    displaySummary: displayText,
                    content: msg.content,
                    searchKeywords: MessageParser.extractKeywords(msg.content),
                    originalMessageIds: [msg.id],
                });

                processedMessageIds.add(msg.id);
            }
        }

        // Add remaining unprocessed messages as individual entries
        // This ensures no data is lost - everything gets archived

        // Use the 'all' category which contains every message
        const allMessages = classified.all || [];

        console.log(
            `Chat Trimmer | Processing ${allMessages.length} total classified messages`,
        );
        console.log(
            `Chat Trimmer | Already processed: ${processedMessageIds.size} messages`,
        );

        // Add all unprocessed messages
        for (const msg of allMessages) {
            if (!processedMessageIds.has(msg.id)) {
                const category = this.determineMessageCategory(msg);
                const displayText = this.formatIndividualDisplay(msg);
                const icon = displayText.match(/^([\u{1F300}-\u{1F9FF}])/u)?.[1] || "📝";
                
                entries.push({
                    id: foundry.utils.randomID(),
                    type: "individual",
                    category: category,
                    icon: icon,
                    timestamp: msg.timestamp,
                    originalMessage: msg.toObject(),
                    displayText: displayText,
                    displaySummary: displayText,
                    content: msg.content,
                    searchKeywords: MessageParser.extractKeywords(msg.content),
                    originalMessageIds: [msg.id],
                });

                processedMessageIds.add(msg.id);
            }
        }

        console.log(
            `Chat Trimmer | Total entries after adding unprocessed: ${entries.length}`,
        );

        // Sort by timestamp
        entries.sort((a, b) => a.timestamp - b.timestamp);

        return entries;
    }

    /**
     * Format combat for display
     */
    formatCombatDisplay(combat) {
        const icon = "⚔️";
        const title =
            combat.title || game.i18n.localize("CHATTRIMMER.Combat.Title");
        const rounds = combat.rounds?.length || combat.duration;
        const outcome = game.i18n.localize(`CHATTRIMMER.Combat.${combat.outcome}`);

        return `${icon} ${title} (${rounds} ${game.i18n.localize("CHATTRIMMER.Combat.Rounds")}, ${outcome})`;
    }

    /**
     * Format individual message for display
     */
    formatIndividualDisplay(msg) {
        // Check if it's a roll message
        if (MessageParser.isRoll(msg)) {
            const rollSummary = MessageParser.createRollSummary(msg);
            return `🎲 ${rollSummary}`;
        }

        // Check if it's in-character dialogue
        const styles = CONST.CHAT_MESSAGE_STYLES || CONST.CHAT_MESSAGE_TYPES;
        const style = msg.style ?? msg.type;
        if (style === styles.IC) {
            const actor = MessageParser.extractActorName(msg);
            const content = MessageParser.stripHTML(msg.content);
            const preview =
                content.substring(0, 80) + (content.length > 80 ? "..." : "");
            return `💬 ${actor ? actor + ": " : ""}${preview}`;
        }

        // Check if it's an emote
        if (style === styles.EMOTE) {
            const content = MessageParser.stripHTML(msg.content);
            const preview =
                content.substring(0, 80) + (content.length > 80 ? "..." : "");
            return `✨ ${preview}`;
        }

        // Check if it's OOC
        if (style === styles.OOC) {
            const content = MessageParser.stripHTML(msg.content);
            const preview =
                content.substring(0, 80) + (content.length > 80 ? "..." : "");
            return `💭 ${preview}`;
        }

        // Default: system message or other
        const content = MessageParser.stripHTML(msg.content);
        const preview =
            content.substring(0, 80) + (content.length > 80 ? "..." : "");

        // Try to add a relevant icon
        let icon = "📝";
        if (content.toLowerCase().includes("damage")) icon = "⚔️";
        else if (content.toLowerCase().includes("heal")) icon = "❤️";
        else if (
            content.toLowerCase().includes("item") ||
            content.toLowerCase().includes("gold")
        )
            icon = "📦";
        else if (
            content.toLowerCase().includes("xp") ||
            content.toLowerCase().includes("level")
        )
            icon = "⭐";

        return `${icon} ${preview}`;
    }

    /**
     * Determine category for a message
     */
    determineMessageCategory(msg) {
        // Check if it's a roll
        if (MessageParser.isRoll(msg)) {
            return "rolls";
        }

        // Check message style/type
        const styles = CONST.CHAT_MESSAGE_STYLES || CONST.CHAT_MESSAGE_TYPES;
        const style = msg.style ?? msg.type;
        
        if (style === styles.IC) {
            return "speech";
        }
        
        if (style === styles.EMOTE) {
            return "emotes";
        }
        
        if (style === styles.WHISPER) {
            return "whispers";
        }

        // Check content for specific keywords
        const content = MessageParser.stripHTML(msg.content).toLowerCase();
        
        if (content.includes("heal")) {
            return "healing";
        }
        
        if (content.includes("item") || content.includes("gold") || content.includes("loot")) {
            return "items";
        }
        
        if (content.includes("xp") || content.includes("level") || content.includes("important")) {
            return "important";
        }

        // Default category
        return "all";
    }

    /**
     * Calculate statistics
     */
    calculateStatistics(entries, detected) {
        const stats = {
            totalCombats: detected.combats.length,
            totalDialogues: 0,
            totalSkillChecks: 0,
            totalRolls: 0,
            criticalHits: 0,
            criticalFails: 0,
            itemsTransferred: 0,
            xpAwarded: 0,
        };

        // Count from combat summaries
        for (const combat of detected.combats) {
            if (combat.rounds) {
                combat.rounds.forEach((round) => {
                    stats.totalRolls += round.actions.length;
                    round.actions.forEach((action) => {
                        if (action.critical) stats.criticalHits++;
                        if (action.fumble) stats.criticalFails++;
                    });
                });
            }
        }

        return stats;
    }
}
