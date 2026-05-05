# Changelog

All notable changes to the Flow Email Composer are documented here.

## [Unreleased]

### Added
- **Folder picker pre-selection** — new `defaultFolderId` Flow property pre-selects a template folder on load, filtering the template dropdown immediately.
- **Granular visibility toggles** — `hideFolderPicker` hides just the folder dropdown while keeping the template picker; `hideAttachments` hides the "Attach New Files" uploader. Template-provided attachments still display when the uploader is hidden.
- **CC / BCC expand on load** — `expandCcOnLoad` and `expandBccOnLoad` Flow properties show the CC and/or BCC fields expanded without requiring the user to click the buttons.
- **Resizable body editor** — `bodyHeight` property sets the starting height (px) of the rich-text editor. Users can drag to resize vertically. Defaults to 300 px.
- **Custom labels and help text** — every form field now supports optional overrides: `toLabel` / `toHelpText`, `ccLabel` / `ccHelpText`, `bccLabel` / `bccHelpText`, `subjectLabel` / `subjectHelpText`, `bodyLabel` / `bodyHelpText`, `folderLabel` / `folderHelpText`, `templateLabel` / `templateHelpText`. Sensible defaults retained when omitted.
- **Field-level help (tooltips)** — help-text properties render as `lightning-helptext` tooltips next to each label.

### Changed
- **Template filter replaced with secure folder filter** — the legacy `additionalCondition` Flow property (raw SOQL fragment, appended via string concatenation) has been replaced with `folderIdFilter`, a Folder Id bound as a SOQL bind variable.
  - **⚠ Breaking for existing flows:** any flow currently using `additionalCondition` must be reconfigured to use `folderIdFilter` with a Folder Id.
- **Default labels simplified** — the To / CC / BCC field labels no longer embed "Specify comma-separated e-mail addresses" by default. Use the new `toHelpText` / `ccHelpText` / `bccHelpText` properties to surface that guidance as a tooltip.
- **Send button centering** — replaced the invalid `slds-align-center` utility with `slds-text-align_center` and a full-width layout item so the Send button actually centers across the row.
- **SLDS utility tokens refreshed** — all `slds-p-horizontal_small` / `slds-p-around_small` classes updated to the current `slds-var-*` design-token variants.

### Fixed
- **Rich-text cursor jumps to end of paragraph on first click** — when a default template or default body was loaded, the first click inside the body editor placed the caret at the end of the content instead of at the click point. The component now intercepts the first mousedown, prevents Quill's default focus-and-place-at-end behavior, and positions the caret at the actual click coordinates. Subsequent clicks are handled normally. The hit-test is shadow-DOM-aware so it works reliably across Chrome, Edge, and Firefox.
- **Body editor rendering decoupled from `value` binding** — the `value={emailBody}` binding on `lightning-input-rich-text` was replaced with an imperative `rte.value = ...` push from `renderedCallback`. This stops spurious re-renders that were contributing to the cursor-jump issue and to transient editor "reset" behavior when other properties changed.
- **SOQL injection risk in `getEmailTemplates`** — user-supplied filter input is now bound (`FolderId = :folderIdFilter`) rather than concatenated into the dynamic SOQL string. `LIMIT` is validated against a safe upper bound (≤ 1000) before use.
- **USER_MODE enforcement for template query** — `getEmailTemplates` now runs via `Database.query(query, AccessLevel.USER_MODE)` so CRUD / FLS is enforced per the running user.
- **FLS checks before Task DML** — when `logEmail` is enabled, the controller now verifies `Task.isUpdateable()` and field-level `isUpdateable()` on `Subject`, `Status`, and `Description` before writing the activity record.
- **Latent Flow attribute change bug** — `handleInputChange` was dispatching `FlowAttributeChangeEvent` with `this.field` / `this.value` (both `undefined`); now uses the local `field` / `value` from the event.
- **Minor SOQL casing / parameter cleanup** — tightened casing and whitespace in several queries (`ContentDocumentLink`, `OrgWideEmailAddress`) and fixed a case inconsistency in the `whatId` argument passed to `Messaging.renderStoredEmailTemplate`.

### Tests
- `testGetEmailTemplates_WithFilter` renamed and rewritten to `testGetEmailTemplates_WithFolderIdFilter`, asserting that all returned templates belong to the requested folder.
