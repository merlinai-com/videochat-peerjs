// pm2.config.cjs

module.exports = {
    apps: [
      {
        name: "server",
        script: "./server.js",
        watch: ["server.js"],
        watch_options: {
          followSymlinks: false,
          usePolling: true,
          interval: 1000,
          binaryInterval: 3000,
          useFsEvents: false,
          persistent: true,
        },
      },
    ],
  };