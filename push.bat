@echo off
REM One-shot publish for anthonypap9/CyberpunkTCG_Web. Run from the project folder (double-click or from cmd).
cd /d "%~dp0"
if not exist .git git init
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/anthonypap9/CyberpunkTCG_Web.git
git add -A
git commit -m "Night City TCG Trainer: art, music, packs and profiles"
git pull origin main --allow-unrelated-histories --no-edit -X ours 2>nul
git push -u origin main
echo.
echo Done. Now set Settings - Pages - Source - GitHub Actions on the repo.
pause
