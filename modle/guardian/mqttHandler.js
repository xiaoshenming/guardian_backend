// ./modle/guardian/mqttHandler.js
import mqtt from 'mqtt';
import deviceUtil from './deviceUtil.js';
import eventUtil from './eventUtil.js';
import alertUtil from './alertUtil.js';
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
            const data = JSON.parse(payload.toString());

            // 1. 安全校验 (简易版，生产环境应更复杂)
            // 假设我们有一个按SN查找的函数 findDeviceBySn
            const device = await db.promise().query('SELECT * FROM device_info WHERE device_sn = ? AND circle_id = ?', [deviceSn, circleId]).then(([rows])=>rows[0]);
            if (!device) {
                console.warn(`[MQTT] 警告: 收到来自未授权设备的消息. SN: ${deviceSn}, Circle: ${circleId}`);
                return;
            }

            // 2. 根据消息类型进行路由
            switch (messageType) {
                case 'event':
                    await handleEventMessage(device, data);
                    break;
                case 'heartbeat':
                    // await handleHeartbeatMessage(device, data);
                    break;
                // ... 其他 case
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
    // 1. 记录事件日志
    const eventLog = await eventUtil.createEventLog({
        device_id: device.id,
        circle_id: device.circle_id,
        event_type: eventPayload.event_type,
        event_data: eventPayload.event_data,
        event_time: new Date(eventPayload.timestamp)
    });
    console.log(`[Event] 已记录新事件, ID: ${eventLog.id}`);

    // 2. 判断是否需要生成告警 (业务逻辑)
    const highPriorityEvents = ['fall_detection', 'sos_alert', 'stranger_detected'];
    if (highPriorityEvents.includes(eventPayload.event_type)) {
        const alert = await alertUtil.createAlert({
            event_id: eventLog.id,
            circle_id: device.circle_id,
            alert_level: 1, // 1: 紧急
            alert_content: `设备"${device.device_name}"上报紧急事件: ${eventPayload.event_type}`
        });
        console.log(`[Alert] 已生成新告警, ID: ${alert.id}. 需要推送通知!`);
        // 在这里触发推送、短信等通知...
    }

    // 3. 检查并执行自动化规则 (未来)
    // const rules = await actionRuleUtil.findRulesByCircleId(device.circle_id);
    // ... 匹配规则并执行 ...
}
