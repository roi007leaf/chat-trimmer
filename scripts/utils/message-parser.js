/**
 * Utility class for parsing chat message content
 */
export class MessageParser {
    /**
     * Extract actor name from message
     */
    static extractActorName(msg) {
        // Try to get from message speaker
        if (msg.speaker?.alias) {
            return msg.speaker.alias;
        }

        // Try to get from actor
        if (msg.speaker?.actor) {
            const actor = game.actors.get(msg.speaker.actor);
            if (actor) return actor.name;
        }

        // Try to extract from content
        const strippedContent = this.stripHTML(msg.content);
        const match = strippedContent.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        return match ? match[1] : "Unknown";
    }

    /**
     * Extract target name from content
     */
    static extractTargetName(content) {
        const stripped = this.stripHTML(content);

        // Look for patterns like "vs Target", "attacks Target", "hits Target"
        const patterns = [
            /(?:vs|versus|attacks?|hits?)\s+([A-Z][a-z]+(?:\s+[A-Z]?[a-z]*)?(?:\s+\d+)?)/i,
            /(?:to|against)\s+([A-Z][a-z]+(?:\s+[A-Z]?[a-z]*)?(?:\s+\d+)?)/i,
        ];

        for (const pattern of patterns) {
            const match = stripped.match(pattern);
            if (match) return match[1].trim();
        }

        return null;
    }

    /**
     * Check if attack hit
     */
    static isHit(content) {
        const lower = content.toLowerCase();
        if (lower.includes("hit!") || lower.includes(" hits")) return true;
        if (lower.includes("miss") || lower.includes("misses")) return false;
        return null; // Unknown
    }

    /**
     * Check if critical hit
     */
    static isCritical(content) {
        const lower = content.toLowerCase();
        return lower.includes("critical hit") || lower.includes("crit!");
    }

    /**
     * Check if critical fumble
     */
    static isFumble(content) {
        const lower = content.toLowerCase();
        return (
            lower.includes("fumble") ||
            lower.includes("critical miss") ||
            lower.includes("critical failure")
        );
    }

    /**
     * Extract damage amount from content
     */
    static extractDamage(content) {
        // Look for damage patterns like "5 damage", "takes 12", "12 hp"
        const patterns = [
            /(\d+)\s*(?:damage|dmg)/i,
            /(?:takes|dealt)\s*(\d+)/i,
            /(\d+)\s*(?:hit points|hp)/i,
        ];

        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) return parseInt(match[1]);
        }

        return null;
    }

    /**
     * Strip HTML tags from content
     */
    static stripHTML(html) {
        const tmp = document.createElement("DIV");
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || "";
    }

    /**
     * Extract keywords from text
     */
    static extractKeywords(text) {
        const keywords = new Set();
        const stripped = this.stripHTML(text).toLowerCase();

        // Extract proper nouns (capitalized words)
        const originalText = this.stripHTML(text);
        const nouns = originalText.match(/\b[A-Z][a-z]+\b/g);
        if (nouns) {
            nouns.forEach((noun) => keywords.add(noun.toLowerCase()));
        }

        // Extract important game terms
        const gameTerms = [
            "attack",
            "damage",
            "hit",
            "miss",
            "critical",
            "fumble",
            "spell",
            "cast",
            "save",
            "saving throw",
            "initiative",
            "combat",
            "round",
            "turn",
            "action",
            "bonus action",
            "reaction",
            "movement",
            "heal",
            "death save",
        ];

        gameTerms.forEach((term) => {
            if (stripped.includes(term)) {
                keywords.add(term);
            }
        });

        return Array.from(keywords);
    }

    /**
     * Check if message is a roll
     */
    static isRoll(msg) {
        return msg.isRoll || (msg.rolls && msg.rolls.length > 0);
    }

    /**
     * Get roll total from message
     */
    static getRollTotal(msg) {
        if (!this.isRoll(msg)) return null;

        if (msg.rolls && msg.rolls.length > 0) {
            return msg.rolls[0].total;
        }

        // Try to extract from content
        const match = msg.content.match(/=\s*(\d+)/);
        return match ? parseInt(match[1]) : null;
    }

    /**
     * Analyze roll message and extract detailed information
     */
    static analyzeRoll(msg) {
        if (!this.isRoll(msg)) return null;

        const analysis = {
            actor: this.extractActorName(msg),
            rollType: this.identifyRollType(msg),
            total: this.getRollTotal(msg),
            formula: null,
            dice: [],
            modifiers: [],
            target: this.extractTargetName(msg.content),
            isSuccess: null,
            isCritical: this.isCritical(msg.content),
            isFumble: this.isFumble(msg.content),
            degree: null,
        };

        // Extract roll details from the Roll object
        if (msg.rolls && msg.rolls.length > 0) {
            const roll = msg.rolls[0];
            analysis.formula = roll.formula;

            // Extract dice and modifiers with labels
            if (roll.terms) {
                for (const term of roll.terms) {
                    if (term.faces) {
                        // Die term
                        analysis.dice.push({
                            faces: term.faces,
                            number: term.number,
                            results: term.results?.map((r) => r.result) || [],
                            label: term.flavor || null,
                        });
                    } else if (term.number !== undefined) {
                        // Numeric modifier with optional label
                        analysis.modifiers.push({
                            value: term.number,
                            label: term.flavor || this.inferModifierLabel(term, roll),
                        });
                    } else if (typeof term === "string") {
                        // Operator like + or -
                        continue;
                    }
                }
            }

            // Try to extract modifier labels from options/flags
            if (roll.options?.flavor) {
                // Parse flavor text for modifier descriptions
                this.enrichModifierLabels(analysis, roll.options.flavor);
            }
        }

        // Determine success/failure
        analysis.isSuccess = this.determineSuccess(msg, analysis);

        // Check for degree of success (PF2e)
        analysis.degree = this.extractDegreeOfSuccess(msg.content);

        return analysis;
    }

    /**
     * Infer modifier label from context
     */
    static inferModifierLabel(term, roll) {
        // Try to extract from formula context
        const formula = roll.formula || "";

        // Common patterns
        if (formula.includes("proficiency")) return "Proficiency";
        if (formula.includes("ability")) return "Ability";
        if (formula.includes("item")) return "Item";
        if (formula.includes("circumstance")) return "Circumstance";
        if (formula.includes("status")) return "Status";

        return null;
    }

    /**
     * Enrich modifier labels from flavor text
     */
    static enrichModifierLabels(analysis, flavor) {
        // Parse PF2e-style modifier breakdowns
        // Example: "Proficiency +5, Dexterity +3, Item +1"
        const modifierPattern = /([A-Za-z\s]+)\s*([+-]\d+)/g;
        let match;
        let modIndex = 0;

        while ((match = modifierPattern.exec(flavor)) !== null) {
            if (
                modIndex < analysis.modifiers.length &&
                !analysis.modifiers[modIndex].label
            ) {
                analysis.modifiers[modIndex].label = match[1].trim();
            }
            modIndex++;
        }
    }

    /**
     * Identify the type of roll
     */
    static identifyRollType(msg) {
        const content = msg.content.toLowerCase();
        const flavor = msg.flavor?.toLowerCase() || "";
        const combined = content + " " + flavor;

        // Check PF2e flags first (most reliable)
        const contextType = msg.flags?.pf2e?.context?.type;
        if (contextType === "skill-check") {
            // PF2e stores action info in flavor field, not content
            const searchText = msg.flavor || msg.content || "";

            console.log("Message Parser | Skill check detected:");
            console.log("  - flavor:", msg.flavor);
            console.log("  - content:", msg.content);

            // Try to extract action name from <strong> tags (works with HTML)
            const actionMatch = searchText.match(/<strong>([A-Za-z\s]+)<\/strong>/i);

            // For skill name, strip HTML first to avoid tag interference
            const strippedText = this.stripHTML(searchText);
            console.log("  - strippedText:", strippedText);

            const skillMatch = strippedText.match(/\(([A-Za-z]+)\s+Check\)/i);

            console.log("  - actionMatch:", actionMatch);
            console.log("  - skillMatch:", skillMatch);

            if (actionMatch && skillMatch) {
                const action = actionMatch[1].trim(); // e.g., "Grapple"
                const skill = skillMatch[1]; // e.g., "Athletics"
                const result = `${action} (${skill})`;
                console.log("  - result:", result);
                return result;
            }

            // If we only found the skill
            if (skillMatch) {
                const skill = skillMatch[1];
                const result = `${skill} Check`;
                console.log("  - result (skill only):", result);
                return result;
            }

            // Fallback to generic
            console.log("  - result: Skill Check (fallback)");
            return "Skill Check";
        }
        if (contextType === "attack-roll") return "Attack";
        if (contextType === "spell-attack-roll") return "Spell Attack";
        if (contextType === "damage-roll") return "Damage";
        if (contextType === "saving-throw") return "Saving Throw";

        // Check for initiative
        if (combined.includes("initiative")) return "Initiative";

        // Check for skill-specific keywords BEFORE generic "attack" check
        // Common skills (PF2e and D&D 5e)
        const skills = [
            "acrobatics",
            "arcana",
            "athletics",
            "crafting",
            "deception",
            "diplomacy",
            "intimidation",
            "medicine",
            "nature",
            "occultism",
            "performance",
            "religion",
            "society",
            "survival",
            "thievery",
            "animal handling",
            "history",
            "insight",
            "investigation",
            "persuasion",
            "sleight of hand",
        ];

        for (const skill of skills) {
            if (combined.includes(skill)) {
                return skill.charAt(0).toUpperCase() + skill.slice(1);
            }
        }

        // Check for "skill check" or "(check)" pattern and try to identify specifics
        if (combined.includes("skill check") || combined.includes("check)")) {
            // Try to extract action name and skill from patterns like "Grapple (Athletics Check)"
            const actionPattern = /([A-Za-z]+)\s*[◆●○]?\s*\(([A-Za-z]+)\s+Check\)/i;
            const match = msg.content.match(actionPattern);

            if (match) {
                const action = match[1]; // e.g., "Grapple"
                const skill = match[2]; // e.g., "Athletics"
                return `${action} (${skill})`;
            }

            // Try to extract just the skill name from "(Skill Check)" pattern
            const skillPattern = /\(([A-Za-z]+)\s+Check\)/i;
            const skillMatch = msg.content.match(skillPattern);

            if (skillMatch) {
                const skill = skillMatch[1];
                return `${skill} Check`;
            }

            return "Skill Check";
        }

        // Check for specific roll types
        if (combined.includes("perception")) return "Perception";
        if (combined.includes("stealth")) return "Stealth";

        // Check saves before damage (saving throw contains "save")
        if (combined.includes("save") || combined.includes("saving throw"))
            return "Saving Throw";

        // Check damage before attack (some attacks contain "damage" in description)
        if (combined.includes("damage")) return "Damage";

        // Check attack/strike LAST to avoid false positives on skill checks
        if (combined.includes("attack") || combined.includes("strike"))
            return "Attack";

        // Check for ability checks
        const abilities = [
            "strength",
            "dexterity",
            "constitution",
            "intelligence",
            "wisdom",
            "charisma",
        ];
        for (const ability of abilities) {
            if (combined.includes(ability)) {
                return ability.charAt(0).toUpperCase() + ability.slice(1) + " Check";
            }
        }

        return "Roll";
    }

    /**
     * Determine if roll was successful
     */
    static determineSuccess(msg, analysis) {
        const content = msg.content.toLowerCase();

        // Explicit success/failure indicators
        if (content.includes("success") || content.includes("hit")) return true;
        if (content.includes("failure") || content.includes("miss")) return false;

        // For attack rolls, check hit/miss
        if (analysis.rollType === "Attack") {
            return this.isHit(msg.content);
        }

        return null; // Unknown
    }

    /**
     * Extract degree of success (for PF2e)
     */
    static extractDegreeOfSuccess(content) {
        const lower = content.toLowerCase();

        if (lower.includes("critical success")) return "Critical Success";
        if (lower.includes("critical failure")) return "Critical Failure";
        if (lower.includes("success")) return "Success";
        if (lower.includes("failure")) return "Failure";

        return null;
    }

    /**
     * Create a human-readable summary of a roll
     */
    static createRollSummary(msg) {
        const analysis = this.analyzeRoll(msg);
        if (!analysis) return this.stripHTML(msg.content).substring(0, 100);

        let summary = "";

        // Actor name
        if (analysis.actor) {
            summary += `${analysis.actor} `;
        }

        // Roll type
        summary += `${analysis.rollType}`;

        // Target (for attacks)
        if (analysis.target) {
            summary += ` vs ${analysis.target}`;
        }

        // Result
        if (analysis.total !== null) {
            summary += `: ${analysis.total}`;
        }

        // Formula/details with named modifiers
        if (analysis.formula && analysis.dice.length > 0) {
            const diceRolls = analysis.dice
                .map((d) =>
                    d.results.length > 0
                        ? `[${d.results.join(", ")}]`
                        : `${d.number}d${d.faces}`,
                )
                .join(" + ");

            if (analysis.modifiers.length > 0) {
                // Build modifier display with labels
                const modDisplay = analysis.modifiers
                    .map((mod) => {
                        const sign = mod.value >= 0 ? "+" : "";
                        const label = mod.label ? `${mod.label} ` : "";
                        return `${label}${sign}${mod.value}`;
                    })
                    .join(", ");
                summary += ` (${diceRolls}, ${modDisplay})`;
            } else {
                summary += ` (${diceRolls})`;
            }
        }

        // Success/failure indicator
        if (analysis.isCritical) {
            summary += " [CRITICAL HIT]";
        } else if (analysis.isFumble) {
            summary += " [CRITICAL FAILURE]";
        } else if (analysis.degree) {
            summary += ` [${analysis.degree}]`;
        } else if (analysis.isSuccess === true) {
            summary += " ✓";
        } else if (analysis.isSuccess === false) {
            summary += " ✗";
        }

        return summary;
    }
}
