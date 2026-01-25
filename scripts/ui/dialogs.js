/**
 * ApplicationV2 Dialog Classes
 */

/**
 * Confirmation dialog using ApplicationV2
 */
export class ConfirmDialog extends foundry.applications.api.DialogV2 {
    constructor(options = {}) {
        super(options);
    }

    static async confirm({ title, content, yes, no } = {}) {
        return new Promise((resolve) => {
            new foundry.applications.api.DialogV2({
                window: { title: title || "Confirm" },
                content: content || "<p>Are you sure?</p>",
                buttons: [
                    {
                        action: "yes",
                        label: yes?.label || "Yes",
                        icon: yes?.icon || "fa-check",
                        default: true,
                        callback: () => resolve(true),
                    },
                    {
                        action: "no",
                        label: no?.label || "No",
                        icon: no?.icon || "fa-times",
                        callback: () => resolve(false),
                    },
                ],
                close: () => resolve(false),
            }).render({ force: true });
        });
    }
}

/**
 * Message viewer dialog for archived messages
 */
export class MessageViewerDialog extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2,
) {
    constructor(options = {}) {
        super(options);
        this.messageContent = options.messageContent || "";
        this.messageTitle = options.messageTitle || "Message";
        this.messageCount = options.messageCount || 1;
        this.speaker = options.speaker || "Unknown";
        this.timestamp = options.timestamp || null;
        this.chatMessage = options.chatMessage || null; // Store the ChatMessage instance
    }

    static DEFAULT_OPTIONS = {
        id: "chat-trimmer-message-viewer",
        classes: ["chat-trimmer-dialog", "original-messages-dialog"],
        tag: "div",
        window: {
            title: game.i18n?.localize("CHATTRIMMER.ArchiveViewer.OriginalMessage") || "Original Message",
            icon: "fa-solid fa-message",
            resizable: true,
        },
        position: {
            width: 600,
            height: "auto",
        },
        actions: {
            close: MessageViewerDialog.prototype.close,
        },
    };

    static PARTS = {
        content: {
            template: "modules/chat-trimmer/templates/dialogs/message-viewer.hbs",
        },
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        return {
            ...context,
            messageTitle: this.messageTitle,
            messageCount: this.messageCount,
            messageContent: this.messageContent,
            speaker: this.speaker,
            timestamp: this.timestamp,
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);

        // Activate listeners on the rendered chat message
        if (this.chatMessage) {
            const messageElement = this.element.querySelector('.chat-message');
            if (messageElement) {
                const $messageElement = $(messageElement);

                // Handle PF2e-specific action buttons
                // Add listeners to PF2e buttons
                // Use broad selector for both <button> and <a> or other elements with data-action
                if (game.system.id === 'pf2e') {
                    $messageElement.find('[data-action]').on('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        const button = event.currentTarget;
                        const dataset = button.dataset;
                        const action = dataset.action;

                        console.log(`Archive Viewer | Clicked element <${button.tagName}> with action: ${action}`);

                        // Get origin data from the message flags
                        const origin = this.chatMessage.flags?.pf2e?.origin;
                        console.log('Archive Viewer | Origin data:', origin);

                        if (!origin) {
                            console.warn('Archive Viewer | No PF2e origin data found');
                            return;
                        }

                        // Get the actor and item
                        const actor = await fromUuid(origin.actor);
                        const item = await fromUuid(origin.uuid);

                        console.log('Archive Viewer | Resolved actor:', actor?.name);
                        console.log('Archive Viewer | Resolved item:', item?.name, item?.type);

                        if (!actor || !item) {
                            console.warn('Archive Viewer | Could not resolve actor or item');
                            return;
                        }

                        // Get the context from the message
                        const context = this.chatMessage.flags?.pf2e?.context;
                        console.log('Archive Viewer | Message context:', context);

                        // Execute the action based on the data-action attribute
                        // PF2e uses different action names for different contexts
                        try {
                            const dataset = event.currentTarget.dataset;
                            console.log('Archive Viewer | Button dataset:', dataset);

                            switch (action) {
                                case 'spell-damage':
                                    console.log('Archive Viewer | Calling spell rollDamage');
                                    await item.rollDamage?.({ event, message: this.chatMessage });
                                    break;

                                case 'strike-damage':
                                case 'damage':
                                case 'strike-critical':
                                case 'critical':
                                {
                                    console.log('Archive Viewer | Calling strike damage/critical');
                                    const isCritical = action.includes('critical') ||
                                        dataset.outcome === 'criticalSuccess' ||
                                        dataset.critical === 'true';

                                    if (item.type === 'weapon' || context?.action === 'strike') {
                                        // For PF2e strikes, we need to find the strike action on the actor
                                        const strikes = actor.system.actions || [];
                                        const strikeIndex = dataset.index;
                                        const strikeIdentifier = context?.identifier;

                                        // Try to find the strike by index, identifier, or item
                                        const strike = strikes[strikeIndex] ||
                                            strikes.find(s => strikeIdentifier && s.identifier === strikeIdentifier) ||
                                            strikes.find(s => s.item?.id === item.id || s.slug === item.slug);

                                        if (strike) {
                                            console.log(`Archive Viewer | Executing PF2e strike ${isCritical ? 'critical' : 'damage'}`);

                                            // Prepare options to ensure critical is respected
                                            // 'check:outcome:critical-success' is the standard roll option
                                            const rollOptions = isCritical ? ['check:outcome:critical-success'] : [];

                                            // Use strike.damage for both, forcing critical via options/outcome if needed
                                            // This often handles dialogs better than strike.critical() which can be just a shortcut
                                            await strike.damage?.({
                                                event,
                                                message: this.chatMessage,
                                                outcome: isCritical ? 'criticalSuccess' : undefined,
                                                options: rollOptions,
                                                // Some system versions use this
                                                getFormula: isCritical ? (d) => d.criticalFormula : undefined
                                            });

                                        } else {
                                            console.warn('Archive Viewer | Could not find strike action, falling back to item.rollDamage');
                                            await item.rollDamage?.({
                                                event,
                                                message: this.chatMessage,
                                                options: isCritical ? ['check:outcome:critical-success'] : [],
                                                outcome: isCritical ? 'criticalSuccess' : undefined
                                            });
                                        }
                                    } else {
                                        // Non-weapon damage (e.g. general item damage)
                                        await item.rollDamage?.({
                                            event,
                                            message: this.chatMessage,
                                            options: isCritical ? ['check:outcome:critical-success'] : [],
                                            outcome: isCritical ? 'criticalSuccess' : undefined
                                        });
                                    }
                                    break;
                                }

                                case 'spell-attack':
                                case 'strike-attack':
                                case 'attack':
                                    console.log('Archive Viewer | Calling rollAttack');
                                    if (item.type === 'weapon' || context?.action === 'strike') {
                                        const strikes = actor.system.actions || [];
                                        const strikeIndex = dataset.index;
                                        const strikeIdentifier = context?.identifier;
                                        const variantIndex = dataset.variantIndex || 0;

                                        const strike = strikes[strikeIndex] ||
                                            strikes.find(s => strikeIdentifier && s.identifier === strikeIdentifier) ||
                                            strikes.find(s => s.item?.id === item.id || s.slug === item.slug);

                                        if (strike && strike.variants?.[variantIndex]) {
                                            console.log('Archive Viewer | Executing PF2e strike attack');
                                            await strike.variants[variantIndex].roll({ event });
                                        } else {
                                            await item.rollAttack?.({ event, message: this.chatMessage });
                                        }
                                    } else {
                                        await item.rollAttack?.({ event, message: this.chatMessage });
                                    }
                                    break;

                                case 'apply-damage':
                                case 'applyDamage':
                                case 'apply-healing':
                                case 'applyHealing':
                                case 'target-applyDamage':
                                {
                                    console.log('Archive Viewer | Applying damage/healing from archived message');
                                    const multiplier = Number(dataset.multiplier || (action === 'apply-healing' || action === 'applyHealing' ? -1 : 1));
                                    try {
                                        // 1. Try PF2e Toolbelt (support multiple API locations)
                                        const toolbelt = game.modules.get('pf2e-toolbelt');
                                        const toolbeltApi = toolbelt?.api || game.pf2eToolbelt;
                                        // Check for target helper which is common in toolbelt
                                        if (toolbelt?.active && toolbeltApi?.target?.applyDamage) {
                                            console.log('Archive Viewer | Using PF2e Toolbelt for damage application');
                                            await toolbeltApi.target.applyDamage(this.chatMessage, multiplier);
                                            break;
                                        }

                                        // 2. PF2e System Damage Application logic
                                        const applyDamageFn = game.pf2e?.system?.chat?.applyDamageFromMessage
                                            || game.pf2e?.RollPF2e?.applyDamageFromMessage
                                            || (typeof CONFIG.ChatMessage?.documentClass?.applyDamageFromMessage === 'function' ? CONFIG.ChatMessage.documentClass.applyDamageFromMessage : null);

                                        if (typeof applyDamageFn === 'function') {
                                            console.log('Archive Viewer | Using PF2e System API');
                                            await applyDamageFn({
                                                message: this.chatMessage,
                                                multiplier,
                                                promptModifier: event.shiftKey,
                                                rollIndex: 0
                                            });
                                        } else {
                                            console.warn('Archive Viewer | PF2e system API not found, attempting manual fallback');

                                            // 3. Manual Fallback
                                            let tokens = [];

                                            // Determine target based on action type
                                            const isTargetAction = action.includes('target');

                                            // 1. Try context target first if it's a target action
                                            if (isTargetAction) {
                                                const targetInfo = context?.target || this.chatMessage.flags?.pf2e?.target;
                                                if (targetInfo?.token) {
                                                    const tokenUuid = targetInfo.token.startsWith('Scene.') ? targetInfo.token : `Scene.${canvas.scene.id}.Token.${targetInfo.token}`;
                                                    const targetToken = await fromUuid(tokenUuid);
                                                    if (targetToken?.object) {
                                                        tokens = [targetToken.object];
                                                        console.log(`Archive Viewer | Using context target: ${targetToken.name}`);
                                                    }
                                                }
                                            }

                                            // 2. If not a target action, OR if target lookup failed, use selected tokens
                                            // (Unless it was a target action and we failed to find one - in that case we shouldn't default to selected to avoid accidents, but user might expect it)
                                            if (tokens.length === 0 && !isTargetAction) {
                                                tokens = canvas.tokens.controlled;
                                            } else if (tokens.length === 0 && isTargetAction) {
                                                console.warn("Archive Viewer | Target action requested but no target found in context.");
                                                // Ideally warn user, but maybe fallback to selected?
                                                // For safety, let's fall back to selected but warn
                                                tokens = canvas.tokens.controlled;
                                                if (tokens.length > 0) {
                                                    ui.notifications.warn("Could not find original target. Applying to selected token instead.");
                                                }
                                            }

                                            if (tokens.length === 0) {
                                                ui.notifications.warn("PF2E.ErrorMessage.NoTokenSelected", { localize: true });
                                            } else {
                                                const roll = this.chatMessage.rolls.find(r => r.constructor.name === "DamageRoll") || this.chatMessage.rolls[0];
                                                if (!roll) throw new Error("No damage roll found in message");

                                                const damageValue = Math.floor(roll.total * multiplier);

                                                for (const token of tokens) {
                                                    if (token.actor && typeof token.actor.applyDamage === 'function') {
                                                        await token.actor.applyDamage({
                                                            damage: damageValue,
                                                            token: token,
                                                            item: this.chatMessage.item,
                                                            skipIWR: multiplier < 0,
                                                        });
                                                        ui.notifications.info(`Applied ${damageValue} ${multiplier < 0 ? 'healing' : 'damage'} to ${token.name}`);
                                                    }
                                                }
                                            }
                                        }
                                    } catch (err) {
                                        console.error('Archive Viewer | Error applying damage:', err);
                                        ui.notifications.error('Could not apply damage from archived message');
                                    }
                                    break;
                                }

                                case 'shield-block':
                                case 'shieldBlock':
                                case 'target-shieldBlock':
                                    console.log('Archive Viewer | Applying shield block from archived message');
                                    try {
                                        // Log available PF2e API structure for debugging
                                        console.log('Archive Viewer | PF2e API structure:', {
                                            'game.pf2e': game.pf2e ? Object.keys(game.pf2e) : 'undefined',
                                            'game.pf2e.actions': game.pf2e?.actions ? Object.keys(game.pf2e.actions) : 'undefined',
                                            'CONFIG.PF2E': CONFIG.PF2E ? Object.keys(CONFIG.PF2E) : 'undefined'
                                        });

                                        // 1. Try various PF2e system API locations
                                        const shieldBlockFn =
                                            game.pf2e?.actions?.shieldBlock?.applyDamage
                                            || game.pf2e?.actions?.shieldBlock
                                            || game.pf2e?.ShieldBlock?.applyFromMessage
                                            || game.pf2e?.system?.chat?.ShieldBlock?.applyFromMessage
                                            || CONFIG.PF2E?.actions?.shieldBlock;

                                        if (typeof shieldBlockFn === 'function') {
                                            console.log('Archive Viewer | Found PF2e shield block function, calling it');
                                            await shieldBlockFn(this.chatMessage, event);
                                        }
                                        // 2. Try message's own handler
                                        else if (typeof this.chatMessage.getFlag === 'function') {
                                            console.log('Archive Viewer | Trying direct message flag approach');
                                            const messageFlags = this.chatMessage.flags?.pf2e;
                                            console.log('Archive Viewer | Message flags:', messageFlags);

                                            // Try to find the shield block action data
                                            const shieldBlockData = messageFlags?.context?.shieldBlock;
                                            if (shieldBlockData) {
                                                console.log('Archive Viewer | Found shield block data in flags:', shieldBlockData);
                                                // Try to apply using actor methods
                                                const actorUuid = messageFlags.origin?.actor;
                                                if (actorUuid) {
                                                    const actor = await fromUuid(actorUuid);
                                                    if (actor && typeof actor.applyShieldBlock === 'function') {
                                                        console.log('Archive Viewer | Using actor.applyShieldBlock');
                                                        await actor.applyShieldBlock(this.chatMessage);
                                                    } else {
                                                        console.warn('Archive Viewer | Actor found but no applyShieldBlock method');
                                                        ui.notifications.warn("Shield block not available. Please apply manually.");
                                                    }
                                                } else {
                                                    console.warn('Archive Viewer | No actor UUID in message flags');
                                                    ui.notifications.warn("Cannot determine actor for shield block. Please apply manually.");
                                                }
                                            } else {
                                                console.warn('Archive Viewer | No shield block data in message flags');
                                                ui.notifications.warn("Shield block not available from archived message. Please apply manually.");
                                            }
                                        }
                                        else {
                                            console.warn('Archive Viewer | No PF2e ShieldBlock API found');
                                            console.warn('Archive Viewer | Available in game.pf2e:', game.pf2e ? Object.keys(game.pf2e) : 'undefined');
                                            ui.notifications.warn("Shield block not supported from archived messages. Please apply shield damage manually.");
                                        }
                                    } catch (err) {
                                        console.error('Archive Viewer | Error applying shield block:', err);
                                        ui.notifications.error(`Shield block failed: ${err.message}`);
                                    }
                                    break;

                                case 'expandRoll':
                                {
                                    console.log('Archive Viewer | Toggling roll tooltip');
                                    const element = event.currentTarget;
                                    const $element = $(element);

                                    // Try getting tooltip part
                                    let tooltip = element.querySelector('.dice-tooltip');

                                    // If click was on the header, tooltip might be sibling or child
                                    if (!tooltip) {
                                        tooltip = element.closest('.dice-roll')?.querySelector('.dice-tooltip');
                                    }

                                    if (tooltip) {
                                        const $tooltip = $(tooltip);
                                        const wasHidden = $tooltip.is(':hidden') || $tooltip.hasClass('hidden');
                                        console.log(`Archive Viewer | Tooltip found. Hidden? ${wasHidden}`);

                                        if (wasHidden) {
                                            $tooltip.removeClass('hidden').slideDown(200);
                                            element.classList.add('expanded');
                                        } else {
                                            $tooltip.slideUp(200, () => $tooltip.addClass('hidden'));
                                            element.classList.remove('expanded');
                                        }
                                    } else {
                                        console.warn('Archive Viewer | No .dice-tooltip found to expand');
                                    }
                                    break;
                                }

                                case 'set-targets':
                                    console.log('Archive Viewer | "Set Targets" action clicked (ignored in archive)');
                                    // This functionality requires live scene interaction which might not be relevant in archive
                                    break;

                                case 'expand-damage-context':
                                {
                                    console.log('Archive Viewer | Toggling damage context visibility');
                                    const button = event.currentTarget;
                                    const $button = $(button);

                                    // Search strategy 1: Relative to message content
                                    // PF2e typically puts it in .message-content -> .damage-application
                                    let damageApplication = button.closest('.message-content')?.querySelector('.damage-application');

                                    // Search strategy 2: Relative to chat message root
                                    if (!damageApplication) {
                                        damageApplication = button.closest('.chat-message')?.querySelector('.damage-application');
                                    }

                                    // Search strategy 3: jQuery sibling/parent search (handles different DOM structures)
                                    if (!damageApplication) {
                                        // Sometimes it's a sibling of the container the button is in
                                        const $container = $button.closest('.dice-roll, .card-content');
                                        damageApplication = $container.find('.damage-application')[0];

                                        // Or just search the whole rendered message in this dialog
                                        if (!damageApplication) {
                                            damageApplication = this.element.querySelector('.damage-application');
                                        }
                                    }

                                    if (damageApplication) {
                                        const $damageApp = $(damageApplication);
                                        // Check if it's currently hidden
                                        // PF2e uses display:none inline style or .hidden class
                                        const isHidden = $damageApp.css('display') === 'none' || $damageApp.hasClass('hidden');

                                        console.log(`Archive Viewer | Found damage application container. Currently hidden: ${isHidden}`);

                                        if (isHidden) {
                                            $damageApp.removeClass('hidden').show().css('display', 'flex');
                                            button.setAttribute('aria-expanded', 'true');
                                            // Ensure buttons inside are active? (They should be captured by the main listener)
                                        } else {
                                            $damageApp.addClass('hidden').hide();
                                            button.setAttribute('aria-expanded', 'false');
                                        }
                                    } else {
                                        console.warn('Archive Viewer | Could not find .damage-application container to toggle');
                                        // Fallback: If we really can't find it, maybe the message didn't render it?
                                        // This happens if the user doesn't have permission or if the system stripped it.
                                        ui.notifications.warn("Could not find damage buttons to expand.");
                                    }
                                    break;
                                }

                                default:
                                    console.log(`Archive Viewer | Unhandled action: ${action}`);
                                    // Try to use the core Foundry handler as a last resort
                                    // ui.chat._onChatCardAction(event); // REMOVED as it breaks in v13
                                    if (ui.chat._onChatCardAction) {
                                        ui.chat._onChatCardAction(event);
                                    }
                                    break;
                            }
                        } catch (error) {
                            console.error('Archive Viewer | Error executing action:', error);
                            ui.notifications.error(`Failed to execute action: ${error.message}`);
                        }
                    });
                } else {
                    // For non-PF2e systems, use Foundry's default ChatLog handler
                    $messageElement.find('button[data-action]').on('click', ui.chat._onChatCardAction?.bind(ui.chat));
                }

                console.log('Archive Viewer | Activated listeners for original message');
            }
        }
    }
}
