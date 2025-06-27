const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const userUtils = require('../user/userUtils');
const circleUtils = require('../circle/circleUtils');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userRooms = new Map(); // userId -> Set of roomIds
  }

  // 初始化Socket.IO服务
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // 设置中间件进行身份验证
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('未提供认证令牌'));
        }

        // 验证JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userUtils.findUserById(decoded.uid);
        
        if (!user) {
          return next(new Error('用户不存在'));
        }

        socket.userId = user.uid;
        socket.userInfo = {
          uid: user.uid,
          username: user.username,
          email: user.email,
          role: user.role
        };
        
        next();
      } catch (error) {
        console.error('Socket认证失败:', error);
        next(new Error('认证失败'));
      }
    });

    // 设置连接事件处理
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    console.log('Socket.IO服务已初始化');
  }

  // 处理客户端连接
  async handleConnection(socket) {
    const userId = socket.userId;
    const userInfo = socket.userInfo;
    
    console.log(`用户连接: ${userInfo.username} (${userId})`);
    
    // 记录用户连接
    this.connectedUsers.set(userId, socket.id);
    
    // 获取用户的守护圈并加入对应房间
    try {
      const userCircles = await circleUtils.getUserCircles(userId);
      const roomIds = new Set();
      
      for (const circle of userCircles) {
        const roomId = `circle_${circle.id}`;
        socket.join(roomId);
        roomIds.add(roomId);
        console.log(`用户 ${userInfo.username} 加入房间: ${roomId}`);
      }
      
      this.userRooms.set(userId, roomIds);
      
      // 通知守护圈成员用户上线
      for (const roomId of roomIds) {
        socket.to(roomId).emit('user_online', {
          userId,
          username: userInfo.username,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      console.error('获取用户守护圈失败:', error);
    }

    // 设置事件监听器
    this.setupEventListeners(socket);

    // 处理断开连接
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });
  }

  // 设置事件监听器
  setupEventListeners(socket) {
    const userId = socket.userId;
    const userInfo = socket.userInfo;

    // 加入守护圈房间
    socket.on('join_circle', async (data) => {
      try {
        const { circleId } = data;
        
        // 验证用户是否是该守护圈成员
        const membership = await circleUtils.checkMembership(circleId, userId);
        if (!membership) {
          socket.emit('error', { message: '您不是该守护圈的成员' });
          return;
        }
        
        const roomId = `circle_${circleId}`;
        socket.join(roomId);
        
        // 更新用户房间记录
        const userRooms = this.userRooms.get(userId) || new Set();
        userRooms.add(roomId);
        this.userRooms.set(userId, userRooms);
        
        socket.emit('joined_circle', { circleId, roomId });
        
      } catch (error) {
        console.error('加入守护圈房间失败:', error);
        socket.emit('error', { message: '加入守护圈失败' });
      }
    });

    // 离开守护圈房间
    socket.on('leave_circle', (data) => {
      const { circleId } = data;
      const roomId = `circle_${circleId}`;
      
      socket.leave(roomId);
      
      // 更新用户房间记录
      const userRooms = this.userRooms.get(userId) || new Set();
      userRooms.delete(roomId);
      this.userRooms.set(userId, userRooms);
      
      socket.emit('left_circle', { circleId, roomId });
    });

    // 发送消息到守护圈
    socket.on('send_message', async (data) => {
      try {
        const { circleId, message, messageType = 'text' } = data;
        
        // 验证用户是否是该守护圈成员
        const membership = await circleUtils.checkMembership(circleId, userId);
        if (!membership) {
          socket.emit('error', { message: '您不是该守护圈的成员' });
          return;
        }
        
        const roomId = `circle_${circleId}`;
        const messageData = {
          id: Date.now().toString(),
          circleId,
          senderId: userId,
          senderName: userInfo.username,
          message,
          messageType,
          timestamp: new Date().toISOString()
        };
        
        // 发送消息到房间内所有用户（包括发送者）
        this.io.to(roomId).emit('new_message', messageData);
        
      } catch (error) {
        console.error('发送消息失败:', error);
        socket.emit('error', { message: '发送消息失败' });
      }
    });

    // 请求在线用户列表
    socket.on('get_online_users', async (data) => {
      try {
        const { circleId } = data;
        
        // 验证用户是否是该守护圈成员
        const membership = await circleUtils.checkMembership(circleId, userId);
        if (!membership) {
          socket.emit('error', { message: '您不是该守护圈的成员' });
          return;
        }
        
        const roomId = `circle_${circleId}`;
        const room = this.io.sockets.adapter.rooms.get(roomId);
        
        if (room) {
          const onlineUsers = [];
          for (const socketId of room) {
            const clientSocket = this.io.sockets.sockets.get(socketId);
            if (clientSocket && clientSocket.userInfo) {
              onlineUsers.push({
                userId: clientSocket.userId,
                username: clientSocket.userInfo.username
              });
            }
          }
          
          socket.emit('online_users', { circleId, users: onlineUsers });
        } else {
          socket.emit('online_users', { circleId, users: [] });
        }
        
      } catch (error) {
        console.error('获取在线用户失败:', error);
        socket.emit('error', { message: '获取在线用户失败' });
      }
    });

    // 心跳检测
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date().toISOString() });
    });
  }

  // 处理客户端断开连接
  handleDisconnection(socket) {
    const userId = socket.userId;
    const userInfo = socket.userInfo;
    
    console.log(`用户断开连接: ${userInfo?.username} (${userId})`);
    
    // 移除用户连接记录
    this.connectedUsers.delete(userId);
    
    // 通知守护圈成员用户下线
    const userRooms = this.userRooms.get(userId);
    if (userRooms) {
      for (const roomId of userRooms) {
        socket.to(roomId).emit('user_offline', {
          userId,
          username: userInfo?.username,
          timestamp: new Date().toISOString()
        });
      }
      this.userRooms.delete(userId);
    }
  }

  // 向特定用户发送消息
  sendToUser(userId, event, data) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  // 向守护圈发送消息
  sendToCircle(circleId, event, data) {
    const roomId = `circle_${circleId}`;
    this.io.to(roomId).emit(event, data);
  }

  // 广播告警消息
  broadcastAlert(alert) {
    const roomId = `circle_${alert.circle_id}`;
    this.io.to(roomId).emit('new_alert', {
      id: alert.id,
      circleId: alert.circle_id,
      alertLevel: alert.alert_level,
      alertContent: alert.alert_content,
      eventType: alert.event_type,
      deviceName: alert.device_name,
      timestamp: alert.created_at
    });
  }

  // 广播事件消息
  broadcastEvent(event) {
    const roomId = `circle_${event.circle_id}`;
    this.io.to(roomId).emit('new_event', {
      id: event.id,
      circleId: event.circle_id,
      eventType: event.event_type,
      eventData: event.event_data,
      deviceName: event.device_name,
      eventTime: event.event_time,
      timestamp: event.created_at
    });
  }

  // 广播设备状态更新
  broadcastDeviceStatus(deviceUpdate) {
    const roomId = `circle_${deviceUpdate.circle_id}`;
    this.io.to(roomId).emit('device_status_update', {
      deviceId: deviceUpdate.device_id,
      deviceName: deviceUpdate.device_name,
      status: deviceUpdate.status,
      batteryLevel: deviceUpdate.battery_level,
      lastHeartbeat: deviceUpdate.last_heartbeat,
      timestamp: new Date().toISOString()
    });
  }

  // 获取在线用户数量
  getOnlineUserCount() {
    return this.connectedUsers.size;
  }

  // 获取房间用户数量
  getRoomUserCount(roomId) {
    const room = this.io.sockets.adapter.rooms.get(roomId);
    return room ? room.size : 0;
  }

  // 获取服务状态
  getStatus() {
    return {
      connected: this.io ? true : false,
      onlineUsers: this.connectedUsers.size,
      totalRooms: this.io ? this.io.sockets.adapter.rooms.size : 0
    };
  }

  // 关闭服务
  close() {
    if (this.io) {
      this.io.close();
      this.connectedUsers.clear();
      this.userRooms.clear();
      console.log('Socket.IO服务已关闭');
    }
  }
}

// 创建单例实例
const socketService = new SocketService();

module.exports = socketService;