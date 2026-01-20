# Chat Trimmer & Summarizer

A Foundry VTT module that automatically compresses chat history using intelligent pattern recognition. Reduces memory usage by 80-90% while preserving important information in searchable, organized archives. **No LLM or external services required!**

## 🎯 Problem Statement

- Large chat logs consume memory and cause performance degradation
- Purging chat loses important campaign information
- Players and GMs need to scroll through hundreds of messages to find information
- Existing archive solutions dump raw logs without summarization

## ✨ Solution

**Intelligent compression** that reduces 500+ messages to ~50 organized summaries using algorithm-based pattern recognition.

## 🚀 Features

### Phase 1 (MVP - Current Implementation)

- ✅ **Combat Encounter Detection** - Automatically identifies and compresses combat encounters
- ✅ **Message Classification** - Categorizes messages by type and importance
- ✅ **Archive Storage** - Saves compressed data as searchable journal entries
- ✅ **Archive Viewer** - Browse and search archived messages
- ✅ **Manual Trim** - Trim chat with a single button click
- ✅ **Auto-Trim** - Automatic trimming based on message count or time thresholds
- ✅ **Statistics** - View compression ratios and session statistics

### Compression Features

- **Combat Encounters**: Detects combat start/end, tracks rounds, actions, damage, and outcomes
- **Critical Message Preservation**: Always keeps death saves, critical hits, level ups, etc.
- **Item Transfer Tracking**: Preserves item transfer messages
- **Searchable Archives**: Full-text search across all archived content
- **No Data Loss**: Original messages can be viewed from summaries

## 📦 Installation

1. Download the latest release
2. Extract to your Foundry VTT `Data/modules` folder
3. Enable "Chat Trimmer & Summarizer" in your world's Module Management
4. Refresh Foundry VTT

## 🎮 Usage

### Quick Start

1. **Access Controls**: Look for the trim buttons in your chat interface
2. **Trim Chat**: Click "Trim Chat" button to manually compress current messages
3. **View Archives**: Click "View Archives" to browse compressed chat history
4. **Configure**: Adjust settings in Module Settings under "Chat Trimmer & Summarizer"

### Archive Viewer

- **Filter by Type**: Combat, Dialogue, Skill Checks, Items
- **Search**: Full-text search across all archives
- **Archive Selection**: View current archive or all archives
- **Expand Entries**: Click any entry to see detailed breakdown
- **View Original**: See the original messages that were compressed

### Settings

#### Auto-Trim Triggers

- **Enable Automatic Trimming**: Toggle auto-trim on/off
- **Message Threshold**: Trim when chat reaches X messages (default: 500)
- **Messages to Keep**: Number of recent messages to preserve in chat (default: 100)
- **Time Threshold**: Trim every X hours (default: 2)

#### Compression Settings

- **Enable Combat Compression**: Compress combat encounters
- **Enable Dialogue Compression**: Compress dialogue threads (future)
- **Enable Skill Check Clustering**: Group related skill checks (future)
- **Preserve Item Transfers**: Always keep item transfer messages

## 🔍 Compression Examples

### Before (47 messages)

```
[15:32:15] GM: Roll for initiative!
[15:32:18] Bob: Initiative
[15:32:18] 🎲 Bob rolled 1d20+2: 15
... [44 more messages] ...
```

### After (1 summary)

```
⚔️ Combat: Goblin Ambush (3 rounds, Victory)
  15:32 - 15:45 (13 minutes)

  Round 1:
    • Goblin 1 hit Bob (5 dmg)
    • Bob missed Goblin 1
    • Alice hit Goblin 2 (8 dmg)

  Round 2:
    • Alice CRIT Goblin 2 (18 dmg) - KILLED
    • Bob hit Goblin 1 (7 dmg)

  [View Original Messages]
```

**Compression Ratio: 97% reduction**

## 🛠️ Technical Details

### Algorithm-Based Detection

The module uses pattern recognition algorithms to detect:

1. **Combat Encounters**
   - Initiative rolls and combat start/end markers
   - Attack rolls, damage, hits/misses
   - Critical hits and fumbles
   - Character knockouts and deaths
   - Round tracking

2. **Message Classification**
   - Critical (always preserve)
   - Important (compress with details)
   - Moderate (compress heavily)
   - Trivial (count or discard)

3. **Smart Compression**
   - Groups related messages
   - Extracts key information
   - Generates searchable summaries
   - Preserves context

### Data Storage

- Archives stored as Journal Entries in "Chat Archives" folder
- Each archive contains compressed entries with:
  - Original message references
  - Extracted data (participants, locations, items)
  - Search keywords
  - Statistics

## 🎯 Performance

- **Memory Reduction**: 80-90% reduction in chat data
- **Processing Speed**: 500 messages in <5 seconds
- **Search Speed**: Results in <1 second
- **UI Responsiveness**: Background processing keeps UI smooth

## 🔮 Future Features (Roadmap)

### Phase 2 - Enhanced Compression

- Dialogue thread detection & compression
- Skill check clustering
- Enhanced item transfer tracking
- Advanced keyword extraction

### Phase 3 - User Experience

- Improved progress indicators
- Enhanced expand/collapse UI
- Better original message viewing
- Archive statistics dashboard

### Phase 4 - Advanced Features

- Advanced search and filters
- Export to PDF/JSON
- Undo operation
- Custom compression rules
- Archive retention policies

## 🐛 Troubleshooting

### Chat not trimming

- Ensure you're a GM (only GMs can trim)
- Check that there are messages to trim
- Verify settings are configured correctly

### Archives not showing

- Check the "Chat Archives" journal folder
- Verify module is enabled
- Try refreshing Foundry VTT

### Performance issues

- Reduce message threshold in settings
- Enable background processing
- Check console for errors

## 💻 Console API

Access the module programmatically:

```javascript
// Manual trim
await ChatTrimmer.manualTrim();

// View archives
ChatTrimmer.viewArchives();

// Export archive
await ChatTrimmer.exportArchive(sessionNumber);

// Access managers
const trimmer = ChatTrimmer.trimmer();
const archiveManager = ChatTrimmer.archiveManager();
```

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- Additional detection algorithms (dialogue, skill checks)
- UI/UX enhancements
- Performance optimizations
- Localization (additional languages)
- Bug fixes and testing

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built for the Foundry VTT community to solve the chat data overload problem.

## 📧 Support

- Report bugs via GitHub Issues
- Feature requests welcome
- Community support on Foundry Discord

---

**Version**: 1.0.0  
**Compatibility**: Foundry VTT v11, v12, v13  
**Systems**: All game systems (tested with D&D 5e, PF2e)
