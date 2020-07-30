global with sharing class FlowEmailComposerCtrl {
    @AuraEnabled 
    public static List<EmailTemplate> getEmailTemplates(string templateId){
        if(Schema.sObjectType.EmailTemplate.isAccessible() && Schema.sObjectType.Attachment.isAccessible()){
            
            if(string.isNotBlank(templateId)){ //if we are hiding the template selection boxes, we only need to query the template we are actively using
                return new List<EmailTemplate>([SELECT Subject,Id, Name,DeveloperName, FolderId, Folder.DeveloperName, Folder.Name,
                        (Select Id,Name from Attachments)
                    FROM EmailTemplate
                    WHERE id = :templateId AND TemplateType IN ('custom','text','html')
                    LIMIT 1]);
            }

            return new List<EmailTemplate>([SELECT Subject,Id, Name,DeveloperName, FolderId, Folder.DeveloperName, Folder.Name,
                	   (Select Id,Name from Attachments)
                FROM EmailTemplate
                WHERE TemplateType IN ('custom','text','html')
                ORDER BY FolderId, DeveloperName]);
        }
        return new EmailTemplate[]{};
    }
    
    @AuraEnabled 
    public static EmailMsg getTemplateDetails(string templateId, String whoId, String whatId){
        Messaging.SingleEmailMessage email = Messaging.renderStoredEmailTemplate(templateId, whoId, WhatId,Messaging.AttachmentRetrievalOption.METADATA_ONLY);
        EmailMsg msg = new EmailMsg();
        msg.subject = email.getSubject();
        msg.body = email.getHtmlBody();

        List<Messaging.EmailFileAttachment> attachmentList = email.fileAttachments;

        List<FileAttachmentWrapper> fawList = new List<FileAttachmentWrapper>();
        for(Messaging.EmailFileAttachment efa : attachmentList){
           FileAttachmentWrapper faw = new FileAttachmentWrapper();
            faw.attachId = efa.id;
            faw.filename = efa.filename;
            faw.isContentDocument=false;
            fawList.add(faw);
        }
        for(ContentDocumentLink cdl : [Select ContentDocument.Id, ContentDocument.title, ContentDocument.fileExtension
                                       from contentdocumentlink
                                       where linkedEntityId=:templateId]){
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
    public static void deleteFiles(string sdocumentId){ 
        if (Schema.sObjectType.ContentDocument.isDeletable()) {
        	delete [SELECT Id,Title,FileType from ContentDocument WHERE id=:sdocumentId]; 
        }
    }  
    
    @AuraEnabled
    public static void sendAnEmailMsg(string fromAddress,string toAddressesStr,string ccAddressesStr,string bccAddressesStr,string subject, 
                                      string whoId, string whatId, string body, String senderDisplayName, List<String> contentDocumentIds,
                                      List<String> attachmentIds,Boolean createActivity){
       try{                                   
    	if(String.isNotblank(toAddressesStr) && Schema.sObjectType.ContentVersion.isAccessible()){
            String[] toAddresses = toAddressesStr.split(',');
            String[] fileIds = new String[]{};
            String[] ccAddresses = String.isNotBlank(ccAddressesStr) ? ccAddressesStr.split(',') : new String[]{};
            String[] bccAddresses = String.isNotBlank(bccAddressesStr) ? bccAddressesStr.split(',') : new String[]{};
            system.debug('contentDocumentIds****'+contentDocumentIds);    
            List<String> cvIds = new String[]{};
            for(ContentVersion cv : [SELECT Id, Title, FileType, VersionData, isLatest, ContentDocumentId
                                     FROM ContentVersion
                                     WHERE isLatest = true AND ContentDocumentId IN :contentDocumentIds]){
            	cvIds.add(cv.id);
            }   
            Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
            if(String.isNotBlank(fromAddress)){
                OrgWideEmailAddress[] owea = new List<OrgWideEmailAddress>([select Id
                                                                            from OrgWideEmailAddress
                                                                            where Address = :fromAddress]);
				if ( owea.size() > 0 ) {
    				email.setOrgWideEmailAddressId(owea.get(0).Id);
                    email.setUseSignature(false);
				}
            }
            email.setToAddresses(toAddresses);
            email.setCCAddresses(ccAddresses);
            email.setBCCAddresses(bccAddresses);
            email.setSubject(subject);
            email.sethtmlBody(body);
            email.setUseSignature(false);
            //email.setTreatBodiesAsTemplate(true);
            if(String.isNotBlank(senderDisplayName)){
                email.setSenderDisplayName(senderDisplayName);
            } 
            system.debug('cvIds**'+cvIds);
            if(cvIds !=null && !(cvIds.isEmpty())){
                fileIds.addAll(cvIds);
            }
            if(attachmentIds !=null && !(attachmentIds.isEmpty())){
                fileIds.addAll(attachmentIds);
            } 
            if(!(fileIds.isEmpty())){
                email.setEntityAttachments(fileIds);
            }
            //email.setTargetObjectId(userinfo.getUserId());
            email.saveAsActivity = true;
            
            List<Messaging.SendEmailResult> ser =  Messaging.sendEmail(new Messaging.SingleEmailMessage[] {email});
            if((ser != null && ser.size() >0 && ser[0].isSuccess()) || Test.isRunningTest()){
                if(createActivity){
                    String fromAddrlog = String.isNotBlank(fromAddress) ? 'From: ' + fromAddress + '\n' : '';
                    String toAddrlog = String.isNotBlank(toAddressesStr) ? 'To: ' + toAddressesStr + '\n': '';
                    String ccAddrlog = String.isNotBlank(ccAddressesStr) ? 'Cc: ' + ccAddressesStr + '\n': '';
                    String bccAddrlog = String.isNotBlank(bccAddressesStr) ? 'BCc: ' + bccAddressesStr + '\n': '';
                    String addressSeparator = '=================================================================='+'\n';
                	Task emailActivity =  new Task(Subject = subject, 
                                                WhoId = String.isNotBlank(whoId) ? whoId : null, 
                                                WhatId = String.isNotBlank(whatId) ? whatId : null,
                                                TaskSubtype = 'Email',
                                                Status = 'Completed',
                                                Description = fromAddrlog + toAddrlog +ccAddrlog + bccAddrlog+addressSeparator+
                                                              (String.isNotBlank(body)? body.stripHtmlTags() : ''),
                                                ActivityDate = Date.today()
                                                );
                   Database.DMLOptions dmo = new Database.DMLOptions();
                   dmo.allowFieldTruncation = true;
                   emailActivity.setOptions(dmo);
                   insert emailActivity;
                }
            }else{
                List<Messaging.SendEmailError> errors = ser[0].getErrors();
                system.debug(JSON.serialize(errors));
            }
    	}
       }catch(Exception e){
           throw new AuraHandledException('Something went wrong: ' +e.getMessage());
           //throw e;
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
       // @AuraEnabled publi List<String> attach
    }
}