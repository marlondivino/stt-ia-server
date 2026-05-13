const { execSync } = require('child_process');

const ports = [3000, 9229];

console.log(`🔍 Checking ports: ${ports.join(', ')}`);

ports.forEach(port => {
  try {
    // Find PID on Windows using netstat
    const stdout = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = stdout.split('\n');
    const pids = new Set();

    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length > 4) {
        const pid = parts[parts.length - 1];
        if (pid !== '0') pids.add(pid);
      }
    });

    if (pids.size > 0) {
      pids.forEach(pid => {
        try {
          console.log(`🚀 Killing process ${pid} on port ${port}...`);
          execSync(`taskkill /F /PID ${pid}`);
        } catch (e) {
          // Process might already be gone
        }
      });
    } else {
      console.log(`✅ Port ${port} is free.`);
    }
  } catch (e) {
    // findstr returns exit code 1 if not found
    console.log(`✅ Port ${port} is free.`);
  }
});
