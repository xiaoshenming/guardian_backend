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

// 2. 导入并初始化 WebSocket 服务
// const { initWebSocket } = require("./config/websockets");
// initWebSocket(server);
const { startHeartbeats } = require("./config/heartbeat"); // 启动心跳检测（Redis 与 MySQL）

// 中间件
app.use(express.json()); // 解析 JSON 请求体
app.use(cors()); // 启用 CORS 中间件

// 路由配置
app.use("/api/auth", authRouter); // 认证相关路由
app.use("/api/user", userRouter); // 用户相关路由
app.use("/api/email", emailRouter); // 邮箱验证相关路由

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
    }
  });
});

// 404 处理
app.use("*", (req, res) => {
  res.status(404).json({
    code: 404,
    message: "接口不存在",
    data: null
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error("全局错误:", err);
  res.status(500).json({
    code: 500,
    message: "服务器内部错误",
    data: null
  });
});

startHeartbeats(); // 启动心跳检测服务

server.listen(port, "0.0.0.0", () => {
    console.log(`服务器已启动，监听端口：http://0.0.0.0:${port}`);
    console.log(`API文档地址: http://0.0.0.0:${port}`);
});