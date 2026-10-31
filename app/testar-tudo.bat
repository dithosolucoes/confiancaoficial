@echo off
rem Roda todos os testes do projeto. Dê dois cliques ou use: testar-tudo.bat --rapido
cd /d "%~dp0"
node scripts\testar-tudo.mjs %*
echo.
pause
