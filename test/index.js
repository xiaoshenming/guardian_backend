import MockDataGenerator from './mockDataGenerator.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../.env') });

// 显示启动横幅
function showBanner() {
    console.log('\n' + '='.repeat(60));
    console.log('🛡️  Guardian智能守护系统 - 测试数据生成器');
    console.log('='.repeat(60));
    console.log('📋 功能说明:');
    console.log('   • 自动创建测试用户和守护圈');
    console.log('   • 模拟设备绑定和状态更新');
    console.log('   • 实时生成MQTT事件数据');
    console.log('   • 支持Base64图片推流');
    console.log('   • 完整的API到MQTT一条龙服务');
    console.log('\n👥 测试用户: admin, test1, test2, test3');
    console.log('🏠 守护圈: 家庭圈, 办公室圈, 学校圈');
    console.log('📱 设备类型: 摄像头, 传感器, 烟雾探测器, 环境监测器');
    console.log('='.repeat(60));
}

// 显示环境信息
function showEnvironmentInfo() {
    console.log('\n🔧 环境配置:');
    console.log(`   • 服务器地址: ${process.env.API_BASE_URL || 'http://localhost:3000'}`);
    console.log(`   • MQTT服务器: ${process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883'}`);
    console.log(`   • 数据库: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
    console.log('='.repeat(60));
}

// 显示实时统计信息
function showRealTimeStats(generator) {
    let eventCount = 0;
    let heartbeatCount = 0;
    let stateUpdateCount = 0;
    
    // 每30秒显示一次统计
    setInterval(() => {
        console.log('\n📊 实时统计 (最近30秒):');
        console.log(`   • 事件生成: ${eventCount} 条`);
        console.log(`   • 心跳发送: ${heartbeatCount} 次`);
        console.log(`   • 状态更新: ${stateUpdateCount} 次`);
        console.log(`   • 活跃设备: ${generator.devices.length} 台`);
        console.log(`   • 守护圈数: ${generator.circles.length} 个`);
        console.log('   ⏰ ' + new Date().toLocaleString());
        
        // 重置计数器
        eventCount = 0;
        heartbeatCount = 0;
        stateUpdateCount = 0;
    }, 30000);
    
    // 监听MQTT消息发送
    const originalPublish = generator.mqttClient?.publish;
    if (originalPublish) {
        generator.mqttClient.publish = function(topic, message, options, callback) {
            if (topic.includes('/event/')) eventCount++;
            else if (topic.includes('/heartbeat/')) heartbeatCount++;
            else if (topic.includes('/state/')) stateUpdateCount++;
            
            return originalPublish.call(this, topic, message, options, callback);
        };
    }
}

// 处理优雅退出
function setupGracefulShutdown(generator) {
    const shutdown = () => {
        console.log('\n\n🛑 正在停止测试数据生成器...');
        
        // 关闭MQTT连接
        if (generator.mqttClient) {
            generator.mqttClient.end();
            console.log('✅ MQTT连接已关闭');
        }
        
        console.log('✅ 测试数据生成器已停止');
        console.log('👋 感谢使用Guardian智能守护系统!');
        process.exit(0);
    };
    
    // 监听退出信号
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGQUIT', shutdown);
}

// 主函数
async function main() {
    try {
        // 显示启动信息
        showBanner();
        showEnvironmentInfo();
        
        console.log('\n🚀 正在启动测试数据生成器...');
        
        // 创建数据生成器实例
        const generator = new MockDataGenerator();
        
        // 设置优雅退出
        setupGracefulShutdown(generator);
        
        // 启动数据生成
        await generator.run();
        
        // 显示实时统计
        setTimeout(() => {
            showRealTimeStats(generator);
        }, 5000); // 5秒后开始显示统计
        
        // 显示成功信息
        console.log('\n🎉 测试数据生成器运行中!');
        console.log('💡 提示:');
        console.log('   • 打开前端应用查看实时数据');
        console.log('   • 查看控制台了解数据生成情况');
        console.log('   • 按 Ctrl+C 停止数据生成');
        
    } catch (error) {
        console.error('\n❌ 启动失败:', error.message);
        console.error('🔍 错误详情:', error);
        
        console.log('\n🛠️  故障排除建议:');
        console.log('   1. 检查后端服务是否正常运行');
        console.log('   2. 确认数据库连接是否正常');
        console.log('   3. 验证MQTT服务器是否可访问');
        console.log('   4. 检查环境变量配置是否正确');
        
        process.exit(1);
    }
}

// 启动应用
main().catch(error => {
    console.error('💥 未捕获的错误:', error);
    process.exit(1);
});

// 导出生成器类供其他模块使用
export { MockDataGenerator };