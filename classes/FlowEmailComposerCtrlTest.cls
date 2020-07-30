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
        EmailTemplate e2 = new EmailTemplate (developerName = 'test2', folderid=userinfo.getUserId(),TemplateType= 'Text', Name = 'test2');
        insert e;
        insert e2;
        List<EmailTemplate> emailTemplateList = FlowEmailComposerCtrl.getEmailTemplates('');
        List<EmailTemplate> emailTemplateListSingle = FlowEmailComposerCtrl.getEmailTemplates(e.id);
        system.assert(emailTemplateList.size() > 0);
        system.assert(emailTemplateListSingle.size() == 1);        
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
        
        
        Test.startTest();
        
            FlowEmailComposerCtrl.sendAnEmailMsg('test@gmail.com','test@gmail.com', 'test@gmail.com', 'test@gmail.com', 'test',
                                                 null,null,'body', 'sender', new string[]{cvList[0].ContentDocumentId},null,true);
            
            system.assert([SELECT Id, ParentId, TextBody, Subject, FromName, FromAddress, ToAddress, CcAddress, BccAddress,createddate
                           FROM EmailMessage
                           WHERE Createddate=Today ].size()>0);
        
        Test.stopTest();
        
        
    }
    
}