# Discovery contract v2

The domain output is independent of Brightspace response field names. Native adapters perform API mapping before the discovery service sees records. `src/services/activityNormalizer.js` validates domain dates; `src/brightspace/activities/normalizers.js` owns Brightspace-specific field mapping.

## Activity

```json
{
  "key": "assignment:9524:983",
  "type": "assignment",
  "id": "983",
  "parentId": null,
  "name": "Tarefa 01",
  "orgUnitId": "9524",
  "dates": {
    "start": "2026-09-21T03:01:00.000Z",
    "due": "2026-09-22T02:59:59.000Z",
    "end": "2026-09-22T02:59:59.000Z"
  },
  "availability": {
    "startType": { "value": 0, "name": "AccessRestricted", "label": "Access restricted", "state": "known" },
    "endType": { "value": 0, "name": "AccessRestricted", "label": "Access restricted", "state": "known" }
  },
  "identity": { "activityId": "https://ids.brightspace.com/activities/example" },
  "metadata": { "isHidden": false, "displayInCalendar": false }
}
```

Supported types are `assignment`, `quiz`, `discussionForum`, `discussionTopic`, `contentModule`, and `contentTopic`. IDs and parent IDs are decimal strings. Keys combine type, OrgUnitId and native ID; names are never keys. Assignment/quiz parents identify categories; discussion-topic parents identify forums; Content parents identify modules. These IDs are type-scoped, not a single global hierarchy. The explicit Content tree describes placements independently.

All primary dates are null or timezone-aware ISO UTC instants. Valid numeric-offset timestamps are converted to UTC. Fractional precision greater than milliseconds is preserved. Invalid dates, impossible calendar dates, date-only strings, empty strings and timezone-free timestamps are rejected. A rejected native record generates `INVALID_DATE`, including a safe field name and item ID, and is excluded rather than being represented with fabricated null dates. Other records remain available. Invalid forum dates do not prevent reading its topics.

Null/omitted API date fields become null. LE versions below 1.90 are rejected before discovery. A failed Content detail read is represented by `readStatus: "failed"` on its node/relationship; relationship `dates` and `availability` are null, meaning unread, distinct from a successfully read `{start:null,due:null,end:null}`. No current-access calculation or UI timezone conversion is performed.

Availability values are not dates: 0 is AccessRestricted, 1 SubmissionRestricted, 2 Hidden. `value` retains the original numeric or numeric-string representation, `name` provides the semantic enum and `label` a readable description. Missing fields have state `missing`; explicit null has `unspecified`; unrecognized values have `unknown` and retain their value. Neither dates nor visibility flags imply a type. See [AVAILABILITY_T](https://docs.valence.desire2learn.com/res/apiprop.html).

Metadata is a small allowlist of returned flags: `isHidden`, `isActive`, `isLocked`, `isBroken`, `displayInCalendar`. Unrelated native settings, descriptions, passwords, legacy posting/unlock dates, pacing dates and complete native objects are not application metadata. Future writers must re-read rather than reconstruct native payloads from this object.

## Canonical identities and relationships

Native Assignment/Quiz/Forum/Discussion Topic API records are authoritative, whether dated or undated. Content references to them never become a second supported activity. Standalone modules and positive File/Link Content references without a tool pointer remain canonical Content activities. Unknown/future tool types are unsupported relationships unless an exact native identity proves a match.

Each `contentRelationships` item contains a stable `key`, `contentId`, `parentId`, `orgUnitId`, `name`, `identity` (lower-camel activity/tool identifiers), `nativeActivity` (key/type/id or null), `status`, `matchedBy`, `identifierConflict`, `readStatus`, `dates`, `availability`, and lightweight `metadata`.

Matching is scoped to the same OrgUnitId:

1. Exact nonempty ActivityId. Multiple distinct primary matches remain ambiguous.
2. Only if there are no primary matches, native type + ToolItemId.
3. No title matching, even when two names are identical.

Statuses are `matched`, `unmatched`, `ambiguous`, `unsupported`. `matchedBy` is `activityId`, `typeAndToolItemId`, or null. Conflicting secondary identifiers generate `IDENTIFIER_CONFLICT`; the primary match remains canonical. Repeated placements remain distinct relationships. Native dates and availability never inherit Content values. A missing native record after a partial API failure remains unmatched, not a new Content activity.

## Content structure

`contentStructure` is an array of root nodes, each with nested `children`. Nodes contain `contentId`, `parentId`, `orgUnitId`, `name`, `kind`, `position`, `readStatus`, `activityKey`, and `relationshipKey`, plus their own stable node `key`. A placement points to its canonical activity and its relationship; standalone Content points to its activity only. Unsupported/unmatched nodes have no canonical activity key. Nodes with a failed standalone detail read retain their location with null activityKey.

Sibling order uses TOC SortOrder when provided. Where absent, array order is retained within each kind, with modules before topics; the API supplies no reliable cross-kind order in that case. Both undated and failed nodes remain in the tree. Use `includeUndated: true` when a UI needs to dereference every supported activityKey. In a dated-only view a node can point to an intentionally filtered undated activity; `counts` distinguishes the full and returned collections.

## Completeness, warnings and filtering

The core service defaults to `includeUndated: true`; the diagnostic route defaults to false. Filtering affects only `activities`, never relationships or hierarchy. `counts` reports `allActivities`, `datedActivities`, and `returnedActivities`.

`complete` describes successful reading/normalization, not whether every relationship matched or every tool is supported. `sources` shows complete/partial/failed status per resource (including topic reads per forum). `warnings` are `{source,code,message,details}` objects. Common codes are `API_READ_FAILED`, `INVALID_RECORD`, `INVALID_DATE`, `DUPLICATE_IDENTITY`, `RELATIONSHIP_UNMATCHED`, `RELATIONSHIP_UNSUPPORTED`, `RELATIONSHIP_AMBIGUOUS`, and `IDENTIFIER_CONFLICT`.

Resource-specific 500 failures can return a partial result. Incomplete paged collections are not exposed as complete collections; other resources survive. Authentication failures, HTTP 401/403/429/503, transport failures, collection 400/404, and failure of every source remain top-level failures. Collection 404 cannot safely distinguish an unavailable route from an invalid org unit, so it fails conservatively. An individual topic/module 404 may mean deletion during discovery and is reported locally. The diagnostic returns HTTP 200 for explicit partial results and 502 for top-level failures; LTI access errors remain 403/503.

Warnings contain no upstream response bodies, request configuration or credentials. Debug `raw` data is opt-in, separated from domain records, and redacts recognized password/token/secret/assertion/private-key/authorization/notification-email/user-info fields. It remains sensitive development data, not a reusable update payload.

## Migration from the earlier spike output

This is an explicit `schemaVersion: 2` change. `startDate/dueDate/endDate` become `dates.start/due/end`; raw date-field metadata is removed. Availability moves from `metadata.availabilityTypes` into `availability.startType/endType`. `contentLinks` becomes `contentRelationships`, identifiers are lower-camel under `identity`, and `unresolved` becomes `unmatched`. Warning strings become structured objects. The diagnostic route and acceptance command consume v2. No aliases duplicate the old shape.

## Native/Content date consistency

Each matched relationship compares normalized start, due and end with its native activity. Differences (including null versus a timestamp) emit `DATE_INCONSISTENCY` with `activityKey`, `field`, `nativeValue`, `contentValue`, and `details.contentId`. Equal UTC instants with different trailing fractional zeros are equal. Failed detail reads are not compared. Native dates and availability are never overwritten; relationship dates remain available for investigation. These warnings do not mean the API read failed, but prevent a warning-free acceptance pass.
