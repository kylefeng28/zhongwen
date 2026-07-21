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
        entryPoints: ['src/background.js'],
        bundle: true,
        outfile: 'dist/background.js',
        format: 'esm',
        target: 'chrome110',
    });

    // Content script for popup
    await esbuild.build({
        entryPoints: ['src/content.js'],
        bundle: true,
        outfile: 'dist/content.js',
        format: 'iife',
        target: 'chrome110',
    });

    // Content script for word list
    await esbuild.build({
        entryPoints: ['src/wordlist.js'],
        bundle: true,
        outfile: 'dist/wordlist.js',
        format: 'iife',
        target: 'chrome110',
    });

    const sharedFiles = ['config.js', 'options.js', 'zhuyin.js'];
    for (const file of sharedFiles) {
      await esbuild.build({
          entryPoints: [`src/shared/${file}`],
          bundle: false,
          outdir: 'dist/js',
          format: 'esm',
          target: 'chrome110',
      });
    }

    console.log('Build complete, outputted to ./dist/');
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
