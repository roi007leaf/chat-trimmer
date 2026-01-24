/**
 * Settings configuration panel
 */
export class SettingsPanel {
    static register() {
        // Auto-trim settings
        game.settings.register("chat-trimmer", "autoTrimEnable", {
            name: game.i18n.localize("CHATTRIMMER.Settings.AutoTrimEnable"),
            hint: game.i18n.localize("CHATTRIMMER.Settings.AutoTrimEnableHint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
        });

        game.settings.register("chat-trimmer", "enableArchiving", {
            name: game.i18n.localize("CHATTRIMMER.Settings.EnableArchiving"),
            hint: game.i18n.localize("CHATTRIMMER.Settings.EnableArchivingHint"),
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register("chat-trimmer", "messageThreshold", {
            name: game.i18n.localize("CHATTRIMMER.Settings.MessageThreshold"),
            hint: game.i18n.localize("CHATTRIMMER.Settings.MessageThresholdHint"),
            scope: "world",
            config: true,
            type: Number,
            default: 500,
            range: {
                min: 0,
                max: 50,
                step: 1,
            },
        });

        game.settings.register("chat-trimmer", "messagesToKeep", {
            name: "CHATTRIMMER.Settings.MessagesToKeep",
            hint: "CHATTRIMMER.Settings.MessagesToKeepHint",
            scope: "world",
            config: true,
            type: Number,
            default: 10,
            range: {
                min: 0,
                max: 100,
                step: 5,
            },
        });

        game.settings.register("chat-trimmer", "timeThreshold", {
            name: game.i18n.localize("CHATTRIMMER.Settings.TimeThreshold"),
            hint: game.i18n.localize("CHATTRIMMER.Settings.TimeThresholdHint"),
            scope: "world",
            config: true,
            type: Number,
            default: 2,
            range: {
                min: 1,
                max: 24,
                step: 1,
            },
        });

        // Compression settings
        game.settings.register("chat-trimmer", "enableCombatCompression", {
            name: game.i18n.localize("CHATTRIMMER.Settings.EnableCombatCompression"),
            hint: game.i18n.localize(
                "CHATTRIMMER.Settings.EnableCombatCompressionHint",
            ),
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register("chat-trimmer", "enableDialogueCompression", {
            name: game.i18n.localize(
                "CHATTRIMMER.Settings.EnableDialogueCompression",
            ),
            hint: game.i18n.localize(
                "CHATTRIMMER.Settings.EnableDialogueCompressionHint",
            ),
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register("chat-trimmer", "enableSkillCheckClustering", {
            name: game.i18n.localize(
                "CHATTRIMMER.Settings.EnableSkillCheckClustering",
            ),
            hint: game.i18n.localize(
                "CHATTRIMMER.Settings.EnableSkillCheckClusteringHint",
            ),
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register("chat-trimmer", "preserveItemTransfers", {
            name: game.i18n.localize("CHATTRIMMER.Settings.PreserveItemTransfers"),
            hint: game.i18n.localize(
                "CHATTRIMMER.Settings.PreserveItemTransfersHint",
            ),
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
        });

        game.settings.register("chat-trimmer", "use24hTime", {
            name: game.i18n.localize("CHATTRIMMER.Settings.Use24hTime"),
            hint: game.i18n.localize("CHATTRIMMER.Settings.Use24hTimeHint"),
            scope: "client",
            config: true,
            type: Boolean,
            default: false,
        });

        game.settings.register("chat-trimmer", "storageType", {
            name: game.i18n.localize("CHATTRIMMER.Settings.StorageType"),
            hint: game.i18n.localize("CHATTRIMMER.Settings.StorageTypeHint"),
            scope: "world",
            config: true,
            type: String,
            choices: {
                journal: game.i18n.localize("CHATTRIMMER.Settings.StorageJournal"),
                external: game.i18n.localize("CHATTRIMMER.Settings.StorageExternal"),
            },
            default: "external",
        });

        // Internal settings (not shown in config)
        game.settings.register("chat-trimmer", "lastTrimTime", {
            scope: "world",
            config: false,
            type: Number,
            default: 0,
        });

        game.settings.register("chat-trimmer", "currentSessionName", {
            scope: "world",
            config: false,
            type: String,
            default: "Session 1",
        });

        game.settings.register("chat-trimmer", "currentSessionNumber", {
            scope: "world",
            config: false,
            type: Number,
            default: 1,
        });

        game.settings.register("chat-trimmer", "currentSessionStartTime", {
            scope: "world",
            config: false,
            type: Number,
            default: Date.now(),
        });

        game.settings.register("chat-trimmer", "archiveIndex", {
            scope: "world",
            config: false,
            type: Object,
            default: [],
        });
    }
}
