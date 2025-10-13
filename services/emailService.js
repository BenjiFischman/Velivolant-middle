const logger = require('../logger/winstonConfig');

/**
 * Email Service
 * 
 * This is a placeholder/mock service for email functionality.
 * In production, integrate with:
 * - SendGrid
 * - AWS SES
 * - Mailgun
 * - Postmark
 * - etc.
 * 
 * For now, it logs emails to console/logger for development
 */

class EmailService {
  constructor() {
    this.from = process.env.EMAIL_FROM || 'noreply@velivolant.com';
    this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    
    // Check if we're in production and should use real email service
    this.useRealEmail = process.env.NODE_ENV === 'production' && process.env.EMAIL_SERVICE_ENABLED === 'true';
    
    if (this.useRealEmail) {
      this.initializeEmailProvider();
    }
  }

  /**
   * Initialize real email provider (e.g., SendGrid, SES)
   */
  initializeEmailProvider() {
    // Example for SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // this.emailProvider = sgMail;
    
    logger.info('Email provider initialized', { 
      provider: process.env.EMAIL_PROVIDER || 'none' 
    });
  }

  /**
   * Send email (generic method)
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      const emailData = {
        from: this.from,
        to,
        subject,
        html,
        text: text || this.stripHtml(html)
      };

      if (this.useRealEmail && this.emailProvider) {
        // Send via real email provider
        await this.emailProvider.send(emailData);
        logger.info('Email sent', { to, subject });
      } else {
        // Development mode: log to console
        logger.info('📧 Email (Development Mode)', {
          ...emailData,
          note: 'This email was not actually sent. Configure EMAIL_SERVICE_ENABLED=true and email provider for production.'
        });
        
        // In development, also log a pretty version
        if (process.env.NODE_ENV !== 'production') {
          console.log('\n' + '='.repeat(80));
          console.log('📧 EMAIL PREVIEW');
          console.log('='.repeat(80));
          console.log(`To: ${to}`);
          console.log(`From: ${this.from}`);
          console.log(`Subject: ${subject}`);
          console.log('-'.repeat(80));
          console.log(text || this.stripHtml(html));
          console.log('='.repeat(80) + '\n');
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Email send error:', error);
      throw error;
    }
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(email, username, verificationToken) {
    const verificationUrl = `${this.frontendUrl}/verify-email?token=${verificationToken}`;
    
    const subject = 'Verify Your Email - Velivolant';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background: #4F46E5; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Velivolant!</h1>
          </div>
          <div class="content">
            <h2>Hi ${username}!</h2>
            <p>Thanks for signing up. Please verify your email address to get started.</p>
            <p>
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Velivolant. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, username, resetToken) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;
    
    const subject = 'Reset Your Password - Velivolant';
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #DC2626; color: white; padding: 20px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background: #DC2626; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Hi ${username}!</h2>
            <p>We received a request to reset your password.</p>
            <p>
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p><strong>If you didn't request a password reset, please ignore this email or contact support if you have concerns.</strong></p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Velivolant. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html
    });
  }

  /**
   * Send newsletter
   */
  async sendNewsletter(email, username, newsletter) {
    const subject = newsletter.title;
    const viewUrl = `${this.frontendUrl}/content/${newsletter.slug}`;
    const unsubscribeUrl = `${this.frontendUrl}/unsubscribe`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Georgia, serif; line-height: 1.8; color: #333; }
          .container { max-width: 650px; margin: 0 auto; padding: 20px; }
          .header { border-bottom: 3px solid #4F46E5; padding-bottom: 20px; margin-bottom: 30px; }
          .content { margin: 30px 0; }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background: #4F46E5; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer { 
            border-top: 1px solid #ddd; 
            margin-top: 40px; 
            padding-top: 20px; 
            text-align: center; 
            color: #666; 
            font-size: 12px; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${newsletter.title}</h1>
            ${newsletter.subtitle ? `<p style="font-size: 18px; color: #666;">${newsletter.subtitle}</p>` : ''}
          </div>
          <div class="content">
            ${newsletter.excerpt || newsletter.body.substring(0, 500) + '...'}
          </div>
          <p>
            <a href="${viewUrl}" class="button">Read Full Article</a>
          </p>
          <div class="footer">
            <p>You're receiving this because you subscribed to Velivolant newsletters.</p>
            <p><a href="${unsubscribeUrl}" style="color: #666;">Unsubscribe</a></p>
            <p>© ${new Date().getFullYear()} Velivolant. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html
    });
  }

  /**
   * Send welcome email to new premium subscriber
   */
  async sendWelcomePremiumEmail(email, username, subscriptionTier) {
    const subject = `Welcome to ${subscriptionTier} - Velivolant`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .button { 
            display: inline-block; 
            padding: 12px 30px; 
            background: #667eea; 
            color: white; 
            text-decoration: none; 
            border-radius: 5px;
            margin: 20px 0;
          }
          .feature { padding: 15px; background: white; margin: 10px 0; border-radius: 5px; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Welcome to ${subscriptionTier}!</h1>
          </div>
          <div class="content">
            <h2>Hi ${username}!</h2>
            <p>Thank you for upgrading to ${subscriptionTier}. You now have access to premium content and exclusive features!</p>
            
            <div class="feature">
              <h3>✨ What's Included:</h3>
              <ul>
                <li>Unlimited access to premium articles and newsletters</li>
                <li>Ad-free experience</li>
                <li>Early access to new features</li>
                <li>Exclusive community events</li>
              </ul>
            </div>

            <p>
              <a href="${this.frontendUrl}/premium" class="button">Explore Premium Content</a>
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Velivolant. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject,
      html
    });
  }

  /**
   * Strip HTML tags for plain text version
   */
  stripHtml(html) {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gs, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Singleton instance
const emailService = new EmailService();

module.exports = emailService;

