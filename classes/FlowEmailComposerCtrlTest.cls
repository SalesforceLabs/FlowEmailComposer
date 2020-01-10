/*
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

@isTest(seeAllData=false)
public class FlowEmailComposerCtrlTest {
    @Testsetup
    static void testCreateContentDocuments(){
        ContentVersion cv = new ContentVersion();
        cv.Title = 'Test Document';
        cv.PathOnClient = 'TestDocument.pdf';
        cv.VersionData = Blob.valueOf('Test Content');
        cv.IsMajorVersion = true;
        Insert cv; 
    }
    static testmethod void testgetEmailTemplates(){
        EmailTemplate e = new EmailTemplate (developerName = 'test', folderid=userinfo.getUserId(),TemplateType= 'Text', Name = 'test'); // plus any other fields that you want to set
        insert e;
        List<EmailTemplate> emailTemplateList = FlowEmailComposerCtrl.getEmailTemplates();
        system.assert(emailTemplateList.size() > 0);
        system.assert(FlowEmailComposerCtrl.getTemplateDetails([select id from emailtemplate limit 1].id,null,null) != null);
    }
    static testmethod void testdeleteFiles(){
        List<ContentVersion> cvList = [SELECT Id, Title, ContentDocumentId FROM ContentVersion];
        System.assertEquals(cvList.size(), 1);
        
        FlowEmailComposerCtrl.deleteFiles(cvList[0].ContentDocumentId);
        System.assertEquals([SELECT Id, Title, LatestPublishedVersionId FROM ContentDocument].size(), 0);
    }
    
    static testmethod void testSendEmail(){
        List<ContentVersion> cvList = [SELECT Id, Title, ContentDocumentId FROM ContentVersion];
        

       FlowEmailComposerCtrl.sendAnEmailMsg('test@gmail.com', 'test@gmail.com', 'test@gmail.com', 'test',
                                             null,'body', 'sender', new string[]{cvList[0].ContentDocumentId},null);
       system.assert([SELECT Id, ParentId, TextBody, Subject, FromName, FromAddress, ToAddress, CcAddress, BccAddress,createddate
                      FROM EmailMessage
                      WHERE Createddate=Today ].size()>0);
    }
    
}