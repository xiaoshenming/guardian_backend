// test/mockDataGenerator.js
import axios from 'axios';
import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '../.env') });

class MockDataGenerator {
    constructor() {
        this.baseURL = `http://localhost:${process.env.PORT || 3000}`;
        this.tokens = {}; // 存储用户token
        this.circles = []; // 存储创建的圈子
        this.devices = []; // 存储创建的设备
        this.mqttClient = null;
        
        // 测试用户信息
        this.testUsers = [
            { username: 'admin', password: '111111', role: 2 },
            { username: 'test1', password: '111111', role: 1 },
            { username: 'test2', password: '111111', role: 2 },
            { username: 'test3', password: '111111', role: 3 }
        ];
        
        // 模拟圈子数据
        this.mockCircles = [
            {
                circle_name: '智慧家庭守护圈',
                description: '保护家人安全的智能监控系统',
                creator: 'admin'
            },
            {
                circle_name: '老人关爱圈',
                description: '专为老年人设计的健康监护圈',
                creator: 'test2'
            },
            {
                circle_name: '儿童安全圈',
                description: '守护孩子成长的安全防护圈',
                creator: 'test3'
            }
        ];
        
        // 模拟设备数据
        this.mockDevices = [
            {
                device_name: '客厅摄像头',
                device_type: 'camera',
                device_sn: 'CAM001',
                device_model: 'Guardian-Cam-Pro',
                firmware_version: '1.2.3'
            },
            {
                device_name: '门口传感器',
                device_type: 'sensor',
                device_sn: 'SEN001',
                device_model: 'Guardian-Sensor-V2',
                firmware_version: '2.1.0'
            },
            {
                device_name: '卧室监控',
                device_type: 'camera',
                device_sn: 'CAM002',
                device_model: 'Guardian-Cam-Mini',
                firmware_version: '1.1.8'
            },
            {
                device_name: '厨房烟雾探测器',
                device_type: 'smoke_detector',
                device_sn: 'SMK001',
                device_model: 'Guardian-Smoke-Pro',
                firmware_version: '3.0.1'
            },
            {
                device_name: '阳台温湿度传感器',
                device_type: 'environment',
                device_sn: 'ENV001',
                device_model: 'Guardian-Env-Sensor',
                firmware_version: '1.5.2'
            }
        ];
    }
    
    // 生成随机base64图片数据
    generateMockImage() {
        // 这是一个1x1像素的透明PNG图片的base64编码
        const mockImages = [
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQIHWNgAAIAAAUAAY27m/MAAAAASUVORK5CYII='
        ];
        return mockImages[Math.floor(Math.random() * mockImages.length)];
    }
    
    // 用户登录
    async loginUser(username, password) {
        try {
            console.log(`🔐 正在登录用户: ${username}`);
            const response = await axios.post(`${this.baseURL}/api/auth/login`, {
                name: username,
                password: password,
                deviceType: 'test'
            });
            
            console.log(`🔍 登录响应:`, JSON.stringify(response.data, null, 2));
            
            if (response.data.code === 200) {
                // 尝试不同的token路径
                const token = response.data.data?.accessToken || 
                             response.data.data?.token || 
                             response.data.accessToken || 
                             response.data.token;
                             
                this.tokens[username] = token;
                console.log(`✅ 用户 ${username} 登录成功`);
                if (token) {
                    console.log(`🔑 Token已保存: ${token.substring(0, 20)}...`);
                } else {
                    console.error(`❌ Token为空，响应数据:`, response.data);
                }
                return token;
            } else {
                console.error(`❌ 用户 ${username} 登录失败:`, response.data.message || 'Unknown error');
            }
        } catch (error) {
            console.error(`❌ 用户 ${username} 登录失败:`, error.response?.data || error.message);
            if (error.response) {
                console.error(`🔍 错误响应:`, error.response.data);
            }
        }
        return null;
    }
    
    // 创建守护圈
    async createCircle(circleData, creatorUsername) {
        try {
            console.log(`🏠 正在创建守护圈: ${circleData.circle_name}`);
            const token = this.tokens[creatorUsername];
            if (!token) {
                console.error(`❌ 用户 ${creatorUsername} 未登录`);
                console.log(`🔍 可用tokens:`, Object.keys(this.tokens));
                return null;
            }
            
            console.log(`🔑 使用token: ${token.substring(0, 20)}...`);
            const response = await axios.post(`${this.baseURL}/api/guardian/circle`, circleData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'deviceType': 'test',
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`🔍 创建守护圈响应:`, JSON.stringify(response.data, null, 2));
            
            // 检查不同的成功标识
            if (response.data.code === 200 || response.data.success || response.data.message?.includes('成功')) {
                const circle = response.data.data || { 
                    id: Date.now(), // 临时ID
                    circle_name: circleData.circle_name,
                    creator_uid: creatorUsername
                };
                this.circles.push(circle);
                console.log(`✅ 守护圈创建成功: ${circle.circle_name} (ID: ${circle.id})`);
                return circle;
            } else {
                console.error(`❌ 守护圈创建失败:`, response.data.message);
                return null;
            }
        } catch (error) {
            console.error(`❌ 守护圈创建错误:`, error.response?.data?.message || error.message);
            if (error.response?.status === 401) {
                console.error(`🔐 认证失败，可能token已过期`);
            } else if (error.response?.status === 403) {
                console.error(`🚫 权限不足，尝试使用admin用户创建`);
                // 如果权限不足，尝试用admin创建
                if (creatorUsername !== 'admin' && this.tokens['admin']) {
                    return await this.createCircle(circleData, 'admin');
                }
            }
            return null;
        }
    }
    
    // 添加设备到圈子
    async addDeviceToCircle(deviceData, circleId, creatorUsername) {
        try {
            console.log(`📱 正在添加设备: ${deviceData.device_name} 到圈子 ${circleId}`);
            const token = this.tokens[creatorUsername];
            if (!token) {
                console.error(`❌ 用户 ${creatorUsername} 未登录`);
                return null;
            }
            
            // 尝试不同的API路径
            const possiblePaths = [
                `/api/guardian/device`,
                `/api/devices`,
                `/api/guardian/devices`,
                `/api/device`
            ];
            
            for (const path of possiblePaths) {
                try {
                    console.log(`🔍 尝试API路径: ${path}`);
                    const response = await axios.post(`${this.baseURL}${path}`, {
                        ...deviceData,
                        circle_id: circleId
                    }, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    console.log(`🔍 设备添加响应:`, JSON.stringify(response.data, null, 2));
                    
                    if (response.data.code === 200 || response.data.code === 201 || response.data.success || response.data.message?.includes('成功')) {
                        const device = response.data.data || {
                            ...deviceData,
                            id: Date.now(),
                            circle_id: circleId
                        };
                        this.devices.push({
                            ...device,
                            circle_id: circleId
                        });
                        console.log(`✅ 设备添加成功: ${device.device_name} (SN: ${device.device_sn})`);
                        return device;
                    }
                } catch (pathError) {
                    if (pathError.response?.status !== 404) {
                        console.error(`❌ API路径 ${path} 错误:`, pathError.response?.data?.message || pathError.message);
                    }
                    continue;
                }
            }
            
            // 如果所有API路径都失败，直接模拟添加设备
            console.log(`⚠️ 所有API路径都失败，模拟添加设备`);
            const mockDevice = {
                ...deviceData,
                id: Date.now(),
                circle_id: circleId,
                status: 'online',
                created_at: new Date().toISOString()
            };
            this.devices.push(mockDevice);
            console.log(`✅ 设备模拟添加成功: ${mockDevice.device_name} (SN: ${mockDevice.device_sn})`);
            return mockDevice;
            
        } catch (error) {
            console.error(`❌ 添加设备失败:`, error.response?.data || error.message);
            return null;
        }
    }
    
    // 初始化MQTT客户端
    initMQTT() {
        console.log('🔌 正在连接MQTT服务器...');
        this.mqttClient = mqtt.connect({
            host: process.env.MQTT_HOST || 'localhost',
            port: process.env.MQTT_PORT || 1883,
            clientId: 'mock_data_generator_' + Math.random().toString(16).substr(2, 8),
            username: process.env.MQTT_USERNAME,
            password: process.env.MQTT_PASSWORD,
        });
        
        this.mqttClient.on('connect', () => {
            console.log('✅ MQTT连接成功');
        });
        
        this.mqttClient.on('error', (error) => {
            console.error('❌ MQTT连接错误:', error);
        });
    }
    
    // 发送MQTT事件
    publishMQTTEvent(circleId, deviceSn, eventType, eventData) {
        if (!this.mqttClient || !this.mqttClient.connected) {
            console.error('❌ MQTT客户端未连接');
            return;
        }
        
        const topic = `${process.env.GUARDIAN_TOPIC || 'emqx/harmony/guardian'}/${circleId}/${deviceSn}/event`;
        const payload = {
            event_type: eventType,
            event_data: eventData,
            timestamp: Math.floor(Date.now() / 1000)
        };
        
        this.mqttClient.publish(topic, JSON.stringify(payload));
        console.log(`📡 发送MQTT事件: ${eventType} from ${deviceSn}`);
    }
    
    // 发送设备心跳
    publishHeartbeat(circleId, deviceSn, firmwareVersion) {
        if (!this.mqttClient || !this.mqttClient.connected) {
            return;
        }
        
        const topic = `${process.env.GUARDIAN_TOPIC || 'emqx/harmony/guardian'}/${circleId}/${deviceSn}/heartbeat`;
        const payload = {
            firmware_version: firmwareVersion,
            timestamp: Math.floor(Date.now() / 1000)
        };
        
        this.mqttClient.publish(topic, JSON.stringify(payload));
        console.log(`💓 发送心跳: ${deviceSn}`);
    }
    
    // 发送设备状态
    publishDeviceState(circleId, deviceSn, state) {
        if (!this.mqttClient || !this.mqttClient.connected) {
            return;
        }
        
        const topic = `${process.env.GUARDIAN_TOPIC || 'emqx/harmony/guardian'}/${circleId}/${deviceSn}/state`;
        const payload = {
            state: state,
            timestamp: Math.floor(Date.now() / 1000)
        };
        
        this.mqttClient.publish(topic, JSON.stringify(payload));
        console.log(`📊 发送设备状态: ${deviceSn}`);
    }
    
    // 生成随机事件数据
    generateRandomEventData(eventType, deviceType) {
        const eventDataMap = {
            'fall_detection': {
                confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0
                location: { x: Math.floor(Math.random() * 1920), y: Math.floor(Math.random() * 1080) },
                image: this.generateMockImage(),
                severity: 'high'
            },
            'sos_alert': {
                button_pressed: true,
                duration: Math.floor(Math.random() * 5) + 1,
                location: { x: Math.floor(Math.random() * 1920), y: Math.floor(Math.random() * 1080) },
                image: this.generateMockImage(),
                severity: 'critical'
            },
            'stranger_detected': {
                confidence: Math.random() * 0.4 + 0.6, // 0.6-1.0
                face_count: Math.floor(Math.random() * 3) + 1,
                location: { x: Math.floor(Math.random() * 1920), y: Math.floor(Math.random() * 1080) },
                image: this.generateMockImage(),
                severity: 'medium'
            },
            'motion_detected': {
                motion_area: Math.floor(Math.random() * 50) + 10, // 10-60%
                location: { x: Math.floor(Math.random() * 1920), y: Math.floor(Math.random() * 1080) },
                image: this.generateMockImage(),
                severity: 'low'
            },
            'door_opened': {
                door_id: 'main_door',
                opened_by: Math.random() > 0.5 ? 'authorized' : 'unknown',
                image: this.generateMockImage(),
                severity: 'low'
            },
            'smoke_detected': {
                smoke_level: Math.floor(Math.random() * 100) + 50, // 50-150 ppm
                temperature: Math.floor(Math.random() * 20) + 25, // 25-45°C
                location: 'kitchen',
                severity: 'high'
            },
            'temperature_alert': {
                temperature: Math.floor(Math.random() * 15) + 35, // 35-50°C
                humidity: Math.floor(Math.random() * 30) + 60, // 60-90%
                location: 'living_room',
                severity: 'medium'
            },
            'device_offline': {
                last_seen: new Date(Date.now() - Math.random() * 3600000).toISOString(),
                reason: 'network_timeout',
                severity: 'medium'
            },
            'low_battery': {
                battery_level: Math.floor(Math.random() * 15) + 5, // 5-20%
                estimated_time: Math.floor(Math.random() * 24) + 1, // 1-24 hours
                severity: 'low'
            }
        };
        
        return eventDataMap[eventType] || { message: 'Unknown event type' };
    }
    
    // 生成随机设备状态
    generateRandomDeviceState(deviceType) {
        const stateMap = {
            'camera': {
                recording: Math.random() > 0.3,
                resolution: ['1080p', '720p', '4K'][Math.floor(Math.random() * 3)],
                night_vision: Math.random() > 0.5,
                motion_detection: Math.random() > 0.2,
                battery_level: Math.floor(Math.random() * 100),
                storage_used: Math.floor(Math.random() * 80) + 10 // 10-90%
            },
            'sensor': {
                active: Math.random() > 0.1,
                sensitivity: Math.floor(Math.random() * 10) + 1, // 1-10
                battery_level: Math.floor(Math.random() * 100),
                last_trigger: new Date(Date.now() - Math.random() * 86400000).toISOString()
            },
            'smoke_detector': {
                active: Math.random() > 0.05,
                sensitivity: Math.floor(Math.random() * 5) + 1, // 1-5
                battery_level: Math.floor(Math.random() * 100),
                last_test: new Date(Date.now() - Math.random() * 2592000000).toISOString() // 30 days
            },
            'environment': {
                active: Math.random() > 0.05,
                temperature: Math.floor(Math.random() * 30) + 10, // 10-40°C
                humidity: Math.floor(Math.random() * 60) + 30, // 30-90%
                battery_level: Math.floor(Math.random() * 100)
            }
        };
        
        return stateMap[deviceType] || { status: 'unknown' };
    }
    
    // 开始模拟事件生成
    startEventSimulation() {
        console.log('🎭 开始模拟事件生成...');
        
        // 定义事件类型及其权重
        const eventTypes = [
            { type: 'motion_detected', weight: 40 },
            { type: 'door_opened', weight: 20 },
            { type: 'stranger_detected', weight: 15 },
            { type: 'temperature_alert', weight: 10 },
            { type: 'fall_detection', weight: 5 },
            { type: 'sos_alert', weight: 3 },
            { type: 'smoke_detected', weight: 3 },
            { type: 'device_offline', weight: 2 },
            { type: 'low_battery', weight: 2 }
        ];
        
        // 根据权重选择事件类型
        const selectEventType = () => {
            const totalWeight = eventTypes.reduce((sum, event) => sum + event.weight, 0);
            let random = Math.random() * totalWeight;
            
            for (const event of eventTypes) {
                random -= event.weight;
                if (random <= 0) {
                    return event.type;
                }
            }
            return eventTypes[0].type;
        };
        
        // 每5-15秒生成一个随机事件
        const generateEvent = () => {
            if (this.devices.length === 0) {
                console.log('⚠️ 没有可用设备，跳过事件生成');
                return;
            }
            
            const device = this.devices[Math.floor(Math.random() * this.devices.length)];
            const eventType = selectEventType();
            const eventData = this.generateRandomEventData(eventType, device.device_type);
            
            this.publishMQTTEvent(device.circle_id, device.device_sn, eventType, eventData);
        };
        
        // 立即生成一个事件，然后设置定时器
        generateEvent();
        setInterval(generateEvent, Math.random() * 10000 + 5000); // 5-15秒
    }
    
    // 开始心跳模拟
    startHeartbeatSimulation() {
        console.log('💓 开始心跳模拟...');
        
        // 每30-60秒发送一次心跳
        setInterval(() => {
            this.devices.forEach(device => {
                if (Math.random() > 0.1) { // 90%的概率发送心跳
                    this.publishHeartbeat(device.circle_id, device.device_sn, device.firmware_version);
                }
            });
        }, Math.random() * 30000 + 30000); // 30-60秒
    }
    
    // 开始状态更新模拟
    startStateUpdateSimulation() {
        console.log('📊 开始状态更新模拟...');
        
        // 每2-5分钟更新一次设备状态
        setInterval(() => {
            this.devices.forEach(device => {
                if (Math.random() > 0.3) { // 70%的概率更新状态
                    const state = this.generateRandomDeviceState(device.device_type);
                    this.publishDeviceState(device.circle_id, device.device_sn, state);
                }
            });
        }, Math.random() * 180000 + 120000); // 2-5分钟
    }
    
    // 主运行函数
    async run() {
        console.log('🚀 开始Guardian测试数据生成...');
        console.log('='.repeat(50));
        
        try {
            // 1. 登录所有测试用户
            console.log('\n📝 第一步: 用户登录');
            for (const user of this.testUsers) {
                await this.loginUser(user.username, user.password);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
            }
            
            // 2. 创建守护圈
            console.log('\n🏠 第二步: 创建守护圈');
            for (const circleData of this.mockCircles) {
                await this.createCircle(circleData, circleData.creator);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
            }
            
            // 3. 添加设备到圈子
            console.log('\n📱 第三步: 添加设备');
            if (this.circles.length === 0) {
                console.error('❌ 没有可用的守护圈，跳过设备添加');
            } else {
                for (let i = 0; i < this.mockDevices.length; i++) {
                    const device = this.mockDevices[i];
                    const circle = this.circles[i % this.circles.length]; // 轮流分配到不同圈子
                    const mockCircle = this.mockCircles[i % this.mockCircles.length];
                    const creator = mockCircle.creator;
                    
                    if (circle && circle.id) {
                        await this.addDeviceToCircle(device, circle.id, creator);
                    } else {
                        console.error(`❌ 圈子信息无效，跳过设备: ${device.device_name}`);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
                }
            }
            
            // 4. 初始化MQTT
            console.log('\n🔌 第四步: 初始化MQTT连接');
            this.initMQTT();
            
            // 等待MQTT连接建立
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 5. 开始模拟数据生成
            console.log('\n🎭 第五步: 开始数据模拟');
            this.startEventSimulation();
            this.startHeartbeatSimulation();
            this.startStateUpdateSimulation();
            
            console.log('\n✅ 测试数据生成器启动完成!');
            console.log('📊 实时数据正在生成中...');
            console.log('🌐 请访问前端查看实时数据效果');
            console.log('⏹️  按 Ctrl+C 停止数据生成');
            
        } catch (error) {
            console.error('❌ 测试数据生成失败:', error);
        }
    }
}

export default MockDataGenerator;