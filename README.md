# Skylark Insights Hub

BUILD A PRODUCTION-QUALITY SKYLARK DRONES BUSINESS INTELLIGENCE AGENT

Act as a Principal Full-Stack Engineer, AI Engineer, Data Engineer, UX Engineer, and Product Architect with 20+ years of professional experience.

Build a complete, polished, deployable full-stack web application for the following technical assignment:

Skylark Drones — Monday.com Business Intelligence Agent

Do not build a generic chatbot.

Build a realistic executive-facing Business Intelligence application that demonstrates:

Full-stack engineering

Gemini AI

Monday.com API integration

Data engineering

Business intelligence

Data resilience

Conversational AI

Executive reporting

Error handling

Clean architecture

Professional UX

The final application must be suitable for demonstration to a senior engineering hiring panel.

1. CORE PRODUCT

Create an application named:

Skylark BI Agent

Tagline:

AI-powered business intelligence for founders and executives.

The user should be able to ask natural-language business questions about data stored in two Monday.com boards:

Deals / Sales Pipeline

Work Orders / Project Execution

Example:

How is our energy pipeline looking this quarter?

The application should:

Understand the question.

Determine which data is required.

Retrieve the required data dynamically from Monday.com.

Normalize messy business data.

Calculate business metrics deterministically.

Identify data-quality problems.

Use Gemini to explain the results.

Present concise founder-level insights.

2. CRITICAL REQUIREMENT — NO HARDCODED BUSINESS DATA

The provided Excel/CSV files are used only to populate Monday.com.

DO NOT hardcode the contents of the Excel/CSV files into the application.

DO NOT create fake datasets that pretend to be Monday.com.

DO NOT use static business metrics in production responses.

Runtime business data must come dynamically from Monday.com.

If Monday.com is not configured yet, create a clearly labeled configuration/setup state rather than pretending that the connection works.

3. TECHNOLOGY

Use the native Google AI Studio full-stack web architecture.

Preferred stack:

Frontend:

React

TypeScript

modern CSS/Tailwind if available

responsive design

Backend:

Node.js

TypeScript

server-side API routes/services

AI:

Gemini API

structured output

function/tool calling where useful

Integration:

Monday.com GraphQL API

Do not introduce Python/FastAPI unless absolutely necessary.

Keep the architecture simple enough to build, deploy, and explain within a 5–6 hour assignment.

4. ARCHITECTURE

Use this architecture:

                    ┌─────────────────────────┐
                    │       React UI          │
                    │ Conversational Interface│
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │     Server API Layer     │
                    └────────────┬────────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               │                 │                 │
               ▼                 ▼                 ▼
       ┌──────────────┐  ┌───────────────┐  ┌──────────────┐
       │ Gemini Agent │  │ Monday Client │  │ Error Handler│
       └──────┬───────┘  └───────┬───────┘  └──────────────┘
              │                  │
              │                  ▼
              │          ┌────────────────┐
              │          │ Data Normalizer│
              │          └───────┬────────┘
              │                  │
              │                  ▼
              │          ┌────────────────┐
              │          │Analytics Engine│
              │          └───────┬────────┘
              │                  │
              └──────────────────┤
                                 ▼
                         Founder Response


Separate:

UI

API

Monday integration

normalization

analytics

Gemini orchestration

Do not put all logic inside one component or one server file.

5. GEMINI RESPONSIBILITIES

Use Gemini for:

Natural-language query understanding

Intent extraction

Identifying required datasets

Extracting filters

Clarification questions

Business-language explanation

Executive summaries

Leadership updates

Do NOT use Gemini as the source of truth for numerical calculations.

Gemini should never independently calculate:

revenue totals

pipeline totals

percentages

weighted pipeline

deal counts

win rate

date filtering

sector aggregation

Those must be calculated deterministically by application code.

6. STRUCTURED QUERY UNDERSTANDING

Create a structured intent model.

For example:

{
  "intent": "pipeline_analysis",
  "datasets": ["deals"],
  "sector": "Energy",
  "timeRange": {
    "type": "current_quarter"
  },
  "metrics": [
    "total_pipeline",
    "weighted_pipeline",
    "deal_count"
  ]
}


Use Gemini structured output / schema validation.

Never execute arbitrary code or arbitrary API instructions generated by Gemini.

Gemini should produce a safe structured query.

The server validates the query before executing it.

7. MONDAY.COM INTEGRATION

Implement a server-side Monday.com GraphQL client.

Required environment/secrets:

MONDAY_API_TOKEN
MONDAY_DEALS_BOARD_ID
MONDAY_WORK_ORDERS_BOARD_ID


Use Google AI Studio's secure Secrets mechanism for API credentials.

Never expose:

MONDAY_API_TOKEN

GEMINI API credentials

other secrets

to browser/client-side code.

Monday.com access must be:

READ ONLY

Do not create, update, or delete Monday items.

8. MONDAY DATA FLOW

Implement:

Monday GraphQL API
        ↓
Raw board response
        ↓
Board mapper
        ↓
Normalized Deal / WorkOrder objects
        ↓
Analytics engine


The rest of the application should not depend directly on raw Monday GraphQL responses.

This allows the source schema to change without rewriting business logic.

9. MONDAY BOARD READER

Implement reusable server-side functions similar to:

getDeals()
getWorkOrders()
getBoardItems(boardId)


Handle:

pagination

API failures

empty boards

missing columns

malformed responses

authentication failures

rate limits where practical

Never assume a board always has perfect data.

10. DATA NORMALIZATION

The assignment explicitly states that the business data is messy.

Build a normalization layer.

Handle:

Null values

Examples:

null
""
"N/A"
"NA"
"-"
"unknown"


Dates

Support inconsistent formats such as:

2026-01-15
15/01/2026
Jan 15, 2026
15-Jan-26


Convert to a consistent internal date representation.

Never invent missing dates.

Numeric values

Safely handle values such as:

50000
"50000"
"50,000"
"$50,000"
"50K"
"₹50,000"


Do not make unsupported currency assumptions.

Text

Normalize obvious naming differences:

Energy
energy
 ENERGY
Energy Sector


while retaining the original raw value when useful for traceability.

11. CANONICAL DATA MODELS

Create normalized internal models.

Deal:

id
name
company
sector
stage
value
probability
expectedCloseDate
owner
createdDate
rawData
dataQualityFlags


Work Order:

id
project
client
sector
status
value
startDate
endDate
owner
completionPercentage
rawData
dataQualityFlags


Adapt these models to the actual Monday.com data.

IMPORTANT:

First inspect the actual board schema.

Do not invent columns that don't exist.

12. DATA QUALITY ENGINE

Create a data-quality analysis layer.

Calculate:

missing probability count

missing close-date count

missing sector count

invalid dates

invalid numeric values

unknown statuses

duplicate records where detectable

Display warnings when relevant.

Example:

Data Quality

⚠ 15 deals are missing probability values.

⚠ 8 deals do not have expected close dates.

⚠ 3 records contain an unknown sector.

Weighted pipeline excludes deals without valid probability values.


These values must come from actual data.

Never fabricate them.

13. BUSINESS ANALYTICS

Create deterministic analytics functions.

Pipeline:

Total Pipeline
Weighted Pipeline
Deal Count
Average Deal Size
Pipeline by Sector
Pipeline by Stage
Pipeline by Owner
Expected Close Value


Sales:

Won Deals
Lost Deals
Open Deals
Win Rate
Average Deal Size
Sector Performance


Operations:

Total Work Orders
Active Work Orders
Completed Work Orders
Delayed Work Orders
Average Completion %
Work Order Value
Work Orders by Sector
Work Orders by Status


Cross-board:

Sector pipeline vs work orders
Sales concentration vs operational concentration
High pipeline / low execution sectors
Potential operational bottlenecks


Only perform cross-board analysis when the available data supports it.

14. WEIGHTED PIPELINE

Use:

Weighted Pipeline = Deal Value × Probability


Normalize probability values such as:

0.75
75%
"75%"


Do not invent probability when missing.

Exclude invalid/missing probability records from weighted calculations where appropriate.

Clearly explain the exclusion.

15. TIME PERIODS

Support natural-language time filters:

today
this week
this month
this quarter
last quarter
this year
Q1
Q2
Q3
Q4
specific date ranges


Gemini can identify the requested period.

The server must perform actual date filtering.

Do not rely on Gemini for date arithmetic.

16. BUSINESS QUESTIONS

Support these high-value queries.

Pipeline

"How is our pipeline looking this quarter?"

"What is our weighted pipeline?"

"How many open deals do we have?"

"Which sector has the strongest pipeline?"

Deals

"Which deals need attention?"

"What are our largest opportunities?"

"Which high-value deals have low probability?"

Sector

"How is the Energy sector performing?"

"Compare Energy and Infrastructure."

Operations

"How many work orders are delayed?"

"How are our projects performing?"

"Which sector has the most active work?"

Cross-board

"Compare Energy sales pipeline with Energy work orders."

"Which sectors have strong sales pipeline but weak execution?"

Executive

"Prepare a leadership update."

17. CLARIFICATION

When a question is genuinely ambiguous, ask a useful clarification.

Example:

User:

How are we doing?


Agent:

I can give you an overall business view,
sales pipeline analysis, or project-execution view.

Which would you like?


Do not ask unnecessary questions.

When a reasonable default exists, use it and state the assumption.

18. EXECUTIVE-LEVEL RESPONSE

The agent should provide insight rather than raw data.

Bad:

Pipeline: ₹2.4 Cr
Deals: 37


Good:

Executive Summary

The current pipeline is ₹2.4 Cr across 37 opportunities,
with ₹1.1 Cr in weighted pipeline.

Energy is the largest contributor to the pipeline,
which creates both a growth opportunity and concentration risk.

Several opportunities are missing probability values,
so weighted pipeline does not represent the complete
opportunity set.

Recommended Actions

1. Review high-value Energy opportunities.
2. Complete missing probability data.
3. Review deals expected to close this quarter.


Clearly distinguish:

factual data

calculated metrics

insights

risks

recommendations

assumptions

data-quality caveats

Never present speculation as fact.

19. UI DESIGN

Create a premium enterprise interface.

Primary navigation:

Overview
AI Analyst
Pipeline
Work Orders
Leadership Update
Data Sources


Main AI page:

Skylark BI Agent

AI-powered business intelligence for founders

● Monday.com Connected

Ask a business question...

[ Send ]


Suggested questions:

How is our pipeline looking this quarter?

Which sector has the strongest pipeline?

Which deals need attention?

How are our work orders performing?

Compare Energy and Infrastructure.

Prepare a leadership update.


20. OVERVIEW PAGE

Create executive KPI cards:

Total Pipeline
₹X

Weighted Pipeline
₹X

Open Deals
X

Active Work Orders
X

Delayed Projects
X


Add small charts for:

Pipeline by sector

Pipeline by stage

Work orders by status

Only show charts supported by actual data.

21. PIPELINE PAGE

Display:

total pipeline

weighted pipeline

deal count

average deal size

pipeline by sector

pipeline by stage

top opportunities

Use clean charts and tables.

Avoid visual clutter.

22. WORK ORDERS PAGE

Display:

total work orders

active work

completed work

delayed work

average completion percentage

work-order value

sector breakdown

Highlight projects requiring attention.

23. LEADERSHIP UPDATE

Create a button:

Prepare Leadership Update

Generate:

Leadership Update

Executive Summary

Sales & Pipeline

Operations

Key Risks

Data Quality

Recommended Actions


The update should be concise enough for a founder to understand in under two minutes.

Interpret "leadership update" as:

A concise executive summary containing current KPIs, notable trends, business risks, data-quality caveats, and recommended actions.

24. SOURCE TRANSPARENCY

When appropriate, show:

Data Sources

Deals Board
Work Orders Board

Records analyzed: X

Retrieved: [timestamp]


This makes it clear that results are based on live source data.

25. ERROR HANDLING

Gracefully handle:

Monday API unavailable

invalid Monday token

board not found

empty board

missing board columns

Gemini API failure

malformed Gemini output

invalid user query

unsupported query

invalid dates

unexpected data types

Never display raw stack traces to users.

Example:

I couldn't retrieve the latest Monday.com data right now.

Please try again in a moment.


Technical errors should be logged server-side.

26. SECURITY

Follow these rules strictly:

secrets must remain server-side

never hardcode API keys

never expose Monday API token to React

validate all server inputs

validate Gemini structured outputs

do not execute arbitrary Gemini-generated code

Monday integration is read-only

avoid logging secrets

Use Google AI Studio's server-side Secrets functionality for credentials.

27. PERFORMANCE

Optimize for a small but reliable prototype.

Avoid:

unnecessary database

vector database

RAG

multi-agent architecture

unnecessary microservices

Prefer:

React
+
Node server
+
Monday API
+
Gemini
+
Deterministic analytics


Cache Monday data briefly where appropriate if it improves performance, but do not allow stale data to be misleading.

Show the retrieval timestamp.

28. PROFESSIONAL UX DETAILS

Include:

loading indicators

skeleton states

empty states

error states

responsive layout

accessible buttons

keyboard-friendly chat input

disabled Send button while processing

retry action for failed requests

clear connection status

clear data-quality indicators

Use subtle animations only where they improve usability.

29. TESTING

Create tests for critical business logic.

At minimum:

numeric parsing

date normalization

probability normalization

sector normalization

missing values

weighted pipeline

pipeline aggregation

sector aggregation

work-order metrics

intent validation

Mock Monday.com API responses in tests.

Do not require a live Monday account to run unit tests.

30. DOCUMENTATION

Create a professional README containing:

Project Overview

Problem Statement

Architecture

Tech Stack

Application Flow

Monday.com Setup

Board Configuration

Environment Variables

Gemini Integration

Data Normalization

Analytics Engine

Data Quality

Error Handling

Security

Supported Questions

Leadership Updates

Testing

Deployment

AI Tools Used

Assumptions

Trade-offs

Limitations

Future Improvements


31. DECISION LOG

Create:

docs/decision-log.md


Keep it within approximately two pages.

Document:

assumptions

architecture decisions

why Monday API was used

why analytics are deterministic

why Gemini does not calculate business metrics

data normalization strategy

missing-data strategy

clarification strategy

leadership-update interpretation

trade-offs

what would be improved with more time

Write it as an experienced engineer's decision record.

32. TIME PRIORITY

This is a 5–6 hour technical assignment.

Prioritize:

P0 — REQUIRED

Monday.com integration

dynamic data

normalization

analytics

conversational agent

professional UI

error handling

data-quality reporting

deployment

README

Decision Log

P1 — IMPORTANT

cross-board analysis

clarification

leadership update

tests

source metadata

P2 — OPTIONAL

advanced charts

conversation memory

advanced visualizations

additional analytics

If time is limited, finish P0 completely before P1/P2.

33. DO NOT FABRICATE

Never fabricate:

Monday board data

API responses

credentials

business metrics

board IDs

test results

connection status

If the Monday API is not configured, clearly show:

Monday.com connection required


rather than showing fake "connected" data.

If a feature cannot be completed, leave a clean documented implementation boundary rather than creating fake functionality.

34. IMPORTANT DEVELOPMENT STRATEGY

Do not generate a giant application blindly.

Build incrementally.

PHASE 1:

Inspect the available datasets and understand their actual schema.

PHASE 2:

Create the application architecture and UI.

PHASE 3:

Implement Monday.com server integration.

PHASE 4:

Implement normalization.

PHASE 5:

Implement deterministic analytics.

PHASE 6:

Implement Gemini intent extraction.

PHASE 7:

Implement conversational responses.

PHASE 8:

Implement leadership update.

PHASE 9:

Implement error handling and testing.

PHASE 10:

Polish UI.

PHASE 11:

Prepare README and Decision Log.

PHASE 12:

Run complete end-to-end testing.

35. FINAL INTERVIEW-QUALITY REVIEW

Before declaring the application finished, review it as if you are a senior Skylark Drones interviewer.

Ask:

Is Monday.com really being queried dynamically?

Is any business data hardcoded?

Can I explain the architecture?

Are financial calculations deterministic?

Can the system handle missing data?

Can it explain data-quality problems?

Can it handle ambiguous questions?

Does Gemini have too much authority?

What happens if Monday.com fails?

What happens if Gemini fails?

Are secrets protected?

Does the UI look professional?

Is the application useful to a founder?

Can another developer understand the code?

Does the README demonstrate engineering maturity?

Does the Decision Log demonstrate thoughtful trade-offs?

Fix high-impact issues before considering the project complete.

36. DEFINITION OF DONE

The application is complete only when:

Monday.com integration exists

Both boards can be read dynamically

No source business data is hardcoded

Data normalization exists

Null handling exists

Date normalization exists

Numeric normalization exists

Sector/text normalization exists

Data-quality reporting exists

Pipeline calculations work

Work-order calculations work

Cross-board analysis works where applicable

Gemini understands natural-language queries

Structured intent is validated

Ambiguous questions trigger clarification

Gemini does not determine numerical truth

Business insights are generated

Leadership updates work

UI is polished

Error states work

Loading states work

Tests exist for critical calculations

README exists

Decision Log exists

Secrets are secure

GitHub-ready source code exists

Application is deployable

End-to-end testing is complete

START NOW

First inspect all files and datasets available to this project.

Do not invent the dataset schema.

Before implementing complex features, report:

What files/data are available.

The actual Deals schema.

The actual Work Orders schema.

Important data-quality problems.

The proposed normalized schema.

The implementation plan.

Then begin implementation phase by phase.

Build this as a serious senior-engineer submission, not a generic AI-generated demo.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://skylark-insight-navigator.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7aa10e3f-5045-4559-92d8-fb92b027579b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
