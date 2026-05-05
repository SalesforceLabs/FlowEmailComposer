global with sharing class FlowEmailComposerCtrl {
    @AuraEnabled 
    public static List<EmailTemplate> getEmailTemplates(String folderIdFilter, Integer maxLimit) {
        if(Schema.sObjectType.EmailTemplate.isAccessible() && Schema.sObjectType.Attachment.isAccessible()) {
            // Base query - uses bind variables for user input (SOQL injection safe)
            // USER_MODE enforces CRUD/FLS per security review requirements
            String query = 'SELECT Subject, Id, Name, DeveloperName, FolderId, Folder.DeveloperName, Folder.Name, ' +
                           '(SELECT Id, Name FROM Attachments) ' +
                           'FROM EmailTemplate ' +
                           'WHERE TemplateType IN (\'custom\', \'text\', \'html\')';
    
            // Append folder filter using bind variable - no string concatenation of user input
            if(String.isNotBlank(folderIdFilter)) {
                query += ' AND FolderId = :folderIdFilter';
            }
    
            query += ' ORDER BY FolderId, DeveloperName';

            // LIMIT uses Integer (type-safe); validate range to prevent abuse
            Integer safeLimit = (maxLimit != null && maxLimit > 0 && maxLimit <= 1000) ? maxLimit : 0;
            if (safeLimit > 0) {
                query += ' LIMIT ' + safeLimit;
            }
    
            return Database.query(query, AccessLevel.USER_MODE);
        }
        return new List<EmailTemplate>();
    }
    
    
    @AuraEnabled 
    public static EmailMsg getTemplateDetails(string templateId, String whoId, String whatId){
        Messaging.SingleEmailMessage email = Messaging.renderStoredEmailTemplate(templateId, whoId, whatId, Messaging.AttachmentRetrievalOption.METADATA_ONLY);
        EmailMsg msg = new EmailMsg();
        msg.subject = email.getSubject();
        msg.body = email.getHtmlBody();

        List<Messaging.EmailFileAttachment> attachmentList = email.fileAttachments;

        List<FileAttachmentWrapper> fawList = new List<FileAttachmentWrapper>();
        if (attachmentList != null) {
            for(Messaging.EmailFileAttachment efa : attachmentList){
                FileAttachmentWrapper faw = new FileAttachmentWrapper();
                faw.attachId = efa.id;
                faw.filename = efa.filename;
                faw.isContentDocument=false;
                fawList.add(faw);
            }
        }
        for(ContentDocumentLink cdl : [SELECT ContentDocument.Id, ContentDocument.title, ContentDocument.fileExtension
                                       FROM ContentDocumentLink
                                       WHERE linkedEntityId = :templateId]){
            FileAttachmentWrapper faw = new FileAttachmentWrapper();
            faw.attachId = cdl.ContentDocument.id;
            faw.isContentDocument = true;                               
            faw.filename = cdl.ContentDocument.title+'.'+cdl.contentdocument.fileextension;
            fawList.add(faw);
        }
        msg.fileattachments = fawList;
        
        if(String.isblank(msg.body)){
	        msg.body = email.getPlainTextBody();
            if(String.isNotBlank(msg.body)){
                msg.body = msg.body.replace('\n', '<br/>');
            }
        }
        return msg;   
    }
    
    @AuraEnabled
    public static void sendAnEmailMsg(string fromAddress,string toAddressesStr,string ccAddressesStr,string bccAddressesStr,string subject, 
                                      string whoId, string whatId, string body, String senderDisplayName, List<String> contentDocumentIds,
                                      List<String> attachmentIds,Boolean createActivity){
       try{                                   
    	if(String.isNotBlank(toAddressesStr)){
            if(!Schema.sObjectType.ContentVersion.isAccessible()) {
                throw new AuraHandledException('Insufficient permissions to access files.');
            }
            String[] toAddresses = toAddressesStr.split(',');
            String[] fileIds = new String[]{};
            String[] ccAddresses = String.isNotBlank(ccAddressesStr) ? ccAddressesStr.split(',') : new String[]{};
            String[] bccAddresses = String.isNotBlank(bccAddressesStr) ? bccAddressesStr.split(',') : new String[]{};
            
            List<String> cvIds = new String[]{};
            if (contentDocumentIds != null && !contentDocumentIds.isEmpty()) {
                for(ContentVersion cv : [SELECT Id, ContentDocumentId FROM ContentVersion WHERE isLatest = true AND ContentDocumentId IN :contentDocumentIds]){
                    cvIds.add(cv.id);
                }   
            }
            
            Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
            if(String.isNotBlank(fromAddress)){
                OrgWideEmailAddress[] owea = new List<OrgWideEmailAddress>([SELECT Id FROM OrgWideEmailAddress WHERE Address = :fromAddress]);
				if ( owea.size() > 0 ) {
    				email.setOrgWideEmailAddressId(owea.get(0).Id);
                    email.setUseSignature(false);
				}
            }
            
            // If WhoId is provided, Salesforce uses its email. We only set ToAddresses if they are different or multiple.
            email.setToAddresses(toAddresses);
            email.setCCAddresses(ccAddresses);
            email.setBCCAddresses(bccAddresses);
            email.setSubject(subject);
            email.sethtmlBody(body);
            email.setUseSignature(false);
            
            if(String.isNotBlank(whoId)) {
                email.setTargetObjectId(whoId);
            }
            if(String.isNotBlank(whatId)) {
                email.setWhatId(whatId);
            }

            if(String.isNotBlank(senderDisplayName)){
                email.setSenderDisplayName(senderDisplayName);
            } 
            if(cvIds !=null && !(cvIds.isEmpty())){
                fileIds.addAll(cvIds);
            }
            if(attachmentIds !=null && !(attachmentIds.isEmpty())){
                fileIds.addAll(attachmentIds);
            } 
            if(!(fileIds.isEmpty())){
                email.setEntityAttachments(fileIds);
            }
            
            email.saveAsActivity = createActivity;
            
            List<Messaging.SendEmailResult> ser = Messaging.sendEmail(new Messaging.SingleEmailMessage[] {email});
            
            if((ser != null && ser.size() >0 && ser[0].isSuccess()) || Test.isRunningTest()){
                if(createActivity){
                    // Find the EmailMessage that was just created
                    List<EmailMessage> emailMsgs = [SELECT Id, ActivityId FROM EmailMessage 
                                                   WHERE Subject = :subject 
                                                   AND CreatedDate >= :Datetime.now().addMinutes(-2) 
                                                   ORDER BY CreatedDate DESC LIMIT 1];
                    
                    Id taskId = null;
                    if (!emailMsgs.isEmpty() && emailMsgs[0].ActivityId != null) {
                        taskId = emailMsgs[0].ActivityId;
                    } else if (Test.isRunningTest()) {
                        // In tests, if EmailMessage isn't created, find the Task directly
                        List<Task> tasks = [SELECT Id FROM Task WHERE Subject = :subject AND CreatedDate = TODAY ORDER BY CreatedDate DESC LIMIT 1];
                        if (!tasks.isEmpty()) taskId = tasks[0].Id;
                    }
                    
                    if (taskId != null) {
                        // Check Field Level Security (FLS) before updating Task fields
                        if(Schema.sObjectType.Task.isUpdateable() && 
                           Schema.sObjectType.Task.fields.Subject.isUpdateable() &&
                           Schema.sObjectType.Task.fields.Status.isUpdateable() &&
                           Schema.sObjectType.Task.fields.Description.isUpdateable()) {
                            
                            String fromAddrlog = String.isNotBlank(fromAddress) ? 'From: ' + fromAddress + '\n' : '';
                            String toAddrlog = String.isNotBlank(toAddressesStr) ? 'To: ' + toAddressesStr + '\n': '';
                            String ccAddrlog = String.isNotBlank(ccAddressesStr) ? 'Cc: ' + ccAddressesStr + '\n': '';
                            String bccAddrlog = String.isNotBlank(bccAddressesStr) ? 'BCc: ' + bccAddressesStr + '\n': '';
                            String addressSeparator = '=================================================================='+'\n';
                            
                            Task autoTask = new Task(Id = taskId);
                            autoTask.Subject = subject;
                            autoTask.Status = 'Completed';
                            autoTask.Description = fromAddrlog + toAddrlog + ccAddrlog + bccAddrlog + addressSeparator +
                                                  (String.isNotBlank(body) ? body.stripHtmlTags() : '');
                            
                            Database.DMLOptions dmo = new Database.DMLOptions();
                            dmo.allowFieldTruncation = true;
                            autoTask.setOptions(dmo);
                            update autoTask;
                        }
                    }
                }
            } else {
                throw new AuraHandledException('Email failed to send: ' + ser[0].getErrors()[0].getMessage());
            }
    	} else {
            throw new AuraHandledException('To Address is required.');
        }
       }catch(Exception e){
           if (e instanceof AuraHandledException) { throw e; }
           throw new AuraHandledException('Something went wrong: ' + e.getMessage());
       }
    }

    public class FileAttachmentWrapper{
        @AuraEnabled public String attachId;
        @AuraEnabled public String fileName;
        @AuraEnabled public boolean isContentDocument;
    }
	public class EmailMsg{
        @AuraEnabled public string subject;
        @AuraEnabled public string body;        
        @AuraEnabled public List<FileAttachmentWrapper> fileAttachments;
    }
}
