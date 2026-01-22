/**
 * Archive Viewer Application (V2)
 * Modern Foundry ApplicationV2 implementation
 */
import { MessageViewerDialog } from "./dialogs.js";

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
        this.summaryCollapsed = false; // Track session summary collapsed state
        this.viewMode = "full"; // "summary" or "full"
        this._scrollPosition = null; // Track scroll position for preservation
        this.currentPage = 1; // Current page for pagination
        this.PAGE_SIZE = 100; // Entries per page
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
            toggleSummary: ArchiveViewerV2.prototype.onToggleSummary,
            toggleViewMode: ArchiveViewerV2.prototype.onToggleViewMode,
            viewOriginal: ArchiveViewerV2.prototype.onViewOriginal,
            rollButton: ArchiveViewerV2.prototype.onRollButton,
            deleteCurrentArchive: ArchiveViewerV2.prototype.onDeleteCurrentArchive,
            deleteAllArchives: ArchiveViewerV2.prototype.onDeleteAllArchives,
            nextPage: ArchiveViewerV2.prototype.onNextPage,
            prevPage: ArchiveViewerV2.prototype.onPrevPage,
            firstPage: ArchiveViewerV2.prototype.onFirstPage,
            lastPage: ArchiveViewerV2.prototype.onLastPage,
        },
    };

    static PARTS = {
        form: {
            template: "modules/chat-trimmer/templates/archive-viewer-v2.hbs",
        },
    };

    _onRender(context, options) {
        super._onRender(context, options);

        // Restore scroll position if it was preserved
        if (this._scrollPosition !== null) {
            const archiveBody = this.element.querySelector(".archive-body");
            if (archiveBody) {
                archiveBody.scrollTop = this._scrollPosition;
            }
            this._scrollPosition = null; // Clear after restoring
        }

        // Attach event listeners for select elements
        const sessionSelect = this.element.querySelector(".archive-select");
        const filterSelect = this.element.querySelector(".category-filter");
        const searchInput = this.element.querySelector(".archive-search");

        if (sessionSelect) {
            sessionSelect.addEventListener("change", (e) => {
                this.currentSession = e.target.value;
                this.currentPage = 1; // Reset to first page when changing session
                this.render();
            });
        }

        if (filterSelect) {
            filterSelect.addEventListener("change", (e) => {
                this.currentFilter = e.target.value;
                this.currentPage = 1; // Reset to first page when changing filter
                this.render();
            });
        }

        if (searchInput) {
            // Update state immediately to prevent data loss on other renders
            searchInput.addEventListener("input", (e) => {
                this.searchQuery = e.target.value;
            });

            // Trigger search (render) only on Enter
            searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    this.currentPage = 1; // Reset to first page when searching
                    this.render();
                }
            });
        }
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        console.log("Archive Viewer | Getting data...");

        // Get all archives
        const allArchives = await this.archiveManager.getAllArchives();
        console.log(`Archive Viewer | Found ${allArchives.length} archives`);

        const hasArchives = allArchives.length > 0;

        // Group archives by session
        const sessionGroups = new Map();

        for (const archive of allArchives) {
            let sName = archive.getFlag("chat-trimmer", "sessionName");
            if (!sName) {
                // Fallback for legacy archives or unnamed sessions
                sName = archive.name;
            }
            if (!sessionGroups.has(sName)) {
                sessionGroups.set(sName, []);
            }
            sessionGroups.get(sName).push(archive);
        }

        // Format sessions for dropdown
        const archives = []; // This variable name maps to 'archives' in context/template

        for (const [name, list] of sessionGroups) {
            archives.push({
                id: name,
                label: `${name}`,
                selected: this.currentSession === name,
            });
        }

        // Handle default selection
        if (!this.currentSession || !sessionGroups.has(this.currentSession)) {
            if (sessionGroups.size > 0) {
                // Default to the last session (most recent)
                const methodKeys = Array.from(sessionGroups.keys());
                this.currentSession = methodKeys[methodKeys.length - 1]; // Last session
            } else {
                this.currentSession = null;
            }
        }

        // Update selection state in dropdown list
        archives.forEach((a) => (a.selected = a.id === this.currentSession));

        // Get entries based on selection
        let entries = [];
        this.entryMap = new Map(); // O(1) lookup cache

        let targetArchives = [];
        if (this.currentSession) {
            targetArchives = sessionGroups.get(this.currentSession) || [];
        }

        if (targetArchives.length > 0) {
            console.log(
                `Archive Viewer | Loading entries from ${targetArchives.length} archives for session '${this.currentSession}'`,
            );

            for (const archive of targetArchives) {
                const archiveEntries =
                    await this.archiveManager.getArchiveEntries(archive);
                // We map entries similarly, maybe adding sessionNumber from archive if needed
                const sNum = archive.getFlag("chat-trimmer", "sessionNumber");

                const mappedEntries = archiveEntries.map((e) => ({
                    ...e,
                    sessionNumber: sNum,
                    archiveName: archive.name, // Track source archive
                    archiveId: archive.id,
                }));
                entries.push(...mappedEntries);
                mappedEntries.forEach((e) => this.entryMap.set(e.id, e));
            }
            // Sort merged entries by timestamp
            entries.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        } else {
            console.log("Archive Viewer | No archives found for selection");
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

        // Save unfiltered entries for session summary generation
        const unfilteredEntries = [...entries];

        // Apply filter - check if entry has the selected category
        // Support both new multi-category system and legacy single category
        if (this.currentFilter !== "all") {
            entries = entries.filter((e) => {
                // New multi-category system: check if filter is in categories array
                if (e.categories && Array.isArray(e.categories)) {
                    return e.categories.includes(this.currentFilter);
                }
                // Legacy fallback: check single category or type property
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

        // Add expanded state and prepare roll buttons HTML
        entries = entries.map((e) => {
            let rollButtonsHtml = "";

            if (e.rollData) {
                console.log(`Archive Viewer | Entry ${e.id} has rollData:`, e.rollData);

                // Add damage buttons if they exist (only show PF2e action buttons, not generic re-rolls)
                if (e.rollData.damageButtons && e.rollData.damageButtons.length > 0) {
                    console.log(
                        `Archive Viewer | Creating ${e.rollData.damageButtons.length} damage buttons`,
                    );
                    rollButtonsHtml = e.rollData.damageButtons
                        .map((btn) => {
                            // Handle PF2e action buttons differently
                            if (btn.type === "pf2e-action") {
                                const datasetHtml = Object.entries(btn.dataset || {})
                                    .map(
                                        ([k, v]) =>
                                            `data-${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}="${v}"`,
                                    )
                                    .join(" ");

                                return `
                                        <button class="archive-roll-button"
                                                data-action="rollButton"
                                                data-button-type="pf2e-action"
                                                data-pf2e-action="${btn.action}"
                                                data-actor-uuid="${btn.actorUuid || ""}"
                                                data-item-uuid="${btn.itemUuid || ""}"
                                                data-flavor="${btn.label}"
                                                data-speaker="${e.speaker || "Unknown"}"
                                                ${datasetHtml}>
                                            <i class="fas fa-dice-d20"></i> ${btn.label}
                                        </button>
                                    `;
                            } else {
                                // Regular formula-based button
                                return `
                                        <button class="archive-roll-button"
                                                data-action="rollButton"
                                                data-button-type="formula"
                                                data-formula="${btn.formula}"
                                                data-flavor="${btn.label}"
                                                data-speaker="${e.speaker || "Unknown"}">
                                            <i class="fas fa-dice-d20"></i> ${btn.label}
                                        </button>
                                    `;
                            }
                        })
                        .join("");
                }
                // Don't show re-roll buttons for regular rolls - they lose PF2e context (target, modifiers, etc.)
                // Users should open the original message to use the real functional buttons
            }

            // Prepare sub-entries for clusters
            let subEntries = [];
            if (
                e.type === "cluster" &&
                e.originalMessages &&
                e.originalMessages.length > 0
            ) {
                subEntries = e.originalMessages.map((originalMsg, idx) => {
                    // Format individual message display
                    const msgContent = originalMsg.content || "";
                    const cleanContent = msgContent
                        .replace(/<[^>]*>/g, "")
                        .substring(0, 80);
                    const preview =
                        cleanContent + (cleanContent.length >= 80 ? "..." : "");

                    return {
                        id: `${e.id}-sub-${idx}`,
                        parentId: e.id,
                        originalMessage: originalMsg,
                        displayText: preview,
                        timestamp: originalMsg.timestamp,
                        isSubEntry: true,
                    };
                });
            }

            return {
                ...e,
                expanded: this.expandedEntries.has(e.id),
                rollButtonsHtml: rollButtonsHtml,
                subEntries: subEntries,
                hasSubEntries: subEntries.length > 0,
            };
        });

        // Store total filtered entries count before pagination
        const totalFilteredEntries = entries.length;

        // Apply pagination
        const totalPages = Math.ceil(entries.length / this.PAGE_SIZE);
        this.totalPages = totalPages; // Store for action handlers

        // Reset to page 1 if current page is out of bounds
        if (this.currentPage > totalPages && totalPages > 0) {
            this.currentPage = 1;
        }

        const startIdx = (this.currentPage - 1) * this.PAGE_SIZE;
        const endIdx = startIdx + this.PAGE_SIZE;
        const paginatedEntries = entries.slice(startIdx, endIdx);

        console.log(
            `Archive Viewer | Pagination: Page ${this.currentPage}/${totalPages}, showing ${paginatedEntries.length} of ${totalFilteredEntries} entries`,
        );

        // Calculate Statistics and Ratio based on targetArchives
        let originalCount = 0;
        let compressedCount = 0;

        // Stats aggregation
        const statKeys = [
            "totalCombats",
            "totalDialogues",
            "totalSkillChecks",
            "totalRolls",
            "criticalSuccesses",
            "criticalFails",
            "itemsTransferred",
            "xpAwarded",
        ];
        const aggregatedStats = Object.fromEntries(statKeys.map((k) => [k, 0]));

        for (const archive of targetArchives) {
            originalCount +=
                archive.getFlag("chat-trimmer", "originalMessageCount") || 0;
            const cCount =
                archive.getFlag("chat-trimmer", "compressedEntryCount") ||
                (archive.getFlag("chat-trimmer", "entries") || []).length;
            compressedCount += cCount;

            const stats = archive.getFlag("chat-trimmer", "statistics") || {};
            for (const k of statKeys) {
                const v = stats[k];
                if (Number.isFinite(v)) aggregatedStats[k] += v;
            }
        }

        let compressionRatio = 0;
        if (originalCount > 0) {
            compressionRatio = Math.round(
                ((originalCount - compressedCount) / originalCount) * 100,
            );
        }

        const statistics = {
            originalCount,
            compressedCount,
            compressionRatio,
            ...aggregatedStats,
        };

        const currentArchive = null; // Unused in new session view paradigm but kept for context compatibility

        // Whether we should show the main viewer body (entries + controls)
        const showArchiveBody = hasArchives;

        // Generate session summary if viewing a specific session
        let sessionSummary = null;
        if (this.currentSession && targetArchives.length > 0) {
            // Use unfiltered entries for session summary so key events aren't affected by filters
            const entriesWithoutHeaders = unfilteredEntries.filter(
                (e) => !e.isHeader,
            );
            sessionSummary = await this.archiveManager.generateSessionSummary(
                targetArchives[0],
                entriesWithoutHeaders,
            );
            console.log(
                "Archive Viewer | Generated session summary:",
                sessionSummary,
            );
        }

        return {
            ...context,
            archives,
            currentArchive,
            currentSession: this.currentSession,
            currentFilter: this.currentFilter,
            searchQuery: this.searchQuery,
            filteredEntries: paginatedEntries,
            totalFilteredEntries,
            totalEntries,
            compressionRatio,
            statistics,
            sessionSummary,
            summaryCollapsed: this.summaryCollapsed,
            viewMode: this.viewMode,
            targetArchivesList: targetArchives.map((a) => ({
                id: a.id,
                name: a.name,
            })),
            hasEntries: paginatedEntries.length > 0,
            hasArchives,
            showArchiveBody,
            // Pagination data
            currentPage: this.currentPage,
            totalPages: totalPages,
            hasPrevPage: this.currentPage > 1,
            hasNextPage: this.currentPage < totalPages,
            pageStart: totalFilteredEntries > 0 ? startIdx + 1 : 0,
            pageEnd: Math.min(endIdx, totalFilteredEntries),
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
        // Preserve scroll position before re-rendering
        const archiveBody = this.element.querySelector(".archive-body");
        if (archiveBody) {
            this._scrollPosition = archiveBody.scrollTop;
        }
        this.render();
    }

    async onToggleSummary(event, target) {
        event.preventDefault();
        event.stopPropagation();
        this.summaryCollapsed = !this.summaryCollapsed;
        // Preserve scroll position before re-rendering
        const archiveBody = this.element.querySelector(".archive-body");
        if (archiveBody) {
            this._scrollPosition = archiveBody.scrollTop;
        }
        this.render();
    }

    async onToggleViewMode(event, target) {
        event.preventDefault();
        this.viewMode = this.viewMode === "full" ? "summary" : "full";
        // Preserve scroll position before re-rendering
        const archiveBody = this.element.querySelector(".archive-body");
        if (archiveBody) {
            this._scrollPosition = archiveBody.scrollTop;
        }
        this.render();
    }

    async onViewOriginal(event, target) {
        event.stopPropagation();
        const entryId = target.closest("[data-entry-id]").dataset.entryId;
        await this.showOriginalMessages(entryId);
    }

    async onRollButton(event, target) {
        event.stopPropagation();
        event.preventDefault();

        console.log("Archive Viewer | Roll button clicked", target);
        console.log("Archive Viewer | Button dataset:", target.dataset);

        const buttonType = target.dataset.buttonType;
        const flavor = target.dataset.flavor || "Archived Roll";
        const speaker = target.dataset.speaker || "Unknown";

        try {
            // Handle PF2e action buttons
            if (buttonType === "pf2e-action") {
                const actionType = target.dataset.pf2eAction;
                console.log(`Archive Viewer | Executing PF2e action: ${actionType} `);

                const actorUuid = target.dataset.actorUuid;
                const itemUuid = target.dataset.itemUuid;

                if (!actorUuid || !itemUuid) {
                    ui.notifications.warn(
                        "Cannot execute PF2e action: missing actor or item reference",
                    );
                    return;
                }

                const actor = await fromUuid(actorUuid);
                const item = await fromUuid(itemUuid);

                if (!actor || !item) {
                    ui.notifications.warn(
                        "Cannot execute PF2e action: actor or item no longer exists",
                    );
                    console.error("Archive Viewer | Could not resolve actor or item");
                    return;
                }

                console.log(
                    `Archive Viewer | Resolved actor: ${actor.name}, item: ${item.name} `,
                );

                // Execute the PF2e action based on type
                if (actionType === "spell-damage" && item.type === "spell") {
                    // Call PF2e's damage roll method
                    if (typeof item.rollDamage === "function") {
                        await item.rollDamage({ event });
                        ui.notifications.info(`Rolled damage for ${item.name}`);
                    } else {
                        ui.notifications.warn("This spell cannot roll damage");
                    }
                } else if (
                    actionType === "strike-damage" ||
                    actionType === "damage" ||
                    actionType === "strike-critical" ||
                    actionType === "critical"
                ) {
                    const strikes = actor.system.actions || [];
                    const strikeIndex = target.dataset.index;
                    const strike =
                        strikes[strikeIndex] ||
                        strikes.find((s) => s.item?.id === item.id || s.slug === item.slug);

                    if (strike) {
                        const isCritical =
                            actionType.includes("critical") ||
                            target.dataset.critical === "true" ||
                            target.dataset.outcome === "criticalSuccess";

                        // Prepare options to ensure critical is respected
                        // 'check:outcome:critical-success' is the standard roll option
                        const rollOptions = isCritical
                            ? ["check:outcome:critical-success"]
                            : [];

                        // Use strike.damage for both, forcing critical via options/outcome if needed
                        await strike.damage?.({
                            event,
                            outcome: isCritical ? "criticalSuccess" : undefined,
                            options: rollOptions,
                            getFormula: isCritical ? (d) => d.criticalFormula : undefined,
                        });

                        ui.notifications.info(
                            `Rolled ${isCritical ? "critical " : ""}damage for ${strike.label}`,
                        );
                    } else {
                        // Fallback
                        const isCritical =
                            actionType.includes("critical") ||
                            target.dataset.critical === "true" ||
                            target.dataset.outcome === "criticalSuccess";
                        if (typeof item.rollDamage === "function") {
                            await item.rollDamage({
                                event,
                                critical: isCritical,
                                options: isCritical ? ["check:outcome:critical-success"] : [],
                                outcome: isCritical ? "criticalSuccess" : undefined,
                            });
                        }
                    }
                } else if (actionType === "strike-attack" || actionType === "attack") {
                    const strikes = actor.system.actions || [];
                    const strikeIndex = target.dataset.index;
                    const variantIndex = target.dataset.variantIndex || 0;
                    const strike =
                        strikes[strikeIndex] ||
                        strikes.find((s) => s.item?.id === item.id || s.slug === item.slug);

                    if (strike && strike.variants?.[variantIndex]) {
                        await strike.variants[variantIndex].roll({ event });
                    } else {
                        if (typeof item.rollAttack === "function") {
                            await item.rollAttack({ event });
                        }
                    }
                } else if (
                    actionType === "apply-damage" ||
                    actionType === "apply-healing" ||
                    actionType === "target-applyDamage"
                ) {
                    const entryId = target.closest(".archive-entry")?.dataset.entryId;
                    if (entryId) {
                        // O(1) lookup using cached entryMap instead of O(n*m) archive search
                        const entry = this.entryMap.get(entryId);

                        if (entry?.originalMessage) {
                            const MessageClass = getDocumentClass("ChatMessage");
                            const message = new MessageClass(entry.originalMessage);
                            const multiplier = Number(
                                target.dataset.multiplier ||
                                (actionType === "apply-healing" ? -1 : 1),
                            );

                            // 1. Try PF2e Toolbelt (support multiple API locations)
                            const toolbelt = game.modules.get("pf2e-toolbelt");
                            const toolbeltApi = toolbelt?.api || game.pf2eToolbelt;
                            if (toolbelt?.active && toolbeltApi?.target?.applyDamage) {
                                console.log(
                                    "Archive Viewer | Using PF2e Toolbelt for damage application",
                                );
                                await toolbeltApi.target.applyDamage(message, multiplier);
                            } else {
                                // 2. PF2e System API
                                const applyDamageFn =
                                    game.pf2e?.system?.chat?.applyDamageFromMessage ||
                                    game.pf2e?.RollPF2e?.applyDamageFromMessage ||
                                    (typeof CONFIG.ChatMessage?.documentClass
                                        ?.applyDamageFromMessage === "function"
                                        ? CONFIG.ChatMessage.documentClass.applyDamageFromMessage
                                        : null);

                                if (typeof applyDamageFn === "function") {
                                    console.log("Archive Viewer | Using PF2e System API");
                                    await applyDamageFn({
                                        message,
                                        multiplier,
                                        promptModifier: event.shiftKey,
                                        rollIndex: 0,
                                    });
                                } else {
                                    console.warn(
                                        "Archive Viewer | PF2e system API not found, attempting manual fallback",
                                    );

                                    // 3. Manual Fallback
                                    let tokens = [];

                                    // Determine target based on action type
                                    const isTargetAction = actionType.includes("target");

                                    // 1. Try context target first if it's a target action
                                    if (isTargetAction) {
                                        const targetInfo =
                                            message.flags.pf2e?.context?.target ||
                                            message.flags.pf2e?.target;
                                        if (targetInfo?.token) {
                                            const tokenUuid = targetInfo.token.startsWith("Scene.")
                                                ? targetInfo.token
                                                : `Scene.${canvas.scene.id}.Token.${targetInfo.token} `;
                                            const targetToken = await fromUuid(tokenUuid);
                                            if (targetToken?.object) {
                                                tokens = [targetToken.object];
                                                console.log(
                                                    `Archive Viewer | Using context target: ${targetToken.name} `,
                                                );
                                            }
                                        }
                                    }

                                    // 2. Fallbacks
                                    if (tokens.length === 0 && !isTargetAction) {
                                        tokens = canvas.tokens.controlled;
                                    } else if (tokens.length === 0 && isTargetAction) {
                                        console.warn(
                                            "Archive Viewer | Target action requested but no target found in context.",
                                        );
                                        tokens = canvas.tokens.controlled;
                                        if (tokens.length > 0) {
                                            ui.notifications.warn(
                                                "Could not find original target. Applying to selected token instead.",
                                            );
                                        }
                                    }

                                    if (tokens.length === 0) {
                                        ui.notifications.warn("PF2E.ErrorMessage.NoTokenSelected", {
                                            localize: true,
                                        });
                                    } else {
                                        const roll =
                                            message.rolls.find(
                                                (r) => r.constructor.name === "DamageRoll",
                                            ) || message.rolls[0];
                                        if (!roll) {
                                            ui.notifications.error("No damage roll found in message");
                                        } else {
                                            const damageValue = Math.floor(roll.total * multiplier);
                                            for (const token of tokens) {
                                                if (
                                                    token.actor &&
                                                    typeof token.actor.applyDamage === "function"
                                                ) {
                                                    await token.actor.applyDamage({
                                                        damage: damageValue,
                                                        token: token,
                                                        item: message.item,
                                                        skipIWR: multiplier < 0,
                                                    });
                                                    ui.notifications.info(
                                                        `Applied ${damageValue} ${multiplier < 0 ? "healing" : "damage"} to ${token.name} `,
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else if (
                    actionType === "shield-block" ||
                    actionType === "target-shieldBlock"
                ) {
                    const entryId = target.closest(".archive-entry")?.dataset.entryId;
                    if (entryId) {
                        const entry = this.entryMap?.get(entryId);

                        if (!entry) {
                            console.warn(
                                `Archive Viewer | Entry ${entryId} not found in map for shield block`,
                            );
                            return;
                        }

                        if (entry?.originalMessage) {
                            const MessageClass = getDocumentClass("ChatMessage");
                            const message = new MessageClass(entry.originalMessage);
                            const shieldBlockFn =
                                game.pf2e?.system?.chat?.ShieldBlock?.applyFromMessage ||
                                game.pf2e?.ShieldBlock?.applyFromMessage;

                            if (typeof shieldBlockFn === "function") {
                                await shieldBlockFn(message);
                            }
                            // Fallback to native handling
                            else if (typeof message.onChatCardAction === "function") {
                                // We need to mock the event slightly if not perfect, but usually passing the click event is enough
                                await message.onChatCardAction(event);
                            } else if (
                                typeof CONFIG.ChatMessage.documentClass?.onChatCardAction ===
                                "function"
                            ) {
                                try {
                                    await CONFIG.ChatMessage.documentClass.onChatCardAction(
                                        event,
                                    );
                                } catch (e) {
                                    console.warn(e);
                                }
                            } else {
                                ui.notifications.warn("System Shield Block helper not found.");
                            }
                        }
                    }
                } else {
                    ui.notifications.warn(`Unknown PF2e action type: ${actionType} `);
                }

                return;
            }

            // Handle regular formula-based buttons
            const formula = target.dataset.formula;
            console.log(`Archive Viewer | Formula: ${formula}, Flavor: ${flavor} `);

            if (!formula) {
                ui.notifications.warn("No roll formula found");
                console.error("Archive Viewer | No formula in button dataset");
                return;
            }

            // Create and evaluate the roll
            const roll = new Roll(formula);
            await roll.evaluate();

            console.log("Archive Viewer | Roll evaluated:", roll.total);

            // Post to chat
            await roll.toMessage({
                speaker: { alias: speaker },
                flavor: flavor,
            });

            ui.notifications.info(`Rolled: ${roll.total} `);
        } catch (error) {
            console.error("Error executing roll:", error);
            ui.notifications.error(`Failed to execute roll: ${error.message} `);
        }
    }

    async showOriginalMessages(entryId) {
        let entry = null;
        let messageData = null;

        // Check if this is a sub-entry (cluster member)
        if (entryId.includes("-sub-")) {
            // Parse: parentId-sub-index
            const parts = entryId.split("-sub-");
            const parentId = parts[0];
            const subIndex = parseInt(parts[1]);

            entry = this.entryMap?.get(parentId);
            if (entry && entry.originalMessages && entry.originalMessages[subIndex]) {
                messageData = entry.originalMessages[subIndex];
            } else {
                console.warn(
                    `Archive Viewer | Sub-entry ${entryId} not found in parent ${parentId}`,
                );
            }
        } else {
            // Regular entry
            entry = this.entryMap?.get(entryId);
            if (entry && entry.originalMessage) {
                messageData = entry.originalMessage;
            }
        }

        if (!entry) {
            console.warn(`Archive Viewer | Entry ${entryId} not found in map`);
        }

        if (!messageData) {
            ui.notifications.warn(
                game.i18n.localize("CHATTRIMMER.Notifications.OriginalNotAvailable"),
            );
            return;
        }

        // Reconstruct the full ChatMessage and render it
        // Create a proper ChatMessage document instance from the stored data
        // Using getDocumentClass ensures we get the correct PF2e-extended class
        const MessageClass = getDocumentClass("ChatMessage");
        const tempMessage = new MessageClass(messageData);

        // Render the message HTML exactly as it appears in chat
        // V13+ uses renderHTML (returns HTMLElement), V12 uses getHTML (returns jQuery)
        let messageElement;
        if (typeof tempMessage.renderHTML === "function") {
            messageElement = await tempMessage.renderHTML();
        } else {
            const jqueryResult = await tempMessage.getHTML();
            messageElement = jqueryResult[0];
        }

        // Show dialog with the fully rendered message AND pass the ChatMessage instance
        const dialog = new MessageViewerDialog({
            messageTitle:
                entry.displayText ||
                game.i18n.localize("CHATTRIMMER.ArchiveViewer.OriginalMessage"),
            messageContent: messageElement.outerHTML, // Full rendered chat message HTML
            chatMessage: tempMessage, // Pass the ChatMessage instance so we can activate listeners
        });
        dialog.render({ force: true });
    }

    async onDeleteCurrentArchive(event, target) {
        event.preventDefault();

        if (!this.currentSession) {
            ui.notifications.warn("No session selected.");
            return;
        }

        const allArchives = await this.archiveManager.getAllArchives();
        // Find archives belonging to current session
        // Note: currentSession is now the Session Name
        let targets = [];

        // Exact match on sessionName
        targets = allArchives.filter((a) => {
            const sName = a.getFlag("chat-trimmer", "sessionName") || a.name;
            return sName === this.currentSession;
        });

        if (targets.length === 0) {
            ui.notifications.warn(
                game.i18n.localize("CHATTRIMMER.Notifications.NoArchivesToDelete"),
            );
            return;
        }

        // Confirm deletion
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: {
                title: game.i18n.localize("CHATTRIMMER.Buttons.DeleteCurrentArchive"),
            },
            content: `<p>Are you sure you want to delete the session <strong>${this.currentSession}</strong>?</p>`,
            rejectClose: false,
            modal: true,
        });

        if (!confirmed) return;

        // Delete all targets - call delete() directly to handle both journal and virtual archives
        for (const archive of targets) {
            await archive.delete();
        }

        ui.notifications.info(
            `${targets.length} archive(s) from session '${this.currentSession}' deleted.`,
        );

        // Re-render - reset to null so it picks the most recent remaining session
        this.currentSession = null;
        this.render({ force: true });
    }

    async onDeleteAllArchives(event, target) {
        const archives = await this.archiveManager.getAllArchives();
        if (archives.length === 0) {
            ui.notifications.warn(
                game.i18n.localize("CHATTRIMMER.Notifications.NoArchivesToDelete"),
            );
            return;
        }

        // Confirm deletion
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Delete All Sessions" },
            content: `<p>Are you sure you want to delete <strong>all ${archives.length} sessions</strong>?</p><p>This action cannot be undone.</p>`,
            rejectClose: false,
            modal: true,
        });

        if (!confirmed) return;

        // Delete all archives
        await this.archiveManager.deleteAllArchives();

        // Reset session numbering to 1
        await game.settings.set("chat-trimmer", "currentSessionNumber", 1);
        await game.settings.set("chat-trimmer", "currentSessionName", "Session 1");
        await game.settings.set(
            "chat-trimmer",
            "currentSessionStartTime",
            Date.now(),
        );

        ui.notifications.info(
            game.i18n.localize("CHATTRIMMER.Notifications.AllArchivesDeleted"),
        );

        // Re-render the viewer
        this.render({ force: true });
    }

    async onNextPage(event) {
        event.preventDefault();
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.render();
        }
    }

    async onPrevPage(event) {
        event.preventDefault();
        if (this.currentPage > 1) {
            this.currentPage--;
            this.render();
        }
    }

    async onFirstPage(event) {
        event.preventDefault();
        if (this.currentPage !== 1) {
            this.currentPage = 1;
            this.render();
        }
    }

    async onLastPage(event) {
        event.preventDefault();
        if (this.currentPage !== this.totalPages) {
            this.currentPage = this.totalPages;
            this.render();
        }
    }

    sanitizeMessageContent(html) {
        if (!html) return "";

        // Create a temporary div to parse HTML
        const temp = document.createElement("div");
        temp.innerHTML = html;

        // Remove all button elements (they won't work in archives)
        temp.querySelectorAll("button").forEach((btn) => btn.remove());

        // Remove script tags
        temp.querySelectorAll("script").forEach((script) => script.remove());

        // Remove inline event handlers
        temp.querySelectorAll("[onclick], [onload], [onerror]").forEach((el) => {
            el.removeAttribute("onclick");
            el.removeAttribute("onload");
            el.removeAttribute("onerror");
        });

        // Remove data-action attributes (Foundry click handlers)
        temp.querySelectorAll("[data-action]").forEach((el) => {
            el.removeAttribute("data-action");
        });

        return temp.innerHTML;
    }
}
