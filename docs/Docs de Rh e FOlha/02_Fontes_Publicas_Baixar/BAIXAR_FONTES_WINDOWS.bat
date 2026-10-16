@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Baixando PDFs oficiais e schemas do eSocial. Requer internet e Python 3.
where py >nul 2>nul
if %errorlevel%==0 (
    py -3 baixar_fontes_oficiais.py %*
) else (
    python baixar_fontes_oficiais.py %*
)
echo.
echo Verifique DOWNLOAD_RESULTADOS.json e a pasta DOWNLOADS_OFICIAIS
pause
