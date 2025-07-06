// app.js
import express from "express"; // 使用 Express 框架
import dotenv from "dotenv"; // 加载环境变量
import cors from "cors"; // 启用跨域支持
import http from "http"; // 用于创建 HTTP 服务器
// --- 1. 导入你的初始化函数 ---
import { initializeDatabase } from "./init/seed.js";
dotenv.config(); // 加载环境变量
const app = express(); // 创建 Express 实例
const port = process.env.PORT || 3000; // 默认端口
const server = http.createServer(app); // 创建 HTTP 服务器

// 导入路由
import authRouter from "./modle/auth/authRouters.js";
import userRouter from "./modle/user/userRouters.js";
import emailRouter from "./modle/email/verifyRoute.js";
// 在这里添加下面这行
import circleRouter from "./modle/guardian/circleRoute.js"; // 1. 导入守护圈路由
import memberRouter from "./modle/guardian/memberRoute.js"; // 1. 导入成员管理路由
import deviceRouter from "./modle/guardian/deviceRoute.js"; // 1. 导入设备管理路由
import eventRouter from './modle/guardian/eventRoute.js';
import alertRouter from './modle/guardian/alertRoute.js';
import smartHomeDeviceRouter from "./modle/guardian/smartHomeDeviceRoute.js";
import actionRuleRouter from "./modle/guardian/actionRuleRoute.js";
import { specs, swaggerUi } from './config/swagger.js';

// 2. 导入并初始化 WebSocket 服务
import { initWebSocket } from "./config/websockets.js";
initWebSocket(server);
import { startHeartbeats } from "./config/heartbeat.js"; // 启动心跳检测（Redis 与 MySQL）
import { initMqtt } from './modle/guardian/mqttHandler.js'; // 1. 导入 MQTT 初始化函数
// 中间件
app.use(express.json()); // 解析 JSON 请求体
app.use(cors()); // 启用 CORS 中间件

// 路由配置
app.use("/api/auth", authRouter); // 认证相关路由
app.use("/api/user", userRouter); // 用户相关路由
app.use("/api/email", emailRouter); // 邮箱验证相关路由
app.use("/api/guardian/circle", circleRouter); // 2. 使用守护圈路由，并设置基础路径
app.use("/api/guardian/member", memberRouter); // 2. 使用成员管理路由，并设置基础路径
app.use("/api/guardian/device", deviceRouter); // 2. 使用设备管理路由，并设置基础路径

app.use('/api/guardian/events', eventRouter); // 3. 使用事件路由
app.use('/api/guardian/alerts', alertRouter); // 4. 使用告警路由
app.use("/api/guardian", smartHomeDeviceRouter);
app.use("/api/guardian", actionRuleRouter);

// Swagger API 文档
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Guardian API 文档',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true
  }
}));
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
        email: "/api/email"
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
  // 对于业务逻辑中主动抛出的、带有 statusCode 的错误进行特殊处理
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      code: err.statusCode,
      message: err.message,
      data: null,
      error: err.name || 'Error'
    });
  }
  // 对于其他未预料的服务器错误，统一返回 500 错误
  res.status(500).json({
    code: 500,
    message: "服务器内部错误",
    data: null,
    error: null
  });
});

// startHeartbeats(); // 启动心跳检测服务
initMqtt(); // 2. 启动 MQTT 监听

/**
 * @description 启动服务器的主函数
 */
async function startServer() {
  // --- 2. 在启动服务器前，执行数据库初始化 ---
  // 这个函数是幂等的，所以可以安全地每次都调用
  await initializeDatabase();

  startHeartbeats(); // 启动心跳检测服务

  server.listen(port, "0.0.0.0", () => {
    console.log(`服务器已启动，监听端口：http://0.0.0.0:${port}`);
    console.log(`API文档地址: http://0.0.0.0:${port}`);
  });
}

// --- 3. 调用主函数启动服务器 ---
startServer();
