// 导入 nodemailer 模块
const nodemailer = require('nodemailer');

// 创建发送邮件的服务函数
async function sendVerificationCode(email) {
    try {
        // 创建一个验证码（6位随机数字）
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 发送邮件
        const info = await transporter.sendMail(mailOptions);
        return { success: true, verificationCode };  // 返回验证码和发送状态
    } catch (error) {
        return { success: false, error };
    }
}

// 导出函数
module.exports = sendVerificationCode;
