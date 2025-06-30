// ./modle/guardian/mqttHandler.js
import mqtt from 'mqtt';
import deviceUtil from './deviceUtil.js';
import eventUtil from './eventUtil.js';
import alertUtil from './alertUtil.js';
import { getIo } from '../../config/websockets.js'; // 引入 WebSocket 实例
import db from '../../config/db.js';
// 以后会用到
// import actionRuleUtil from './actionRuleUtil.js';

const client = mqtt.connect({
    host: process.env.MQTT_HOST,
    port: process.env.MQTT_PORT,
    clientId: process.env.MQTT_CLIENT_ID,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
});

// 缓存设备与圈子的关系，避免频繁查库
const deviceCircleCache = new Map();

async function verifyDevice(deviceSn, circleId) {
    const cacheKey = `${deviceSn}:${circleId}`;
    if (deviceCircleCache.has(cacheKey)) {
        return true;
    }
    const device = await deviceUtil.findDeviceById(deviceSn); // 注意：findDeviceById可能需要调整为通过SN查找
    if (device && device.circle_id === parseInt(circleId)) {
        deviceCircleCache.set(cacheKey, true);
        return true;
    }
    return false;
}

export function initMqtt() {
    client.on('connect', () => {
        console.log('✅ MQTT a 连接成功!');
        // 订阅所有需要处理的 Topic
        client.subscribe(`${process.env.GUARDIAN_TOPIC}/#`, (err) => {
            if (!err) {
                console.log(`✅ 成功订阅主题: ${process.env.GUARDIAN_TOPIC}/#`);
            }
        });
    });

    client.on('message', async (topic, payload) => {
        console.log(`收到消息 -> 主题: ${topic}, 内容: ${payload.toString()}`);

        const topicParts = topic.split('/');
        // emqx/harmony/guardian/{circle_id}/{device_sn}/{message_type}
        if (topicParts.length < 6) return; // 格式不符

        const [, , , circleId, deviceSn, messageType] = topicParts;

        try {
            // 1. 安全校验：设备是否存在且属于该守护圈
            const device = await deviceUtil.findDeviceBySn(deviceSn);
            if (!device || device.circle_id !== parseInt(circleId)) {
                console.warn(`[MQTT-Security] 警告: 收到来自未授权或圈ID不匹配设备的消息. SN: ${deviceSn}, Topic-Circle: ${circleId}`);
                return;
            }
            const data = JSON.parse(payload.toString());

            // 2. 根据消息类型进行路由
            switch (messageType) {
                case 'event':
                    console.log(`[MQTT-Event] 设备: ${device.device_name}, 事件: ${data.event_type}`);
                    await handleEventMessage(device, data);
                    break;
                case 'heartbeat':
                    console.log(`[MQTT-Heartbeat] 设备: ${device.device_name} 发送心跳`);
                    await deviceUtil.updateDeviceHeartbeat(device.device_sn, data.firmware_version);
                    break;
                case 'state':
                    console.log(`[MQTT-State] 设备: ${device.device_name} 上报状态`);
                    await handleStateMessage(device, data);
                    break;
                default:
                    console.warn(`[MQTT] 警告: 未知的消息类型: ${messageType}`);
            }
        } catch (error) {
            console.error(`[MQTT] 处理消息时出错: ${error.message}`);
        }
    });

    client.on('error', (error) => {
        console.error('MQTT 连接错误:', error);
    });
}

async function handleEventMessage(device, eventPayload) {
    const eventTime = eventPayload.timestamp ? new Date(eventPayload.timestamp * 1000) : new Date();

    const eventLogData = {
        device_id: device.id,
        circle_id: device.circle_id,
        event_type: eventPayload.event_type,
        event_data: eventPayload.event_data,
        event_time: eventTime
    };

    // 1. 记录事件日志
    const eventLog = await eventUtil.createEventLog(eventLogData);
    console.log(`[Event] 已记录新事件, LogID: ${eventLog.id}`);

    // 通过 WebSocket 推送新事件到前端
    const io = getIo();
    io.to(`circle_${device.circle_id}`).emit('new_event', eventLog);


    // 2. 判断是否需要生成告警
    const highPriorityEvents = {
        'fall_detection': { level: 1, content: '检测到摔倒事件' },
        'sos_alert': { level: 1, content: '收到SOS紧急求助' },
        'stranger_detected': { level: 2, content: '检测到陌生人靠近' }
    };

    if (highPriorityEvents[eventPayload.event_type]) {
        const alertInfo = highPriorityEvents[eventPayload.event_type];
        const alert = await alertUtil.createAlert({
            event_id: eventLog.id,
            circle_id: device.circle_id,
            alert_level: alertInfo.level,
            alert_content: `设备"${device.device_name}"上报: ${alertInfo.content}`
        });
        console.log(`[Alert] 已生成新告警, AlertID: ${alert.id}. 需要推送通知!`);
        // 通过 WebSocket 推送新告警到前端
        io.to(`circle_${device.circle_id}`).emit('new_alert', alert);
        // 在这里还可以触发短信、电话等其他通知服务
    }

    // 3. 检查并执行自动化规则 (未来)
    // const rules = await actionRuleUtil.findRulesByCircleId(device.circle_id);
    // ... 匹配规则并执行 ...
}
async function handleStateMessage(device, statePayload) {
    // 1. 更新数据库中设备的 config 字段
    await deviceUtil.updateDeviceState(device.device_sn, statePayload.state);
    console.log(`[State] 已更新设备 ${device.device_sn} 的状态到数据库`);

    // 2. 通过 WebSocket 将最新状态推送到前端
    const io = getIo();
    const message = {
        deviceId: device.id,
        state: statePayload.state
    };
    io.to(`circle_${device.circle_id}`).emit('device_state_update', message);
}
