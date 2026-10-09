/**
 * PM2 on the VPS:  cd ~/BoliBazaar/backend && pm2 start ecosystem.config.cjs && pm2 save
 * Settings come from backend/.env (loaded by src/core/config/env.js), never from this file.
 */
module.exports = {
  apps: [
    {
      name: 'bolibazaar-backend',
      cwd: __dirname,
      script: 'src/server.js',
      exec_mode: 'fork',
      instances: 1, // the in-process schedulers expect one instance unless Redis/BullMQ are on
      max_memory_restart: '700M',
      restart_delay: 3000,
      exp_backoff_restart_delay: 200,
      time: true,
    },
  ],
};
