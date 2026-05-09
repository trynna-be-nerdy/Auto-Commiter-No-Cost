module.exports = {
  apps: [
    {
      name: 'auto-commit-vtb',
      script: 'C:\\Users\\sriva\\VtB\\git-auto-commit\\dist\\index.js',
      cwd: 'C:\\Users\\sriva\\vtb',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'auto-commit-self',
      script: 'C:\\Users\\sriva\\VtB\\git-auto-commit\\dist\\index.js',
      cwd: 'C:\\Users\\sriva\\VtB\\git-auto-commit',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
