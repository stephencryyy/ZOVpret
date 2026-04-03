@echo off
chcp 65001 >nul
title ZOVpret Setup

echo ============================================
echo   ZOVpret - Установка зависимостей
echo ============================================
echo.

:: Проверка Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден!
    echo Скачайте и установите Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js найден:
node --version
echo.

:: Установка зависимостей
echo [1/2] Установка npm пакетов...
call npm install
if %errorlevel% neq 0 (
    echo [ОШИБКА] npm install завершился с ошибкой
    pause
    exit /b 1
)
echo [OK] Зависимости установлены
echo.

:: Запуск dev-сервера
echo [2/2] Запуск приложения в dev-режиме...
echo.
echo ============================================
echo   Приложение запускается...
echo   Нажмите Ctrl+C для остановки
echo ============================================
echo.
call npm run dev

pause
