/**
 * MASSIVE TRANSCRIPTION TEST SCRIPT (Native Node v22+)
 * 
 * Purpose: Automated bulk testing of STT REST API with token management,
 * statistical summaries, and persistent JSON results.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { openAsBlob } = require('node:fs');

// Configuration from Environment or Defaults
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_URL = BASE_URL.endsWith('/api') ? BASE_URL : `${BASE_URL.replace(/\/$/, '')}/api`;

const USERNAME = process.env.ADMIN_USERNAME || 'user';
const PASSWORD = process.env.ADMIN_PASSWORD || 'password';
const CONCURRENCY = parseInt(process.env.TEST_CONCURRENCY || '3');
const POLL_INTERVAL = 5000;
const MAX_POLL_ATTEMPTS = 120;

// MIME Type Mapping for Audio Files
const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac'
};

class TranscriptionTester {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.token = null;
    this.tokenExpiry = 0;
    this.stats = {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      startTime: Date.now(),
      errors: []
    };
    this.supportedExtensions = Object.keys(MIME_TYPES);
  }

  /**
   * 1. Get Token / Authentication Logic
   */
  async ensureAuthenticated() {
    const now = Date.now() / 1000;
    if (!this.token || (this.tokenExpiry - now) < 300) {
      try {
        console.log(`🔑 Authenticating at ${API_URL}/auth/login ...`);
        const response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: USERNAME, password: PASSWORD })
        });

        if (!response.ok) throw new Error(`Auth status: ${response.status} at ${API_URL}/auth/login`);
        
        const data = await response.json();
        this.token = data.access_token;
        
        try {
          const payload = JSON.parse(Buffer.from(this.token.split('.')[1], 'base64').toString());
          this.tokenExpiry = payload.exp;
        } catch (e) {
          this.tokenExpiry = now + 3600;
        }
        
        console.log(`✅ Token obtained. Expires in: ${Math.round((this.tokenExpiry - now) / 60)} min`);
      } catch (error) {
        throw new Error(`Authentication failed: ${error.message}`);
      }
    }
  }

  /**
   * 2. Job Scheduling & 3. Validation
   */
  async processFile(filePath) {
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const resultPath = filePath.replace(path.extname(filePath), '.json');
    const mimeType = MIME_TYPES[ext];

    if (!mimeType) {
      throw new Error(`Unsupported file extension: ${ext}`);
    }

    try {
      await this.ensureAuthenticated();

      // Step 2: Upload / Schedule
      console.log(`🚀 [${fileName}] Uploading as ${mimeType} ...`);
      
      const formData = new FormData();
      // Using openAsBlob with explicit type to satisfy server-side Multer validation
      const blob = await openAsBlob(filePath, { type: mimeType });
      formData.append('audio', blob, fileName);

      const uploadRes = await fetch(`${API_URL}/process`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: formData
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.message || `Upload failed with status ${uploadRes.status}`);
      }

      const { jobId } = await uploadRes.json();
      console.log(`⏳ [${fileName}] Job scheduled: ${jobId}`);

      // Step 3: Poll for readiness
      let attempts = 0;
      let completed = false;
      let jobResult = null;

      while (!completed && attempts < MAX_POLL_ATTEMPTS) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

        const statusRes = await fetch(`${API_URL}/status/${jobId}`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });

        if (statusRes.status === 401) {
          await this.ensureAuthenticated();
          continue;
        }

        if (!statusRes.ok) throw new Error(`Status check failed: ${statusRes.status}`);

        const statusData = await statusRes.json();
        if (statusData.status === 'completed') {
          completed = true;
          jobResult = statusData.result;
        } else if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Job processing failed on server');
        }
      }

      if (!completed) throw new Error('Polling timeout reached');

      // Step 4: Generate JSON File
      const output = {
        source: fileName,
        processedAt: new Date().toISOString(),
        jobId,
        transcription: jobResult.transcription,
        summary: jobResult.summary,
        metadata: {
          attempts,
          duration: Math.round((Date.now() - this.stats.startTime) / 1000)
        }
      };

      await fs.writeFile(resultPath, JSON.stringify(output, null, 2));
      console.log(`✨ [${fileName}] Success! Saved to ${path.basename(resultPath)}`);
      this.stats.success++;

    } catch (error) {
      console.error(`❌ [${fileName}] Failed:`, error.message);
      this.stats.failed++;
      this.stats.errors.push({ file: fileName, error: error.message });
    } finally {
      this.stats.processed++;
      this.printProgress();
    }
  }



  printProgress() {
    const percent = Math.round((this.stats.processed / (this.stats.total || 1)) * 100);
    const elapsed = Math.round((Date.now() - this.stats.startTime) / 1000);
    process.stdout.write(`\r📊 Progress: ${percent}% (${this.stats.processed}/${this.stats.total}) | Success: ${this.stats.success} | Failed: ${this.stats.failed} | Elapsed: ${elapsed}s`);
  }

  async run() {
    console.log(`\n📂 Scanning directory: ${this.directory}`);
    
    const files = await fs.readdir(this.directory);
    const audioFiles = [];
    let ignoredCount = 0;

    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      if (this.supportedExtensions.includes(ext)) {
        audioFiles.push(path.join(this.directory, f));
      } else if (ext !== '.json' && ext !== '') {
        ignoredCount++;
      }
    }

    this.stats.total = audioFiles.length;

    if (ignoredCount > 0) {
      console.log(`ℹ️  Ignored ${ignoredCount} files with unsupported extensions.`);
    }

    if (this.stats.total === 0) {
      console.log('⚠️ No supported audio files found.');
      return;
    }

    console.log(`📋 Found ${this.stats.total} files. Starting processing with concurrency=${CONCURRENCY}...\n`);

    const pool = [];
    for (const file of audioFiles) {
      if (pool.length >= CONCURRENCY) {
        await Promise.race(pool);
      }
      
      const p = this.processFile(file).then(() => {
        pool.splice(pool.indexOf(p), 1);
      });
      pool.push(p);
    }
    
    await Promise.all(pool);
    this.printSummary();
  }

  printSummary() {
    const totalTime = (Date.now() - this.stats.startTime) / 1000;
    console.log(`\n\n=========================================`);
    console.log(`🏁 TEST EXECUTION COMPLETE`);
    console.log(`=========================================`);
    console.log(`⏱️  Total Duration: ${totalTime.toFixed(2)}s`);
    console.log(`📈 Success Rate:  ${((this.stats.success / (this.stats.total || 1)) * 100).toFixed(1)}%`);
    console.log(`✅ Completed:     ${this.stats.success}`);
    console.log(`❌ Failed:        ${this.stats.failed}`);
    console.log(`📦 Total Files:   ${this.stats.total}`);
    
    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️ ERROR LOG:`);
      this.stats.errors.forEach(e => console.log(` - ${e.file}: ${e.error}`));
    }
    console.log(`=========================================\n`);
  }
}

const targetDir = process.argv[2] || './samples';
const tester = new TranscriptionTester(targetDir);
tester.run().catch(err => {
  console.error('💥 Fatal Error:', err);
  process.exit(1);
});

