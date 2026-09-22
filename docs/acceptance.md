# Spike 01B acceptance

## Automated coverage

Synthetic fixture runs exercise both a Course Offering context and a Source Course context with distinct OrgUnitIds. They verify all six types, all relevant date combinations, canonical matching, hierarchy, availability states, standalone/unsupported Content, partial failures, pagination, UTC parsing, secret redaction and no duplicate selection keys. They do not establish live tenant API support.

`test/fixtures/acceptance-course.json` is a complete synthetic dataset, not a tenant export. `scripts/discovery-acceptance.js` checks this matrix:

- Dated Content module and nested module.
- Dated standalone Content topic.
- Linked and unlinked Assignment.
- Linked and unlinked Quiz.
- Discussion Forum and linked Discussion Topic.
- Start-only, due-only, end-only and undated activities.
- Undated Assignment, Quiz, Discussion Topic and standalone Content Topic.
- Assignment availability values 0, 1 and 2.
- Correct OrgUnit identity, UTC dates, resolvable hierarchy keys, no duplicate native activities and no unexplained warnings.

Unsupported/unmatched/ambiguous cases have separate tests with expected structured warnings. An empty successful response cannot pass the acceptance matrix.

## Live procedure

Known tenant: `https://d2lbrasil.brightspacedemo.com`.
Course Offering: **9524**. Source Course: **9531**.
LTI app: `https://brightspace-activity-date-manager.onrender.com`.
Use the authenticated administrator's normal LMS launch. Do not open the bare app URL expecting it to bypass LTI.

First deploy the current local v2 code. The diagnostic should show the Include undated activities checkbox and Content structure section; JSON should contain `schemaVersion: 2`. Run both IDs with undated activities included and compare the matrix to known LMS items. Do not create or modify course content as part of read-only verification. If an existing test course lacks a case, mark it unverified rather than manufacturing a successful result.

Alternatively, with installed dependencies and real OAuth environment configuration:

```sh
npm run verify:discovery -- 9524 9531
```

This command uses only OAuth token exchange and activity GETs. It does not start MongoDB/LTI, create test data, write dates, or display raw responses. It returns per-context checks and fails if either matrix is incomplete, a source fails, or warnings require investigation. Context labels are supplied by the operator; the command does not infer org-unit type. Local `render.env` is not loaded automatically and currently contains placeholder connection values.

## Status

Local v2 fixture verification passes. The user's earlier Course Offering 9524 output proved native Assignment 983 matched Content topic 16022 without duplication, plus standalone Content topic 16005. That is a useful real baseline, not proof of the full matrix or the current v2 implementation. Live inspection and its outcome are recorded below after checking the deployed diagnostic.

### Final hardening status — September 22, 2026

103 automated tests pass. The user reports successful earlier Source Course 9531 discovery, including discussion due dates after the LE version upgrade. Browser verification of Course Offering 9524 returned the earlier flat contract (two activities, one matched relationship, no warnings). The deployed page did not yet expose the v2 undated checkbox or hierarchy. Neither observation proves acceptance of the final local v2 implementation.

**Pending:** deploy the current code with supported LE >=1.90, then run the complete matrix against Offering 9524 and Source Course 9531. Retain both resulting assessment reports. Missing fixtures in either real course must be reported as gaps. Spike 01B is not marked COMPLETE until these final live checks pass. No course data was modified to manufacture acceptance coverage.
