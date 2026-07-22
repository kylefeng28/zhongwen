const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const name = 'zhongwen';
const distDir = path.resolve('dist');
const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf-8'));
const version = manifest.version;
const outFile = path.resolve(`${name}-${version}.zip`);

// Remove old zip if it exists
if (fs.existsSync(outFile)) {
    fs.unlinkSync(outFile);
}

// Create zip from the dist/ directory contents
execSync(`cd "${distDir}" && zip -r "${outFile}" . -x "*.DS_Store"`, { stdio: 'inherit' });

const stats = fs.statSync(outFile);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

console.log(`\nPackaged: ${path.basename(outFile)} (${sizeMB} MB)`);
console.log(`Upload this file to the Chrome Web Store Developer Dashboard.`);
