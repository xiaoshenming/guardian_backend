// model/user/userRouter.js
const express = require("express");
const router = express.Router();
const userUtils = require("./userUtils");
const authorize = require("../auth/authUtils"); // 您的授权中间件

module.exports = router;
