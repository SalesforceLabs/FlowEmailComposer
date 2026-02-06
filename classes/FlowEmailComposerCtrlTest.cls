@isTest(seeAllData=false)
public class FlowEmailComposerCtrlTest {
    
    /**
     * @TestSetup only creates SETUP objects (EmailTemplate)
     * This avoids MIXED_DML_OPERATION errors when combined with non-setup objects
     */
    @TestSetup
    static void setupEmailTemplates(){
        // Create standard Text EmailTemplate
        EmailTemplate textTemplate = new EmailTemplate(
            DeveloperName = 'test_text_template',
            FolderId = UserInfo.getUserId(),
            TemplateType = 'text',
            Name = 'Test Text Template',
            Subject = 'Test Text Subject',
            Body = 'Hello, this is a test text body.'
        );
        insert textTemplate;

        // Create HTML EmailTemplate (using 'text' type to avoid BrandTemplate/Letterhead requirement in tests)
        EmailTemplate htmlTemplate = new EmailTemplate(
            DeveloperName = 'test_html_template',
            FolderId = UserInfo.getUserId(),
            TemplateType = 'text', 
            Name = 'Test HTML Template',
            Subject = 'Test HTML Subject',
            Body = '<html><body><h1>Hello</h1><p>This is a test HTML body.</p></body></html>'
        );
        insert htmlTemplate;
    }

    /**
     * Helper method to create non-setup objects (Account, Contact, ContentVersion)
     * Call this inside test methods AFTER Test.startTest() to ensure separate transaction context
     */
    static void createTestData() {
        // Create Account for WhatId
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        // Create Contact for WhoId
        Contact con = new Contact(
            FirstName = 'Test',
            LastName = 'Contact',
            Email = 'test@example.com',
            AccountId = acc.Id
        );
        insert con;

        // Create ContentVersion for attachments
        ContentVersion cv = new ContentVersion(
            Title = 'Test File',
            PathOnClient = 'test.pdf',
            VersionData = Blob.valueOf('Test Content'),
            IsMajorVersion = true
        );
        insert cv;
    }

    /* --- getEmailTemplates Tests --- */

    @isTest
    static void testGetEmailTemplates_Basic() {
        Test.startTest();
        List<EmailTemplate> results = FlowEmailComposerCtrl.getEmailTemplates(null, 0);
        Test.stopTest();
        
        System.assert(results.size() >= 2, 'Should return at least the 2 templates created in setup');
    }

    @isTest
    static void testGetEmailTemplates_WithFilter() {
        Test.startTest();
        String condition = 'DeveloperName = \'test_text_template\'';
        List<EmailTemplate> results = FlowEmailComposerCtrl.getEmailTemplates(condition, 0);
        Test.stopTest();
        
        System.assertEquals(1, results.size(), 'Should return exactly 1 filtered template');
        System.assertEquals('test_text_template', results[0].DeveloperName);
    }

    @isTest
    static void testGetEmailTemplates_WithLimit() {
        Test.startTest();
        List<EmailTemplate> results = FlowEmailComposerCtrl.getEmailTemplates(null, 1);
        Test.stopTest();
        
        System.assertEquals(1, results.size(), 'Should respect the maxLimit of 1');
    }

    /* --- getTemplateDetails Tests --- */

    @isTest
    static void testGetTemplateDetails_Basic() {
        EmailTemplate et = [SELECT Id FROM EmailTemplate WHERE DeveloperName = 'test_text_template' LIMIT 1];
        
        Test.startTest();
        FlowEmailComposerCtrl.EmailMsg result = FlowEmailComposerCtrl.getTemplateDetails(et.Id, null, null);
        Test.stopTest();
        
        System.assertNotEquals(null, result);
        System.assertEquals('Test Text Subject', result.subject);
        System.assert(result.body.contains('test text body'));
    }

    @isTest
    static void testGetTemplateDetails_WithMergedFields() {
        EmailTemplate et = [SELECT Id FROM EmailTemplate WHERE DeveloperName = 'test_text_template' LIMIT 1];
        
        Test.startTest();
        createTestData();
        Contact con = [SELECT Id FROM Contact LIMIT 1];
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        FlowEmailComposerCtrl.EmailMsg result = FlowEmailComposerCtrl.getTemplateDetails(et.Id, con.Id, acc.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result);
    }

    /* --- sendAnEmailMsg Tests --- */

    @isTest
    static void testSendEmail_WithActivityLogging() {
        Test.startTest();
        createTestData();
        Contact con = [SELECT Id FROM Contact LIMIT 1];
        Account acc = [SELECT Id FROM Account LIMIT 1];
        ContentVersion cv = [SELECT ContentDocumentId FROM ContentVersion LIMIT 1];
        
        FlowEmailComposerCtrl.sendAnEmailMsg(
            'sender@example.com',
            'to@example.com',
            'cc@example.com',
            'bcc@example.com',
            'Final Test Subject',
            con.Id,
            acc.Id,
            '<p>Test Body Content</p>',
            'Sender Name',
            new List<String>{cv.ContentDocumentId},
            null,
            true // createActivity = true
        );
        Test.stopTest();

        // Verify Task creation
        Task t = [SELECT Id, Subject, TaskSubtype, WhatId, WhoId FROM Task WHERE Subject = 'Final Test Subject' LIMIT 1];
        System.assertEquals('Email', t.TaskSubtype);
        System.assertEquals(acc.Id, t.WhatId);
        System.assertEquals(con.Id, t.WhoId);

        // Verify EmailMessage creation
        EmailMessage em = [SELECT Id, Subject, ToAddress, Incoming, ActivityId FROM EmailMessage WHERE Subject = 'Final Test Subject' LIMIT 1];
        System.assertEquals(false, em.Incoming);
        System.assert(em.ToAddress.contains('to@example.com'), 'ToAddress should contain the specified email');
        System.assertEquals(t.Id, em.ActivityId, 'EmailMessage should be linked to the Task');
    }

    @isTest
    static void testSendEmail_NoActivityLogging() {
        Test.startTest();
        createTestData();
        
        FlowEmailComposerCtrl.sendAnEmailMsg(
            null,
            'to@example.com',
            null,
            null,
            'No Activity Subject',
            null,
            null,
            'Body',
            null,
            null,
            null,
            false // createActivity = false
        );
        Test.stopTest();

        // Should NOT have our custom Task
        List<Task> tasks = [SELECT Id FROM Task WHERE Subject = 'No Activity Subject'];
        System.assertEquals(0, tasks.size(), 'Should not create a custom Task when createActivity is false');
    }

    @isTest
    static void testSendEmail_WithAttachmentIds() {
        Test.startTest();
        createTestData();
        Account acc = [SELECT Id FROM Account LIMIT 1];
        Contact con = [SELECT Id FROM Contact LIMIT 1];
        
        // Create standard Attachment
        Attachment att = new Attachment(
            Name = 'Old School Attachment.txt',
            Body = Blob.valueOf('Attachment data'),
            ParentId = acc.Id
        );
        insert att;

        FlowEmailComposerCtrl.sendAnEmailMsg(
            'sender@example.com',
            'to@example.com',
            null,
            null,
            'Attachment Test',
            con.Id,
            acc.Id,
            'Body',
            null,
            null,
            new List<String>{att.Id},
            true
        );
        Test.stopTest();

        System.assertEquals(1, [SELECT count() FROM Task WHERE Subject = 'Attachment Test']);
    }

    @isTest
    static void testSendEmail_ExceptionHandling() {
        Test.startTest();
        try {
            // Trigger exception by passing empty required fields
            FlowEmailComposerCtrl.sendAnEmailMsg(null, '', null, null, null, null, null, null, null, null, null, true);
            System.assert(false, 'Should have thrown an exception');
        } catch (AuraHandledException e) {
            // Some orgs/tests might return the message differently, check for the core text
            System.assert(e.getMessage().contains('To Address is required') || e.getMessage().contains('Script-thrown exception'), 'Exception message should be handled');
        }
        Test.stopTest();
    }

    /**
     * Test case using seeAllData=true in a separate class is usually better,
     * but here we just test that the controller handles missing OrgWideEmailAddress gracefully.
     */
    @isTest
    static void testSendEmail_InvalidFromAddress() {
        Test.startTest();
        createTestData();
        Contact con = [SELECT Id FROM Contact LIMIT 1];
        Account acc = [SELECT Id FROM Account LIMIT 1];

        // This address likely won't exist as an OWEA in the test context
        FlowEmailComposerCtrl.sendAnEmailMsg(
            'random-non-existent@owea.com',
            'to@example.com',
            null,
            null,
            'OWEA Test',
            con.Id,
            acc.Id,
            'Body',
            null,
            null,
            null,
            true
        );
        Test.stopTest();

        System.assertEquals(1, [SELECT count() FROM EmailMessage WHERE Subject = 'OWEA Test']);
    }
}
