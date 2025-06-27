const mqtt = require('mqtt');
const eventUtils = require('../event/eventUtils');
const deviceUtils = require('../device/deviceUtils');
const circleUtils = require('../circle/circleUtils');

class MQTTService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectInterval = 5000; // 5秒
  }

  // 初始化MQTT连接
  async initialize() {
    try {
      const mqttConfig = {
        host: process.env.MQTT_HOST || 'localhost',
        port: process.env.MQTT_PORT || 1883,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clientId: `guardian_backend_${Date.now()}`,
        clean: true,
        connectTimeout: 30000,
        reconnectPeriod: this.reconnectInterval,
        keepalive: 60
      };

      console.log('正在连接MQTT服务器...', mqttConfig.host + ':' + mqttConfig.port);
      
      this.client = mqtt.connect(mqttConfig);
      
      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        this.client.on('connect', () => {
          console.log('MQTT连接成功');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.subscribeToTopics();
          resolve();
        });
        
        this.client.on('error', (error) => {
          console.error('MQTT连接错误:', error);
          reject(error);
        });
        
        // 设置超时
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('MQTT连接超时'));
          }
        }, 30000);
      });
      
    } catch (error) {
      console.error('MQTT初始化失败:', error);
      throw error;
    }
  }

  // 设置事件处理器
  setupEventHandlers() {
    this.client.on('connect', () => {
      console.log('MQTT已连接');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('disconnect', () => {
      console.log('MQTT连接断开');
      this.isConnected = false;
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      console.log(`MQTT重连中... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('MQTT重连次数超限，停止重连');
        this.client.end();
      }
    });

    this.client.on('error', (error) => {
      console.error('MQTT错误:', error);
      this.isConnected = false;
    });

    this.client.on('message', (topic, message) => {
      this.handleMessage(topic, message);
    });
  }

  // 订阅主题
  subscribeToTopics() {
    const topics = [
      'guardian/+/heartbeat',     // 设备心跳
      'guardian/+/event',         // 设备事件
      'guardian/+/location',      // 位置信息
      'guardian/+/health',        // 健康数据
      'guardian/+/status',        // 设备状态
      'guardian/+/emergency'      // 紧急事件
    ];

    topics.forEach(topic => {
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          console.error(`订阅主题失败: ${topic}`, err);
        } else {
          console.log(`已订阅主题: ${topic}`);
        }
      });
    });
  }

  // 处理接收到的消息
  async handleMessage(topic, message) {
    try {
      const topicParts = topic.split('/');
      const deviceSn = topicParts[1];
      const messageType = topicParts[2];
      
      let data;
      try {
        data = JSON.parse(message.toString());
      } catch (parseError) {
        console.error('消息解析失败:', parseError, 'Topic:', topic, 'Message:', message.toString());
        return;
      }

      console.log(`收到消息 [${topic}]:`, data);

      // 验证设备是否存在
      const device = await deviceUtils.findDeviceBySn(deviceSn);
      if (!device) {
        console.warn(`未知设备: ${deviceSn}`);
        return;
      }

      // 根据消息类型处理
      switch (messageType) {
        case 'heartbeat':
          await this.handleHeartbeat(device, data);
          break;
        case 'event':
          await this.handleEvent(device, data);
          break;
        case 'location':
          await this.handleLocation(device, data);
          break;
        case 'health':
          await this.handleHealth(device, data);
          break;
        case 'status':
          await this.handleStatus(device, data);
          break;
        case 'emergency':
          await this.handleEmergency(device, data);
          break;
        default:
          console.warn(`未知消息类型: ${messageType}`);
      }

    } catch (error) {
      console.error('处理MQTT消息错误:', error, 'Topic:', topic);
    }
  }

  // 处理心跳消息
  async handleHeartbeat(device, data) {
    try {
      await deviceUtils.updateDeviceHeartbeat(device.device_sn, {
        status: 1,
        battery_level: data.battery || null,
        signal_strength: data.signal || null
      });
      
      // 如果电量低，生成事件
      if (data.battery && data.battery <= 20) {
        await eventUtils.createEvent({
          deviceId: device.id,
          circleId: device.circle_id,
          eventType: 'low_battery',
          eventData: { battery_level: data.battery },
          eventTime: new Date()
        });
      }
      
    } catch (error) {
      console.error('处理心跳消息错误:', error);
    }
  }

  // 处理事件消息
  async handleEvent(device, data) {
    try {
      const eventId = await eventUtils.createEvent({
        deviceId: device.id,
        circleId: device.circle_id,
        eventType: data.type,
        eventData: data.data || {},
        eventTime: data.timestamp ? new Date(data.timestamp) : new Date()
      });

      // 判断是否需要生成告警
      const shouldAlert = await eventUtils.shouldGenerateAlert(data.type, data.data);
      if (shouldAlert) {
        await eventUtils.generateAlert({
          eventId,
          circleId: device.circle_id,
          alertLevel: eventUtils.getAlertLevel(data.type),
          alertContent: eventUtils.generateAlertContent(data.type, data.data, device)
        });
      }
      
    } catch (error) {
      console.error('处理事件消息错误:', error);
    }
  }

  // 处理位置消息
  async handleLocation(device, data) {
    try {
      await eventUtils.createEvent({
        deviceId: device.id,
        circleId: device.circle_id,
        eventType: 'location_update',
        eventData: {
          latitude: data.lat,
          longitude: data.lng,
          accuracy: data.accuracy,
          altitude: data.altitude,
          speed: data.speed
        },
        eventTime: data.timestamp ? new Date(data.timestamp) : new Date()
      });
      
      // 检查围栏违规
      if (data.fence_status && data.fence_status !== 'normal') {
        await eventUtils.createEvent({
          deviceId: device.id,
          circleId: device.circle_id,
          eventType: 'fence_violation',
          eventData: {
            violation_type: data.fence_status,
            location: { lat: data.lat, lng: data.lng }
          },
          eventTime: new Date()
        });
      }
      
    } catch (error) {
      console.error('处理位置消息错误:', error);
    }
  }

  // 处理健康数据消息
  async handleHealth(device, data) {
    try {
      await eventUtils.createEvent({
        deviceId: device.id,
        circleId: device.circle_id,
        eventType: 'health_data',
        eventData: {
          heart_rate: data.heart_rate,
          blood_pressure: data.blood_pressure,
          steps: data.steps,
          sleep_quality: data.sleep_quality
        },
        eventTime: data.timestamp ? new Date(data.timestamp) : new Date()
      });
      
      // 检查心率异常
      if (data.heart_rate && (data.heart_rate < 50 || data.heart_rate > 120)) {
        await eventUtils.createEvent({
          deviceId: device.id,
          circleId: device.circle_id,
          eventType: 'heart_rate_abnormal',
          eventData: { heart_rate: data.heart_rate },
          eventTime: new Date()
        });
      }
      
    } catch (error) {
      console.error('处理健康数据消息错误:', error);
    }
  }

  // 处理状态消息
  async handleStatus(device, data) {
    try {
      await eventUtils.createEvent({
        deviceId: device.id,
        circleId: device.circle_id,
        eventType: 'status_update',
        eventData: data,
        eventTime: new Date()
      });
      
    } catch (error) {
      console.error('处理状态消息错误:', error);
    }
  }

  // 处理紧急消息
  async handleEmergency(device, data) {
    try {
      let eventType = 'emergency_button';
      
      if (data.type === 'fall') {
        eventType = 'fall_detected';
      } else if (data.type === 'sos') {
        eventType = 'location_sos';
      }
      
      await eventUtils.createEvent({
        deviceId: device.id,
        circleId: device.circle_id,
        eventType,
        eventData: {
          emergency_type: data.type,
          location: data.location,
          additional_info: data.info
        },
        eventTime: data.timestamp ? new Date(data.timestamp) : new Date()
      });
      
    } catch (error) {
      console.error('处理紧急消息错误:', error);
    }
  }

  // 发送消息到设备
  async sendToDevice(deviceSn, messageType, data) {
    if (!this.isConnected) {
      throw new Error('MQTT未连接');
    }
    
    const topic = `guardian/${deviceSn}/command/${messageType}`;
    const message = JSON.stringify({
      timestamp: new Date().toISOString(),
      data
    });
    
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, { qos: 1 }, (error) => {
        if (error) {
          console.error(`发送消息失败 [${topic}]:`, error);
          reject(error);
        } else {
          console.log(`消息已发送 [${topic}]:`, data);
          resolve();
        }
      });
    });
  }

  // 发送配置到设备
  async sendConfig(deviceSn, config) {
    return this.sendToDevice(deviceSn, 'config', config);
  }

  // 发送控制命令到设备
  async sendControl(deviceSn, command) {
    return this.sendToDevice(deviceSn, 'control', command);
  }

  // 获取连接状态
  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // 关闭连接
  async close() {
    if (this.client) {
      this.client.end();
      this.isConnected = false;
      console.log('MQTT连接已关闭');
    }
  }
}

// 创建单例实例
const mqttService = new MQTTService();

module.exports = mqttService;