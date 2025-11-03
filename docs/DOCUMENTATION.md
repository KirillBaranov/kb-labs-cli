# KB Labs CLI Documentation Standard

> **This document is a project-specific copy of the KB Labs Documentation Standard.**  
> See [Main Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) for the complete ecosystem standard.

This document defines the documentation standards for **KB Labs CLI**. This project follows the [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md) with the following project-specific customizations:

## Project-Specific Customizations

KB Labs CLI is the UX wrapper over core providing unified CLI commands (kb *). Documentation should focus on:

- Command reference and usage examples
- Command registration process
- CLI output formatting standards
- Integration with other KB Labs projects

## Project Documentation Structure

```
docs/
├── README.md              # Documentation index
├── DOCUMENTATION.md       # This standard (REQUIRED)
├── ARCHITECTURE.md        # System architecture
├── COMMAND_QUICK_REFERENCE.md  # Quick command reference
├── COMMAND_REGISTRATION.md     # Command registration guide
├── DEVLINK_COMMANDS.md         # DevLink command documentation
├── guides/                # Detailed guides
│   ├── cli-style.md       # CLI design principles
│   └── command-output.md  # Output formatting guide
└── adr/                   # Architecture Decision Records
    ├── 0000-template.md  # ADR template
    └── *.md               # ADR files
```

## Required Documentation

This project requires:

- [x] `README.md` in root with all required sections
- [x] `CONTRIBUTING.md` in root with development guidelines
- [x] `docs/DOCUMENTATION.md` (this file)
- [ ] `docs/adr/0000-template.md` (ADR template - should be created from main standard)
- [x] `LICENSE` in root

## Optional Documentation

Consider adding:

- [ ] `docs/glossary.md` - CLI-specific terms
- [ ] `docs/examples.md` - Command usage examples
- [ ] `docs/faq.md` - Frequently asked questions

## ADR Requirements

All ADRs must follow the format defined in the [main standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md#architecture-decision-records-adr) with:

- Required metadata: Date, Status, Deciders, Last Reviewed, Tags
- Minimum 1 tag, maximum 5 tags
- Tags from approved list
- See main standard `docs/templates/ADR.template.md` for template

## Cross-Linking

This project links to:

**Dependencies:**
- [@kb-labs/core](https://github.com/KirillBaranov/kb-labs-core) - Core utilities
- [@kb-labs/shared](https://github.com/KirillBaranov/kb-labs-shared) - Shared types

**Used By:**
- [kb-labs-studio](https://github.com/KirillBaranov/kb-labs-studio) - Web UI
- Other KB Labs projects using CLI commands

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

---

**Last Updated:** 2025-01-28  
**Standard Version:** 1.0 (following KB Labs ecosystem standard)  
**See Main Standard:** [KB Labs Documentation Standard](https://github.com/KirillBaranov/kb-labs/blob/main/docs/DOCUMENTATION.md)


