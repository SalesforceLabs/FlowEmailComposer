import { LightningElement, api, track } from "lwc";
import getEmailTemplates from "@salesforce/apex/FlowEmailComposerCtrl.getEmailTemplates";
import sendAnEmailMsg from "@salesforce/apex/FlowEmailComposerCtrl.sendAnEmailMsg";
import getTemplateDetails from "@salesforce/apex/FlowEmailComposerCtrl.getTemplateDetails";
import Toast from 'lightning/toast';
import { FlowAttributeChangeEvent, FlowNavigationNextEvent, FlowNavigationFinishEvent } from 'lightning/flowSupport';


export default class flowEmailComposer extends LightningElement {
    // Public properties with @api annotation for attribute flow
    @api emailTemplateId;
    @api whatId;
    @api whoId;
    @api fromAddress;
    @api toAddresses;
    @api ccAddresses;
    @api bccAddresses;
    @api subject;
    @api senderName;
    @api logEmail = false;
    @api additionalCondition;
    @api folderIdFilter;
    @api recordId;
    @api emailBody;
    @api maxLimit;
    @api hideTemplateSelection = false;
    @api transitionOnSend;
    @api availableActions = [];
    @api hideFolderPicker = false;
    @api hideAttachments = false;
    @api expandCcOnLoad = false;
    @api expandBccOnLoad = false;
    @api defaultFolderId;
    @api bodyHeight;
    @api toLabel;
    @api toHelpText;
    @api ccLabel;
    @api ccHelpText;
    @api bccLabel;
    @api bccHelpText;
    @api subjectLabel;
    @api subjectHelpText;
    @api bodyLabel;
    @api bodyHelpText;
    @api folderLabel;
    @api folderHelpText;
    @api templateLabel;
    @api templateHelpText;

    // Properties with @track annotation for tracking changes
    @track showSpinner = false;
    @track folders = [];
    @track filteredTemplateList = [];
    @track attachmentsFromTemplate = [];
    @track showCCField = false;
    @track showBccField = false;
    @track selTemplateId;
    @track selFolderId;
    @track allTemplates = [];
    @track docIds = [];
    @track attachmentIds = [];
    @track objFiles = [];
    @track uploadedFiles = [];
    @track _bodyDisplay = '';

    get resolvedToLabel()       { return this.toLabel       || 'To'; }
    get resolvedCcLabel()       { return this.ccLabel       || 'CC'; }
    get resolvedBccLabel()      { return this.bccLabel      || 'BCC'; }
    get resolvedSubjectLabel()  { return this.subjectLabel  || 'Subject'; }
    get resolvedBodyLabel()     { return this.bodyLabel     || 'Body'; }
    get resolvedFolderLabel()   { return this.folderLabel   || 'Select Email Template Folder:'; }
    get resolvedTemplateLabel() { return this.templateLabel || 'Select a Template:'; }

    get showFolderPicker()       { return !this.hideTemplateSelection && !this.hideFolderPicker; }
    get showTemplatePicker()     { return !this.hideTemplateSelection; }
    get showAttachmentUploader() { return !this.hideAttachments; }

    // connectedCallback method to initialize the component
    connectedCallback() {
        if (this.expandCcOnLoad)  this.showCCField  = true;
        if (this.expandBccOnLoad) this.showBccField = true;
        if (this.emailBody) {
            this.emailBody = this._sanitizeTemplateHtml(this.emailBody);
            this._bodyDisplay = this.emailBody;
        }
        this.initializeComponent();
    }

    // Declaratively bound to lightning-input-rich-text's `value`. Reflects the
    // body content as set by template selection / config default / reset — but
    // NOT live keystrokes (handleBodyChange intentionally does not write back to
    // _bodyDisplay), so the binding never re-renders mid-edit and the caret stays
    // where the user clicked.
    get bodyValue() {
        return this._bodyDisplay || '';
    }

    renderedCallback() {
        this._primeBodyEditor();
    }

    // The editor (Quill, inside lightning-input-rich-text's sealed native shadow
    // DOM) snaps the caret to the END of the content on its FIRST focus after the
    // content is set. That happens on initial mount AND every time the value is
    // replaced (e.g. selecting a template — especially Classic HTML templates whose
    // heavier markup makes Quill fully re-set its contents and reset selection).
    // We consume that first-focus end-snap programmatically here so the user's next
    // real click is a *subsequent* focus, which Quill honors at the pointer position.
    //
    // Re-primes whenever _bodyDisplay changes to a new value. Because
    // handleBodyChange intentionally does NOT write back to _bodyDisplay, keystrokes
    // never trigger this — only initial load, template selection, and reset do.
    // Skip when the editor is currently focused so we never hijack an active edit.
    //
    // Note: focus() scrolls the editor into view — an accepted tradeoff for
    // keeping the caret-placement fix working.
    _primeBodyEditor() {
        if (!this._bodyDisplay) return;
        if (this._lastPrimedBody === this._bodyDisplay) return;
        const rte = this.template.querySelector('lightning-input-rich-text');
        if (!rte || typeof rte.focus !== 'function') return;
        if (this.template.activeElement === rte) return;
        this._lastPrimedBody = this._bodyDisplay;
        try {
            rte.focus();
            // Release focus on the next frame so the editor doesn't sit active.
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            requestAnimationFrame(() => {
                if (typeof rte.blur === 'function') {
                    try { rte.blur(); } catch (e) { /* noop */ }
                }
            });
        } catch (e) {
            /* noop */
        }
    }

    // Classic HTML email templates come back from Apex as a full rendered document
    // (`<html><head><style>…</style></head><body>…</body></html>`) whose body is a
    // layout <table> (header row / accent bars / main content row / footer row).
    // Quill can't edit tables — it wraps them in a single `ql-table-blob` blot that
    // is atomic, so backspace deletes the WHOLE body and typing only appends outside
    // the blob. Lightning email templates aren't table-based, which is why they work.
    //
    // Two passes:
    //   1. Strip document wrappers + <style>/<script>/<meta>/<link>/<title>.
    //   2. Unwrap tables into editable block markup — <table>/<tbody>/<thead>/
    //      <tfoot>/<tr> become <div>, <td>/<th> become <p>. Content is preserved;
    //      the un-editable table scaffolding is not. Visual layout of the classic
    //      template chrome (colored accent bars) is lost — an acceptable tradeoff
    //      for a body the user can actually edit.
    _sanitizeTemplateHtml(html) {
        if (!html || typeof html !== 'string') return html || '';
        const hasWrapper = /<\s*(html|head|body)\b/i.test(html);
        const hasHeadTags = /<\s*(style|script|meta|link|title)\b/i.test(html);
        const hasTable = /<\s*(table|tr|td|th|tbody|thead|tfoot)\b/i.test(html);
        if (!hasWrapper && !hasHeadTags && !hasTable) return html;
        try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('style, script, meta, link, title').forEach(n => n.remove());
            const unwrap = (el, replacementTag) => {
                const replacement = doc.createElement(replacementTag);
                while (el.firstChild) replacement.appendChild(el.firstChild);
                el.parentNode.replaceChild(replacement, el);
            };
            // Innermost-first: cells before rows before tables so replacements
            // don't invalidate the outer selection.
            doc.querySelectorAll('td, th').forEach(el => unwrap(el, 'p'));
            doc.querySelectorAll('tr').forEach(el => unwrap(el, 'div'));
            doc.querySelectorAll('tbody, thead, tfoot').forEach(el => unwrap(el, 'div'));
            doc.querySelectorAll('table').forEach(el => unwrap(el, 'div'));
            return (doc.body && doc.body.innerHTML) ? doc.body.innerHTML : html;
        } catch (e) {
            return html;
        }
    }

    // Initialization method
    initializeComponent() {
        this.showSpinner = true;
        //Call Apex to get initial list of folders and templates
        const filterValue = this.folderIdFilter || this.additionalCondition;
        getEmailTemplates({ folderIdFilter: filterValue, maxLimit: this.maxLimit })
            .then((templates) => {
                const folders = [];
                templates.forEach((template) => {
                    const existingFolder = folders.find((folder) => folder.Id === template.FolderId);
                    if (!existingFolder) {
                        folders.push({
                            Id: template.FolderId,
                            Name: template.Folder?.Name || 'No Folder Name',
                        });
                    }
                });
                this.folderOptions = folders.map((folder) => ({
                    label: folder.Name,
                    value: folder.Id,
                }));
                this.allTemplates = templates.map((template) => ({
                    label: template.Name,
                    value: template.Id,
                    ...template,
                }));
                this.filteredTemplateList = [...this.allTemplates]; // Initialize with all templates

                if (this.defaultFolderId) {
                    this.selFolderId = this.defaultFolderId;
                    this.filteredTemplateList = this.allTemplates.filter(
                        (t) => t.FolderId === this.defaultFolderId
                    );
                }

                this.showSpinner = false;

                // Check if templateId has a value and call changeBody if it does
                if (this.emailTemplateId) {
                    //console.log("initial email template is " + this.emailTemplateId);
                    this.selTemplateId = this.emailTemplateId;
                    //console.log("calling changeBody with " + this.selTemplateId);
                    this.changeBody(this.selTemplateId);

                }
            })


            .catch((error) => {
                console.error('Error fetching email templates:', error);
                this.showSpinner = false;
            });
    }

    // Filter templates based on selected folder
    filterTemplatesByFolder(event) {
        this.selFolderId = event.detail.value;
        if (this.selFolderId) {
            this.filteredTemplateList = this.allTemplates.filter(
                (template) => template.FolderId === this.selFolderId
            );
        } else {
            this.filteredTemplateList = [...this.allTemplates]; // Show all templates if no folder selected
        }
        this.attachmentsFromTemplate = [];
        this.selTemplateId = null; // Reset selected template when folder changes
    }

    // Change the email body when a new template is selected
    templateChanged(event) {
        this.selTemplateId = event.detail.value;
        this.changeBody(this.selTemplateId);
    }


    // Change the email body based on the selected template
    changeBody(selTemplateId) {
        //console.log('changeBody called with value:', selTemplateId);
        this.showSpinner = true;
        this.selTemplateId = selTemplateId;

        getTemplateDetails({
            templateId: this.selTemplateId,
            whoId: this.whoId,
            whatId: this.whatId
        })
            .then((result) => {
                // Handle the successful response
                this.subject = result.subject;
                const cleanBody = this._sanitizeTemplateHtml(result.body);
                this.emailBody = cleanBody;
                this._bodyDisplay = cleanBody;
                this.attachmentsFromTemplate = result.fileAttachments;
                //console.log("Attachments are " + JSON.stringify(this.attachmentsFromTemplate));

                // Initialize arrays to store document and attachment IDs
                let docIdsFromAttachment = [];
                let attachmentIdsFromAttachment = [];

                // Check if there are file attachments
                if (this.attachmentsFromTemplate && this.attachmentsFromTemplate.length > 0) {
                    this.attachmentsFromTemplate.forEach(attachment => {
                        if (attachment.isContentDocument) {
                            docIdsFromAttachment.push(attachment.attachId);
                        } else {
                            attachmentIdsFromAttachment.push(attachment.attachId);
                        }
                    });

                    this.docIds = docIdsFromAttachment;
                    this.attachmentIds = attachmentIdsFromAttachment;
                } else {
                    //console.log('No attachments found or attachmentsFromTemplate is undefined');
                    this.docIds = [];
                    this.attachmentIds = [];
                }
                //console.log("docIds from Template are " + docIdsFromAttachment);
                //console.log("attachmentIds from Template are " + attachmentIdsFromAttachment);
                this.showSpinner = false;
            })
            .catch((error) => {
                // Handle any errors
                console.error('Error in getTemplateDetails:', error);
                this.showSpinner = false;
                Toast.show({
                    label: 'Error',
                    message: error.body.message,
                    mode: 'dismissable',
                    variant: 'error',
                }, this);
            });
    }

    // Handle file uploads for both file attachments and content documents
    handleUpload_lightningFile(event) {
        let files = event.detail.files;
        //console.log("Files are " + JSON.stringify(files));
        this.handleUploadFinished(files);
    }


    handleUploadFinished(files) {
        //console.log("handleUploadFinished called with files: " + JSON.stringify(files));
        let objFiles = [];
        let documentIds = this.docIds;
        files.forEach(file => {

            let objFile = {
                name: file.name,
                documentId: file.documentId,
                contentVersionId: file.contentVersionId
            }
            objFiles.push(objFile);
            documentIds.push(file.documentId);
            this.docIds = documentIds;
            this.uploadedFiles = objFiles;
        })
        //console.log("docIds is " + docIds);
        //console.log("objFiles is " + JSON.stringify(objFiles));
        //console.log("uploadedFiles is " + JSON.stringify(this.uploadedFiles));

    }


    _fireFlowEvent(eventName, data) {
        this.dispatchEvent(new FlowAttributeChangeEvent(eventName, data));
    }

    // Remove an attachment from the email
    removeAttachment(event) {
        const attId = event.detail.name;
        this.attachmentsFromTemplate = this.attachmentsFromTemplate.filter(
            (att) => att.attachId !== attId
        );
    }

    // Remove an uploaded file
    removeFile(event) {
        const fileId = event.detail.name;
        this.uploadedFiles = this.uploadedFiles.filter(
            (file) => file.documentId !== fileId
        );
        this.docIds = this.docIds.filter(
            (file) => file !== fileId
        );
    }

    // Send an email using the sendAnEmailMsg Apex method
    sendEmailFromButton() {
        this.showSpinner = true;
        //console.log("docIds being sent +" + this.docIds);
        //console.log("attachmentIds being sent +" + this.attachmentIds);

        sendAnEmailMsg({
            fromAddress: this.fromAddress,
            toAddressesStr: this.toAddresses,
            ccAddressesStr: this.ccAddresses,
            bccAddressesStr: this.bccAddresses,
            subject: this.subject,
            whoId: this.whoId,
            whatId: this.whatId,
            body: this.emailBody,
            senderDisplayName: this.senderName,
            contentDocumentIds: this.docIds,
            attachmentIds: this.attachmentIds,
            createActivity: this.logEmail,
        })
            .then(() => {
                Toast.show({
                    label: 'Success',
                    message: 'Email Sent',
                    mode: 'dismissable',
                    variant: 'success'
                }, this);
                this.resetForm();
                if(this.transitionOnSend) {
                    this.handleNavigation();
                }                
            })
            .catch((error) => {
                console.error('Error sending email:', error);
                Toast.show({
                    label: 'Error',
                    message: error.body.message,
                    mode: 'dismissable',
                    variant: 'error',
                }, this);
            })
            .finally(() => {
                this.showSpinner = false;
            });
            
            
    }

    // Reset the form fields
    resetForm() {
        this.emailBody = '';
        this._bodyDisplay = '';
        this.subject = '';
        this.attachmentsFromTemplate = [];
        this.selTemplateId = '';
        this.selFolderId = '';
        this.filteredTemplateList = [];
    }

    showCC() {
        this.showCCField = !this.showCCField;
    }

    showBCC() {
        this.showBccField = !this.showBccField;
    }

    handleInputChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.value;
        this[field] = value;
        this._fireFlowEvent(field, value);
    }

    handleBodyChange(event) {
        const value = event.target.value;
        this.emailBody = value;
        this._fireFlowEvent('emailBody', value);
    }

    // navigate to the next screen or (if last element) terminate the flow    
    handleNavigation() {    
        if (this.availableActions.find(action => action === 'NEXT')) {
            const navigateNextEvent = new FlowNavigationNextEvent();
            this.dispatchEvent(navigateNextEvent);
        } else if (this.availableActions.find(action => action === 'FINISH')) {
            const navigateFinishEvent = new FlowNavigationFinishEvent();
            this.dispatchEvent(navigateFinishEvent);
        }
    
}

}
