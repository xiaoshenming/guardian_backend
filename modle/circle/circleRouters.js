const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authorize = require('../auth/authUtils');
const circleUtils = require('./circleUtils');

// 创建守护圈限流：每小时最多5次
const createCircleLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 5,
  message: { code: 429, message: '创建守护圈过于频繁，请稍后再试！', data: null, error: null },
});

// 创建守护圈
router.post('/create', authorize([1, 2, 3]), createCircleLimiter, async (req, res) => {
  try {
    const { circleName, description } = req.body;
    const creatorUid = req.user.uid;

    if (!circleName) {
      return res.status(400).json({
        code: 400,
        message: '守护圈名称不能为空',
        data: null,
        error: null
      });
    }

    // 生成唯一的邀请码
    const circleCode = await circleUtils.generateUniqueCircleCode();
    
    // 创建守护圈
    const circleId = await circleUtils.createCircle({
      circleName,
      creatorUid,
      circleCode,
      description: description || ''
    });

    // 将创建者添加为圈主
    await circleUtils.addMemberToCircle(circleId, creatorUid, 0, '圈主');

    res.json({
      code: 200,
      message: '守护圈创建成功',
      data: {
        circleId,
        circleName,
        circleCode,
        description
      },
      error: null
    });

  } catch (error) {
    console.error('创建守护圈错误:', error);
    res.status(500).json({
      code: 500,
      message: '创建守护圈失败',
      data: null,
      error: error.message
    });
  }
});

// 获取用户的守护圈列表
router.get('/list', authorize([1, 2, 3]), async (req, res) => {
  try {
    const userId = req.user.uid;
    const circles = await circleUtils.getUserCircles(userId);

    res.json({
      code: 200,
      message: '获取守护圈列表成功',
      data: circles,
      error: null
    });

  } catch (error) {
    console.error('获取守护圈列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取守护圈列表失败',
      data: null,
      error: error.message
    });
  }
});

// 通过邀请码加入守护圈
router.post('/join', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleCode, memberAlias } = req.body;
    const userId = req.user.uid;

    if (!circleCode) {
      return res.status(400).json({
        code: 400,
        message: '邀请码不能为空',
        data: null,
        error: null
      });
    }

    // 查找守护圈
    const circle = await circleUtils.findCircleByCode(circleCode);
    if (!circle) {
      return res.status(404).json({
        code: 404,
        message: '邀请码无效或守护圈不存在',
        data: null,
        error: null
      });
    }

    // 检查用户是否已经是成员
    const existingMember = await circleUtils.checkMembership(circle.id, userId);
    if (existingMember) {
      return res.status(400).json({
        code: 400,
        message: '您已经是该守护圈的成员',
        data: null,
        error: null
      });
    }

    // 添加成员（默认为普通成员）
    await circleUtils.addMemberToCircle(circle.id, userId, 1, memberAlias || '成员');

    res.json({
      code: 200,
      message: '成功加入守护圈',
      data: {
        circleId: circle.id,
        circleName: circle.circle_name
      },
      error: null
    });

  } catch (error) {
    console.error('加入守护圈错误:', error);
    res.status(500).json({
      code: 500,
      message: '加入守护圈失败',
      data: null,
      error: error.message
    });
  }
});

// 获取守护圈详情
router.get('/:circleId', authorize([1, 2, 3]), async (req, res) => {
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

    // 获取守护圈详情
    const circleDetail = await circleUtils.getCircleDetail(circleId);
    
    res.json({
      code: 200,
      message: '获取守护圈详情成功',
      data: circleDetail,
      error: null
    });

  } catch (error) {
    console.error('获取守护圈详情错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取守护圈详情失败',
      data: null,
      error: error.message
    });
  }
});

// 获取守护圈成员列表
router.get('/:circleId/members', authorize([1, 2, 3]), async (req, res) => {
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

    // 获取成员列表
    const members = await circleUtils.getCircleMembers(circleId);
    
    res.json({
      code: 200,
      message: '获取成员列表成功',
      data: members,
      error: null
    });

  } catch (error) {
    console.error('获取成员列表错误:', error);
    res.status(500).json({
      code: 500,
      message: '获取成员列表失败',
      data: null,
      error: error.message
    });
  }
});

// 更新成员角色（仅圈主可操作）
router.put('/:circleId/members/:memberId/role', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleId, memberId } = req.params;
    const { memberRole, memberAlias } = req.body;
    const userId = req.user.uid;

    // 检查操作者是否是圈主
    const operatorMembership = await circleUtils.checkMembership(circleId, userId);
    if (!operatorMembership || operatorMembership.member_role !== 0) {
      return res.status(403).json({
        code: 403,
        message: '只有圈主可以修改成员角色',
        data: null,
        error: null
      });
    }

    // 更新成员角色
    await circleUtils.updateMemberRole(circleId, memberId, memberRole, memberAlias);
    
    res.json({
      code: 200,
      message: '成员角色更新成功',
      data: null,
      error: null
    });

  } catch (error) {
    console.error('更新成员角色错误:', error);
    res.status(500).json({
      code: 500,
      message: '更新成员角色失败',
      data: null,
      error: error.message
    });
  }
});

// 移除成员（仅圈主可操作）
router.delete('/:circleId/members/:memberId', authorize([1, 2, 3]), async (req, res) => {
  try {
    const { circleId, memberId } = req.params;
    const userId = req.user.uid;

    // 检查操作者是否是圈主
    const operatorMembership = await circleUtils.checkMembership(circleId, userId);
    if (!operatorMembership || operatorMembership.member_role !== 0) {
      return res.status(403).json({
        code: 403,
        message: '只有圈主可以移除成员',
        data: null,
        error: null
      });
    }

    // 不能移除自己
    if (parseInt(memberId) === userId) {
      return res.status(400).json({
        code: 400,
        message: '不能移除自己',
        data: null,
        error: null
      });
    }

    // 移除成员
    await circleUtils.removeMemberFromCircle(circleId, memberId);
    
    res.json({
      code: 200,
      message: '成员移除成功',
      data: null,
      error: null
    });

  } catch (error) {
    console.error('移除成员错误:', error);
    res.status(500).json({
      code: 500,
      message: '移除成员失败',
      data: null,
      error: error.message
    });
  }
});

// 退出守护圈
router.post('/:circleId/leave', authorize([1, 2, 3]), async (req, res) => {
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

    // 圈主不能直接退出，需要先转让圈主权限
    if (membership.member_role === 0) {
      return res.status(400).json({
        code: 400,
        message: '圈主不能直接退出，请先转让圈主权限',
        data: null,
        error: null
      });
    }

    // 退出守护圈
    await circleUtils.removeMemberFromCircle(circleId, userId);
    
    res.json({
      code: 200,
      message: '成功退出守护圈',
      data: null,
      error: null
    });

  } catch (error) {
    console.error('退出守护圈错误:', error);
    res.status(500).json({
      code: 500,
      message: '退出守护圈失败',
      data: null,
      error: error.message
    });
  }
});

module.exports = router;