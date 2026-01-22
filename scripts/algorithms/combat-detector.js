import { MessageParser } from "../utils/message-parser.js";

/**
 * Combat encounter detection algorithm
 */
export class CombatDetector {
    constructor() {
        this.combatTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Detect combat encounters from messages
     * @param {Array} messages - Combat-related messages
     * @returns {Array} Array of combat summaries
     */
    async detect(messages) {
        console.log(
            `Combat Detector | Analyzing ${messages.length} combat-related messages`,
        );
        const combats = [];
        let currentCombat = null;
        let combatMessages = [];

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            // Check if combat starts
            if (this.isCombatStart(msg)) {
                console.log(`Combat Detector | Combat start detected at message ${i}`);
                // If there was a previous combat, finalize it
                if (currentCombat) {
                    const finalized = this.finalizeCombat(currentCombat, combatMessages);
                    console.log(`Combat Detector | Finalized combat: ${finalized.title}`);
                    combats.push(finalized);
                }

                // Start new combat
                currentCombat = {
                    startTime: msg.timestamp,
                    startMessageId: msg.id,
                    participants: new Set(),
                    rounds: [],
                    currentRound: null,
                };
                combatMessages = [msg];
            }
            // Check if in active combat
            else if (currentCombat && this.isCombatMessage(msg)) {
                combatMessages.push(msg);

                // Extract combat information
                this.extractCombatInfo(msg, currentCombat);
            }
            // Check if combat ends
            else if (currentCombat && this.isCombatEnd(msg)) {
                combatMessages.push(msg);
                currentCombat.endTime = msg.timestamp;
                currentCombat.endMessageId = msg.id;

                // Finalize and add to list
                combats.push(this.finalizeCombat(currentCombat, combatMessages));
                currentCombat = null;
                combatMessages = [];
            }
            // Combat timeout (5+ minutes since last message)
            else if (currentCombat && combatMessages.length > 0) {
                const timeSince =
                    msg.timestamp - combatMessages[combatMessages.length - 1].timestamp;
                if (timeSince > this.combatTimeout) {
                    // Finalize combat due to timeout
                    currentCombat.endTime =
                        combatMessages[combatMessages.length - 1].timestamp;
                    combats.push(this.finalizeCombat(currentCombat, combatMessages));
                    currentCombat = null;
                    combatMessages = [];
                }
            }
        }

        // Finalize any remaining combat
        if (currentCombat && combatMessages.length > 0) {
            currentCombat.endTime =
                combatMessages[combatMessages.length - 1].timestamp;
            combats.push(this.finalizeCombat(currentCombat, combatMessages));
        }

        return combats;
    }

    /**
     * Check if message indicates combat start
     */
    isCombatStart(msg) {
        const content = msg.content.toLowerCase();
        return (
            content.includes("combat has started") ||
            content.includes("combat started") ||
            content.includes("roll initiative") ||
            content.includes("roll for initiative") ||
            msg.flags?.core?.initiativeRoll ||
            content.includes("enters combat")
        );
    }

    /**
     * Check if message is part of combat
     */
    isCombatMessage(msg) {
        const content = msg.content.toLowerCase();

        // Check for explicit combat keywords
        if (
            content.includes("attack") ||
            content.includes("damage") ||
            content.includes("hit") ||
            content.includes("miss") ||
            content.includes("saving throw") ||
            content.includes("save") ||
            content.includes("cast") ||
            content.includes("uses") ||
            content.includes("action")
        ) {
            return true;
        }

        // Check if it's a combat-related roll
        if (MessageParser.isRoll(msg)) {
            const rollAnalysis = MessageParser.analyzeRoll(msg);
            if (rollAnalysis) {
                const combatRollTypes = [
                    "Attack",
                    "Damage",
                    "Saving Throw",
                    "Initiative",
                ];
                if (combatRollTypes.includes(rollAnalysis.rollType)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check if combat has ended
     */
    isCombatEnd(msg) {
        const content = msg.content.toLowerCase();
        return (
            content.includes("combat has ended") ||
            content.includes("combat ended") ||
            content.includes("all enemies defeated") ||
            content.includes("combat is over") ||
            content.includes("encounter ended")
        );
    }

    /**
     * Extract combat information from message
     */
    extractCombatInfo(msg, combat) {
        const content = msg.content;

        // Extract actor name
        const actor = MessageParser.extractActorName(msg);
        if (actor) {
            combat.participants.add(actor);
        }

        // Initialize current round if needed
        if (!combat.currentRound) {
            combat.currentRound = {
                number: 1,
                actions: [],
            };
            combat.rounds.push(combat.currentRound);
        }

        // Use roll analysis for better combat tracking
        if (MessageParser.isRoll(msg)) {
            const rollAnalysis = MessageParser.analyzeRoll(msg);

            if (rollAnalysis) {
                // Handle attack rolls
                if (rollAnalysis.rollType === "Attack") {
                    combat.currentRound.actions.push({
                        actor: rollAnalysis.actor || actor,
                        action: "attack",
                        target: rollAnalysis.target,
                        roll: rollAnalysis.total,
                        hit: rollAnalysis.isSuccess,
                        critical: rollAnalysis.isCritical,
                        fumble: rollAnalysis.isFumble,
                        messageId: msg.id,
                    });
                }
                // Handle damage rolls
                else if (rollAnalysis.rollType === "Damage") {
                    const damage = rollAnalysis.total;
                    const target = rollAnalysis.target;

                    // Try to associate with last attack action
                    if (combat.currentRound.actions.length > 0) {
                        const lastAction =
                            combat.currentRound.actions[
                            combat.currentRound.actions.length - 1
                            ];
                        if (lastAction.action === "attack" && lastAction.hit) {
                            lastAction.damage = damage;
                            if (target && !lastAction.target) {
                                lastAction.target = target;
                            }
                        }
                    } else {
                        // Standalone damage (e.g., spell damage)
                        combat.currentRound.actions.push({
                            actor: rollAnalysis.actor || actor,
                            action: "damage",
                            target: target,
                            damage: damage,
                            messageId: msg.id,
                        });
                    }
                }
                // Handle saving throws
                else if (rollAnalysis.rollType === "Saving Throw") {
                    combat.currentRound.actions.push({
                        actor: rollAnalysis.actor || actor,
                        action: "save",
                        roll: rollAnalysis.total,
                        success: rollAnalysis.isSuccess,
                        critical: rollAnalysis.isCritical,
                        fumble: rollAnalysis.isFumble,
                        messageId: msg.id,
                    });
                }
            }
        }
        // Fallback to old method for non-roll messages
        else if (content.toLowerCase().includes("attack")) {
            const rollTotal = MessageParser.getRollTotal(msg);
            const target = MessageParser.extractTargetName(content);
            const hit = MessageParser.isHit(content);

            combat.currentRound.actions.push({
                actor,
                action: "attack",
                target,
                roll: rollTotal,
                hit,
                critical: MessageParser.isCritical(content),
                fumble: MessageParser.isFumble(content),
                messageId: msg.id,
            });
        }
        // Check for non-roll damage
        else if (content.toLowerCase().includes("damage")) {
            const damage = MessageParser.extractDamage(content);
            const target = MessageParser.extractTargetName(content);

            // Try to associate with last attack action
            if (combat.currentRound.actions.length > 0) {
                const lastAction =
                    combat.currentRound.actions[combat.currentRound.actions.length - 1];
                if (lastAction.action === "attack" && lastAction.hit) {
                    lastAction.damage = damage;
                    if (target && !lastAction.target) {
                        lastAction.target = target;
                    }
                }
            }
        }

        // Check for death/knockout
        if (
            content.toLowerCase().includes("dies") ||
            content.toLowerCase().includes("unconscious") ||
            content.toLowerCase().includes("drops to 0") ||
            content.toLowerCase().includes("reduced to 0")
        ) {
            const victim = actor || MessageParser.extractTargetName(content);
            if (victim) {
                if (!combat.casualties) combat.casualties = [];
                if (!combat.casualties.includes(victim)) {
                    combat.casualties.push(victim);
                }
            }
        }

        // Check for new round
        if (
            content.toLowerCase().includes("round") ||
            content.toLowerCase().includes("turn")
        ) {
            const roundMatch = content.match(/round\s+(\d+)/i);
            if (roundMatch) {
                const roundNum = parseInt(roundMatch[1]);
                if (roundNum > combat.currentRound.number) {
                    combat.currentRound = {
                        number: roundNum,
                        actions: [],
                    };
                    combat.rounds.push(combat.currentRound);
                }
            }
        }
    }

    /**
     * Finalize combat summary
     */
    finalizeCombat(combat, messages) {
        // Determine outcome
        let outcome = "Unknown";
        if (combat.casualties && combat.casualties.length > 0) {
            // Check if any PCs died
            const pcDeath = combat.casualties.some((c) => {
                const actor = game.actors.getName(c);
                return actor?.hasPlayerOwner;
            });

            if (pcDeath) {
                outcome = "Defeat";
            } else {
                outcome = "Victory";
            }
        }

        // Extract key moments and calculate statistics in single pass for performance
        const keyMoments = [];
        let totalDamageDealt = 0;
        let totalDamageTaken = 0;
        let criticalSuccesses = 0;

        for (const round of combat.rounds) {
            for (const action of round.actions) {
                // Track critical hits
                if (action.critical) {
                    criticalSuccesses++;
                    if (action.damage) {
                        keyMoments.push(
                            `${action.actor} scored a critical hit on ${action.target || "target"} (${action.damage} damage)`,
                        );
                    } else {
                        keyMoments.push(`${action.actor} scored a critical hit`);
                    }
                }

                // Track fumbles
                if (action.fumble) {
                    keyMoments.push(`${action.actor} critically failed`);
                }

                // Calculate damage statistics
                if (action.damage) {
                    // Determine if dealt or taken based on actor
                    const actor = game.actors?.getName(action.actor);
                    if (actor?.hasPlayerOwner) {
                        totalDamageDealt += action.damage;
                    } else {
                        totalDamageTaken += action.damage;
                    }
                }
            }
        }

        // Add casualties to key moments
        if (combat.casualties) {
            combat.casualties.forEach((c) => {
                keyMoments.push(`${c} was defeated`);
            });
        }

        // Get scene name
        const sceneName = game.scenes?.current?.name || "Unknown Location";

        return {
            type: "combat",
            title: this.generateCombatTitle(combat, messages),
            location: sceneName,
            startTime: combat.startTime,
            endTime: combat.endTime,
            duration: `${combat.rounds.length} rounds`,
            participants: {
                allies: this.getPlayerCharacters(combat.participants),
                enemies: this.getEnemies(combat.participants),
            },
            rounds: combat.rounds,
            keyMoments,
            outcome,
            casualties: combat.casualties || [],
            stats: {
                totalDamageDealt,
                totalDamageTaken,
                criticalSuccesses,
            },
            originalMessageIds: messages.map((m) => m.id),
            originalMessageCount: messages.length,
            compressedSize: 1,
        };
    }

    /**
     * Generate a descriptive title for the combat
     */
    generateCombatTitle(combat, messages) {
        // Try to find a descriptive name from the messages
        for (const msg of messages) {
            const content = msg.content.toLowerCase();
            if (content.includes("ambush")) return "Ambush";
            if (content.includes("boss")) return "Boss Fight";
        }

        // Use enemy names
        const enemies = this.getEnemies(combat.participants);
        if (enemies.length > 0) {
            const firstEnemy = enemies[0].replace(/\d+/g, "").trim(); // Remove numbers
            return `${firstEnemy} Encounter`;
        }

        return "Combat Encounter";
    }

    /**
     * Get player characters from participants
     */
    getPlayerCharacters(participants) {
        return Array.from(participants).filter((name) => {
            const actor = game.actors?.getName(name);
            return actor?.hasPlayerOwner;
        });
    }

    /**
     * Get enemies from participants
     */
    getEnemies(participants) {
        return Array.from(participants).filter((name) => {
            const actor = game.actors?.getName(name);
            return !actor?.hasPlayerOwner && actor !== null;
        });
    }
}
