#!/bin/bash
cd "D:/COVERFI/frontend"

# Start HTML
cat > index.html << 'HTMLSTART'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Strata — On-Chain Credit Protection for RWA Tokens</title>
  <style>
HTMLSTART

# Inject CSS
cat parts/styles.css >> index.html

# Close style, open body
cat >> index.html << 'MIDHTML'
  </style>
</head>
<body>

<!-- === SVG DEFINITIONS (hidden, referenced inline) === -->
<div style="display:none">
MIDHTML

# Inject all SVG packs
cat parts/svg-hero-stats.html >> index.html
cat parts/svg-sections.html >> index.html
cat parts/svg-steps.html >> index.html
cat parts/svg-modals.html >> index.html

# Close hidden SVG div
echo '</div>' >> index.html
echo '' >> index.html

# Inject top HTML (nav, hero, stats)
cat parts/html-top.html >> index.html
echo '' >> index.html

# Inject main content
cat parts/html-main.html >> index.html
echo '' >> index.html

# Inject script
echo '<script>' >> index.html
cat parts/script.js >> index.html
echo '</script>' >> index.html

# Close HTML
cat >> index.html << 'HTMLEND'
</body>
</html>
HTMLEND

echo "Assembled index.html: $(wc -l < index.html) lines, $(wc -c < index.html) bytes"
