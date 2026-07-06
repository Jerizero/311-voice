# 311-voice Requirements Specification

**Created**: 2026-01-27
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - Report Illegally Parked Vehicle (Priority: P1)

User sees a car blocking a fire hydrant. They open 311-voice, type "there's a car blocking the hydrant on 45th and 9th", and the system asks follow-up questions to gather vehicle details, then shows a summary for confirmation before submitting.

**Why this priority**: Most time-sensitive complaint type. Illegal parking situations change quickly - a car blocking a hydrant now may be gone in 10 minutes. Fast submission matters.

**Independent Test**: Can be fully tested by typing a parking complaint and verifying the system gathers location + violation type, shows confirmation, and submits to 311 portal.

**Acceptance Scenarios**:

1. **Given** a new conversation, **When** user types "car double parked on my block at 123 Main St", **Then** system identifies this as illegal parking and asks about vehicle details
2. **Given** system has gathered all required info, **When** user types "that's everything", **Then** system shows formatted summary and asks for confirmation
3. **Given** user confirms, **When** system submits via Playwright, **Then** system captures and displays 311 confirmation number
4. **Given** system cannot determine violation type, **When** user says "someone parked illegally", **Then** system asks "What's the violation? Blocking hydrant, double-parked, in bike lane, blocking crosswalk, or something else?"

---

### User Story 2 - Report No Heat/Hot Water (Priority: P2)

User's apartment has no heat. They type "no heat in my apartment", system gathers building address, apartment number, whether issue is apartment-only or building-wide, and whether landlord was contacted. Shows summary, confirms, submits to HPD via 311.

**Why this priority**: Critical quality-of-life issue, especially in winter. HPD has specific response protocols.

**Independent Test**: Can test by filing a heat complaint and verifying all required fields are gathered before submission.

**Acceptance Scenarios**:

1. **Given** user types "my apartment has no heat", **When** system responds, **Then** it asks for building address
2. **Given** address provided, **When** system continues, **Then** it asks for apartment number
3. **Given** apartment number provided, **When** system continues, **Then** it asks if issue is apartment-only or building-wide
4. **Given** all info gathered, **When** system shows summary, **Then** it includes note about HPD inspector callback and need for contact info
5. **Given** user indicates NYCHA housing, **When** system responds, **Then** it explains NYCHA has separate system (718-707-7771) and cannot use 311

---

### User Story 3 - Report Traffic Signal Issue (Priority: P3)

User notices a traffic light has bad timing - green is too short for pedestrians to cross safely. They describe the issue, system gathers intersection location and specific problem, submits to DOT via 311.

**Why this priority**: Important but less urgent. DOT has 48-hour response time for non-critical issues.

**Independent Test**: Can test by reporting a signal timing issue and verifying intersection and problem description are gathered.

**Acceptance Scenarios**:

1. **Given** user types "the light at Broadway and 42nd changes too fast", **When** system responds, **Then** it confirms intersection and asks for direction of travel
2. **Given** user describes timing issue, **When** system gathers info, **Then** it asks what time of day they observed the problem
3. **Given** user reports "light is completely out", **When** system classifies urgency, **Then** it notes this is a priority issue (2-hour contractor response)

---

### User Story 4 - Report Uncleared Snow/Ice (Priority: P3)

User's neighbor hasn't shoveled their sidewalk. System gathers address, verifies grace period has passed, and submits to DSNY via 311.

**Why this priority**: Seasonal. Only relevant after snowfall.

**Independent Test**: Can test by reporting snow complaint and verifying address and timing are validated.

**Acceptance Scenarios**:

1. **Given** user types "sidewalk not shoveled at 456 Oak Street", **When** system responds, **Then** it confirms this is a snow/ice complaint
2. **Given** snow complaint, **When** system gathers info, **Then** it asks about location type: sidewalk, corner crossing, fire hydrant, or bus stop
3. **Given** complaint filed, **When** system notes timing, **Then** it reminds user about grace period rules (4 hours daytime snow, 11am for overnight)

---

### User Story 5 - Report Missed Garbage Collection (Priority: P3)

User's trash wasn't picked up on collection day. System confirms address and that it's past 8 AM the following day, then submits to DSNY.

**Why this priority**: Non-urgent, simple complaint type.

**Independent Test**: Can test by reporting missed collection and verifying address and timing are gathered.

**Acceptance Scenarios**:

1. **Given** user types "my garbage wasn't picked up", **When** system responds, **Then** it asks for address
2. **Given** current time is before 8 AM day after collection, **When** user tries to file, **Then** system explains they must wait until 8 AM
3. **Given** active snow operation, **When** user files, **Then** system warns delays may occur during winter operations

---

### User Story 6 - Check Complaint History (Priority: P2)

User wants to know status of previous complaints. They type "what complaints have I filed?" and see a list with statuses.

**Why this priority**: Core feature for tracking. Enables follow-up.

**Independent Test**: Can test by filing a complaint, then asking to see history.

**Acceptance Scenarios**:

1. **Given** user has filed complaints, **When** they ask "show my complaints", **Then** system lists all with dates, types, and statuses
2. **Given** user asks about specific complaint, **When** they say "what happened with my heat complaint", **Then** system shows details of that complaint
3. **Given** user has 311 confirmation number, **When** system checks status, **Then** it can report current 311 status (if status lookup is available)

---

### Edge Cases

- User provides incomplete address (no borough) - system must ask for clarification
- User describes problem that doesn't match any complaint type - system should ask clarifying questions or suggest closest match
- 311 portal is down or changed - system should fail gracefully and show what would have been submitted
- User cancels during confirmation - complaint should not be submitted, but draft should be saved
- User describes multiple issues at once - system should handle one at a time

## Requirements

### Functional Requirements

**Natural Language Understanding**
- **FR-001**: System MUST classify user input into one of five complaint types: illegal parking, no heat/hot water, traffic signal, snow/ice, missed collection
- **FR-002**: System MUST extract location information from natural language (addresses, intersections, landmarks)
- **FR-003**: System MUST ask follow-up questions when required information is missing
- **FR-004**: System MUST handle "I don't know" responses gracefully and only require truly mandatory fields

**Conversation Management**
- **FR-005**: System MUST maintain conversation state across multiple turns
- **FR-006**: System MUST allow user to correct previously provided information ("actually, it's 46th street not 45th")
- **FR-007**: System MUST support abandoning current complaint ("never mind", "cancel")

**Confirmation & Submission**
- **FR-008**: System MUST show complete summary before submission with all fields that will be sent
- **FR-009**: System MUST wait for explicit user confirmation before submitting
- **FR-010**: System MUST submit via Playwright browser automation to portal.311.nyc.gov
- **FR-011**: System MUST capture and display 311 confirmation/reference number after successful submission

**Complaint History**
- **FR-012**: System MUST persist all submitted complaints to local SQLite database
- **FR-013**: System MUST store: complaint type, all gathered fields, submission timestamp, 311 reference number
- **FR-014**: System MUST allow querying complaint history by type, date, or status

**Error Handling**
- **FR-015**: System MUST handle 311 portal failures gracefully (show what would have been submitted)
- **FR-016**: System MUST handle NYCHA housing specially (redirect to separate system)

### Key Entities

- **Complaint**: Type, status (draft/submitted/confirmed), all type-specific fields, timestamps, 311 reference
- **Conversation**: Current complaint being built, gathered fields, conversation history
- **User**: Contact info (optional, needed for some complaint types like heat)

## Data Requirements by Complaint Type

### Illegal Parking
| Field | Required | Notes |
|-------|----------|-------|
| Location (address or intersection) | Yes | |
| Violation type | Yes | Hydrant, double-parked, bike lane, crosswalk, bus stop, disability parking, other |
| Vehicle license plate | No | If visible |
| Vehicle description | No | Make, model, color |

### No Heat/Hot Water
| Field | Required | Notes |
|-------|----------|-------|
| Building address | Yes | |
| Apartment number | Yes | Unless building-wide |
| Issue type | Yes | Heat, hot water, or both |
| Scope | Yes | Apartment only or entire building |
| Contact phone | Recommended | HPD inspector needs to reach tenant |
| Landlord contacted | Asked | 311 asks this |

### Traffic Signal
| Field | Required | Notes |
|-------|----------|-------|
| Intersection | Yes | Cross streets |
| Problem type | Yes | Timing, malfunction, lights out, request new signal |
| Direction of travel | Helpful | Which approach has the issue |
| Time observed | Helpful | Some timing issues are time-specific |

### Snow/Ice on Sidewalk
| Field | Required | Notes |
|-------|----------|-------|
| Address | Yes | |
| Location type | Yes | Sidewalk, corner crossing, fire hydrant, bus stop |

### Missed Collection
| Field | Required | Notes |
|-------|----------|-------|
| Address | Yes | |
| Collection type | Yes | Trash, recycling, or compost |
| Scheduled collection day | Helpful | To verify timing |

## Success Criteria

### Measurable Outcomes

- **SC-001**: User can file a complete complaint in under 2 minutes of typing
- **SC-002**: System correctly classifies complaint type 95%+ of the time on first message
- **SC-003**: Submitted complaints appear in 311 system with correct information
- **SC-004**: User can retrieve any previously filed complaint from history
- **SC-005**: System handles 311 portal changes/failures without crashing (graceful degradation)
