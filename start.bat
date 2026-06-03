@echo off
cd /d "%~dp0"
python ttf2woff2_converter.py
if errorlevel 1 pause
