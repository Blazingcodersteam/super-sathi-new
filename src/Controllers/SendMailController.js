"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
exports.sendCallNotificationEmail = sendCallNotificationEmail;
const nodemailer = require("nodemailer");
async function sendMail(toAddress, subject, body) {
    try {
        console.log('Email config:', {
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            user: process.env.EMAIL_USER
        });
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || "587"),
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
        const mailOptions = {
            from: `"Vivaaha Matrimony" <${process.env.EMAIL_FROM}>`,
            to: toAddress,
            subject: subject,
            html: body,
        };
        await transporter.sendMail(mailOptions);
        console.log(`📨 Email sent to ${toAddress}`);
    }
    catch (error) {
        console.error("Email Error:", error);
        throw error;
    }
}
// Send call notification email
async function sendCallNotificationEmail(toAddress, callDetails) {
    const subject = `Incoming ${callDetails.call_type.charAt(0).toUpperCase() + callDetails.call_type.slice(1)} Call - Vivaaha Matrimony`;
    const body = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Incoming Call Notification</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .call-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📞 Incoming ${callDetails.call_type.charAt(0).toUpperCase() + callDetails.call_type.slice(1)} Call</h1>
            </div>
            <div class="content">
                <div class="call-info">
                    <h3>Call Details:</h3>
                    <p><strong>From:</strong> ${callDetails.caller_name}</p>
                    <p><strong>Call Type:</strong> ${callDetails.call_type.charAt(0).toUpperCase() + callDetails.call_type.slice(1)} Call</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <p>You have received an incoming ${callDetails.call_type} call from ${callDetails.caller_name}. Please open your Vivaaha app to accept or decline the call.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <p><strong>Open the Vivaaha app to respond to this call</strong></p>
                </div>
                
                <p><strong>Note:</strong> This call is only available to users in your connections list for your safety and privacy.</p>
            </div>
            <div class="footer">
                <p>This is an automated notification from Vivaaha Matrimony</p>
                <p>If you did not expect this call, please contact our support team</p>
            </div>
        </div>
    </body>
    </html>
  `;
    await sendMail(toAddress, subject, body);
}
//# sourceMappingURL=SendMailController.js.map