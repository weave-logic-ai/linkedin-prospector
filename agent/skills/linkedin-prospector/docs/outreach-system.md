# LinkedIn Outreach & CRM System

## Overview

The Outreach & CRM system transforms the LinkedIn Network Intelligence platform from passive analysis into active relationship development. It provides:

- **Intelligence Briefs**: Per-contact dossiers with context, mutual connections, and recommended approach
- **Template Engine**: Merge-field templates with automatic character limit enforcement for LinkedIn
- **Outreach Plans**: Prioritized action lists organized by tier (gold/silver/bronze)
- **State Machine**: Track outreach lifecycle from planned → sent → responded → engaged → converted
- **Multiple Output Formats**: JSON (for CRM integration) and HTML (for human review)

## Architecture

### Core Modules

```
scripts/
  template-engine.mjs      # Merge field rendering, character limit enforcement
  targeted-plan.mjs        # Intelligence briefs, plan generation, state machine

data/
  outreach-templates.yaml  # User-editable message templates (16 templates)
  outreach-config.json     # Feature configuration, lifecycle rules
  outreach-state.json      # Runtime state tracking (auto-created)
  outreach-plan.json       # Generated plan (JSON)
  outreach-plan.html       # Generated plan (HTML)
```

## Quick Start

### 1. Generate Outreach Plan

```bash
# Gold contacts only (top 50)
PROSPECTOR_DATA_DIR=../data node targeted-plan.mjs --tier gold --max 50 --format both

# All tiers (top 100)
PROSPECTOR_DATA_DIR=../data node targeted-plan.mjs --tier all --max 100 --format html

# Silver contacts (JSON export for CRM)
PROSPECTOR_DATA_DIR=../data node targeted-plan.mjs --tier silver --max 50 --format json
```

**Output**:
- `data/outreach-plan.json` - Structured JSON with contact briefs, templates, priorities
- `data/outreach-plan.html` - Styled HTML report (printable, with action cards)

### 2. Track Outreach Lifecycle

```bash
# Check current status
PROSPECTOR_DATA_DIR=../data node targeted-plan.mjs --status

# Advance a contact through lifecycle
PROSPECTOR_DATA_DIR=../data node targeted-plan.mjs --advance <profile-url> <new-state>

# View pipeline (counts by state)
PROSPECTOR_DATA_DIR=../data node targeted-plan.mjs --pipeline
```

**Lifecycle States**:
```
planned → sent → pending_response → responded → engaged → converted
                                  ↓
                               declined → closed_lost
                                        ↓
                                     deferred → (back to planned)
```

**Example**:
```bash
# Mark as sent
node targeted-plan.mjs --advance "https://linkedin.com/in/johndoe" sent

# Mark as responded
node targeted-plan.mjs --advance "https://linkedin.com/in/johndoe" pending_response
node targeted-plan.mjs --advance "https://linkedin.com/in/johndoe" responded

# View pipeline
node targeted-plan.mjs --pipeline
# Output:
#   sent                 12
#   pending_response     8
#   responded            3
#   engaged              1
```

## Template System

### Available Merge Fields

| Field | Source | Example |
|-------|--------|---------|
| `{{firstName}}` | Contact name | "John" |
| `{{lastName}}` | Contact name | "Doe" |
| `{{name}}` | Full name | "John Doe" |
| `{{company}}` | Current company | "Acme Corp" |
| `{{currentRole}}` | Current role/title | "VP Engineering" |
| `{{headline}}` | LinkedIn headline | "Engineering Leader at Acme" |
| `{{mutualConnection}}` | Top mutual connection | "Jane Smith" |
| `{{mutualCount}}` | Number of mutuals | "15" |
| `{{sharedInterest}}` | Top shared interest/tag | "AI and automation" |
| `{{personalNote}}` | Custom note (optional) | User-provided |
| `{{targetName}}` | For intro requests | "Jane Doe" |
| `{{targetCompany}}` | For intro requests | "Target Corp" |

### Character Limit Enforcement

LinkedIn connection requests have a **300-character hard limit**. The template engine automatically:

1. Renders template with all merge fields
2. If exceeds limit:
   - **Strategy 1**: Remove `{{personalNote}}` section
   - **Strategy 2**: Shorten `{{sharedInterest}}` to first word only
   - **Strategy 3**: Hard truncate with ellipsis (last resort)
3. Returns `{ text, truncated, originalLength, finalLength, withinLimit }`

**Example**:
```javascript
import { renderTemplate } from './template-engine.mjs';

const template = `Hi {{firstName}}, I noticed we share {{mutualCount}} connections.
{{personalNote}} Would love to connect!`;

const result = renderTemplate(template, {
  firstName: 'John',
  mutualCount: '15',
  personalNote: 'Your post on AI was fascinating and I have some ideas to share.',
}, { maxChars: 300 });

console.log(result.text);
// If original was 320 chars, personalNote is removed to fit 300-char limit
```

### Editing Templates

Templates are stored in `data/outreach-templates.yaml` (YAML format, user-editable).

**Template Structure**:
```yaml
templates:
  connection-request-default:
    id: conn-default
    name: "Default Connection Request"
    type: connection-request
    maxChars: 300
    default: true
    template: |
      Hi {{firstName}}, I noticed we share {{mutualCount}} connections including {{mutualConnection}}.
      {{personalNote}}
      Would love to connect and learn about your work at {{company}}.
    requiredFields: [firstName, mutualConnection, company]
    optionalFields: [personalNote, mutualCount]
```

**16 Built-in Templates**:
- 6 connection requests (default, influencer, decision-maker, warm mutual, technical, referral)
- 3 follow-ups (warm, value-add, meeting request)
- 2 introduction requests
- 2 re-engagement templates
- 1 event invitation
- 2 more...

**Add Custom Template**:
```yaml
templates:
  my-custom-template:
    id: custom-1
    name: "My Custom Approach"
    type: connection-request
    maxChars: 300
    persona: decision-maker  # Auto-selected for decision-maker persona
    template: |
      Hi {{firstName}}, your work at {{company}} in {{sharedInterest}} caught my eye.
      I'd love to connect and exchange insights.
```

### Template Selection Rules

Templates are auto-selected based on contact attributes. Rules defined in `data/outreach-config.json`:

```json
{
  "templateSelection": {
    "rules": [
      { "persona": "decision-maker", "tier": "gold", "template": "connection-request-decision-maker" },
      { "persona": "influencer", "tier": "gold", "template": "connection-request-influencer" },
      { "tier": "gold", "template": "connection-request-warm-mutual" },
      { "tier": "silver", "template": "connection-request-default" }
    ],
    "defaultTemplate": "connection-request-default"
  }
}
```

Rules are evaluated **in order**. First matching rule wins.

## Intelligence Briefs

Each contact in the outreach plan gets a comprehensive intelligence brief:

### Basic Info
- Name, headline, current role/company, location
- Profile URL

### Scoring & Prioritization
- Gold score, tier (gold/silver/bronze), persona
- ICP fit, network hub, relationship strength scores

### Network Context
- **Degree**: 1st or 2nd degree connection
- **Mutual connections**: Top 5 mutual connections (for 2nd-degree), sorted by gold score
- **Bridge contacts**: Who discovered them (from `discoveredVia`)
- **Company peers**: Other contacts at same company

### Interests & Signals
- **Shared interests**: Contact's tags (e.g., "ai-interest", "ecommerce", "decision-maker")
- **Clusters**: Which network clusters they belong to

### Activity (if available)
- **Activity score**: Recent LinkedIn activity engagement
- **Last activity date**: Most recent post/comment/share

### Receptiveness & Approach
- **Receptiveness score**: Composite score predicting likelihood of positive response
  - Weights: relationship strength (30%), behavioral (25%), activity recency (20%), mutuals (15%), referral likelihood (10%)
- **Recommended approach**: Tailored suggestion based on persona, tier, and receptiveness
  - Examples:
    - "Direct outreach with personalized value proposition" (gold + high receptiveness)
    - "Request warm introduction via mutual connection" (2nd-degree with bridges)
    - "Engage with content first, then connect" (influencer persona)
    - "Monitor and engage with content before connecting" (low receptiveness)

### Metadata
- **Enriched**: Whether profile has enriched data
- **Data completeness**: Score 0-1.0 based on populated fields

## Outreach Plan Structure

Plans organize contacts into three tiers with specific actions:

### Tier 1: Gold Contacts (Direct Outreach)
- Highest priority contacts (gold tier)
- Direct connection requests with personalized messages
- Immediate follow-up recommended
- Timing: Within 24-48 hours if recent activity

### Tier 2: Silver Contacts (Warm Introduction)
- Medium priority (silver tier)
- Request warm intros via mutual connections if 2nd-degree
- Standard connection requests for 1st-degree
- Timing: Standard (Tue-Thu mornings)

### Tier 3: Bronze Contacts (Monitor & Nurture)
- Lower priority (bronze tier)
- Engage with content before connecting
- Build familiarity before outreach
- Timing: After 2-3 content engagements

### Priority Scoring

Priority is calculated from:
- **Tier** (gold=100, silver=75, bronze=50, watch=25)
- **Persona bonus** (decision-maker=+20, influencer=+15, technical=+10, referral=+10)
- **Recency bonus** (0-7 days=+15, 8-30 days=+10, 31-90 days=+5)
- **Gold score multiplier** (goldScore × 20)

## Configuration

### Lifecycle States (`outreach-config.json`)

```json
{
  "lifecycle": {
    "states": ["planned", "sent", "pending_response", "responded", "engaged", "converted", "declined", "deferred", "closed_lost"],
    "transitions": {
      "planned": ["sent", "deferred"],
      "sent": ["pending_response"],
      "pending_response": ["responded", "declined", "deferred"],
      "responded": ["engaged", "declined"],
      "engaged": ["converted", "declined"],
      "converted": [],
      "declined": ["closed_lost", "deferred"],
      "deferred": ["planned"],
      "closed_lost": []
    }
  }
}
```

### Rate Limits

LinkedIn enforces daily/weekly limits to prevent account flagging:

```json
{
  "limits": {
    "dailyConnectionRequests": 20,
    "dailyMessages": 50,
    "weeklyNewConnections": 100,
    "dailyProfileViews": 80
  }
}
```

**Important**: The system generates and previews messages only. **Never automate sending** - human must click the send button. This protects your LinkedIn account and keeps outreach personal.

### Compliance & GDPR

```json
{
  "compliance": {
    "gdpr": {
      "consentBasis": "legitimate_interest",
      "autoArchiveDays": 180
    },
    "linkedin": {
      "automationPolicy": "generate_only"
    }
  }
}
```

- Auto-archive closed plans after 180 days
- No automation of message sending (compliance with LinkedIn TOS)
- Implement `--forget` command for GDPR right-to-be-forgotten (future)

## Output Formats

### JSON Output (`outreach-plan.json`)

Structured data for CRM integration:

```json
{
  "metadata": {
    "generatedAt": "2026-03-12T13:00:00Z",
    "totalActions": 50,
    "tierCounts": { "gold": 20, "silver": 20, "bronze": 10 }
  },
  "actions": {
    "tier1": [ /* gold contacts */ ],
    "tier2": [ /* silver contacts */ ],
    "tier3": [ /* bronze contacts */ ]
  },
  "allActions": [ /* all contacts flat array */ ]
}
```

Each action contains:
```json
{
  "tier": "gold",
  "contact": { /* intelligence brief */ },
  "template": "Default Connection Request",
  "message": "Hi John, I noticed...",
  "truncated": false,
  "priority": 118.32,
  "timing": "Standard timing (Tue-Thu mornings)"
}
```

### HTML Output (`outreach-plan.html`)

Styled, printable report with:
- **Header**: Summary stats (total actions, tier counts), print button
- **Tier sections**: Gold/silver/bronze sections with colored borders
- **Action cards**: Per-contact cards with:
  - Contact name, role, company
  - Score badges (gold score, ICP fit, receptiveness, mutuals)
  - Mutual connections list
  - Shared interests
  - Recommended approach
  - Rendered message (ready to copy/paste)
  - Timing recommendation
  - Template used, persona, profile link

Features:
- Responsive design (works on mobile)
- Print-optimized styles
- Color-coded tiers (gold/silver/bronze)
- Direct links to LinkedIn profiles

## State Tracking

State is persisted in `data/outreach-state.json`:

```json
{
  "contacts": {
    "https://linkedin.com/in/johndoe": {
      "currentState": "pending_response",
      "history": [
        { "from": "planned", "to": "sent", "timestamp": "2026-03-12T10:00:00Z" },
        { "from": "sent", "to": "pending_response", "timestamp": "2026-03-12T10:05:00Z" }
      ],
      "createdAt": "2026-03-12T09:00:00Z"
    }
  },
  "version": "1.0",
  "lastUpdated": "2026-03-12T10:05:00Z"
}
```

**State Machine Validation**:
- Invalid transitions are rejected with helpful error messages
- History tracks all state changes with timestamps
- Allows rollback/audit trail

## Best Practices

### 1. Outreach Strategy

**High-Value Contacts (Gold)**:
1. Generate plan for gold tier only (`--tier gold`)
2. Review intelligence briefs
3. Customize `{{personalNote}}` field per contact
4. Send 5-10 connection requests per day (stay under LinkedIn limit)
5. Mark as "sent" in state machine
6. Follow up within 2-3 days if accepted

**Warm Introductions (2nd-Degree)**:
1. Identify contacts with strong mutual connections (check `bridgeContacts`)
2. Use `intro-request` template to ask mutual for introduction
3. Wait for introduction before direct outreach
4. Reference the mutual in your connection request

**Content Engagement (Influencers)**:
1. Engage with 2-3 posts before connecting
2. Add thoughtful comments (50+ chars)
3. Wait 3-5 days, then send connection request referencing their content
4. Use `connection-request-influencer` template

### 2. Template Customization

**Connection Requests** (300-char limit):
- Keep templates short (aim for 200-250 chars with merge fields)
- Make `{{personalNote}}` optional (will be truncated first if over limit)
- Test with real data: `renderTemplate(template, contactData, { maxChars: 300 })`

**Follow-up Messages** (no limit):
- Can be longer, more detailed
- Include specific value proposition or call-to-action
- Reference previous conversation/connection

### 3. Compliance

**Never Automate**:
- System generates messages only
- Human must manually send each message
- No bulk sending, no automation tools
- This protects your LinkedIn account

**Rate Limits**:
- Stay under 20 connection requests/day
- Vary timing (don't send 20 at once)
- Take weekends off
- Use `--pipeline` to track volume

**GDPR**:
- Archive closed plans after 180 days
- Implement `--forget` for right-to-be-forgotten
- Document consent basis (legitimate interest for B2B)

### 4. Tracking & Optimization

**Use State Machine**:
- Track every contact through lifecycle
- Measure conversion rates per template
- Identify drop-off points (sent → responded rate)
- Optimize templates based on response data

**Weekly Review**:
```bash
# Generate fresh plan
node targeted-plan.mjs --tier gold --max 50 --format both

# Check pipeline
node targeted-plan.mjs --pipeline

# Calculate conversion rates
# responded / sent = connection acceptance rate
# engaged / responded = reply rate
# converted / engaged = meeting conversion rate
```

## API Usage (Programmatic)

### Template Engine

```javascript
import { renderTemplate, validateTemplate, listMergeFields } from './template-engine.mjs';

// List merge fields in a template
const fields = listMergeFields('Hi {{firstName}}, I noticed {{company}}...');
// => ['firstName', 'company']

// Validate template
const validation = validateTemplate(template, ['firstName', 'company'], { maxChars: 300 });
// => { valid: true, errors: [], warnings: [], fields: [...], minLength: 50, typicalLength: 180 }

// Render template
const result = renderTemplate(template, contactData, { maxChars: 300 });
// => { text: '...', truncated: false, originalLength: 220, finalLength: 220, withinLimit: true, fields: {...} }
```

### Intelligence Briefs

```javascript
import { generateBrief } from './targeted-plan.mjs'; // (would need to export function)

const brief = generateBrief(contact, graph, config);
// => { name, firstName, headline, goldScore, tier, persona, mutualConnections, recommendedApproach, ... }
```

## Troubleshooting

**Issue**: No contacts in generated plan
- **Check**: `node -e "import('fs').readFileSync(...graph.json)" | grep '"tier"'`
- **Fix**: Run scorer to generate tiers: `node scorer.mjs`

**Issue**: Templates not loading
- **Check**: `data/outreach-templates.yaml` exists
- **Fix**: Copy from `skills/.../data/outreach-templates.yaml`

**Issue**: State transitions fail
- **Check**: Lifecycle rules in `outreach-config.json`
- **Valid transitions**: Check error message for allowed states

**Issue**: Messages exceed 300 chars
- **Check**: `result.truncated` and `result.finalLength`
- **Fix**: Shorten template or make more fields optional

**Issue**: Missing merge field values
- **Check**: Contact data completeness: `brief.dataCompleteness`
- **Fix**: Enrich contact profiles: `node enrich-graph.mjs`

## Future Enhancements

### Planned Features (P3)

1. **Response Monitoring** (`outreach-monitor.mjs`)
   - Auto-detect connection acceptance
   - Track message replies
   - Profile view notifications

2. **Campaign Sequences**
   - Multi-step sequences (request → follow-up → meeting)
   - Automated state advancement based on time delays
   - Conditional steps (if no response after 7 days, send follow-up)

3. **A/B Testing**
   - Test multiple templates per segment
   - Track response rates per template
   - Auto-select winning templates

4. **CRM Integration**
   - Export to CSV for CRM import
   - Webhook notifications on state changes
   - Salesforce/HubSpot API integrations

5. **Analytics Dashboard**
   - Conversion funnel visualization
   - Response rate trends
   - Template performance comparison
   - Best time-to-send analysis

6. **Account-Based Outreach**
   - Multi-contact sequences per company
   - Account penetration tracking
   - Coordinated outreach across team

## Related Documentation

- [Network Intelligence Symposium Report](../../docs/plans/network-intelligence-symposium-report.md) - Committee 5 findings
- [Development Checklist](../../docs/plans/network-intelligence-symposium-development.md) - Phase 4 implementation
- [Scoring System](./scoring.md) - Understanding contact scores and tiers
- [Pipeline Guide](./pipeline.md) - Full data pipeline overview

## Support

For issues, feature requests, or questions:
- GitHub Issues: [linkedin-prospector/issues](https://github.com/...)
- Documentation: This file
- Symposium Report: `docs/plans/network-intelligence-symposium-report.md` (Committee 5)

---

**Version**: 1.0
**Last Updated**: 2026-03-12
**Status**: Production-ready
