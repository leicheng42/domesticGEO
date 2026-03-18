const appName = process.env.APP_NAME || "domestic-geo";
const port = String(process.env.PORT || "3000");
const dataFile =
  process.env.DATA_FILE || "/www/wwwroot/domesticGEO-data/site-data.json";

module.exports = {
  apps: [
    {
      name: appName,
      script: "src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        APP_NAME: appName,
        PORT: port,
        DATA_FILE: dataFile,
      },
    },
  ],
};
