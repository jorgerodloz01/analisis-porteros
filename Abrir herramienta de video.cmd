@echo off
chcp 65001 >nul
title Herramienta de video - Analisis Porteros
cd /d "%~dp0"
where node >nul 2>nul || (echo No encuentro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo. & pause & exit /b 1)
node video\servidor.mjs
if errorlevel 1 pause
