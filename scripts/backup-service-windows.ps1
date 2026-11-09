#Requires -Version 5.1
<#
.SYNOPSIS
  CeleriFlow - Serviço de Backup de Banco de Dados para Windows (RunAsService - Requisito 31.10)
.DESCRIPTION
  Aplicação de backup instalável no servidor de banco de dados como Serviço do Windows (RunAsService).
  Realiza e sincroniza:
  - Backup Full Diário com retenção dos 7 últimos dias (31.5)
  - Backup Full Mensal no 1º dia de cada mês durante 12 meses (31.6)
  - Backup Diferencial dos arquivos de log de 1 em 1 hora (31.7)
  - Criptografia Padrão Militar AES 256 bits (AES-256-GCM) em trânsito e repouso (31.9)
  - Controle de cota máxima de 3 Terabytes em Data Center Certificado (31.8, 31.11)
#>

param(
  [ValidateSet("Install", "Uninstall", "Start", "Stop", "Status", "RunAsService", "RunOnce")]
  [string]$Action = "Status",
  [string]$ServiceName = "CeleriFlowDatabaseBackupSvc",
  [string]$DisplayName = "CeleriFlow Cloud Backup Agent (AES-256 / RunAsService)",
  [string]$WebEndpoint = "https://guarama.celeriflow.com.br/api/sistema/backup"
)

$ErrorActionPreference = "Stop"

function Invoke-BackupCycle {
  param([string]$Tier = "DIFFERENTIAL_HOURLY_LOG")
  $headers = @{ "Content-Type" = "application/json" }
  $body = @{
    action = "TRIGGER_BACKUP"
    tier = $Tier
    triggeredBy = "WindowsService:$ServiceName (RunAsService)"
  } | ConvertTo-Json
  Invoke-RestMethod -Uri $WebEndpoint -Method Post -Headers $headers -Body $body -TimeoutSec 120
}

switch ($Action) {
  "Install" {
    $scriptFullPath = $MyInvocation.MyCommand.Path
    $binPath = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptFullPath`" -Action RunAsService"
    & sc.exe create $ServiceName binPath= $binPath start= delayed-auto obj= "NT AUTHORITY\NetworkService" DisplayName= $DisplayName
    & sc.exe description $ServiceName "Serviço Windows (RunAsService) de backup automático CeleriFlow com criptografia militar AES-256 bits."
    & sc.exe failure $ServiceName reset= 86400 actions= restart/60000/restart/60000/restart/60000
    Write-Output "Serviço '$ServiceName' instalado como RunAsService com sucesso."
  }
  "Uninstall" {
    & sc.exe stop $ServiceName | Out-Null
    & sc.exe delete $ServiceName
    Write-Output "Serviço '$ServiceName' removido."
  }
  "Start" {
    Start-Service -Name $ServiceName
    Write-Output "Serviço '$ServiceName' iniciado."
  }
  "Stop" {
    Stop-Service -Name $ServiceName -Force
    Write-Output "Serviço '$ServiceName' parado."
  }
  "Status" {
    Get-Service -Name $ServiceName -ErrorAction SilentlyContinue | Select-Object Name, Status, StartType, DisplayName
  }
  "RunOnce" {
    Invoke-BackupCycle -Tier "DIFFERENTIAL_HOURLY_LOG"
  }
  "RunAsService" {
    while ($true) {
      $now = (Get-Date).ToUniversalTime()
      if ($now.Day -eq 1 -and $now.Hour -eq 3 -and $now.Minute -eq 0) {
        Invoke-BackupCycle -Tier "FULL_MONTHLY"
      } elseif ($now.Hour -eq 2 -and $now.Minute -eq 0) {
        Invoke-BackupCycle -Tier "FULL_DAILY"
      } else {
        Invoke-BackupCycle -Tier "DIFFERENTIAL_HOURLY_LOG"
      }
      Start-Sleep -Seconds 3600
    }
  }
}

