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
        this._isTrimming = false; // Lock to prevent concurrent trim operations
    }

    /**
     * Main trim operation
     * @param {Array} messages - Messages to trim (optional, defaults to all chat messages)
     * @param {Object} options - Trim options
     * @returns {Object} Archive summary
     */
    async trim(messages = null, options = {}) {
        // Prevent concurrent trim operations (race condition protection)
        if (this._isTrimming) {
            console.log("Chat Trimmer | Trim already in progress, skipping");
            return null;
        }

        try {
            this._isTrimming = true;
            console.log("Chat Trimmer | Starting trim operation");

            // Get messages if not provided
            if (!messages) {
                // Get all messages, sorted by timestamp to ensure correct ordering
                messages = [...game.messages.contents].sort(
                    (a, b) => a.timestamp - b.timestamp,
                );
            }

            // Apply "Messages to Keep" logic (unless ignored or overridden)
            const keepCount = game.settings.get("chat-trimmer", "messagesToKeep");
            if (!options.ignoreKeep && keepCount > 0) {
                if (messages.length <= keepCount) {
                    console.log(
                        `Chat Trimmer | Message count (${messages.length}) is within 'Keep' limit (${keepCount}). Skipping trim.`,
                    );
                    return null;
                }

                const toKeepCount = keepCount;
                const toTrimCount = messages.length - keepCount;

                console.log(
                    `Chat Trimmer | Preserving ${toKeepCount} recent messages, trimming ${toTrimCount} older messages`,
                );

                // Keep the last 'keepCount' messages (do not process or delete them)
                messages = messages.slice(0, messages.length - keepCount);
            }

            console.log(`Chat Trimmer | Processing ${messages.length} messages`);

            if (messages.length === 0) {
                console.log("Chat Trimmer | No messages to trim");
                ui.notifications.warn(
                    game.i18n.localize("CHATTRIMMER.Notifications.NoMessages"),
                );
                return null;
            }

            // Check if archiving is enabled
            const enableArchiving = game.settings.get("chat-trimmer", "enableArchiving");
            console.log(`Chat Trimmer | Archiving enabled: ${enableArchiving}`);

            // If archiving is disabled, just delete messages and return
            if (!enableArchiving) {
                console.log("Chat Trimmer | Archiving disabled - deleting messages without archiving");
                const messageIds = messages.map((m) => m.id);
                await ChatMessage.deleteDocuments(messageIds);
                
                ui.notifications.info(
                    game.i18n.format("CHATTRIMMER.Notifications.TrimmingCompleteNoArchive", {
                        original: messages.length,
                    }),
                );
                
                return {
                    archive: null,
                    stats: null,
                    compressionRatio: 0,
                };
            }

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
        } finally {
            this._isTrimming = false; // Always release lock
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

            // Cache toLowerCase() operation once per message for performance
            const contentLower = msg.content.toLowerCase();

            // Check message content and flags
            if (this.isCombatMessage(msg, contentLower)) {
                classified.combat.push(msg);
            }

            if (this.isDialogueMessage(msg)) {
                classified.dialogue.push(msg);
            }

            if (this.isRollMessage(msg)) {
                classified.rolls.push(msg);
            }

            if (this.isItemMessage(msg, contentLower)) {
                classified.items.push(msg);
            }

            if (this.isSystemMessage(msg)) {
                classified.system.push(msg);
            }

            if (this.isOOCMessage(msg)) {
                classified.ooc.push(msg);
            }

            // Check if critical (always preserve)
            if (this.isCriticalMessage(msg, contentLower)) {
                classified.critical.push(msg);
            }
        }

        return classified;
    }

    /**
     * Check if message is combat-related
     * Only considers a message as combat if there's an active encounter
     * @param {Object} msg - The message to check
     * @param {string} [contentLower] - Pre-computed lowercase content for performance
     */
    isCombatMessage(msg, contentLower = null) {
        // Strong indicators from flags (always combat-related)
        if (msg.flags?.core?.initiativeRoll) return true;

        // PF2e specific flags
        const contextType = msg.flags?.pf2e?.context?.type;
        if (
            contextType === "attack-roll" ||
            contextType === "spell-attack-roll" ||
            contextType === "saving-throw" ||
            contextType === "damage-roll"
        ) {
            return true;
        }

        // Check active combat
        const hasActiveCombat =
            game.combat?.active || game.combats?.some((c) => c.active);

        if (!hasActiveCombat) {
            return false;
        }

        // If there is active combat:
        // 1. ANY roll is considered combat-related
        if (MessageParser.isRoll(msg)) {
            return true;
        }

        // 2. Check textual content for combat keywords
        const content = contentLower ?? msg.content.toLowerCase();
        return (
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
     * @param {Object} msg - The message to check
     * @param {string} [contentLower] - Pre-computed lowercase content for performance
     */
    isItemMessage(msg, contentLower = null) {
        const content = contentLower ?? msg.content.toLowerCase();
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
     * @param {Object} msg - The message to check
     * @param {string} [contentLower] - Pre-computed lowercase content for performance
     */
    isCriticalMessage(msg, contentLower = null) {
        const content = contentLower ?? msg.content.toLowerCase();
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
     * Check if message is a key event that should appear in session summary
     * @param {Object} msg - The message to check
     * @param {string} [contentLower] - Pre-computed lowercase content for performance
     * @returns {boolean} True if this is a key event
     */
    isKeyEvent(msg, contentLower = null) {
        const content = contentLower ?? msg.content.toLowerCase();
        const flavor = msg.flavor?.toLowerCase() || "";
        const combined = content + " " + flavor; // Check both content and flavor

        // 1. Critical successes and failures on rolls
        const outcome = msg.flags?.pf2e?.context?.outcome;
        if (outcome === "criticalSuccess" || outcome === "criticalFailure") {
            console.log("Chat Trimmer | Key Event detected (PF2e flag):", {
                outcome,
                speaker: msg.speaker?.alias,
            });
            return true;
        }

        // Check content AND flavor for critical indicators (PF2e stores this in flavor)
        // Also check for PF2e CSS classes in HTML
        if (
            combined.includes("critical success") ||
            combined.includes("critical hit") ||
            combined.includes("critical failure") ||
            combined.includes("critical miss") ||
            combined.includes("fumble") ||
            combined.includes('class="criticalsuccess"') ||
            combined.includes('class="criticalfailure"')
        ) {
            console.log("Chat Trimmer | Key Event detected (critical):", {
                text: combined.substring(0, 100),
                speaker: msg.speaker?.alias,
            });
            return true;
        }

        // 2. Dying, death, unconscious, and wounded conditions
        if (
            combined.includes("dying") ||
            combined.includes("death") ||
            combined.includes("dies") ||
            combined.includes("dead") ||
            combined.includes("unconscious") ||
            combined.includes("knocked out") ||
            combined.includes("wounded")
        ) {
            return true;
        }

        // 3. Death saves (Recovery Checks in PF2e)
        if (
            combined.includes("death save") ||
            combined.includes("recovery check") ||
            combined.includes("stabilize")
        ) {
            return true;
        }

        // 4. Hero Point usage
        if (
            combined.includes("hero point") ||
            combined.includes("hero points") ||
            msg.flags?.pf2e?.context?.heroPoints
        ) {
            return true;
        }

        // 5. High-level spells (4th level and above)
        if (msg.flags?.pf2e?.origin?.type === "spell") {
            const spellLevel = msg.flags.pf2e.origin.item?.level;
            if (spellLevel && spellLevel >= 4) {
                return true;
            }
        }

        // Also check content+flavor for high-level spell indicators
        const spellLevelMatch = combined.match(/\b(\d+)(?:st|nd|rd|th)[-\s]?level spell/i);
        if (spellLevelMatch && parseInt(spellLevelMatch[1]) >= 4) {
            return true;
        }

        // 6. XP gains and level ups
        if (
            combined.includes("xp") ||
            combined.includes("experience") ||
            combined.includes("level up") ||
            combined.includes("gained a level") ||
            combined.includes("leveled up")
        ) {
            return true;
        }

        // 7. Major item transfers and loot
        // Check for significant gold amounts (100+) or notable item keywords
        const goldMatch = combined.match(/(\d+)\s*(?:gold|gp|pp|platinum)/i);
        if (goldMatch && parseInt(goldMatch[1]) >= 100) {
            return true;
        }

        if (
            combined.includes("treasure") ||
            combined.includes("loot") ||
            combined.includes("artifact") ||
            combined.includes("relic") ||
            combined.includes("legendary") ||
            combined.includes("unique item")
        ) {
            return true;
        }

        // 8. Persistent damage and debilitating conditions
        if (
            combined.includes("persistent damage") ||
            combined.includes("persistent bleed") ||
            combined.includes("persistent fire") ||
            combined.includes("persistent acid") ||
            combined.includes("persistent poison") ||
            combined.includes("doomed") ||
            combined.includes("drained") ||
            combined.includes("enfeebled") ||
            combined.includes("clumsy") ||
            combined.includes("stupefied") ||
            combined.includes("slowed") ||
            combined.includes("stunned") ||
            combined.includes("paralyzed") ||
            combined.includes("petrified") ||
            combined.includes("confused")
        ) {
            console.log("Chat Trimmer | Key Event detected (condition):", {
                text: combined.substring(0, 100),
                speaker: msg.speaker?.alias,
            });
            return true;
        }

        // Debug: Log when no key event is detected for critical-looking messages
        if (combined.includes("critical") || combined.includes("success")) {
            console.log("Chat Trimmer | NOT a key event (debug):", {
                text: combined.substring(0, 200),
                outcome: msg.flags?.pf2e?.context?.outcome,
                speaker: msg.speaker?.alias,
            });
        }

        return false;
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
                speaker: "Combat",
                summary: combat,
                displayText: this.formatCombatDisplay(combat),
                displaySummary: this.formatCombatDisplay(combat),
                content: this.formatCombatDisplay(combat),
                searchKeywords: KeywordExtractor.extractFromData(combat),
                originalMessageIds: combat.originalMessageIds,
                isKeyEvent: true, // Combat encounters are always key events
            });

            // Mark messages as processed
            combat.originalMessageIds.forEach((id) => processedMessageIds.add(id));
        }

        // Add critical messages individually (not compressed)
        for (const msg of classified.critical) {
            if (!processedMessageIds.has(msg.id)) {
                const contentLower = msg.content.toLowerCase();
                const category = this.determineMessageCategory(msg);
                const displayText = this.formatIndividualDisplay(msg);
                const icon =
                    displayText.match(/^([\u{1F300}-\u{1F9FF}])/u)?.[1] || "📝";
                const speaker = MessageParser.extractActorName(msg) || "Unknown";
                const rollData = this.extractRollData(msg);

                entries.push({
                    id: foundry.utils.randomID(),
                    type: "individual",
                    category: category,
                    icon: icon,
                    timestamp: msg.timestamp,
                    speaker: speaker,
                    originalMessage: msg.toObject(),
                    displayText: displayText,
                    displaySummary: displayText,
                    content: this.sanitizeContent(msg.content),
                    rollData: rollData,
                    searchKeywords: MessageParser.extractKeywords(msg.content),
                    originalMessageIds: [msg.id],
                    isKeyEvent: this.isKeyEvent(msg, contentLower),
                });

                processedMessageIds.add(msg.id);
            }
        }

        // Get remaining unprocessed messages
        const allMessages = classified.all || [];
        const unprocessedMessages = allMessages.filter(
            (msg) => !processedMessageIds.has(msg.id),
        );

        console.log(
            `Chat Trimmer | Processing ${allMessages.length} total classified messages`,
        );
        console.log(
            `Chat Trimmer | Already processed: ${processedMessageIds.size} messages`,
        );
        console.log(
            `Chat Trimmer | Unprocessed messages to add: ${unprocessedMessages.length}`,
        );

        // Add all unprocessed messages individually to preserve chronological order
        for (const msg of unprocessedMessages) {
            const contentLower = msg.content.toLowerCase();
            const categories = this.determineMessageCategories(msg);
            const category = categories[0]; // Primary category for backward compatibility
            const displayText = this.formatIndividualDisplay(msg);
            const icon = displayText.match(/^([\u{1F300}-\u{1F9FF}])/u)?.[1] || "📝";
            const speaker = MessageParser.extractActorName(msg) || "Unknown";
            const rollData = this.extractRollData(msg);

            entries.push({
                id: foundry.utils.randomID(),
                type: "individual",
                category: category, // Primary category (for backward compatibility)
                categories: categories, // All applicable categories
                icon: icon,
                timestamp: msg.timestamp,
                speaker: speaker,
                originalMessage: msg.toObject(),
                displayText: displayText,
                displaySummary: displayText,
                content: this.sanitizeContent(msg.content),
                rollData: rollData,
                searchKeywords: MessageParser.extractKeywords(msg.content),
                originalMessageIds: [msg.id],
                isKeyEvent: this.isKeyEvent(msg, contentLower),
            });

            processedMessageIds.add(msg.id);
        }

        console.log(`Chat Trimmer | Total entries created: ${entries.length}`);

        // Sort by timestamp
        entries.sort((a, b) => a.timestamp - b.timestamp);

        return entries;
    }

    /**
     * Create an individual entry from a message
     */
    createIndividualEntry(msg) {
        const contentLower = msg.content.toLowerCase();
        const categories = this.determineMessageCategories(msg);
        const category = categories[0]; // Primary category for backward compatibility
        const displayText = this.formatIndividualDisplay(msg);
        const icon = displayText.match(/^([\u{1F300}-\u{1F9FF}])/u)?.[1] || "📝";
        const speaker = MessageParser.extractActorName(msg) || "Unknown";
        const rollData = this.extractRollData(msg);

        return {
            id: foundry.utils.randomID(),
            type: "individual",
            category: category, // Primary category (for backward compatibility)
            categories: categories, // All applicable categories
            icon: icon,
            timestamp: msg.timestamp,
            speaker: speaker,
            originalMessage: msg.toObject(),
            displayText: displayText,
            displaySummary: displayText,
            content: this.sanitizeContent(msg.content),
            rollData: rollData,
            searchKeywords: MessageParser.extractKeywords(msg.content),
            originalMessageIds: [msg.id],
            isKeyEvent: this.isKeyEvent(msg, contentLower),
        };
    }

    /**
     * Extract roll data from message for recreation
     * @param {ChatMessage} msg - The chat message
     * @returns {Object|null} Roll data including formulas and labels
     */
    extractRollData(msg) {
        const rollData = {
            rolls: [],
            damageButtons: [],
            flags: msg.flags || {},
        };

        // Extract roll formulas from the message rolls
        if (msg.rolls && msg.rolls.length > 0) {
            for (const roll of msg.rolls) {
                // Clean up formula - remove damage type labels (e.g., "1d4 + 1 force" -> "1d4 + 1")
                let formula = roll.formula;

                // Common PF2e damage types that appear after the formula
                const damageTypes =
                    /\s+(acid|bludgeoning|cold|electricity|fire|force|mental|negative|piercing|poison|positive|slashing|sonic|untyped|lawful|chaotic|good|evil|precision|persistent)$/i;
                formula = formula.replace(damageTypes, "");

                rollData.rolls.push({
                    formula: formula,
                    flavor: roll.options?.flavor || "",
                    type: roll.options?.type || "roll",
                });
            }
        }

        // Try to extract damage roll buttons from HTML content
        if (msg.content) {
            const temp = document.createElement("div");
            temp.innerHTML = msg.content;

            // Check for PF2e action buttons (spells, strikes, etc.)
            const pf2eActionButtons = temp.querySelectorAll(
                'button[data-action="spell-damage"], button[data-action="strike-damage"], button[data-action="strike-attack"], button[data-action="strike-critical"], button[data-action="damage"], button[data-action="critical"], button[data-action="target-applyDamage"], button[data-action="target-shieldBlock"], button[data-action="apply-damage"], button[data-action="shield-block"], button[data-action="expand-damage-context"]',
            );
            if (pf2eActionButtons.length > 0) {
                console.log(
                    `Chat Trimmer | Found ${pf2eActionButtons.length} PF2e action buttons`,
                );

                // For PF2e, we need to store references to recreate the action
                if (msg.flags?.pf2e?.origin) {
                    const origin = msg.flags.pf2e.origin;

                    pf2eActionButtons.forEach((btn) => {
                        const label = btn.textContent?.trim() || "Roll";
                        const actionType = btn.dataset.action;

                        // Store PF2e-specific data for recreation
                        rollData.damageButtons.push({
                            label,
                            type: "pf2e-action",
                            action: actionType,
                            actorUuid: origin.actor || `Actor.${msg.speaker?.actor}`,
                            itemUuid: origin.uuid,
                            // Store dataset attributes like index, variant, etc.
                            dataset: { ...btn.dataset },
                            // Keep full origin data
                            pf2eOrigin: origin,
                        });

                        console.log(
                            `Chat Trimmer | Stored PF2e action button: ${label} (${actionType})`,
                        );
                    });
                } else {
                    console.log(`Chat Trimmer | No PF2e origin data found in flags`);
                }
            }

            // If no PF2e buttons or no formulas found, try generic button extraction
            if (rollData.damageButtons.length === 0) {
                // Look for various button patterns used by different systems
                const buttonSelectors = [
                    'button[data-action="damage"]',
                    'button[data-action="roll-damage"]',
                    "button.damage-roll",
                    "button.roll-damage",
                ];

                // Try each selector
                for (const selector of buttonSelectors) {
                    let buttons;
                    try {
                        buttons = temp.querySelectorAll(selector);
                    } catch (e) {
                        continue;
                    }

                    buttons.forEach((btn) => {
                        // Try multiple attributes where formula might be stored
                        const formula =
                            btn.dataset.formula ||
                            btn.getAttribute("data-formula") ||
                            btn.dataset.damageFormula ||
                            btn.getAttribute("data-damage-formula");

                        let label = btn.textContent?.trim() || "Roll Damage";

                        // Clean up label (remove extra whitespace and icons)
                        label = label.replace(/\s+/g, " ").trim();

                        if (formula) {
                            rollData.damageButtons.push({ formula, label });
                            console.log(
                                `Chat Trimmer | Extracted damage button: ${label} = ${formula}`,
                            );
                        }
                    });

                    if (rollData.damageButtons.length > 0) break;
                }
            }
        }

        const hasData =
            rollData.rolls.length > 0 || rollData.damageButtons.length > 0;

        if (hasData) {
            console.log(
                `Chat Trimmer | Roll data for message: ${rollData.rolls.length} rolls, ${rollData.damageButtons.length} damage buttons`,
            );
        }

        return hasData ? rollData : null;
    }

    /**
     * Sanitize HTML content for archive storage
     * Removes interactive buttons and scripts that won't function in the archive
     */
    sanitizeContent(html) {
        if (!html) return "";

        // Create a temporary div to parse HTML
        const temp = document.createElement("div");
        temp.innerHTML = html;

        // Remove buttons and scripts, clean attributes - single DOM traversal for performance
        temp.querySelectorAll("button, script").forEach((el) => el.remove());

        // Remove inline event handlers and data-action attributes
        temp
            .querySelectorAll("[onclick], [onload], [onerror], [data-action]")
            .forEach((el) => {
                el.removeAttribute("onclick");
                el.removeAttribute("onload");
                el.removeAttribute("onerror");
                el.removeAttribute("data-action");
            });

        return temp.innerHTML;
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
        // Extract target information from various sources
        const targetName = this.extractTargetName(msg);
        const targetSuffix = targetName ? ` → ${targetName}` : "";

        // Check for PF2e strike/attack rolls first
        if (
            msg.flags?.pf2e?.context?.type === "attack-roll" ||
            msg.flags?.pf2e?.context?.type === "strike"
        ) {
            const origin = msg.flags.pf2e.origin;
            const outcome = msg.flags.pf2e.context?.outcome;

            // Extract weapon/action name
            let actionName = origin?.item?.name || "Strike";

            // Extract outcome (hit/miss/crit)
            let outcomeText = "";
            if (outcome === "criticalSuccess") {
                outcomeText = " [Critical Hit!]";
            } else if (outcome === "success") {
                outcomeText = " [Hit]";
            } else if (outcome === "failure") {
                outcomeText = " [Miss]";
            } else if (outcome === "criticalFailure") {
                outcomeText = " [Critical Miss]";
            }

            // Get roll total
            let rollTotal = "";
            if (msg.rolls && msg.rolls.length > 0) {
                rollTotal = ` (${msg.rolls[0].total})`;
            }

            return `⚔️ ${actionName}${targetSuffix}${outcomeText}${rollTotal}`;
        }

        // Check for PF2e damage rolls
        if (msg.flags?.pf2e?.context?.type === "damage-roll") {
            const origin = msg.flags.pf2e.origin;
            let actionName = origin?.item?.name || "Damage";
            const outcome = msg.flags.pf2e.context?.outcome;
            const isCritical = outcome === "criticalSuccess";

            let rollTotal = "";
            if (msg.rolls && msg.rolls.length > 0) {
                rollTotal = ` (${msg.rolls[0].total})`;
            }

            // Construct label: [Item Name] [Critical] Damage
            let labelParts = [];

            // Add Item Name if it's not just "Damage"
            if (actionName.toLowerCase() !== "damage") {
                labelParts.push(actionName);
            }

            // Add Critical/Damage suffix
            if (isCritical) {
                labelParts.push("Critical Damage");
            } else {
                labelParts.push("Damage");
            }

            const label = labelParts.join(" ");

            return `⚔️ ${label}${targetSuffix}${rollTotal}`;
        }

        // Check for PF2e spell casts
        if (msg.flags?.pf2e?.origin?.type === "spell") {
            const spellName = msg.flags.pf2e.origin.item?.name || "Spell";
            return `✨ ${spellName}${targetSuffix}`;
        }

        // Check if it's a roll message
        if (MessageParser.isRoll(msg)) {
            const rollSummary = MessageParser.createRollSummary(msg);
            return `🎲 ${rollSummary}${targetSuffix}`;
        }

        // Check if it's in-character dialogue
        const styles = CONST.CHAT_MESSAGE_STYLES || CONST.CHAT_MESSAGE_TYPES;
        const style = msg.style ?? msg.type;
        if (style === styles.IC) {
            const content = MessageParser.stripHTML(msg.content);
            const preview =
                content.substring(0, 80) + (content.length > 80 ? "..." : "");
            return `💬 ${preview}`;
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
     * Extract target name from message
     * @param {ChatMessage} msg - The chat message
     * @returns {string|null} Target name or null
     */
    extractTargetName(msg) {
        // Check PF2e context for target
        if (msg.flags?.pf2e?.context?.target) {
            const targetCtx = msg.flags.pf2e.context.target;

            // 1. Try resolving Token name (most specific,handles aliasing)
            if (targetCtx.token) {
                // If it's a full UUID
                if (targetCtx.token.startsWith("Scene.")) {
                    // Try sync lookup from canvas if current scene
                    const parts = targetCtx.token.split(".");
                    if (parts[1] === canvas.scene?.id) {
                        const token = canvas.tokens.get(parts[3]);
                        if (token) return token.name;
                    }
                    // If we have FromUuidSync (v11+)
                    if (typeof fromUuidSync === "function") {
                        try {
                            const doc = fromUuidSync(targetCtx.token);
                            if (doc) return doc.name;
                        } catch (e) { }
                    }
                } else {
                    // It might be just an ID on the current canvas
                    const token = canvas.tokens.get(targetCtx.token);
                    if (token) return token.name;
                }
            }

            // 2. Try resolving Actor name
            if (targetCtx.actor) {
                // Handle "Actor.ID" format
                const actorId = targetCtx.actor.replace("Actor.", "");
                const actor = game.actors.get(actorId);
                if (actor) return actor.name;

                // Try finding a token for this actor on canvas as backup
                const token = canvas.tokens.placeables.find(
                    (t) => t.actor?.id === actorId,
                );
                if (token) return token.name;
            }

            // If we have an actor ID but couldn't resolve it, we might return the ID as a last resort
            // But prefer null so regex fallback can try finding a name in text
            if (targetCtx.actor) {
                // return targetCtx.actor; // Commented out to allow fallbacks
            }
        }

        // Check if target is in the content HTML (common pattern)
        if (msg.content) {
            // Look for "Target: ActorName" pattern
            const targetMatch = msg.content.match(/Target:\s*([^<\n]+)/i);
            if (targetMatch) {
                return targetMatch[1].trim();
            }

            // Look for "vs ActorName" pattern
            const vsMatch = msg.content.match(
                /\bvs\.?\s+([A-Z][a-zA-Z\s]+?)(?:\s*\(|<|$)/,
            );
            if (vsMatch) {
                return vsMatch[1].trim();
            }
        }

        // Check flavor text
        if (msg.flavor) {
            const targetMatch = msg.flavor.match(/Target:\s*([^<\n]+)/i);
            if (targetMatch) {
                return targetMatch[1].trim();
            }
        }

        return null;
    }

    /**
     * Determine category for a message
     */
    /**
     * Determine all applicable categories for a message
     * Messages can belong to multiple categories (e.g., a combat roll is both "combat" and "rolls")
     * @param {Object} msg - The message to categorize
     * @returns {Array<string>} Array of category strings
     */
    determineMessageCategories(msg) {
        const categories = [];

        // Check if it's a roll first
        if (MessageParser.isRoll(msg)) {
            categories.push("rolls");
        }

        // Check if there's an active combat encounter
        const hasActiveCombat =
            game.combat?.active || game.combats?.some((c) => c.active);

        // If combat is active, add combat category to combat-related messages
        if (hasActiveCombat) {
            // Check for PF2e combat flags
            const contextType = msg.flags?.pf2e?.context?.type;
            if (
                contextType === "attack-roll" ||
                contextType === "spell-attack-roll" ||
                contextType === "saving-throw" ||
                contextType === "damage-roll"
            ) {
                if (!categories.includes("combat")) {
                    categories.push("combat");
                }
            }
            // Check for initiative or other combat indicators
            else if (msg.flags?.core?.initiativeRoll) {
                if (!categories.includes("combat")) {
                    categories.push("combat");
                }
            }
            // Check content for combat keywords
            else if (MessageParser.isRoll(msg)) {
                const contentLower = msg.content.toLowerCase();
                if (
                    contentLower.includes("attack") ||
                    contentLower.includes("damage") ||
                    contentLower.includes("saving throw") ||
                    contentLower.includes("combat")
                ) {
                    if (!categories.includes("combat")) {
                        categories.push("combat");
                    }
                }
            }
        }

        // Check for whispers
        if (msg.whisper && msg.whisper.length > 0) {
            categories.push("whispers");
        }

        // Check message style/type
        const styles = CONST.CHAT_MESSAGE_STYLES || CONST.CHAT_MESSAGE_TYPES;
        const style = msg.style ?? msg.type;

        if (style === styles.IC) {
            categories.push("speech");
        }

        if (style === styles.EMOTE) {
            categories.push("emotes");
        }

        // Check content for specific keywords
        const content = MessageParser.stripHTML(msg.content).toLowerCase();

        if (content.includes("heal")) {
            categories.push("healing");
        }

        if (
            content.includes("item") ||
            content.includes("gold") ||
            content.includes("loot")
        ) {
            categories.push("items");
        }

        if (
            content.includes("xp") ||
            content.includes("level") ||
            content.includes("important")
        ) {
            categories.push("important");
        }

        // If no categories matched, default to "all"
        if (categories.length === 0) {
            categories.push("all");
        }

        return categories;
    }

    /**
     * Determine primary category for a message (for backward compatibility and icon selection)
     * @param {Object} msg - The message to categorize
     * @returns {string} Primary category string
     */
    determineMessageCategory(msg) {
        // Get all categories and return the first (primary) one
        const categories = this.determineMessageCategories(msg);
        return categories[0];
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
            criticalSuccesses: 0,
            criticalFails: 0,
            itemsTransferred: 0,
            xpAwarded: 0,
        };

        // Count from all entries to capture critical successes/failures on all roll types
        for (const entry of entries) {
            // Count rolls from entries
            if (entry.originalMessage && MessageParser.isRoll(entry.originalMessage)) {
                stats.totalRolls++;

                // Check for critical success/failure in PF2e flags first (most reliable)
                const outcome = entry.originalMessage.flags?.pf2e?.context?.outcome;

                console.log("Chat Trimmer | Stats: Checking roll message:", {
                    speaker: entry.speaker,
                    outcome: outcome,
                    hasFlags: !!entry.originalMessage.flags?.pf2e,
                    content: entry.originalMessage.content.substring(0, 50),
                    flavor: entry.originalMessage.flavor ? entry.originalMessage.flavor.substring(0, 50) : "no flavor"
                });

                if (outcome === "criticalSuccess") {
                    stats.criticalSuccesses++;
                    console.log("Chat Trimmer | Stats: Critical success found (PF2e flag)!");
                } else if (outcome === "criticalFailure") {
                    stats.criticalFails++;
                    console.log("Chat Trimmer | Stats: Critical failure found (PF2e flag)!");
                } else {
                    // Fallback: Check content AND flavor for critical indicators
                    // (PF2e stores critical text in flavor field, not content)
                    const content = entry.originalMessage.content.toLowerCase();
                    const flavor = entry.originalMessage.flavor?.toLowerCase() || "";
                    const combined = content + " " + flavor;

                    if (
                        combined.includes("critical success") ||
                        combined.includes("critical hit") ||
                        combined.includes('class="criticalsuccess"')
                    ) {
                        stats.criticalSuccesses++;
                        console.log("Chat Trimmer | Stats: Critical success found (content/flavor check)!", {
                            hasCriticalSuccess: combined.includes("critical success"),
                            hasCriticalHit: combined.includes("critical hit"),
                            hasClass: combined.includes('class="criticalsuccess"')
                        });
                    } else if (
                        combined.includes("critical failure") ||
                        combined.includes("critical miss") ||
                        combined.includes("fumble") ||
                        combined.includes('class="criticalfailure"')
                    ) {
                        stats.criticalFails++;
                        console.log("Chat Trimmer | Stats: Critical failure found (content/flavor check)!");
                    }
                }
            }
        }

        console.log("Chat Trimmer | Final statistics:", stats);

        return stats;
    }
}
