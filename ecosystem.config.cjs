module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || "domestic-geo",
      script: "src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        DATA_FILE: "/www/wwwroot/domesticGEO-data/site-data.json",
      },
    },
  ],
};
