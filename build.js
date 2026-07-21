const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Directories and files to copy as-is into dist/
const staticAssets = [
    'css',
    'data',
    'images',
    'js',
    'manifest.json',
    'options.html',
    'wordlist.html',
    'help.html',
];

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
}

function cleanDist() {
    if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true });
    }
    fs.mkdirSync('dist', { recursive: true });
}

function copyStaticAssets() {
    for (const asset of staticAssets) {
        const src = path.resolve(asset);
        const dest = path.resolve('dist', asset);
        if (!fs.existsSync(src)) {
            console.warn(`Warning: ${asset} not found, skipping.`);
            continue;
        }
        copyRecursive(src, dest);
    }
}

async function build() {
    cleanDist();
    copyStaticAssets();

    // Service worker (background worker)
    await esbuild.build({
        entryPoints: ['src/background.ts'],
        bundle: true,
        outfile: 'dist/background.js',
        format: 'esm',
        target: 'chrome110',
    });

    const scripts = {
      // Content script for popup
      'src/content.ts': 'dist/content.js',
      // Word list script
      'src/wordlist.ts': 'dist/wordlist.js',
      // Options page
      'src/options.ts': 'dist/options.js',
    };

    for (const [src, outfile] of Object.entries(scripts)) {
      await esbuild.build({
          entryPoints: [src],
          bundle: true,
          outfile: outfile,
          format: 'iife',
          target: 'chrome110',
      });
    }

    console.log('Build complete, outputted to ./dist/');
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
