@echo off
cd /d "%~dp0"
python ttf2woff2.py
if errorlevel 1 pause
