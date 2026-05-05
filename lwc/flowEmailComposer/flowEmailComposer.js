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
    @api recordId;
    @api emailBody;
    @api maxLimit;
    @api hideTemplateSelection = false;
    @api transitionOnSend;
    @api availableActions = [];

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


    // connectedCallback method to initialize the component
    connectedCallback() {
        this.initializeComponent();
    }

    renderedCallback() {
        this._syncBodyEditorValue();
        this._wireBodyEditorCursorFix();
    }

    _syncBodyEditorValue() {
        if (this.emailBody === this._lastPushedBody) return;
        const rte = this.template.querySelector('lightning-input-rich-text');
        if (!rte) return;
        rte.value = this.emailBody || '';
        this._lastPushedBody = this.emailBody;
    }

    // Intercept the first click into the rich-text editor so the caret lands
    // at the click point instead of snapping to the end of the paragraph —
    // a long-standing quirk of Quill when the editable first receives focus
    // with pre-populated content (e.g. a default template or default body).
    _wireBodyEditorCursorFix() {
        const rte = this.template.querySelector('lightning-input-rich-text');
        if (!rte || !rte.shadowRoot) return;
        const editable = rte.shadowRoot.querySelector('.ql-editor') ||
                         rte.shadowRoot.querySelector('.slds-rich-text-editor__textarea [contenteditable="true"]') ||
                         rte.shadowRoot.querySelector('[contenteditable="true"]');
        if (!editable || editable.dataset.fecCursorWired === 'true') return;

        const collectShadowRoots = () => {
            const roots = [];
            let node = editable;
            while (node) {
                const root = node.getRootNode();
                if (root && root.host) {
                    roots.push(root);
                    node = root.host;
                } else {
                    break;
                }
            }
            return roots;
        };

        const rangeFromPoint = (x, y) => {
            const shadowRoots = collectShadowRoots();
            if (document.caretPositionFromPoint) {
                let pos = null;
                try {
                    pos = document.caretPositionFromPoint(x, y, { shadowRoots });
                } catch (e) {
                    pos = document.caretPositionFromPoint(x, y);
                }
                if (pos && pos.offsetNode) {
                    const r = document.createRange();
                    r.setStart(pos.offsetNode, pos.offset);
                    r.collapse(true);
                    return r;
                }
            }
            if (document.caretRangeFromPoint) {
                return document.caretRangeFromPoint(x, y);
            }
            return null;
        };

        const applyCaret = (x, y) => {
            const range = rangeFromPoint(x, y);
            if (!range) return false;
            if (!editable.contains(range.startContainer)) return false;
            const root = editable.getRootNode();
            const selection = (root && root.getSelection) ? root.getSelection() : window.getSelection();
            if (!selection) return false;
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        };

        editable.addEventListener('mousedown', (event) => {
            const root = editable.getRootNode();
            const active = root && root.activeElement;
            const hadFocus = active && (active === editable || editable.contains(active));
            if (hadFocus) return;
            if (event.button !== 0) return;

            event.preventDefault();
            const x = event.clientX;
            const y = event.clientY;

            try { editable.focus({ preventScroll: true }); } catch (e) { editable.focus(); }

            applyCaret(x, y);
            requestAnimationFrame(() => {
                applyCaret(x, y);
                requestAnimationFrame(() => applyCaret(x, y));
            });
        });
        editable.dataset.fecCursorWired = 'true';
    }

    // Initialization method
    initializeComponent() {
        this.showSpinner = true;
        //Call Apex to get initial list of folders and templates
        getEmailTemplates({ additionalCondition: this.additionalCondition, maxLimit: this.maxLimit })
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
                this.emailBody = result.body;
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
