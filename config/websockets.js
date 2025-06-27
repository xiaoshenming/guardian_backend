// config/websockets.js
const { Server } = require("socket.io");

let io;

const initWebSocket = (server) => {
    io = new Server(server, {
      path: "/api/socket.io/",
      cors: {
        origin: "*", // 在生产环境中，应设置为你的前端域名
        methods: ["GET", "POST"],
      },
    });

  io.on("connection", (socket) => {
    console.log("一个新客户端已通过WebSocket连接:", socket.id);

    socket.on("disconnect", () => {
      console.log("客户端已断开连接:", socket.id);
    });
  });

  console.log("WebSocket服务已初始化并附加到HTTP服务器。");
  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error("Socket.IO 未初始化!");
  }
  return io;
};

module.exports = { initWebSocket, getIo };
