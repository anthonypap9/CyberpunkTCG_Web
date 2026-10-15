#!/bin/sh
# Builds dist/night-city-tcg-trainer.html (single file) and dist/cptcg-project.zip
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
npx esbuild www/js/app.js --bundle --minify --format=iife --outfile=dist/app.bundle.js --log-level=warning
python3 - <<'PY'
js=open('dist/app.bundle.js').read().replace('</script>','<\\/script>')
css=open('www/css/style.css').read()
h=open('www/index.html').read()
h=h.replace('<link rel="stylesheet" href="css/style.css">','<style>'+css+'</style>')
h=h.replace('<script type="module" src="js/app.js"></script>','<script>'+js+'</script>')
h=h.replace('<link rel="manifest" href="manifest.webmanifest">','')
open('dist/night-city-tcg-trainer.html','w').write(h)
PY
rm -f dist/app.bundle.js dist/cptcg-project.zip
zip -qr dist/cptcg-project.zip . -x 'node_modules/*' 'dist/*'
ls -la dist
