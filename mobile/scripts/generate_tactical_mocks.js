const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../assets/visual_audit');
const QUALITIES = [40, 70];
const SIZES = [300, 600];

// Find all original images (the ones that don't have _q in their name and are not report files)
const files = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith('.jpg') && !f.includes('_q') && !f.includes('test'));

console.log(`Found ${files.length} original images. Starting comprehensive audit matrix generation...`);

files.forEach(file => {
  const baseName = path.parse(file).name;
  const inputPath = path.join(ASSETS_DIR, file);

  SIZES.forEach(size => {
    QUALITIES.forEach(q => {
      const outputFileName = `${baseName}_s${size}_q${q}.jpg`;
      const outputPath = path.join(ASSETS_DIR, outputFileName);

      console.log(`  > Generating ${outputFileName}...`);

      try {
        const cmd = `npx sharp-cli -i "${inputPath}" -o "${outputPath}" -q ${q} resize ${size} ${size}`;
        execSync(cmd, { stdio: 'ignore' });
      } catch (err) {
        console.error(`    FAILED to generate ${outputFileName}:`, err.message);
      }
    });
  });
});

// Generate the HTML Report
const htmlPath = path.join(ASSETS_DIR, 'comparison_report.html');
let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Tactical Visual Audit - Compression Matrix</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px; }
        h1 { color: #60a5fa; border-bottom: 2px solid #1e293b; padding-bottom: 10px; }
        .row { margin-bottom: 60px; }
        .row-title { font-size: 20px; font-weight: bold; margin-bottom: 20px; color: #94a3b8; }
        .grid { display: flex; gap: 20px; overflow-x: auto; padding-bottom: 20px; }
        .item { flex: 0 0 auto; background-color: #1e293b; padding: 10px; border-radius: 8px; border: 1px solid #334155; }
        .item img { display: block; border-radius: 4px; background-color: #000; }
        .label { margin-top: 10px; font-size: 12px; font-weight: bold; text-align: center; color: #60a5fa; }
        .stats { font-size: 10px; color: #64748b; margin-top: 4px; text-align: center; }
        .section-header { background-color: #3b82f6; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; margin-bottom: 20px; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
    </style>
</head>
<body>
    <h1>Tactical Visual Audit - Compression Matrix</h1>
    <p>Compare resolution and compression levels across all pre-shot logistical assets.</p>
`;

SIZES.reverse().forEach(size => {
    html += `<div class="section-header">${size}px TACTICAL STANDARD</div>`;
    
    files.forEach(file => {
        const baseName = path.parse(file).name;
        html += `<div class="row">`;
        html += `<div class="row-title">Source Asset: ${file}</div>`;
        html += `<div class="grid">`;
        
        QUALITIES.forEach(q => {
            const fileName = `${baseName}_s${size}_q${q}.jpg`;
            const stats = fs.statSync(path.join(ASSETS_DIR, fileName));
            const sizeKb = (stats.size / 1024).toFixed(1);
            
            html += `
                <div class="item">
                    <img src="${fileName}" width="${size}" height="${size}" loading="lazy" />
                    <div class="label">${q}% Quality</div>
                    <div class="stats">${sizeKb} KB</div>
                </div>
            `;
        });
        
        html += `</div></div>`;
    });
});

html += `
</body>
</html>
`;

fs.writeFileSync(htmlPath, html);
console.log(`\nSUCCESS: Audit report generated at ${htmlPath}`);
console.log('You can now open this file in your browser to perform the evaluation.');
