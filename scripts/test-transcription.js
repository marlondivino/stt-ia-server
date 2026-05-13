const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.resolve(__dirname, 'transcribe.py');
const audioPath = path.resolve(__dirname, '..', 'samples', 'Gravando.m4a');
const pythonPath = 'python';

console.log(`🧪 Starting automated test...`);
console.log(`📜 Script: ${scriptPath}`);
console.log(`🎵 Audio: ${audioPath}`);

const args = [
  scriptPath,
  audioPath,
  '--model-size', 'base',
  '--device', 'cpu', // Use CPU for faster/reliable test in this environment
  '--compute-type', 'int8',
  '--language', 'pt'
];

const process = spawn(pythonPath, args);

let stdout = '';
let stderr = '';

process.stdout.on('data', (data) => {
  stdout += data.toString();
});

process.stderr.on('data', (data) => {
  stderr += data.toString();
  if (data.toString().includes('[whisper]')) {
    process.stderr.write(data);
  }
});

process.on('close', (code) => {
  console.log(`\n🏁 Process finished with code ${code}`);
  
  if (code === 0) {
    try {
      const result = JSON.parse(stdout);
      console.log('✅ Success! JSON parsed correctly.');
      console.log('🌐 Detected Language:', result.language);
      console.log('📝 Transcription length:', result.full_text.length);
      console.log('🔍 First 100 chars:', result.full_text.substring(0, 100));
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e.message);
      console.log('Raw stdout snippet:', stdout.substring(0, 500));
    }
  } else {
    console.error('❌ Test failed.');
    console.error('Stderr:', stderr);
  }
});
