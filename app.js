// app.js
const express = require("express"); // 使用 Express 框架
require("dotenv").config(); // 加载环境变量
const cors = require("cors"); // 启用跨域支持
const app = express(); // 创建 Express 实例
const port = process.env.PORT || 3000; // 默认端口
const http = require("http"); // 用于创建 HTTP 服务器
const server = http.createServer(app); // 创建 HTTP 服务器
// 2. 导入并初始化 WebSocket 服务
const { initWebSocket } = require("./config/websockets");
initWebSocket(server);
const { startHeartbeats } = require("./config/heartbeat"); // 启动心跳检测（Redis 与 MySQL）
app.use(express.json()); // 解析 JSON 请求体
app.use(cors()); // 启用 CORS 中间件
app.use("/api", userRouter);
startHeartbeats(); // 启动心跳检测服务
server.listen(port, "0.0.0.0", () => {
    console.log(`服务器已启动，监听端口：http://0.0.0.0:${port}`);
});