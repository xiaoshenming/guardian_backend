// app.js
const express = require("express"); // 使用 Express 框架
require("dotenv").config(); // 加载环境变量
const cors = require("cors"); // 启用跨域支持
const app = express(); // 创建 Express 实例
const port = process.env.PORT || 3000; // 默认端口
const http = require("http"); // 用于创建 HTTP 服务器
const server = http.createServer(app); // 创建 HTTP 服务器

// 导入路由
const authRouter = require("./modle/auth/authRouters");
const userRouter = require("./modle/user/userRouters");
const emailRouter = require("./modle/email/verifyRoute");
const circleRouter = require("./modle/circle/circleRouters");
const deviceRouter = require("./modle/device/deviceRouters");
const eventRouter = require("./modle/event/eventRouters");
const dashboardRouter = require("./modle/dashboard/dashboardRouters");
const analyticsRouter = require("./modle/analytics/analyticsRouters");
const adminRouter = require("./modle/admin/adminRouters");

// 导入服务
const mqttService = require("./modle/mqtt/mqttService");
const socketService = require("./modle/socket/socketService");

// 初始化Socket.IO服务
socketService.initialize(server);

const { startHeartbeats } = require("./config/heartbeat"); // 启动心跳检测（Redis 与 MySQL）

// 中间件
app.use(express.json()); // 解析 JSON 请求体
app.use(cors()); // 启用 CORS 中间件

// 路由配置
app.use("/api/auth", authRouter); // 认证相关路由
app.use("/api/user", userRouter); // 用户相关路由
app.use("/api/email", emailRouter); // 邮箱验证相关路由
app.use("/api/circle", circleRouter); // 守护圈相关路由
app.use("/api/device", deviceRouter); // 设备相关路由
app.use("/api/event", eventRouter); // 事件相关路由
app.use("/api/events", eventRouter); // 事件相关路由（兼容前端调用）
app.use("/api/dashboard", dashboardRouter); // 仪表板相关路由
app.use("/api/analytics", analyticsRouter); // 分析统计相关路由
app.use("/api/admin", adminRouter); // 管理员相关路由

// 根路径响应
app.get("/", (req, res) => {
  res.json({
    code: 200,
    message: "Guardian Backend API 服务正在运行",
    data: {
      version: "1.0.0",
      endpoints: {
        auth: "/api/auth",
        user: "/api/user",
        email: "/api/email",
        circle: "/api/circle",
        device: "/api/device",
        event: "/api/event",
        dashboard: "/api/dashboard",
        analytics: "/api/analytics",
        admin: "/api/admin"
      },
      services: {
        mqtt: mqttService.getStatus(),
        socket: socketService.getStatus()
      }
    },
    error: null
  });
});

// 404 处理
app.use("*", (req, res) => {
  res.status(404).json({
    code: 404,
    message: "接口不存在",
    data: null,
    error: null
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error("全局错误:", err);
  res.status(500).json({
    code: 500,
    message: "服务器内部错误",
    data: null,
    error: null
  });
});

// 启动服务
startHeartbeats(); // 启动心跳检测服务

// 初始化MQTT服务
mqttService.initialize().catch(error => {
  console.error('MQTT服务启动失败:', error);
});

server.listen(port, "0.0.0.0", () => {
    console.log(`服务器已启动，监听端口：http://0.0.0.0:${port}`);
    console.log(`API文档地址: http://0.0.0.0:${port}`);
    console.log('Guardian智能守护系统后端服务已就绪');
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到SIGTERM信号，正在优雅关闭服务...');
  await mqttService.close();
  socketService.close();
  server.close(() => {
    console.log('服务已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('收到SIGINT信号，正在优雅关闭服务...');
  await mqttService.close();
  socketService.close();
  server.close(() => {
    console.log('服务已关闭');
    process.exit(0);
  });
});