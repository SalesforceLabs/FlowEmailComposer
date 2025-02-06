import { LightningElement, api, track } from "lwc";
import getEmailTemplates from "@salesforce/apex/FlowEmailComposerCtrl.getEmailTemplates";
import sendAnEmailMsg from "@salesforce/apex/FlowEmailComposerCtrl.sendAnEmailMsg";
import deleteFiles from "@salesforce/apex/FlowEmailComposerCtrl.deleteFiles";
import getTemplateDetails from "@salesforce/apex/FlowEmailComposerCtrl.getTemplateDetails";
import $currentUserId from "@salesforce/user/Id";

export default class flowEmailComposer extends LightningElement {
    @api emailTemplateId;
    @api whatId;
    @api whoId;
    @api fromAddress;
    @api toAddresses;
    @api ccAddresses;
    @api bccAddresses;
    @api subject;
    @api senderName;
    @api logEmail;
    @api recordId;

    @track showSpinner = false;
    @track uploadRefId;
    @track folders = [];
    @track emailTemplates = [];
    @track filteredTemplateList = [];
    @track attachmentsFromTemplate = [];
    @track filesTobeAttached = [];
    @track hasModalOpen = false;
    @track selectedDocumentId;
    @track showCCField = false;
    @track showBccField = false;
    @track emailBody = '';
    @track selTemplateId;
    @track selFolderId;

    connectedCallback() {
        this.init();
    }

    init() {
        this.showSpinner = true;
        if (this.emailTemplateId && this.emailTemplateId.length === 15) {
            this.convertTo18();
        }

        if (!this.whatId && !this.whoId) {
            this.uploadRefId = 'YOUR_USER_ID_HERE'; // Replace with actual user ID retrieval method
        } else if (this.whatId) {
            this.uploadRefId = this.whatId;
        } else if (this.whoId) {
            this.uploadRefId = this.whoId;
        }

        this.loadEmailTemplates();
    }

    loadEmailTemplates() {
        getEmailTemplates()
            .then(result => {
                this.emailTemplates = result;
                this.processFolders();
                if ((this.whatId || this.whoId) && this.emailTemplateId) {
                    this.getEmailTemplateBody(this.emailTemplateId, this.whatId);
                } else {
                    this.showSpinner = false;
                }
            })
            .catch(error => {
                this.showErrorToast(error);
            });
    }

    processFolders() {
        this.folders = this.emailTemplates.reduce((acc, template) => {
            if (!acc.some(folder => folder.Id === template.FolderId)) {
                acc.push({
                    Id: template.FolderId,
                    Name: (template.Folder && template.Folder.Name) ? template.Folder.Name : 'No Folder Name'
                });
            }
            return acc;
        }, []);
    }

    changeBody() {
        this.showSpinner = true;
        this.getEmailTemplateBody(this.selTemplateId, this.whatId);
    }

    filterEmailTemplates() {
        this.filteredTemplateList = this.emailTemplates.filter(template => template.FolderId === this.selFolderId);
        this.attachmentsFromTemplate = [];
    }

    sendEmail() {
        this.showSpinner = true;
        const docIds = this.filesTobeAttached.map(file => file.documentId);
        const attIds = this.attachmentsFromTemplate
            .filter(att => !att.isContentDocument)
            .map(att => att.attachId);

        docIds.push(...this.attachmentsFromTemplate
            .filter(att => att.isContentDocument)
            .map(att => att.attachId));

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
            contentDocumentIds: docIds,
            attachmentIds: attIds,
            createActivity: this.logEmail
        })
            .then(() => {
                this.showSuccessToast('Success!', 'E-mail has been sent successfully.');
                this.resetFields();
            })
            .catch(error => {
                this.showErrorToast(error);
            })
            .finally(() => {
                this.showSpinner = false;
            });
    }

    handleUploadFinished(event) {
        const uploadedFiles = event.detail.files;
        this.filesTobeAttached = [...this.filesTobeAttached, ...uploadedFiles];
    }

    previewFile(event) {
        this.selectedDocumentId = event.target.dataset.id;
        this.hasModalOpen = true;
    }

    closeModel() {
        this.hasModalOpen = false;
        this.selectedDocumentId = null;
    }

    delFiles(event) {
        this.showSpinner = true;
        const documentId = event.target.dataset.id;
        this.filesTobeAttached = this.filesTobeAttached.filter(file => file.documentId !== documentId);
        this.delUploadedfiles(documentId);
    }

    removeAtt(event) {
        const attId = event.target.dataset.id;
        this.attachmentsFromTemplate = this.attachmentsFromTemplate.filter(att => att.attachId !== attId);
    }

    showcc() {
        this.showCCField = true;
    }

    showbcc() {
        this.showBccField = true;
    }

    // Helper methods
    convertTo18() {
        // Implement 15 to 18 character ID conversion logic here
    }

    getEmailTemplateBody(templateId, whatId) {
        // Implement email template body retrieval logic here
    }

    delUploadedfiles(documentId) {
        // Implement file deletion logic here
    }

    resetFields() {
        this.emailBody = '';
        this.attachmentsFromTemplate = [];
        this.subject = '';
        this.selTemplateId = '';
        this.selFolderId = '';
        this.filteredTemplateList = [];
        this.filesTobeAttached = [];
    }

    showSuccessToast(title, message) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: title,
                message: message,
                variant: 'success',
            }),
        );
    }

    showErrorToast(error) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: error.message || 'Unknown error',
                variant: 'error',
            }),
        );
    }
}