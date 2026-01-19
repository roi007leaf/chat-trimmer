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

        game.settings.register("chat-trimmer", "messageThreshold", {
            name: game.i18n.localize("CHATTRIMMER.Settings.MessageThreshold"),
            hint: game.i18n.localize("CHATTRIMMER.Settings.MessageThresholdHint"),
            scope: "world",
            config: true,
            type: Number,
            default: 500,
            range: {
                min: 20,
                max: 100,
                step: 10,
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

        // Internal settings (not shown in config)
        game.settings.register("chat-trimmer", "lastTrimTime", {
            scope: "world",
            config: false,
            type: Number,
            default: 0,
        });
    }
}
