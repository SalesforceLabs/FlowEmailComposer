import { LightningElement, api, track } from "lwc";
import getEmailTemplates from "@salesforce/apex/FlowEmailComposerCtrl.getEmailTemplates";
import sendAnEmailMsg from "@salesforce/apex/FlowEmailComposerCtrl.sendAnEmailMsg";
import getTemplateDetails from "@salesforce/apex/FlowEmailComposerCtrl.getTemplateDetails";


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
        this.initializeComponent();
    }

    initializeComponent() {
        this.showSpinner = true;
        getEmailTemplates()
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
                this.filteredTemplateList = templates.map((template) => ({
                    label: template.Name,
                    value: template.Id,
                    ...template,
                }));
                this.showSpinner = false;
            })
            .catch((error) => {
                console.error('Error fetching email templates:', error);
                this.showSpinner = false;
            });
    }

    filterEmailTemplates(event) {
        this.selFolderId = event.detail.value;
        this.filteredTemplateList = this.filteredTemplateList.filter(
            (template) => template.FolderId === this.selFolderId
        );
        this.attachmentsFromTemplate = [];
    }

    changeBody(event) {
        this.showSpinner = true;
        this.selTemplateId = event.detail.value;
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
                this.showSpinner = false; // Hide spinner after data is fetched
            })
            .catch((error) => {
                // Handle any errors
                console.error('Error fetching template details:', error);
                this.showSpinner = false; // Hide spinner even if there's an error
            });
    }
    

    handleUploadFinished(event) {
        const uploadedFiles = event.detail.files;
        this.filesToBeAttached = [...this.filesToBeAttached, ...uploadedFiles];
    }

    sendEmail() {
        this.showSpinner = true;
        const docIds = this.filesToBeAttached.map((file) => file.documentId);
        const attIds = this.attachmentsFromTemplate.map((att) => att.attachId);

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
            createActivity: this.logEmail,
        })
            .then(() => {
                this.showToast('Success', 'Email sent successfully!', 'success');
                this.resetForm();
            })
            .catch((error) => {
                console.error('Error sending email:', error);
                this.showToast('Error', 'Failed to send email.', 'error');
            })
            .finally(() => {
                this.showSpinner = false;
            });
    }

    removeAttachment(event) {
        const attId = event.detail.name;
        this.attachmentsFromTemplate = this.attachmentsFromTemplate.filter(
            (att) => att.attachId !== attId
        );
    }

    resetForm() {
        this.emailBody = '';
        this.attachmentsFromTemplate = [];
        this.selTemplateId = '';
        this.selFolderId = '';
        this.filteredTemplateList = [];
        this.filesToBeAttached = [];
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title,
            message,
            variant,
        });
        this.dispatchEvent(event);
    }

    showCC() {
        this.showCCField = true;
    }

    showBCC() {
        this.showBccField = true;
    }
}
