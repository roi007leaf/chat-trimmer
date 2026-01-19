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
