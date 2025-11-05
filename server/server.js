const http = require('http');
const url = require('url');

/**
 * 简单的内存存储服务器，匹配 RemoteUser 客户端接口
 */
class RemoteUserServer {
  constructor() {
    this.users = new Map();      // userId -> { password, token }
    this.userData = new Map();   // userId -> { sceneId -> { key -> value } }
    this.tokens = new Map();     // token -> userId
    this.port = 8088;
  }

  start() {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(this.port, '127.0.0.1', () => {
      console.log(`RemoteUser server running at http://127.0.0.1:${this.port}`);
      console.log('Available endpoints:');
      console.log('  POST /register - 注册用户');
      console.log('  POST /login    - 用户登录');
      console.log('  POST /logout   - 用户登出');
      console.log('  POST /write    - 写入数据');
      console.log('  POST /read     - 读取数据');
    });

    return server;
  }

  async handleRequest(req, res) {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      this.sendResponse(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      const body = await this.parseBody(req);
      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname;

      console.log(`[${new Date().toISOString()}] ${pathname}`, body);

      let result;
      switch (pathname) {
        case '/register':
          result = this.handleRegister(body);
          break;
        case '/login':
          result = this.handleLogin(body);
          break;
        case '/logout':
          result = this.handleLogout(body);
          break;
        case '/write':
          result = this.handleWrite(body);
          break;
        case '/read':
          result = this.handleRead(body);
          break;
        default:
          result = { ok: false, error: 'Endpoint not found' };
      }

      this.sendResponse(res, 200, result);
    } catch (error) {
      console.error('Request error:', error);
      this.sendResponse(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  // 处理用户注册
  handleRegister(body) {
    const { userId, password } = body;
    
    if (!userId || !password) {
      return { ok: false, error: 'Missing userId or password' };
    }

    if (this.users.has(userId)) {
      return { ok: false, error: 'User already exists' };
    }

    // 存储用户信息
    this.users.set(userId, { password });
    this.userData.set(userId, new Map());
    
    console.log(`User registered: ${userId}`);
    return { ok: true };
  }

  // 处理用户登录
  handleLogin(body) {
    const { userId, password } = body;
    
    if (!userId || !password) {
      return { ok: false, error: 'Missing userId or password' };
    }

    const user = this.users.get(userId);
    if (!user || user.password !== password) {
      return { ok: false, error: 'Invalid credentials' };
    }

    // 生成 token
    const token = this.generateToken();
    user.token = token;
    this.tokens.set(token, userId);

    console.log(`User logged in: ${userId}`);
    return { ok: true, token };
  }

  // 处理用户登出
  handleLogout(body) {
    const { token } = body;
    
    if (!token) {
      return { ok: false, error: 'Missing token' };
    }

    const userId = this.tokens.get(token);
    if (userId) {
      const user = this.users.get(userId);
      if (user) {
        delete user.token;
      }
      this.tokens.delete(token);
      console.log(`User logged out: ${userId}`);
    }

    return { ok: true };
  }

  // 处理数据写入
  handleWrite(body) {
    const { token, sceneId, key, value } = body;
    
    if (!token || !sceneId || !key || value === undefined) {
      return { ok: false, error: 'Missing required fields' };
    }

    const userId = this.tokens.get(token);
    if (!userId) {
      return { ok: false, error: 'Invalid token' };
    }

    // 获取或创建用户的数据存储
    let userScenes = this.userData.get(userId);
    if (!userScenes) {
      userScenes = new Map();
      this.userData.set(userId, userScenes);
    }

    // 获取或创建场景的数据存储
    let sceneData = userScenes.get(sceneId);
    if (!sceneData) {
      sceneData = new Map();
      userScenes.set(sceneId, sceneData);
    }

    // 存储数据
    sceneData.set(key, value);
    
    console.log(`Data written: ${userId}/${sceneId}/${key}`);
    return { ok: true };
  }

  // 处理数据读取
  handleRead(body) {
    const { token, sceneId, key } = body;
    
    if (!token || !sceneId) {
      return { ok: false, error: 'Missing required fields' };
    }

    const userId = this.tokens.get(token);
    if (!userId) {
      return { ok: false, error: 'Invalid token' };
    }

    const userScenes = this.userData.get(userId);
    if (!userScenes) {
      return { ok: false, error: 'No data found for user' };
    }

    const sceneData = userScenes.get(sceneId);
    if (!sceneData) {
      return { ok: false, error: 'No data found for scene' };
    }

    if (key !== undefined) {
      // 读取特定键的值
      if (sceneData.has(key)) {
        return { ok: true, data: sceneData.get(key) };
      } else {
        return { ok: false, error: 'Key not found' };
      }
    } else {
      // 读取整个场景的所有数据
      const allData = {};
      for (const [k, v] of sceneData) {
        allData[k] = v;
      }
      return { ok: true, data: allData };
    }
  }

  // 生成随机 token
  generateToken() {
    return 'token_' + Math.random().toString(36).substr(2) + Date.now().toString(36);
  }
}

// 启动服务器
const server = new RemoteUserServer();
server.start();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});