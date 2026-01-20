/**
 * Utility class for extracting keywords and creating search indices
 */
export class KeywordExtractor {
    /**
     * Extract keywords from data object
     */
    static extractFromData(data) {
        const keywords = new Set();

        // Extract from different data types
        const text = JSON.stringify(data).toLowerCase();

        // Extract actor/character names
        // Extract actor/character names
        if (data.participants) {
            if (Array.isArray(data.participants)) {
                data.participants.forEach((p) => keywords.add(p.toLowerCase()));
            } else {
                if (data.participants.allies) {
                    data.participants.allies.forEach((p) => keywords.add(p.toLowerCase()));
                }
                if (data.participants.enemies) {
                    data.participants.enemies.forEach((p) => keywords.add(p.toLowerCase()));
                }
            }
        }
        if (data.actor) {
            keywords.add(data.actor.toLowerCase());
        }

        // Extract location names
        if (data.location) {
            keywords.add(data.location.toLowerCase());
        }

        // Extract NPC names
        if (data.npcsMentioned) {
            data.npcsMentioned.forEach((npc) => keywords.add(npc.toLowerCase()));
        }

        // Extract item names
        if (data.itemsMentioned) {
            data.itemsMentioned.forEach((item) => keywords.add(item.toLowerCase()));
        }

        // Extract topics
        if (data.topics) {
            data.topics.forEach((topic) => keywords.add(topic.toLowerCase()));
        }

        // Extract from summary text
        if (data.summary) {
            this.extractFromText(JSON.stringify(data.summary)).forEach((kw) =>
                keywords.add(kw),
            );
        }

        return Array.from(keywords);
    }

    /**
     * Extract keywords from text
     */
    static extractFromText(text) {
        const keywords = new Set();
        const lower = text.toLowerCase();

        // Extract capitalized words (proper nouns)
        const nouns = text.match(/\b[A-Z][a-z]+\b/g);
        if (nouns) {
            nouns.forEach((noun) => keywords.add(noun.toLowerCase()));
        }

        // Extract quest-related keywords
        const questKeywords = [
            "find",
            "search",
            "investigate",
            "discover",
            "locate",
            "retrieve",
            "deliver",
        ];
        questKeywords.forEach((kw) => {
            if (lower.includes(kw)) keywords.add(kw);
        });

        // Extract combat keywords
        const combatKeywords = [
            "attack",
            "damage",
            "hit",
            "miss",
            "kill",
            "defeat",
            "victory",
        ];
        combatKeywords.forEach((kw) => {
            if (lower.includes(kw)) keywords.add(kw);
        });

        return Array.from(keywords);
    }

    /**
     * Build search index from entries
     */
    static buildSearchIndex(entries) {
        const index = {
            keywords: new Set(),
            actors: new Set(),
            scenes: new Set(),
            items: new Set(),
            types: {},
        };

        for (const entry of entries) {
            // Add keywords
            if (entry.searchKeywords) {
                entry.searchKeywords.forEach((kw) => index.keywords.add(kw));
            }

            // Add type
            if (!index.types[entry.type]) {
                index.types[entry.type] = [];
            }
            index.types[entry.type].push(entry.id);

            // Extract actors, scenes, items from summary
            if (entry.summary) {
                if (entry.summary.participants) {
                    if (Array.isArray(entry.summary.participants)) {
                        entry.summary.participants.forEach((p) => index.actors.add(p));
                    } else if (entry.summary.participants.allies) {
                        entry.summary.participants.allies.forEach((p) =>
                            index.actors.add(p),
                        );
                        entry.summary.participants.enemies.forEach((p) =>
                            index.actors.add(p),
                        );
                    }
                }

                if (entry.summary.location) {
                    index.scenes.add(entry.summary.location);
                }

                if (entry.summary.itemsMentioned) {
                    entry.summary.itemsMentioned.forEach((i) => index.items.add(i));
                }
            }
        }

        // Convert sets to arrays for storage
        return {
            keywords: Array.from(index.keywords),
            actors: Array.from(index.actors),
            scenes: Array.from(index.scenes),
            items: Array.from(index.items),
            types: index.types,
        };
    }
}
