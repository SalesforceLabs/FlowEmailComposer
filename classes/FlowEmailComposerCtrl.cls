/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

global with sharing class FlowEmailComposerCtrl {
    @AuraEnabled 
    public static List<EmailTemplate> getEmailTemplates(){
        if(Schema.sObjectType.EmailTemplate.isAccessible() && Schema.sObjectType.Attachment.isAccessible()){
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
        Messaging.SingleEmailMessage email = Messaging.renderStoredEmailTemplate(templateId, whoId, WhatId);
        EmailMsg msg = new EmailMsg();
        msg.subject = email.getSubject();
        msg.body = email.getHtmlBody();
        if(String.isblank(msg.body)){
	        msg.body = email.getPlainTextBody();
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
    public static void sendAnEmailMsg(string toAddressesStr,string ccAddressesStr,string bccAddressesStr,string subject, 
                                      string whoId, string body, String senderDisplayName, List<String> contentDocumentIds,
                                      List<String> attachmentIds){
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
            email.setToAddresses(toAddresses);
            email.setCCAddresses(ccAddresses);
            email.setBCCAddresses(bccAddresses);
            email.setSubject(subject);
            email.sethtmlBody(body);
            email.setTreatBodiesAsTemplate(true);
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
            email.saveAsActivity = true;
            List<Messaging.SendEmailResult> ser =  Messaging.sendEmail(new Messaging.SingleEmailMessage[] {email});
            if(ser[0].isSuccess()){
                system.debug('success');
            }else{
                List<Messaging.SendEmailError> errors = ser[0].getErrors();
                system.debug(JSON.serialize(errors));
            }
    	}
    }

	public class EmailMsg{
        @AuraEnabled public string subject;
        @AuraEnabled public string body;
    }
}