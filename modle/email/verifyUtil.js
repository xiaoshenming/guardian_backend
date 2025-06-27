// 导入 nodemailer 模块
const nodemailer = require('nodemailer');
require('dotenv').config();

// 创建邮件传输器
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.example.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER || 'user@example.com',
        pass: process.env.EMAIL_PASS || 'password'
    }
});

// 创建发送邮件的服务函数
async function sendVerificationCode(email, type = 1) {
    try {
        // 创建一个验证码（6位随机数字）
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 根据类型确定邮件主题
        const subject = type === 1 ? '注册验证码' : '重置密码验证码';
        
        // 设置邮件选项
        const mailOptions = {
            from: `"Guardian 安全系统" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
                    <h2 style="color: #333;">Guardian 安全系统</h2>
                    <p style="font-size: 16px; color: #555;">您好，</p>
                    <p style="font-size: 16px; color: #555;">您的验证码是：</p>
                    <div style="background-color: #f5f5f5; padding: 10px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
                        ${verificationCode}
                    </div>
                    <p style="font-size: 14px; color: #777;">验证码有效期为10分钟，请勿将验证码泄露给他人。</p>
                    <p style="font-size: 14px; color: #777;">如果您没有请求此验证码，请忽略此邮件。</p>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999;">
                        此邮件由系统自动发送，请勿回复。
                    </div>
                </div>
            `
        };

        // 发送邮件
        // 注释掉实际发送，仅返回验证码用于测试
        // const info = await transporter.sendMail(mailOptions);
        console.log(`模拟发送验证码到 ${email}: ${verificationCode}`);
        
        return { success: true, verificationCode };  // 返回验证码和发送状态
    } catch (error) {
        console.error('发送邮件错误:', error);
        return { success: false, error };
    }
}

// 导出函数
module.exports = sendVerificationCode;
