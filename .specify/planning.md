# 311-voice Technical Plan

**Created**: 2026-01-27
**Status**: Draft

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         311-voice CLI                           │
├─────────────────────────────────────────────────────────────────┤
│  User Input (natural language)                                  │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────┐                                           │
│  │  Conversation   │◄──────────────────────────────────────┐   │
│  │    Manager      │                                       │   │
│  └────────┬────────┘                                       │   │
│           │                                                │   │
│           ▼                                                │   │
│  ┌─────────────────┐      ┌─────────────────┐             │   │
│  │  Claude API     │      │  Complaint      │             │   │
│  │  (Classification│──────│  Templates      │             │   │
│  │   & Extraction) │      │  (5 types)      │             │   │
│  └────────┬────────┘      └─────────────────┘             │   │
│           │                                                │   │
│           ▼                                                │   │
│  ┌─────────────────┐                                       │   │
│  │  Complaint      │───────────────────────────────────────┘   │
│  │  Builder        │  (asks follow-up questions)               │
│  └────────┬────────┘                                           │
│           │ (when complete)                                    │
│           ▼                                                    │
│  ┌─────────────────┐      ┌─────────────────┐                  │
│  │  Confirmation   │──Yes─│  Playwright     │                  │
│  │  Prompt         │      │  Submitter      │                  │
│  └─────────────────┘      └────────┬────────┘                  │
│                                    │                           │
│                                    ▼                           │
│                           ┌─────────────────┐                  │
│                           │  SQLite DB      │                  │
│                           │  (complaints)   │                  │
│                           └─────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js (TypeScript) | Fast iteration, good Playwright support, strong typing |
| CLI Framework | Commander.js or Inquirer | Simple, well-documented |
| LLM | Claude API (claude-sonnet-4-20250514) | Best for classification + extraction, you have API access |
| Browser Automation | Playwright | Most reliable, handles modern SPAs, good for 311 portal |
| Database | SQLite (better-sqlite3) | Zero config, local, sufficient for personal use |
| Testing | Vitest | Fast, TypeScript-native |

## Component Design

### 1. Conversation Manager
- Maintains conversation state (current complaint, gathered fields, history)
- Routes user input to Claude for classification/extraction
- Determines when enough info is gathered to show confirmation
- Handles corrections, cancellations, and topic switches

### 2. Complaint Templates
Each complaint type has a template defining:
```typescript
interface ComplaintTemplate {
  type: ComplaintType;
  requiredFields: Field[];
  optionalFields: Field[];
  validationRules: ValidationRule[];
  portalPath: string; // Which 311 portal form to use
}
```

### 3. Claude Integration
Two main prompts:
1. **Classification prompt**: Given user input + conversation history, identify complaint type and extract any mentioned information
2. **Follow-up prompt**: Given complaint template and current state, generate natural follow-up question for missing required fields

### 4. Playwright Submitter
- Navigates to correct 311 portal form based on complaint type
- Fills in all gathered fields
- Handles portal-specific quirks (dropdowns, multi-step forms)
- Captures confirmation number from success page
- Screenshots for debugging (optional)

### 5. SQLite Storage
```sql
CREATE TABLE complaints (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, submitted, confirmed
  fields JSON NOT NULL,
  confirmation_number TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  complaint_id INTEGER REFERENCES complaints(id),
  role TEXT NOT NULL, -- user or assistant
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Implementation Phases

### Phase 1: Core Infrastructure
- Project setup (TypeScript, ESLint, Vitest)
- SQLite schema and basic CRUD
- Claude API integration (classification + extraction)
- Basic CLI input/output loop

### Phase 2: Single Complaint Type (Illegal Parking)
- Illegal parking complaint template
- Conversation flow for gathering all fields
- Confirmation display
- Playwright automation for illegal parking form
- End-to-end test

### Phase 3: Remaining Complaint Types
- Add templates for: heat/hot water, traffic signal, snow/ice, missed collection
- Add Playwright flows for each
- Handle type-specific logic (NYCHA redirect, grace periods)

### Phase 4: History & Polish
- Complaint history queries
- Status checking (if 311 provides status lookup)
- Error handling and graceful degradation
- User experience polish

## Key Technical Decisions

### Why Claude API instead of local LLM?
- Classification accuracy matters - wrong type = wrong form
- Extraction from natural language is Claude's strength
- API latency (~1-2s) acceptable for conversational use
- You already have Anthropic API access

### Why Playwright over Puppeteer?
- Better auto-waiting and reliability
- Handles SPAs better (311 portal is likely React/modern)
- Can record sessions for debugging
- Cross-browser support if needed

### Why SQLite over JSON file?
- Query capabilities (search by type, date range)
- Concurrent access handled properly
- Easy to export/backup
- Migrations if schema changes

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| 311 portal changes UI | Playwright selectors use data attributes when available; alert on submission failure |
| Rate limiting by 311 | Unlikely for personal use; can add delays between submissions |
| Claude API costs | Sonnet is cheap (~$0.003/1K tokens); typical complaint is <1K tokens |
| Portal requires CAPTCHA | May need manual intervention or investigate CAPTCHA services |

## File Structure

```
311-voice/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── conversation/
│   │   ├── manager.ts        # Conversation state machine
│   │   └── prompts.ts        # Claude prompts
│   ├── complaints/
│   │   ├── types.ts          # Type definitions
│   │   ├── templates/        # Complaint templates
│   │   │   ├── illegal-parking.ts
│   │   │   ├── heat-hot-water.ts
│   │   │   ├── traffic-signal.ts
│   │   │   ├── snow-ice.ts
│   │   │   └── missed-collection.ts
│   │   └── builder.ts        # Builds complaints from gathered info
│   ├── submission/
│   │   ├── playwright.ts     # Browser automation
│   │   └── forms/            # Form-specific logic
│   │       ├── illegal-parking.ts
│   │       └── ...
│   └── storage/
│       ├── db.ts             # SQLite connection
│       └── complaints.ts     # Complaint CRUD
├── tests/
├── package.json
├── tsconfig.json
└── .env                      # ANTHROPIC_API_KEY
```

## Open Questions

1. **Should conversations persist across sessions?** Leaning yes - resume incomplete complaints.
2. **Photo attachment support?** Some 311 complaints accept photos. Could add later.
3. **Multiple boroughs?** Need to ensure addresses are unambiguous. Might need to ask for borough.
