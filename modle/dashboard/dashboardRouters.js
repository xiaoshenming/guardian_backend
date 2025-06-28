const express = require('express');
const router = express.Router();
const authorize = require('../auth/authUtils');
const circleUtils = require('../circle/circleUtils');
const deviceUtils = require('../device/deviceUtils');
const eventUtils = require('../event/eventUtils');

// 获取仪表板统计信息
router.get('/stats', authorize(), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    
    // 获取用户的守护圈列表
    const userCircles = await circleUtils.getUserCircles(userId);
    const totalCircles = userCircles.length;
    
    // 统计所有守护圈的设备数量
    let totalDevices = 0;
    let onlineDevices = 0;
    let urgentAlerts = 0;
    let todayEvents = 0;
    
    for (const circle of userCircles) {
      // 获取守护圈设备统计
      const deviceStats = await deviceUtils.getDeviceStats(circle.id);
      totalDevices += deviceStats.total_devices || 0;
      onlineDevices += deviceStats.online_devices || 0;
      todayEvents += deviceStats.today_events || 0;
      
      // 获取紧急告警数量（今日）
      const alertStats = await eventUtils.getAlertStats(circle.id);
      urgentAlerts += alertStats.urgent_today || 0;
    }
    
    res.json({
      code: 200,
      message: "获取仪表板统计信息成功",
      data: {
        totalCircles,
        totalDevices,
        onlineDevices,
        urgentAlerts,
        todayEvents
      },
      error: null
    });
    
  } catch (error) {
    console.error("获取仪表板统计信息错误:", error);
    res.status(500).json({
      code: 500,
      message: "获取仪表板统计信息失败",
      data: null,
      error: error.message
    });
  }
});

// 获取实时数据
router.get('/realtime', authorize(), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    
    // 获取用户的守护圈列表
    const userCircles = await circleUtils.getUserCircles(userId);
    
    let onlineDevices = 0;
    const recentEvents = [];
    
    for (const circle of userCircles) {
      // 获取在线设备数量
      const deviceStats = await deviceUtils.getDeviceStats(circle.id);
      onlineDevices += deviceStats.online_devices || 0;
    }
    
    // 获取最近事件
    if (userCircles.length > 0) {
      const circleIds = userCircles.map(circle => circle.id);
      const events = await eventUtils.getRecentEvents({
        circleIds,
        limit: 5
      });
      recentEvents.push(...events);
    }
    
    res.json({
      code: 200,
      message: "获取实时数据成功",
      data: {
        onlineDevices,
        recentEvents,
        systemStatus: 'normal'
      },
      error: null
    });
    
  } catch (error) {
    console.error("获取实时数据错误:", error);
    res.status(500).json({
      code: 500,
      message: "获取实时数据失败",
      data: null,
      error: error.message
    });
  }
});

module.exports = router;