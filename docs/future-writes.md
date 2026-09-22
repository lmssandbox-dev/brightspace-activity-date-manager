# Future write adapters — design notes only

No updates or write scopes are implemented. The domain model is intentionally insufficient to reconstruct complete Brightspace update bodies. A future writer must re-read the current native object, map it to the configured API version's update contract, preserve unrelated fields and availability semantics, apply only requested changes, write, then re-read and verify. Never use a Content placement to update a native Assignment/Quiz/Discussion. Never accept a complete native payload from a browser.

The eventual request should identify a canonical activity key and an explicit subset of date changes. Omitted changes mean leave unchanged; explicit null means clear only where that endpoint/version supports it. Validate identity, authorization, dates and ordering at write time. Re-reading reduces stale-data risk but does not make concurrent edits atomic; concurrency/version handling remains a 01C design task.

## Native tools

| Type | Re-read/update target | Non-date settings the future adapter must preserve |
|---|---|---|
| Assignment | `dropbox/folders/{id}` | Map DropboxFolder to DropboxFolderUpdateData: name, category, instructions, group type, calendar/hidden flags, notification email, assessment denominator, anonymity, submission/completion/dropbox types, grading and special-access settings; include version-specific submission rule. Preserve both availability types in the nested availability block. |
| Quiz | `quizzes/{id}` | Map QuizReadData to QuizData: name, activation, order, grading, instructions/description/header/footer, calendar flag, attempts, timing/late-submission settings, password, navigation/display restrictions, IP limits, category, special access and newer version-specific options. Read and write shapes differ (for example, AttemptsAllowed versus NumberOfAttemptsAllowed); copying a read object verbatim is unsafe. |
| Discussion Forum | `discussions/forums/{id}` | Map Forum to ForumData: name/description, description display, anonymity, moderation, participation, hidden/locked and calendar settings. Preserve availability types. There is no Forum DueDate in the documented read/write shape. |
| Discussion Topic | `discussions/forums/{parentId}/topics/{id}` | Map Topic to CreateTopicData: name/description, anonymity, moderation, scoring/auto-score, ratings, participation, hidden/locked/calendar flags and group association. Preserve availability types; do not repurpose legacy unlock fields as ordinary start/end dates. |

This table identifies preservation groups, not an executable payload schema. The version-specific adapter must enumerate the complete writable schema at implementation time and reject insufficient re-read data. Some read properties depend on permissions and cannot safely be defaulted.

Assignments distinguish an absent/null availability block from a dated restriction, and omitting availability types can apply tenant defaults. Quiz updates replace associated properties, so partial UI data is not a safe body. Discussions may clear dates when null or omitted in update structures. Discussion topic due dates require LE 1.90+. RichText read objects and RichTextInput write objects require explicit conversion.

Primary contracts: [DropboxFolderUpdateData](https://docs.valence.desire2learn.com/res/dropbox.html#Dropbox.DropboxFolderUpdateData), [QuizData](https://docs.valence.desire2learn.com/res/quiz.html#Quiz.QuizData), [ForumData and CreateTopicData](https://docs.valence.desire2learn.com/res/discuss.html).

## Standalone Content

Content Modules use `content/modules/{id}` and the Module ContentObjectData shape: preserve title, short title, type, visibility, locking, description and supported duration. Do not send a reconstructed Structure array; updating module properties does not change its structure.

Standalone Content Topics use `content/topics/{id}` and Topic ContentObjectData: preserve title, short title, type/topic type, URL, visibility, locking, external-resource behavior, description and applicable version-specific fields. MajorUpdate and notification-related behavior need deliberate handling rather than copying defaults. Relationships to native tools are never eligible for this standalone topic update path.

Null module start/end dates erase stored values. ModuleDueDate null-clear behavior changed at LE 1.70; older versions must not be assumed equivalent. Preserve supported availability fields through a version-aware adapter when available; discovery marks missing fields rather than inventing values. Read the [ContentObjectData and update endpoint documentation](https://docs.valence.desire2learn.com/res/content.html#Content.ContentObjectData) for the deployed version before implementing writes.

No password, notification address or unrelated setting needs to be stored in the UI contract for this strategy. Retrieve these on the server immediately before the future update and do not log them. Diagnostic raw responses are redacted and must never be replayed as update bodies.

## Endpoint and scope inventory (future writes only)

All paths below are relative to `/d2l/api/le/{version}/{orgUnitId}/`. Every detail target supports GET for re-reading and PUT for the future update. These write permissions are documentation only; the app requests read permissions exclusively.

| Type | Discovery GET | Detail GET / future PUT | Read scope | Future write scope | IDs |
|---|---|---|---|---|---|
| Assignment | `dropbox/folders/` | `dropbox/folders/{folderId}` | `dropbox:folders:read` | `dropbox:folders:write` | OrgUnitId, folderId |
| Quiz | `quizzes/` | `quizzes/{quizId}` | `quizzing:quizzes:read` | `quizzing:quizzes:write` | OrgUnitId, quizId |
| Discussion Forum | `discussions/forums/` | `discussions/forums/{forumId}` | `discussions:forums:readonly` | `discussions:forums:manage` | OrgUnitId, forumId |
| Discussion Topic | `discussions/forums/{forumId}/topics/` | `discussions/forums/{forumId}/topics/{topicId}` | `discussions:topics:readonly` | `discussions:topics:manage` | OrgUnitId, forumId (parentId), topicId |
| Content Module | `content/toc?ignoreDateRestrictions=true` plus detail | `content/modules/{moduleId}` | `content:toc:read`, `content:modules:readonly` | `content:modules:manage` | OrgUnitId, moduleId |
| Standalone Content Topic | TOC plus detail | `content/topics/{topicId}` | `content:toc:read`, `content:topics:readonly` | `content:topics:manage` | OrgUnitId, topicId |

Assignment date payload fields are `Availability.StartDate`, `Availability.EndDate`, their availability types, and `DueDate`. Quizzes use `StartDate`, `DueDate`, `EndDate`. Forums use `StartDate`, `EndDate` and availability types; topics also use `DueDate` at LE >=1.90. Modules use `ModuleStartDate`, `ModuleDueDate`, `ModuleEndDate`; standalone topics use `StartDate`, `DueDate`, `EndDate`. Preserve the non-date groups described above. Explicit nulls can clear dates; omitted fields must never be assumed to preserve current state in a PUT replacement contract.

Check the configured version against the official [scope inventory](https://docs.valence.desire2learn.com/http-scopestable.html) and the resource contracts linked above when implementing 01C. No write adapter exists in this spike.
