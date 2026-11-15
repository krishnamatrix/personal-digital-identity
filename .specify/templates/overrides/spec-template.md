# Feature Specification: [FEATURE NAME]

**Feature ID**: [NNN-short-name]  
**Feature Branch**: [Actual branch; preserve explicitly requested names]  
**Created**: [DATE]  
**Status**: Draft  
**Input**: User description: "$ARGUMENTS"

## Problem and scope

[Who needs this, what they need, and why. Describe observable behavior without prescribing implementation.]

**In scope**: [Bounded outcomes]

**Out of scope**: [Explicit exclusions]

**Existing evidence**: [Relevant architecture/milestone records and current code paths; distinguish historical claims from verified state]

## User Scenarios & Testing (mandatory)

### User Story 1 - [Journey] (Priority: P1)

[User outcome and why this priority. Add independent stories as needed.]

**Independent Test**: [How this journey can be verified on its own]

**Acceptance Scenarios**:

1. **Given** [state], **When** [action], **Then** [observable result].
2. **Given** [unauthorized/unpublished/invalid state as applicable], **When** [action], **Then** [safe, observable result].

### Edge Cases

- [Invalid input, empty state, failed operation, or relevant boundary]
- [Ownership/publication/cache/media boundary when affected; otherwise explain N/A]

## Requirements (mandatory)

### Functional Requirements

- **FR-001**: System MUST [specific, testable behavior].
- **FR-002**: System MUST [specific, testable behavior].

### Privacy and permissions

[Who can read/change/publish this information? Which information must remain private? For public output, define selection, unpublish, and revocation behavior. Mark N/A with a reason if no user data is involved.]

### Key Entities (if data is affected)

[Concepts, ownership, and relationships; avoid SQL/implementation details here.]

## Success Criteria (mandatory)

- **SC-001**: [Measurable, technology-independent outcome with verification method].

## Assumptions and open questions

- [Explicit assumptions and dependencies]
- [NEEDS CLARIFICATION: only material unresolved choices; resolve before dependent implementation]
