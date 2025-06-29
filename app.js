// app.js
import express from "express"; // 使用 Express 框架
import dotenv from "dotenv"; // 加载环境变量
import cors from "cors"; // 启用跨域支持
import http from "http"; // 用于创建 HTTP 服务器

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
// 2. 导入并初始化 WebSocket 服务
// import { initWebSocket } from "./config/websockets.js";
// initWebSocket(server);
import { startHeartbeats } from "./config/heartbeat.js"; // 启动心跳检测（Redis 与 MySQL）

// 中间件
app.use(express.json()); // 解析 JSON 请求体
app.use(cors()); // 启用 CORS 中间件

// 路由配置
app.use("/api/auth", authRouter); // 认证相关路由
app.use("/api/user", userRouter); // 用户相关路由
app.use("/api/email", emailRouter); // 邮箱验证相关路由
app.use("/api/guardian/circle", circleRouter); // 2. 使用守护圈路由，并设置基础路径
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
  res.status(500).json({
    code: 500,
    message: "服务器内部错误",
    data: null,
    error: null
  });
});

startHeartbeats(); // 启动心跳检测服务

server.listen(port, "0.0.0.0", () => {
    console.log(`服务器已启动，监听端口：http://0.0.0.0:${port}`);
    console.log(`API文档地址: http://0.0.0.0:${port}`);
});
