const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authorize = require('../auth/authUtils');
const deviceUtils = require('./deviceUtils');
const circleUtils = require('../circle/circleUtils');

// 设备操作限流
const deviceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 20,
  message: { code: 429, message: '设备操作过于频繁，请稍后再试！', data: null, error: null },
});

// 绑定设备到守护圈
router.post('/bind', authorize([1, 2, 3]), deviceLimiter, async (req, res) => {
  try {
    const { deviceSn, deviceName, circleId } = req.body;
    const userId = req.user.uid;

    if (!deviceSn || !circleId) {
      return res.status(400).json({
        code: 400,
        message: '设备序列号和守护圈ID不能为空',
        data: null,
        error: null
      });
    }

    // 检查用户是否是该守护圈的成员且有权限绑定设备
    const membership = await circleUtils.checkMembership(circleId, userId);
    if (!membership || membership.member_role > 1) {
      return res.status(403).json({
        code: 403,
        message: '只有圈主和管理员可以绑定设备',
        data: null,
        error: null
      });
    }

    // 检查设备是否已被绑定
    const existingDevice = await deviceUtils.findDeviceBySn(deviceSn);
    if (existingDevice) {
      return res.status(400).json({
        code: 400,
        message: '该设备已被绑定到其他守护圈',
        data: null,
        error: null
      });
    }

    // 绑定设备
    const deviceId = await deviceUtils.bindDevice({
      deviceSn,
      deviceName: deviceName || `Hi3516设备_${deviceSn.slice(-4)}`,
      circleId,
      boundByUid: userId
    });

    res.json({
      code: 200,
      message: '设备绑定成功',
      data: {
        deviceId,
        deviceSn,
        deviceName: deviceName || `Hi3516设备_${deviceSn.slice(-4)}`,
        circleId
      },
      error: null
    });

  } catch (error) {
    console.error('绑定设备错误:', error);
    res.status(500).json({
      code: 500,
      message: '绑定设备失败',
      data: null,
      error: error.message
    });
  }
});

// 获取守护圈的设备列表
router.get('/circle/:circleId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleId } = req.params;
    const userId = req.user.uid;

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

    // 获取设备列表
    const devices = await deviceUtils.getCircleDevices(circleId);
    
    res.json({
      code: 200,
      message: '获取设备列表成功',
      data: devices,
      error: null
    });

  } catch (error) {
    console.error('获取设备列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取设备列表失败',
      data: null,
      error: error.message
    });
  }
});

// 获取设备详情
router.get('/:deviceId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.uid;

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

    // 获取设备详细信息（包括最近事件）
    const deviceDetail = await deviceUtils.getDeviceDetail(deviceId);
    
    res.json({
      code: 200,
      message: '获取设备详情成功',
      data: deviceDetail,
      error: null
    });

  } catch (error) {
    console.error('获取设备详情错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取设备详情失败',
      data: null,
      error: error.message
    });
  }
});

// 更新设备配置
router.put('/:deviceId/config', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { deviceName, config } = req.body;
    const userId = req.user.uid;

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

    // 检查用户是否有权限修改该设备
    const membership = await circleUtils.checkMembership(device.circle_id, userId);
    if (!membership || membership.member_role > 1) {
      return res.status(403).json({
        code: 403,
        message: '只有圈主和管理员可以修改设备配置',
        data: null,
        error: null
      });
    }

    // 更新设备配置
    await deviceUtils.updateDeviceConfig(deviceId, {
      deviceName,
      config
    });
    
    res.json({
      code: 200,
      message: '设备配置更新成功',
      data: null,
      error: null
    });

  } catch (error) {
    console.error('更新设备配置错误:', error);
    res.status(500).json({
      code: 500,
      message: '更新设备配置失败',
      data: null,
      error: error.message
    });
  }
});

// 解绑设备
router.delete('/:deviceId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.uid;

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

    // 检查用户是否有权限解绑该设备
    const membership = await circleUtils.checkMembership(device.circle_id, userId);
    if (!membership || membership.member_role > 1) {
      return res.status(403).json({
        code: 403,
        message: '只有圈主和管理员可以解绑设备',
        data: null,
        error: null
      });
    }

    // 解绑设备
    await deviceUtils.unbindDevice(deviceId);
    
    res.json({
      code: 200,
      message: '设备解绑成功',
      data: null,
      error: null
    });

  } catch (error) {
    console.error('解绑设备错误:', error);
    res.status(500).json({
      code: 500,
      message: '解绑设备失败',
      data: null,
      error: error.message
    });
  }
});

// 设备心跳上报接口（供设备调用）
router.post('/:deviceSn/heartbeat', async (req, res) => {
  try {
    const { deviceSn } = req.params;
    const { firmwareVersion, status } = req.body;

    // 更新设备心跳时间和状态
    await deviceUtils.updateDeviceHeartbeat(deviceSn, {
      firmwareVersion,
      status: status || 1 // 默认在线状态
    });
    
    res.json({
      code: 200,
      message: '心跳上报成功',
      data: {
        timestamp: new Date().toISOString()
      },
      error: null
    });

  } catch (error) {
    console.error('设备心跳上报错误:', error);
    res.status(500).json({
      code: 500,
      message: '心跳上报失败',
      data: null,
      error: error.message
    });
  }
});

// 获取设备状态统计
router.get('/circle/:circleId/stats', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleId } = req.params;
    const userId = req.user.uid;

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

    // 获取设备状态统计
    const stats = await deviceUtils.getDeviceStats(circleId);
    
    res.json({
      code: 200,
      message: '获取设备统计成功',
      data: stats,
      error: null
    });

  } catch (error) {
    console.error('获取设备统计错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取设备统计失败',
      data: null,
      error: error.message
    });
  }
});

module.exports = router;