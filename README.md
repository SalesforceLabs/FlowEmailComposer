# FlowEmailComposer

Flow Email Composer is a lightning component that provides the ability to select email template and prepare a draft version of the email with merge field values. User can also compose the email on the go without selecting email template.

### Features

- Pre-populate the email composer with To,CC,Bcc,Subject. The e-mail addresses should be comma separated.

- Prepares a draft version of the email being sent based on selected e-mail template. The draft version is loaded with evaluated merge fields, adds attachments if any added to template. This feature requires to specify whatId.

- Ability to upload attachments. Uploaded attachments will get saved to Files. If you specify whatId, the attachment gets linked to the record.

### Setup Instructions

1. Install the package.
2. Open the lightning flow you wish to edit or create one.
3. Drag and drop Screen Element to the canvas.
4. Select the component, Flow Email Composer in the Screen Component search wizard.
5. Specify the values for whatId, To, CC, Bcc, Subject. The body of email uses whatId to evaluate the merge fields in selected email template. You can also use flow variables to populate these attributes

/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */