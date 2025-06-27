// model/user/userRouter.js
const express = require("express");
const router = express.Router();
const userUtils = require("./userUtils");
const authorize = require("../auth/authUtils"); // 您的授权中间件

// 获取个人信息接口
router.get("/info", authorize(), async (req, res) => {
  try {
    const userId = req.user.id;
    const userUid = req.user.uid || userId; // 兼容处理

    // 获取登录信息
    const loginInfo = await userUtils.findUserById(userId);
    if (!loginInfo) {
      return res.status(404).json({
        code: 404,
        message: "用户不存在",
        data: null
      });
    }

    // 获取用户详细信息
    const userProfile = await userUtils.findUserProfileById(loginInfo.uid);
    if (!userProfile) {
      return res.status(404).json({
        code: 404,
        message: "用户资料不存在",
        data: null
      });
    }

    // 返回用户信息（排除隐私数据）
    const userInfo = {
      id: userProfile.id,
      username: userProfile.username,
      email: userProfile.email,
      phone_number: userProfile.phone_number,
      avatar_url: userProfile.avatar_url,
      gender: userProfile.gender,
      status: userProfile.status,
      last_login_time: userProfile.last_login_time,
      create_time: userProfile.create_time,
      role: loginInfo.role
      // 排除敏感信息如 id_card, wechat_openid, wechat_unionid
    };

    res.json({
      code: 200,
      message: "获取用户信息成功",
      data: userInfo
    });

  } catch (error) {
    console.error("获取用户信息错误:", error);
    res.status(500).json({
      code: 500,
      message: "服务器内部错误",
      data: null
    });
  }
});

// 四级权限测试接口

// 1. 无权限测试接口 (role: 0)
router.get("/test/no-permission", authorize([0]), async (req, res) => {
  res.json({
    code: 200,
    message: "无权限用户测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [0],
      description: "此接口仅允许角色为0（无权限）的用户访问"
    }
  });
});

// 2. 普通用户测试接口 (role: 1)
router.get("/test/normal-user", authorize([1]), async (req, res) => {
  res.json({
    code: 200,
    message: "普通用户测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [1],
      description: "此接口仅允许角色为1（普通用户）的用户访问"
    }
  });
});

// 3. 管理员测试接口 (role: 2)
router.get("/test/admin", authorize([2]), async (req, res) => {
  res.json({
    code: 200,
    message: "管理员测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [2],
      description: "此接口仅允许角色为2（管理员）的用户访问"
    }
  });
});

// 4. 超级管理员测试接口 (role: 3)
router.get("/test/super-admin", authorize([3]), async (req, res) => {
  res.json({
    code: 200,
    message: "超级管理员测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [3],
      description: "此接口仅允许角色为3（超级管理员）的用户访问"
    }
  });
});

// 5. 多角色权限测试接口 (role: 1,2,3)
router.get("/test/multi-role", authorize([1, 2, 3]), async (req, res) => {
  res.json({
    code: 200,
    message: "多角色权限测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [1, 2, 3],
      description: "此接口允许角色为1（普通用户）、2（管理员）、3（超级管理员）的用户访问"
    }
  });
});

// 6. 无角色限制测试接口（任何已登录用户都可访问）
router.get("/test/any-user", authorize(), async (req, res) => {
  res.json({
    code: 200,
    message: "无角色限制测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: "任何已登录用户",
      description: "此接口允许任何已登录的用户访问，无角色限制"
    }
  });
});

module.exports = router;
