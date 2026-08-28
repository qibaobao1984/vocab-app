@echo off
title Vocab Local Server
echo Starting local server...
echo If the browser does not open, visit: http://localhost:8787/
echo.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0serve.ps1"
echo.
echo Server stopped.
pause
