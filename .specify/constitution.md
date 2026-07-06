# 311-voice Constitution

## Mission

A natural language interface that makes filing NYC 311 complaints effortless. Users describe problems in plain English; the system handles routing, information gathering, and submission.

## Core Principles

### I. Conversational First
The primary interface is natural language text. Users should never need to navigate menus, fill forms, or know 311 category codes. The system asks follow-up questions conversationally when it needs more information.

### II. Complete Before Submit
Every complaint requires specific information (address, description, timing, etc.). The system must gather ALL required fields through conversation before attempting submission. Never submit incomplete complaints.

### III. Complaint Memory
Track all complaints with their status. Users should be able to ask "what complaints have I filed?" or "what happened with my traffic light complaint?" and get accurate answers.

### IV. Confirm Then Submit
Browser automation handles submission via the 311 portal. Before any submission:
1. System shows a complete summary of what will be filed
2. User explicitly confirms (or edits/cancels)
3. System submits and captures confirmation number

No complaint goes to 311 without user seeing exactly what's being sent.

### V. Five Complaint Types (v1)
Initial scope is limited to:
1. Traffic light timing/frequency
2. Waste removal issues
3. Snow removal issues
4. Illegally parked vehicles
5. No heat/hot water in buildings

Each type has specific required fields. The system must know what to ask for each.

## Platform

- **Interface**: CLI on macOS
- **Submission**: Playwright browser automation against portal.311.nyc.gov
- **Storage**: Local SQLite database for complaint history

## Technical Constraints

### Data Requirements by Complaint Type
- **Traffic lights**: Intersection (cross streets), direction of travel, issue description, time of day observed
- **Waste removal**: Address, type of waste, how long it's been there
- **Snow removal**: Address, type of location (sidewalk/street/hydrant), days since snowfall
- **Illegal parking**: Location, vehicle description (if available), type of violation
- **Heat/hot water**: Building address, apartment number, duration of issue, landlord contacted (y/n)

### Storage
- Complaints must persist across sessions
- Include: complaint type, all gathered info, submission status, 311 reference number (if obtained), timestamps

### No Secrets in Code
API keys, credentials for any integrations stored in environment variables only.

## Governance

This constitution defines the boundaries of v1. Scope expansion (new complaint types, new submission channels) requires explicit discussion.

**Version**: 1.0 | **Created**: 2026-01-27
