// config/emqx.js
const mqtt = require("mqtt");
require("dotenv").config(); // 确保 .env 文件被读取以加载配置

const { getIo } = require("./websockets"); // 引入 WebSocket 实例获取函数

// 从环境变量中读取 MQTT Broker 连接详情
const MQTT_HOST = process.env.MQTT_HOST; // MQTT 服务器 IP 地址
const MQTT_PORT = process.env.MQTT_PORT; // MQTT 服务器端口
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID; // MQTT 客户端 ID
const MQTT_USERNAME = process.env.MQTT_USERNAME; // MQTT 用户名
const MQTT_PASSWORD = process.env.MQTT_PASSWORD; // MQTT 密码

// 从环境变量中读取 MQTT 主题


const options = {
  host: MQTT_HOST,
  port: MQTT_PORT,
  clientId: MQTT_CLIENT_ID,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  protocol: "mqtt", // 显式指定 MQTT 协议
  keepalive: 60, // Keepalive 心跳间隔（秒）
  reconnectPeriod: 1000, // 两次重连尝试之间的间隔（毫秒）
  connectTimeout: 30 * 1000, // 等待 CONNACK 的超时时间（毫秒）
  clean: true, // 清理会话，断开连接时不保留会话信息
};

// 校验环境变量是否都已设置 (MQTT 连接相关的)
if (
  !MQTT_HOST ||
  !MQTT_PORT ||
  !MQTT_CLIENT_ID ||
  !MQTT_USERNAME ||
  !MQTT_PASSWORD 
  //订阅
  // HEARTBEAT_TOPIC is not strictly needed for emqx.js connection itself now
) {
  console.error(
    "错误：一个或多个 MQTT 连接或主题相关的环境变量未设置。请检查您的 .env 文件。"
  );
  // process.exit(1); // 考虑在关键性错误时取消注释
}

const client = mqtt.connect(options);

//链接订阅

client.on("error", (err) => {
  console.error("MQTT 客户端错误:", err);
});

client.on("reconnect", () => {
  console.log("MQTT 客户端正在尝试重新连接...");
});

client.on("offline", () => {
  console.log("MQTT 客户端已离线。");
});

client.on("close", () => {
  console.log("MQTT 连接已关闭。");
});

module.exports = client; // 导出客户端供 heartbeat.js 和其他可能的模块使用
