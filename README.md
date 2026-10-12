[![Latest Version](https://img.shields.io/github/v/release/roi007leaf/chat-trimmer?display_name=tag&sort=semver&label=Latest%20Version)](https://github.com/roi007leaf/chat-trimmer/releases/latest)

[![GitHub all releases](https://img.shields.io/github/downloads/roi007leaf/chat-trimmer/total)](https://github.com/roi007leaf/chat-trimmer/releases)

[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fchat-trimmer)](https://forge-vtt.com/bazaar)

# Chat Trimmer

## Clear Chat Log responsiveness

While Chat Trimmer is enabled, Foundry's trash-can **Clear Chat Log** button deletes messages in batches of 10, with 100 ms pauses between batches. This spreads deletion hooks and chat animations over smaller requests to reduce long stalls. Large logs may take longer to finish clearing. The normal confirmation and document permissions apply; messages posted after cleanup starts remain in chat. Clear Chat Log still deletes messages without archiving them.

## Session controls and archive access

- Right-click the Chat Trimmer button → **Set Current Session Number** to match your campaign's session count. This changes the label without starting a new session.
- In the archive viewer, select a session and click the pencil to edit its number. All archive segments for that session are updated. Numbers already used by another archived session are rejected.
- Enable **Archive chat when starting a new session** in module settings to archive all remaining messages before advancing, including messages normally kept by **Messages to Keep**. Archiving must be enabled. Failed archiving leaves the session unchanged. Ending a session through the setup prompt uses the same behavior.
- **Hide archives from players** defaults to enabled and restricts the module's viewer and archive lookup to GMs. Disabling it restores player access. External JSON files are static files and remain accessible by direct URL; for sensitive archives, use Journal storage and keep journal entries and their pages unshared. This setting does not revoke existing journal sharing or remove old external files.

A Foundry VTT module that automatically compresses chat history using intelligent pattern recognition. Reduces memory usage by 80-90% while preserving important information in searchable, organized archives. **No LLM or external services required!**

## 🎯 Problem Statement

- Large chat logs consume memory and cause performance degradation
- Purging chat loses important campaign information
- Players and GMs need to scroll through hundreds of messages to find information
- Existing archive solutions dump raw logs without summarization

## ✨ Solution

**Intelligent compression** that reduces 500+ messages to ~50 organized summaries using algorithm-based pattern recognition.

## 🚀 Features

### Core Features

- ✅ **Combat Encounter Detection** - Automatically identifies and compresses combat encounters
- ✅ **Message Classification** - Categorizes messages by type (combat, dialogue, rolls, items, etc.)
- ✅ **Session Management** - Track multiple sessions with automatic archiving
- ✅ **Archive Storage** - External JSON storage or Journal entries for optimal performance
- ✅ **Advanced Archive Viewer** - Browse, filter, and search archived messages with pagination
- ✅ **Manual Trim** - Trim chat with a single button click
- ✅ **Auto-Trim** - Automatic trimming based on message count or time thresholds
- ✅ **Session Statistics** - View compression ratios and detailed session statistics
- ✅ **Key Events Summary** - Highlights critical moments from your session

### Compression Features

- **Combat Encounters**: Detects combat start/end, tracks rounds, actions, damage, and outcomes
- **Key Events Detection**: Automatically identifies and highlights:
  - Critical successes and failures
  - Death, dying, unconscious, and wounded conditions
  - Hero Point usage
  - High-level spells (4th level and above)
  - XP gains and level ups
  - Major item transfers and loot
  - Persistent damage and debilitating conditions
- **Skill Check Recognition**: Properly labels skill checks with action names (e.g., "Grapple (Athletics)")
- **Item Transfer Tracking**: Preserves item transfer messages
- **Searchable Archives**: Full-text search across all archived content
- **No Data Loss**: Original messages can be viewed from summaries
- **Roll Recreation**: Preserve roll buttons and formulas for later re-rolling

## 📦 Installation

1. Download the latest release
2. Extract to your Foundry VTT `Data/modules` folder
3. Enable "Chat Trimmer & Summarizer" in your world's Module Management
4. Refresh Foundry VTT

## 🎮 Usage

### Quick Start

1. **Find the Archive Button**: Look for the archive icon (📦) in your chat controls
2. **Left-click** to open the Archive Viewer and browse past sessions
3. **Right-click** to open the menu with options:
   - **Trim Chat**: Manually compress all current messages
   - **New Session**: End current session and start a new one
4. **Configure**: Adjust settings in Module Settings under "Chat Trimmer"
5. **Auto-Trim**: Enable in settings to automatically trim based on message count or time

### Archive Viewer

- **Session Summary**: Collapsible section showing key events, participants, duration, and statistics
- **Filter by Category**: Combat, Rolls, Speech, Emotes, Whispers, Healing, Items, Important
- **Search**: Full-text search across all archives (press Enter to search)
- **Session Selection**: View specific sessions or all archives
- **Pagination**: Navigate through large archives with 100 entries per page
- **Expand Entries**: Click any entry to see detailed breakdown with sub-entries
- **View Original**: See the original chat messages that were compressed
- **Roll Buttons**: Re-roll damage and other rolls directly from archived messages

### Settings

#### Auto-Trim Configuration

- **Enable Automatic Trimming**: Toggle auto-trim on/off
- **Additional Messages Before Trim**: How many messages above "Messages to Keep" before auto-trim triggers
- **Messages to Keep Visible**: Number of recent messages to preserve in chat for performance
- **Time Threshold**: Trigger auto-trim after X hours

#### Compression Settings

- **Enable Combat Compression**: Compress combat encounters into summaries
- **Enable Dialogue Compression**: Compress dialogue threads (future feature)
- **Enable Skill Check Clustering**: Group related skill checks (future feature)
- **Preserve Item Transfers**: Always keep item transfer messages

#### Display Settings

- **Use 24-Hour Time Format**: Display timestamps in 24-hour format (e.g., 14:30 instead of 2:30 PM)
- **Storage Location**: Choose between Journal Entry (embedded) or External JSON File (recommended for better performance)

## 🔍 Compression Examples

### Before (47 messages)

```text
[15:32:15] GM: Roll for initiative!
[15:32:18] Bob: Initiative
[15:32:18] 🎲 Bob rolled 1d20+2: 15
[15:32:20] Alice: Initiative
[15:32:20] 🎲 Alice rolled 1d20+4: 18
[15:32:22] Goblin 1: Initiative
[15:32:22] 🎲 Goblin 1 rolled 1d20+1: 8
... [41 more messages] ...
```

### After (Combat Summary + Key Events)

```text
SESSION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Duration: 2h 15m
Participants: Bob, Alice, GM
Combats: 2 | Rolls: 47 | Critical Successes: 3

KEY EVENTS:
💥 15:35 - Alice: Critical Success! Grapple (Athletics): 45
💀 15:38 - Goblin 2 was reduced to 0 HP
⭐ 15:52 - Bob: Leveled Up

━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚔️ Combat: Goblin Ambush (3 rounds, Victory)
  Round 1:
    • Goblin 1 → Bob: Attack (12) [Hit] → Damage (5)
    • Bob → Goblin 1: Attack (8) [Miss]
    • Alice → Goblin 2: Attack (15) [Hit] → Damage (8)

  Round 2:
    • Alice → Goblin 2: Attack (20) [CRITICAL HIT] → Critical Damage (18)
    • Goblin 2: Dies
    • Bob → Goblin 1: Attack (14) [Hit] → Damage (7)

  [Expand] [View Original Messages]
```

### Compression Ratio

97% reduction (47 messages → 1 combat summary)

## 🛠️ Technical Details

### Algorithm-Based Detection

The module uses pattern recognition algorithms to detect:

1. **Combat Encounters**
   - Initiative rolls and combat start/end markers
   - Attack rolls, damage, hits/misses
   - Critical hits and fumbles
   - Character knockouts and deaths
   - Round tracking and combat outcome detection

2. **Key Events (Session Highlights)**
   - Critical successes/failures via PF2e flags and content parsing
   - Death saves and recovery checks
   - Dying, death, unconscious, and wounded conditions
   - Hero Point usage
   - High-level spells (4th level and above)
   - XP gains and level ups
   - Major item transfers (100+ gold, legendary items, treasure)
   - Persistent damage and debilitating conditions

3. **Message Classification**
   - Multi-category support (entries can belong to multiple categories)
   - Combat, Rolls, Speech, Emotes, Whispers, Healing, Items, Important
   - PF2e-specific roll type detection (attack-roll, damage-roll, skill-check, saving-throw)
   - Skill check action extraction (e.g., "Grapple (Athletics Check)")

4. **Smart Compression**
   - Groups related messages by combat encounter
   - Extracts key information (actors, targets, outcomes, damage)
   - Generates human-readable summaries
   - Preserves roll data for recreation
   - Maintains chronological order

### Data Storage

- **External JSON Storage** (Recommended): Stores archives as JSON files in `Data/chat-trimmer-archives/`
  - Better performance for large archives
  - Easier to backup and transfer
  - Indexed in world settings for fast access

- **Journal Entry Storage**: Stores archives as Journal Entries in "Chat Archives" folder
  - Native Foundry integration
  - No external files needed
  - May impact performance with very large archives

Each archive contains:

- Compressed entries with original message references
- Extracted data (participants, locations, items, damage)
- Search keywords for full-text search
- Session statistics and metadata
- Key events list for session summary
- Roll data for button recreation

## 🎯 Performance

- **Memory Reduction**: 80-90% reduction in chat data
- **Processing Speed**: 500 messages processed in <5 seconds
- **Search Speed**: Full-text search results in <1 second
- **Archive Loading**: Pagination ensures fast loading even with thousands of entries
- **Storage Options**: External JSON recommended for optimal performance with large archives
- **UI Responsiveness**: Non-blocking operations keep Foundry responsive during trim

## 🔮 Future Features (Roadmap)

### Enhanced Compression

- Dialogue thread detection and compression
- Skill check clustering
- Location tracking and scene changes
- Advanced keyword extraction with NPC/location recognition

### User Experience Improvements

- Progress indicators during trim operations
- Archive comparison tools
- Session timeline visualization
- Statistics dashboard with charts

### Advanced Features

- Export to PDF/JSON/Markdown
- Undo/restore operations
- Custom compression rules and filters
- Archive retention policies (auto-delete old archives)
- Integration with other modules (Simple Calendar, etc.)

## 🐛 Troubleshooting

### Chat not trimming

- Ensure you're a GM (only GMs can trim chat)
- Check that there are messages to trim beyond the "Messages to Keep" threshold
- Verify "Enable Automatic Trimming" is turned on (if using auto-trim)
- Check browser console (F12) for error messages

### Archives not showing

- For Journal storage: Check the "Chat Archives" journal folder
- For External JSON storage: Verify files exist in `Data/chat-trimmer-archives/`
- Try refreshing Foundry VTT (F5)
- Verify module is enabled in Module Management

### Archive Viewer issues

- If entries don't load: Check Storage Type setting and ensure files/journals exist
- If search doesn't work: Press Enter after typing your search query
- If pagination is broken: Check browser console for errors

### Performance issues

- Switch to External JSON storage (recommended for large archives)
- Reduce "Messages to Keep Visible" setting
- Decrease auto-trim thresholds
- Check console (F12) for errors or warnings

### Key Events not showing

- Ensure you're on version 1.0.6 or later
- Trim new messages after updating to capture key events
- Check that messages have PF2e flags or critical content
- Expand session summary to view key events list

## 💻 Developer API

Access module functionality programmatically via console:

```javascript
// Get module instance
const chatTrimmer = game.modules.get("chat-trimmer")?.instance;

// Manual trim (ignores "Messages to Keep" setting)
await chatTrimmer.trimmer.trim(null, { ignoreKeep: true });

// View archive viewer
const viewer = new game.modules.get("chat-trimmer").ArchiveViewerV2(
  chatTrimmer.archiveManager,
);
viewer.render(true);

// Access archive manager
const archiveManager = chatTrimmer.archiveManager;

// Get all archives
const archives = await archiveManager.getAllArchives();

// Get specific archive entries
const entries = await archiveManager.getArchiveEntries(archive);

// Generate session summary
const summary = await archiveManager.generateSessionSummary(archive, entries);

// Delete an archive
await archive.delete();
```

### Hooks

Listen to module events:

```javascript
// Before trim starts
Hooks.on("chatTrimmer.beforeTrim", (messages, options) => {
  console.log(`About to trim ${messages.length} messages`);
});

// After trim completes
Hooks.on("chatTrimmer.afterTrim", (archive, result) => {
  console.log(`Trimmed to ${result.compressionRatio}% compression`);
});
```

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- Additional detection algorithms (dialogue, skill checks)
- UI/UX enhancements
- Performance optimizations
- Localization (additional languages)
- Bug fixes and testing

Run regression tests (including Chromium toolbar layout and click checks):

```sh
npm ci
npx playwright install chromium
npm test
```

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built for the Foundry VTT community to solve the chat data overload problem.

## 📧 Support

- Report bugs via GitHub Issues
- Feature requests welcome
- Community support on Foundry Discord

---

- **Version**: 1.0.0
- **Compatibility**: Foundry VTT v13+
- **Systems**: All game systems (optimized for PF2e, works with D&D 5e and others)
- **Repository**: [GitHub](https://github.com/roi007leaf/chat-trimmer)
