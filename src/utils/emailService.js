const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');



class EmailService {
  constructor() {
    this.transporter = null;
    this.emailQueue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
    this.retryDelay = 5000; 
  }

  
  async initialize() {
    try {
      const emailProvider = process.env.EMAIL_PROVIDER || 'smtp';

      let transportConfig;

      switch (emailProvider.toLowerCase()) {
        case 'gmail':
          transportConfig = {
            service: 'gmail',
            auth: {
              user: process.env.GMAIL_USER,
              pass: process.env.GMAIL_APP_PASSWORD 
            }
          };
          break;

        case 'sendgrid':
          transportConfig = {
            host: 'smtp.sendgrid.net',
            port: 587,
            secure: false,
            auth: {
              user: 'apikey',
              pass: process.env.SENDGRID_API_KEY
            }
          };
          break;

        case 'smtp':
        default:
          transportConfig = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true', 
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD
            },
            tls: {
              rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
            }
          };
          break;
      }

      this.transporter = nodemailer.createTransport(transportConfig);

      
      await this.transporter.verify();
      console.log('Email service initialized successfully');
      return true;
    } catch (error) {
      console.error('Email service initialization failed:', error.message);
      
      return false;
    }
  }

  
  async getTransporter() {
    if (!this.transporter) {
      await this.initialize();
    }
    return this.transporter;
  }

  
  async loadTemplate(templateName) {
    try {
      const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
      const template = await fs.readFile(templatePath, 'utf-8');
      return template;
    } catch (error) {
      console.error(`Failed to load email template: ${templateName}`, error);
      throw new Error(`Email template not found: ${templateName}`);
    }
  }

  
  replacePlaceholders(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value || '');
    }
    return result;
  }

  
  async sendEmail(mailOptions, retries = 0) {
    try {
      const transporter = await this.getTransporter();

      if (!transporter) {
        throw new Error('Email service is not available');
      }

      
      if (!mailOptions.from) {
        mailOptions.from = process.env.EMAIL_FROM || process.env.SMTP_USER;
      }

      const info = await transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      console.error('Email send error:', error);

      
      if (retries < this.maxRetries) {
        console.log(`Retrying email send (${retries + 1}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.sendEmail(mailOptions, retries + 1);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  
  addToQueue(mailOptions) {
    this.emailQueue.push(mailOptions);
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  
  async processQueue() {
    if (this.emailQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    while (this.emailQueue.length > 0) {
      const mailOptions = this.emailQueue.shift();
      await this.sendEmail(mailOptions);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.isProcessing = false;
  }

  
  async sendInvoiceEmail(invoice, recipientEmail, pdfBuffer) {
    try {
      const template = await this.loadTemplate('invoice');

      const templateData = {
        customerName: invoice.customerName || 'Valued Customer',
        invoiceNumber: invoice.invoiceNumber || invoice._id,
        invoiceDate: invoice.date ? new Date(invoice.date).toLocaleDateString() : new Date().toLocaleDateString(),
        totalAmount: invoice.totalAmount ? `$${invoice.totalAmount.toFixed(2)}` : '$0.00',
        currency: invoice.currency || 'USD',
        companyName: process.env.COMPANY_NAME || 'Inventory Management System',
        companyEmail: process.env.COMPANY_EMAIL || process.env.EMAIL_FROM,
        companyPhone: process.env.COMPANY_PHONE || '',
        year: new Date().getFullYear()
      };

      const htmlContent = this.replacePlaceholders(template, templateData);

      const mailOptions = {
        to: recipientEmail,
        subject: `Invoice #${templateData.invoiceNumber} from ${templateData.companyName}`,
        html: htmlContent,
        attachments: [
          {
            filename: `invoice-${templateData.invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Error sending invoice email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  
  async sendLowStockAlert(items, recipientEmail) {
    try {
      const template = await this.loadTemplate('lowStock');

      
      const itemRows = items.map(item => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.itemName || 'N/A'}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.skuCode || 'N/A'}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.category || 'N/A'}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity?.current || 0}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity?.minimum || 0}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.supplier?.name || 'N/A'}</td>
        </tr>
      `).join('');

      const templateData = {
        itemCount: items.length,
        itemsTable: itemRows,
        alertDate: new Date().toLocaleDateString(),
        alertTime: new Date().toLocaleTimeString(),
        companyName: process.env.COMPANY_NAME || 'Inventory Management System',
        dashboardUrl: process.env.CLIENT_URL || 'http://localhost:3000',
        year: new Date().getFullYear()
      };

      const htmlContent = this.replacePlaceholders(template, templateData);

      const mailOptions = {
        to: recipientEmail,
        subject: `⚠️ Low Stock Alert - ${items.length} Items Need Attention`,
        html: htmlContent,
        priority: 'high'
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Error sending low stock alert:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  
  async sendWelcomeEmail(user, temporaryPassword) {
    try {
      const template = await this.loadTemplate('welcome');

      const templateData = {
        fullName: user.fullName || user.username,
        username: user.username,
        email: user.email,
        temporaryPassword: temporaryPassword,
        role: user.role || 'employee',
        loginUrl: `${process.env.CLIENT_URL}/login` || 'http://localhost:3000/login',
        companyName: process.env.COMPANY_NAME || 'Inventory Management System',
        supportEmail: process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM,
        year: new Date().getFullYear()
      };

      const htmlContent = this.replacePlaceholders(template, templateData);

      const mailOptions = {
        to: user.email,
        subject: `Welcome to ${templateData.companyName}`,
        html: htmlContent
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  
  async sendPasswordResetEmail(user, newPassword) {
    try {
      const template = await this.loadTemplate('passwordReset');

      const templateData = {
        fullName: user.fullName || user.username,
        username: user.username,
        newPassword: newPassword,
        loginUrl: `${process.env.CLIENT_URL}/login` || 'http://localhost:3000/login',
        resetDate: new Date().toLocaleString(),
        companyName: process.env.COMPANY_NAME || 'Inventory Management System',
        supportEmail: process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM,
        year: new Date().getFullYear()
      };

      const htmlContent = this.replacePlaceholders(template, templateData);

      const mailOptions = {
        to: user.email,
        subject: `Password Reset - ${templateData.companyName}`,
        html: htmlContent,
        priority: 'high'
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  
  async sendCustomEmail(to, subject, htmlContent, attachments = []) {
    try {
      const mailOptions = {
        to,
        subject,
        html: htmlContent,
        attachments
      };

      return await this.sendEmail(mailOptions);
    } catch (error) {
      console.error('Error sending custom email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  
  async testConnection() {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) {
        return {
          success: false,
          message: 'Email service is not configured'
        };
      }

      await transporter.verify();
      return {
        success: true,
        message: 'Email service is working correctly'
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}


const emailService = new EmailService();
module.exports = emailService;
