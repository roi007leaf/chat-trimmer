# Changelog

All notable changes to the Chat Trimmer & Summarizer module will be documented in this file.

## [1.0.0] - 2026-01-19

### Added

- Initial release of Chat Trimmer & Summarizer
- Combat encounter detection and compression algorithm
- Message classification system (combat, dialogue, rolls, items, system, OOC, critical)
- Archive management system using Journal Entries
- Archive Viewer application with search and filter capabilities
- Manual trim button in chat interface
- Auto-trim functionality based on message count and time thresholds
- Settings panel for configuring compression behavior
- Statistics tracking (compression ratio, combat count, damage, etc.)
- Original message viewing from summaries
- Handlebars templates for archive display
- Full styling for archive viewer and settings
- Console API for programmatic access
- Support for Foundry VTT v11, v12, v13

### Features

- Algorithm-based pattern recognition (no LLM required)
- 80-90% compression ratio
- Searchable archives
- Session-based organization
- Critical message preservation
- Item transfer tracking
- Combat round-by-round breakdown
- Key moment extraction
- Participant tracking

### Technical

- ES Module architecture
- Async/await pattern for smooth performance
- Background processing support
- Efficient data storage using flags
- Comprehensive error handling

## [1.0.1] - 2026-01-25

### Added

- **System Category**: Added new "System" category filter to replace confusing "all/unknown" entries
  - System messages (notifications, round handlers, etc.) now properly categorized
  - Added visual styling with gray border for system entries
  - Localization support added for System category

- **Key Events Enhancements**:
  - Key events are now clickable to view original messages
  - Critical success/failure indicators automatically added to event text
  - Color-coded visual styling (green for successes, red for failures)
  - Filtered out gibberish/empty events (minimum 5 characters required)
  - Bold text styling for critical events

- **Participants List Improvements**:
  - Participants now sorted with Players first, then NPCs alphabetically
  - Added scrollable container with max-height of 200px
  - Custom scrollbar styling for better aesthetics

- **Check Request Formatting**:
  - `@Check[skill|dc:X]` syntax now displays as "Skill Check Request" with dice icon
  - Better readability for skill check messages in archives

### Fixed

- **Original Message Dialog Text Contrast**: Completely resolved white-on-white text visibility issue
  - Implemented ultra-aggressive CSS approach: force all text to dark by default
  - Selectively restore light text only on confirmed dark background elements (tags, badges, buttons)
  - Override all inline color styles that could cause white text
  - Better visibility for dice rolls, results, formulas, and check elements
  - Enhanced styling for PF2e-specific elements with proper contrast

- **Trade Message Categorization**: Trade/merchant messages no longer incorrectly appear under "Emotes"
  - Added detection for trade patterns (sells, buys, merchant)
  - Trade messages now properly categorized under "Items"
  - Improved item transfer detection

### Improved

- **Auto-Trim System**:
  - Added new "Automatic Trim Method" dropdown setting for clearer UX
  - Choose between: Disabled (manual only), By Message Count, or By Time Elapsed
  - Removed 50-message minimum requirement for time-based auto-trim
  - Added "Pause Timer When Game Paused" setting for time-based trimming
  - Time-based trimming can use real-world time or respect game pause state
  - Default: timer continues regardless of pause (real-world time)
  - Default method set to "Disabled" (manual trim only)
  - Better logging to show which method triggered the auto-trim

- **Message Categorization System**:
  - Enhanced detection of trade/sell/buy messages
  - Better handling of EMOTE-style messages that should be Items
  - More accurate keyword matching for item transfers

- **Visual Polish**:
  - Improved CSS for key events hover states
  - Better color contrast for critical events
  - Consistent styling across all category types

### Technical

- Added `eventType` field to key events for CSS styling
- Improved participant detection using `actor.hasPlayerOwner`
- Enhanced message parsing with regex for check requests
- Better text sanitization with emoji filtering
- Added `autoTrimMethod` setting replacing old boolean `autoTrimEnable`
- Added `pauseTimerWithGame` setting to control time-based trim behavior during pause
- Time-based trimming checks `game.paused` state when pause setting is enabled
- Hidden unused settings (Dialogue Compression, Skill Check Clustering, Preserve Item Transfers) until features are implemented

## [Unreleased]

### Planned for Phase 2

- Dialogue thread detection
- Skill check clustering
- Enhanced keyword extraction
- Improved NPC tracking

### Planned for Phase 3

- Enhanced UI animations
- Progress bars for long operations
- Better mobile responsiveness
- Archive statistics dashboard

### Planned for Phase 4

- Export to PDF/JSON/TXT
- Undo operation
- Custom compression rules
- Archive retention policies
- Advanced search with regex
- Multi-language support
