const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authorize = require('../auth/authUtils');
const eventUtils = require('./eventUtils');
const circleUtils = require('../circle/circleUtils');
const deviceUtils = require('../device/deviceUtils');

// 事件上报限流
const eventReportLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100, // 设备可能频繁上报事件
  message: { code: 429, message: '事件上报过于频繁，请稍后再试！', data: null, error: null },
});

// 设备事件上报接口（供设备调用）
router.post('/report', eventReportLimiter, async (req, res) => {
  try {
    const { deviceSn, eventType, eventData, eventTime } = req.body;

    if (!deviceSn || !eventType) {
      return res.status(400).json({
        code: 400,
        message: '设备序列号和事件类型不能为空',
        data: null,
        error: null
      });
    }

    // 查找设备
    const device = await deviceUtils.findDeviceBySn(deviceSn);
    if (!device) {
      return res.status(404).json({
        code: 404,
        message: '设备不存在或未绑定',
        data: null,
        error: null
      });
    }

    // 记录事件
    const eventId = await eventUtils.createEvent({
      deviceId: device.id,
      circleId: device.circle_id,
      eventType,
      eventData: eventData || {},
      eventTime: eventTime || new Date()
    });

    // 根据事件类型判断是否需要生成告警
    const shouldAlert = await eventUtils.shouldGenerateAlert(eventType, eventData);
    if (shouldAlert) {
      await eventUtils.generateAlert({
        eventId,
        circleId: device.circle_id,
        alertLevel: eventUtils.getAlertLevel(eventType),
        alertContent: eventUtils.generateAlertContent(eventType, eventData, device)
      });
    }

    // 更新设备心跳时间
    await deviceUtils.updateDeviceHeartbeat(deviceSn, { status: 1 });

    res.json({
      code: 200,
      message: '事件上报成功',
      data: {
        eventId,
        timestamp: new Date().toISOString()
      },
      error: null
    });

  } catch (error) {
    console.error('事件上报错误:', error);
    res.status(500).json({
      code: 500,
      message: '事件上报失败',
      data: null,
      error: error.message
    });
  }
});

// 获取守护圈的事件列表
router.get('/circle/:circleId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { page = 1, limit = 20, eventType, startDate, endDate } = req.query;
    const userId = req.user.id;

    // 检查用户是否是该守护圈的成员
    const membership = await circleUtils.checkMembership(circleId, userId);
    if (!membership) {
      return res.status(403).json({
        code: 403,
        message: '您不是该守护圈的成员',
        data: null,
        error: null
      });
    }

    // 获取事件列表
    const events = await eventUtils.getCircleEvents(circleId, {
      page: parseInt(page),
      limit: parseInt(limit),
      eventType,
      startDate,
      endDate
    });
    
    res.json({
      code: 200,
      message: '获取事件列表成功',
      data: events,
      error: null
    });

  } catch (error) {
    console.error('获取事件列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取事件列表失败',
      data: null,
      error: error.message
    });
  }
});

// 获取设备的事件列表
router.get('/device/:deviceId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { page = 1, limit = 20, eventType, startDate, endDate } = req.query;
    const userId = req.user.id;

    // 获取设备信息
    const device = await deviceUtils.getDeviceById(deviceId);
    if (!device) {
      return res.status(404).json({
        code: 404,
        message: '设备不存在',
        data: null,
        error: null
      });
    }

    // 检查用户是否有权限访问该设备
    const membership = await circleUtils.checkMembership(device.circle_id, userId);
    if (!membership) {
      return res.status(403).json({
        code: 403,
        message: '您没有权限访问该设备',
        data: null,
        error: null
      });
    }

    // 获取设备事件列表
    const events = await eventUtils.getDeviceEvents(deviceId, {
      page: parseInt(page),
      limit: parseInt(limit),
      eventType,
      startDate,
      endDate
    });
    
    res.json({
      code: 200,
      message: '获取设备事件列表成功',
      data: events,
      error: null
    });

  } catch (error) {
    console.error('获取设备事件列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取设备事件列表失败',
      data: null,
      error: error.message
    });
  }
});

// 获取最近事件列表
router.get('/recent', authorize(), async (req, res) => {
  try {
    const { limit = 10, event_type } = req.query;
    const userId = req.user.uid || req.user.id;
    
    // 获取用户的所有守护圈
    const userCircles = await circleUtils.getUserCircles(userId);
    
    if (userCircles.length === 0) {
      return res.json({
        code: 200,
        message: '获取最近事件成功',
        data: {
          list: [],
          total: 0
        },
        error: null
      });
    }
    
    // 获取用户所有守护圈的最近事件
    const circleIds = userCircles.map(circle => circle.id);
    const events = await eventUtils.getRecentEvents({
      circleIds,
      limit: parseInt(limit),
      eventType: event_type
    });
    
    res.json({
      code: 200,
      message: '获取最近事件成功',
      data: {
        list: events,
        total: events.length
      },
      error: null
    });
    
  } catch (error) {
    console.error('获取最近事件错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取最近事件失败',
      data: null,
      error: error.message
    });
  }
});

// 获取告警列表
router.get('/alerts/circle/:circleId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { page = 1, limit = 20, status, alertLevel } = req.query;
    const userId = req.user.id;

    // 检查用户是否是该守护圈的成员
    const membership = await circleUtils.checkMembership(circleId, userId);
    if (!membership) {
      return res.status(403).json({
        code: 403,
        message: '您不是该守护圈的成员',
        data: null,
        error: null
      });
    }

    // 获取告警列表
    const alerts = await eventUtils.getCircleAlerts(circleId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status: status ? parseInt(status) : undefined,
      alertLevel: alertLevel ? parseInt(alertLevel) : undefined
    });
    
    res.json({
      code: 200,
      message: '获取告警列表成功',
      data: alerts,
      error: null
    });

  } catch (error) {
    console.error('获取告警列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取告警列表失败',
      data: null,
      error: error.message
    });
  }
});

// 确认告警
router.put('/alerts/:alertId/acknowledge', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;

    // 获取告警信息
    const alert = await eventUtils.getAlertById(alertId);
    if (!alert) {
      return res.status(404).json({
        code: 404,
        message: '告警不存在',
        data: null,
        error: null
      });
    }

    // 检查用户是否有权限确认该告警
    const membership = await circleUtils.checkMembership(alert.circle_id, userId);
    if (!membership) {
      return res.status(403).json({
        code: 403,
        message: '您没有权限确认该告警',
        data: null,
        error: null
      });
    }

    // 确认告警
    await eventUtils.acknowledgeAlert(alertId, userId);
    
    res.json({
      code: 200,
      message: '告警确认成功',
      data: null,
      error: null
    });

  } catch (error) {
    console.error('确认告警错误:', error);
    res.status(500).json({
      code: 500,
      message: '确认告警失败',
      data: null,
      error: error.message
    });
  }
});

// 获取事件列表（通用接口，支持分页和状态筛选）
router.get('/', authorize(), async (req, res) => {
  try {
    const { page = 1, pageSize = 10, status } = req.query;
    const userId = req.user.uid || req.user.id;
    
    // 获取用户的所有守护圈
    const userCircles = await circleUtils.getUserCircles(userId);
    
    if (userCircles.length === 0) {
      return res.json({
        code: 200,
        message: '获取事件列表成功',
        data: {
          list: [],
          total: 0,
          page: parseInt(page),
          pageSize: parseInt(pageSize)
        },
        error: null
      });
    }
    
    // 获取用户所有守护圈的事件列表
    const circleIds = userCircles.map(circle => circle.id);
    const events = await eventUtils.getAllEvents({
      circleIds,
      page: parseInt(page),
      limit: parseInt(pageSize),
      status: status === 'pending' ? 0 : (status === 'handled' ? 1 : undefined)
    });
    
    res.json({
      code: 200,
      message: '获取事件列表成功',
      data: {
        list: events.list,
        total: events.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      },
      error: null
    });
    
  } catch (error) {
    console.error('获取事件列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取事件列表失败',
      data: null,
      error: error.message
    });
  }
});

// 获取未处理事件数量（兼容前端调用）
router.get('/pending-count', authorize(), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    
    // 获取用户的所有守护圈
    const userCircles = await circleUtils.getUserCircles(userId);
    
    if (userCircles.length === 0) {
      return res.json({
        code: 200,
        message: '获取未处理事件数量成功',
        data: {
          count: 0
        },
        error: null
      });
    }
    
    // 获取用户所有守护圈的未处理事件数量
    const circleIds = userCircles.map(circle => circle.id);
    const count = await eventUtils.getUnhandledEventCount(circleIds);
    
    res.json({
      code: 200,
      message: '获取未处理事件数量成功',
      data: {
        count
      },
      error: null
    });
    
  } catch (error) {
    console.error('获取未处理事件数量错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取未处理事件数量失败',
      data: null,
      error: error.message
    });
  }
});

// 获取未处理事件数量
router.get('/unhandled-count', authorize(), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    
    // 获取用户的所有守护圈
    const userCircles = await circleUtils.getUserCircles(userId);
    
    if (userCircles.length === 0) {
      return res.json({
        code: 200,
        message: '获取未处理事件数量成功',
        data: {
          count: 0
        },
        error: null
      });
    }
    
    // 获取用户所有守护圈的未处理事件数量
    const circleIds = userCircles.map(circle => circle.id);
    const count = await eventUtils.getUnhandledEventCount(circleIds);
    
    res.json({
      code: 200,
      message: '获取未处理事件数量成功',
      data: {
        count
      },
      error: null
    });
    
  } catch (error) {
    console.error('获取未处理事件数量错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取未处理事件数量失败',
      data: null,
      error: error.message
    });
  }
});

// 处理单个事件
router.post('/:eventId/handle', authorize(), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status, note } = req.body;
    const userId = req.user.uid || req.user.id;

    // 获取事件详情（这里假设是告警ID）
    const alert = await eventUtils.getAlertById(eventId);
    if (!alert) {
      return res.status(404).json({
        code: 404,
        message: '事件不存在',
        data: null,
        error: null
      });
    }

    // 检查用户是否有权限处理该事件
    const membership = await circleUtils.checkMembership(alert.circle_id, userId);
    if (!membership) {
      return res.status(403).json({
        code: 403,
        message: '您没有权限处理该事件',
        data: null,
        error: null
      });
    }

    // 处理事件（确认告警）
    await eventUtils.handleAlert(eventId, userId, { status, note });
    
    res.json({
      code: 200,
      message: '事件处理成功',
      data: null,
      error: null
    });

  } catch (error) {
    console.error('处理事件错误:', error);
    res.status(500).json({
      code: 500,
      message: '处理事件失败',
      data: null,
      error: error.message
    });
  }
});

// 批量处理事件
router.post('/batch-handle', authorize(), async (req, res) => {
  try {
    const { ids, status, note } = req.body;
    const userId = req.user.uid || req.user.id;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '事件ID列表不能为空',
        data: null,
        error: null
      });
    }

    // 批量处理事件
    const results = await eventUtils.batchHandleAlerts(ids, userId, { status, note });
    
    res.json({
      code: 200,
      message: '批量处理事件成功',
      data: {
        processed: results.processed,
        failed: results.failed
      },
      error: null
    });

  } catch (error) {
    console.error('批量处理事件错误:', error);
    res.status(500).json({
      code: 500,
      message: '批量处理事件失败',
      data: null,
      error: error.message
    });
  }
});

// 获取事件统计
router.get('/stats/circle/:circleId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleId } = req.params;
    const { period = 'today' } = req.query; // today, week, month
    const userId = req.user.id;

    // 检查用户是否是该守护圈的成员
    const membership = await circleUtils.checkMembership(circleId, userId);
    if (!membership) {
      return res.status(403).json({
        code: 403,
        message: '您不是该守护圈的成员',
        data: null,
        error: null
      });
    }

    // 获取事件统计
    const stats = await eventUtils.getEventStats(circleId, period);
    
    res.json({
      code: 200,
      message: '获取事件统计成功',
      data: stats,
      error: null
    });

  } catch (error) {
    console.error('获取事件统计错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取事件统计失败',
      data: null,
      error: error.message
    });
  }
});

// 获取事件详情 (参数化路由放在最后，避免与具体路由冲突)
router.get('/:eventId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    // 获取事件详情
    const event = await eventUtils.getEventDetail(eventId);
    if (!event) {
      return res.status(404).json({
        code: 404,
        message: '事件不存在',
        data: null,
        error: null
      });
    }

    // 检查用户是否有权限访问该事件
    const membership = await circleUtils.checkMembership(event.circle_id, userId);
    if (!membership) {
      return res.status(403).json({
        code: 403,
        message: '您没有权限访问该事件',
        data: null,
        error: null
      });
    }
    
    res.json({
      code: 200,
      message: '获取事件详情成功',
      data: event,
      error: null
    });

  } catch (error) {
    console.error('获取事件详情错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取事件详情失败',
      data: null,
      error: error.message
    });
  }
});

module.exports = router;