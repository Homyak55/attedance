# QA report — V5.3.4

- JS syntax: `js/app.js`, `js/docx.js`, `js/exporter.js`, `js/storage.js`, `sw.js` — OK.
- Weekly schedule is limited in UI/data logic to pair numbers 1–3.
- Date-specific schedule can use pair numbers 1–6, so one-off 4–6 classes remain supported.
- Attendance pair choices are derived from actual scheduled classes on the selected date; they are no longer all 6 fixed slots.
- «Весь день» selects only scheduled pairs for the selected date.
- Existing attendance records can still be opened because stored pair numbers are included when editing an existing record.
- Word generator files were not modified.
- Service worker cache bumped to `attendance-journal-v5.3.4`.
