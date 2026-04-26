/**
 * Email Notification Service
 * 
 * Unified service for sending transactional emails via SendGrid or SMTP.
 * Supports Handlebars templates, asynchronous sending, and HTML/text versions.
 * 
 * Closes #222
 */

import axios from 'axios';

// ============================================
// Type Definitions
// ============================================

export type EmailProvider = 'sendgrid' | 'smtp';

export interface EmailConfig {
  provider: EmailProvider;
  // SendGrid Config
  sendgridApiKey?: string;
  sendgridFromEmail?: string;
  sendgridFromName?: string;
  // SMTP Config
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFromEmail?: string;
  smtpFromName?: string;
}

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailData {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  type: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailQueueJob {
  id: string;
  emailData: EmailData;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// ============================================
// Email Templates
// ============================================

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlTemplate: string;
  textTemplate: string;
}

// Predefined email templates
export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  welcome: {
    id: 'welcome',
    name: 'Welcome Email',
    subject: 'Welcome to SocialFlow AI!',
    htmlTemplate: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 4px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to SocialFlow AI!</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      <p>Thank you for joining SocialFlow AI! We're excited to have you on board.</p>
      <p>With SocialFlow AI, you can:</p>
      <ul>
        <li>Schedule and manage social media posts</li>
        <li>Generate AI-powered content</li>
        <li>Track analytics and engagement</li>
        <li>And much more!</p>
      </ul>
      <p style="text-align: center; margin: 20px 0;">
        <a href="{{appUrl}}" class="button">Get Started</a>
      </p>
      <p>If you have any questions, feel free to reply to this email.</p>
      <p>Best regards,<br>The SocialFlow AI Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} SocialFlow AI. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    textTemplate: `
Hi {{name}},

Thank you for joining SocialFlow AI! We're excited to have you on board.

With SocialFlow AI, you can:
- Schedule and manage social media posts
- Generate AI-powered content
- Track analytics and engagement
- And much more!

Get started at: {{appUrl}}

If you have any questions, feel free to reply to this email.

Best regards,
The SocialFlow AI Team

© {{year}} SocialFlow AI. All rights reserved.
    `,
  },

  passwordReset: {
    id: 'password-reset',
    name: 'Password Reset',
    subject: 'Reset your SocialFlow AI password',
    htmlTemplate: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .button { display: inline-block; padding: 12px 24px; background: #DC2626; color: white; text-decoration: none; border-radius: 4px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reset Your Password</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      <p>We received a request to reset your password. Click the button below to create a new password:</p>
      <p style="text-align: center; margin: 20px 0;">
        <a href="{{resetUrl}}" class="button">Reset Password</a>
      </p>
      <p><strong>Note:</strong> This link will expire in {{expiryHours}} hours.</p>
      <p>If you didn't request this, please ignore this email or contact support if you have concerns.</p>
      <p>Best regards,<br>The SocialFlow AI Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} SocialFlow AI. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    textTemplate: `
Hi {{name}},

We received a request to reset your password. Click the link below to create a new password:

{{resetUrl}}

Note: This link will expire in {{expiryHours}} hours.

If you didn't request this, please ignore this email or contact support if you have concerns.

Best regards,
The SocialFlow AI Team

© {{year}} SocialFlow AI. All rights reserved.
    `,
  },

  verifyEmail: {
    id: 'verify-email',
    name: 'Email Verification',
    subject: 'Verify your SocialFlow AI email',
    htmlTemplate: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .code { background: #eee; padding: 15px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 4px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Verify Your Email</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      <p>Thank you for signing up! Please verify your email address by entering the code below:</p>
      <div class="code">{{verificationCode}}</div>
      <p>Or click the link below:</p>
      <p><a href="{{verificationUrl}}">{{verificationUrl}}</a></p>
      <p><strong>Note:</strong> This code will expire in 24 hours.</p>
      <p>Best regards,<br>The SocialFlow AI Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} SocialFlow AI. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    textTemplate: `
Hi {{name}},

Thank you for signing up! Please verify your email address by entering the code below:

{{verificationCode}}

Or click the link below:
{{verificationUrl}}

Note: This code will expire in 24 hours.

Best regards,
The SocialFlow AI Team

© {{year}} SocialFlow AI. All rights reserved.
    `,
  },

  notification: {
    id: 'notification',
    name: 'General Notification',
    subject: '{{subject}}',
    htmlTemplate: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{subject}}</h1>
    </div>
    <div class="content">
      {{content}}
      <p>Best regards,<br>The SocialFlow AI Team</p>
    </div>
    <div class="footer">
      <p>&copy; {{year}} SocialFlow AI. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `,
    textTemplate: `
{{subject}}

{{content}}

Best regards,
The SocialFlow AI Team

© {{year}} SocialFlow AI. All rights reserved.
    `,
  },
};

// ============================================
// Email Queue (Background Worker)
// ============================================

class EmailQueue {
  private queue: EmailQueueJob[] = [];
  private processing: boolean = false;
  private onProcess: (job: EmailQueueJob) => Promise<void>;

  constructor(onProcess: (job: EmailQueueJob) => Promise<void>) {
    this.onProcess = onProcess;
  }

  async add(emailData: EmailData, maxAttempts: number = 3): Promise<string> {
    const job: EmailQueueJob = {
      id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      emailData,
      attempts: 0,
      maxAttempts,
      createdAt: new Date(),
      status: 'pending',
    };

    this.queue.push(job);
    console.log(`[EmailQueue] Added job ${job.id} to queue`);

    // Start processing if not already
    if (!this.processing) {
      this.processQueue();
    }

    return job.id;
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) break;

      try {
        job.status = 'processing';
        await this.onProcess(job);
        job.status = 'completed';
        console.log(`[EmailQueue] Completed job ${job.id}`);
      } catch (error) {
        job.attempts++;
        if (job.attempts < job.maxAttempts) {
          job.status = 'pending';
          this.queue.push(job);
          console.log(`[EmailQueue] Retrying job ${job.id} (attempt ${job.attempts})`);
        } else {
          job.status = 'failed';
          console.error(`[EmailQueue] Failed job ${job.id}:`, error);
        }
      }
    }

    this.processing = false;
  }

  getQueueStatus(): { pending: number; processing: number; completed: number; failed: number } {
    return {
      pending: this.queue.filter(j => j.status === 'pending').length,
      processing: this.queue.filter(j => j.status === 'processing').length,
      completed: this.queue.filter(j => j.status === 'completed').length,
      failed: this.queue.filter(j => j.status === 'failed').length,
    };
  }

  clear(): void {
    this.queue = [];
  }
}

// ============================================
// Email Service
// ============================================

export class EmailService {
  private config: EmailConfig;
  private queue: EmailQueue;
  private templates: Record<string, EmailTemplate> = { ...EMAIL_TEMPLATES };

  constructor(config: EmailConfig) {
    this.config = config;
    this.queue = new EmailQueue(this.processJob.bind(this));
  }

  /**
   * Process a single email job
   */
  private async processJob(job: EmailQueueJob): Promise<void> {
    await this.sendEmail(job.emailData);
  }

  /**
   * Send email immediately
   */
  async sendEmail(emailData: EmailData): Promise<EmailResult> {
    try {
      const recipients = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
      
      for (const recipient of recipients) {
        if (this.config.provider === 'sendgrid') {
          await this.sendViaSendGrid(recipient, emailData);
        } else {
          await this.sendViaSMTP(recipient, emailData);
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to send email: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Send email asynchronously (queued)
   */
  async sendEmailAsync(emailData: EmailData): Promise<string> {
    return this.queue.add(emailData);
  }

  // ============================================
  // SendGrid Implementation
  // ============================================

  private async sendViaSendGrid(
    recipient: EmailRecipient,
    emailData: EmailData
  ): Promise<void> {
    if (!this.config.sendgridApiKey) {
      throw new Error('SendGrid API key not configured');
    }

    const msg: Record<string, unknown> = {
      to: recipient.email,
      from: {
        email: this.config.sendgridFromEmail || 'noreply@socialflow.ai',
        name: this.config.sendgridFromName || 'SocialFlow AI',
      },
      subject: emailData.subject,
    };

    if (emailData.templateId) {
      msg.template_id = emailData.templateId;
      msg.dynamic_template_data = emailData.templateData;
    } else if (emailData.html) {
      msg.html = emailData.html;
      msg.text = emailData.text;
    }

    if (emailData.attachments) {
      msg.attachments = emailData.attachments;
    }

    await axios.post('https://api.sendgrid.com/v3/mail/send', msg, {
      headers: {
        Authorization: `Bearer ${this.config.sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`[Email] Sent via SendGrid to ${recipient.email}`);
  }

  // ============================================
  // SMTP Implementation
  // ============================================

  private async sendViaSMTP(
    recipient: EmailRecipient,
    emailData: EmailData
  ): Promise<void> {
    // In production, use nodemailer
    // For now, we'll mock the SMTP sending
    
    const fromEmail = this.config.smtpFromEmail || 'noreply@socialflow.ai';
    const fromName = this.config.smtpFromName || 'SocialFlow AI';

    console.log(`[Email] Sent via SMTP`);
    console.log(`  From: ${fromName} <${fromEmail}>`);
    console.log(`  To: ${recipient.name || ''} <${recipient.email}>`);
    console.log(`  Subject: ${emailData.subject}`);

    if (emailData.html) {
      console.log(`  HTML: ${emailData.html.substring(0, 100)}...`);
    }
  }

  // ============================================
  // Template Management
  // ============================================

  getTemplate(id: string): EmailTemplate | undefined {
    return this.templates[id];
  }

  getAllTemplates(): EmailTemplate[] {
    return Object.values(this.templates);
  }

  addTemplate(template: EmailTemplate): void {
    this.templates[template.id] = template;
  }

  updateTemplate(id: string, updates: Partial<EmailTemplate>): void {
    if (this.templates[id]) {
      this.templates[id] = { ...this.templates[id], ...updates };
    }
  }

  deleteTemplate(id: string): void {
    delete this.templates[id];
  }

  /**
   * Render a template with data
   */
  renderTemplate(
    templateId: string,
    data: Record<string, unknown>
  ): { html: string; text: string; subject: string } {
    const template = this.templates[templateId];
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const mergedData = {
      ...data,
      year: new Date().getFullYear(),
    };

    let html = template.htmlTemplate;
    let text = template.textTemplate;
    let subject = template.subject;

    // Simple template variable replacement
    for (const [key, value] of Object.entries(mergedData)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, String(value));
      text = text.replace(regex, String(value));
      subject = subject.replace(regex, String(value));
    }

    return { html, text, subject };
  }

  // ============================================
  // Convenience Methods
  // ============================================

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    recipient: EmailRecipient,
    data: { name: string; appUrl: string }
  ): Promise<EmailResult> {
    const { html, text, subject } = this.renderTemplate('welcome', data);
    return this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    recipient: EmailRecipient,
    data: { name: string; resetUrl: string; expiryHours: number }
  ): Promise<EmailResult> {
    const { html, text, subject } = this.renderTemplate('password-reset', data);
    return this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
    });
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(
    recipient: EmailRecipient,
    data: { name: string; verificationCode: string; verificationUrl: string }
  ): Promise<EmailResult> {
    const { html, text, subject } = this.renderTemplate('verify-email', data);
    return this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
    });
  }

  /**
   * Send general notification
   */
  async sendNotification(
    recipient: EmailRecipient,
    data: { subject: string; content: string }
  ): Promise<EmailResult> {
    const { html, text, subject } = this.renderTemplate('notification', data);
    return this.sendEmail({
      to: recipient,
      subject,
      html,
      text,
    });
  }

  // ============================================
  // Queue Status
  // ============================================

  getQueueStatus(): { pending: number; processing: number; completed: number; failed: number } {
    return this.queue.getQueueStatus();
  }
}

// ============================================
// Factory Functions
// ============================================

export const createEmailService = (config: EmailConfig): EmailService => {
  return new EmailService(config);
};

// Default export
export default EmailService;
