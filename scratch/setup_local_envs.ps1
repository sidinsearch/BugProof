$ErrorActionPreference = "Continue"
$projectRoot = "d:\BugProof"
$skillsSource = "$projectRoot\.agents\skills"

# 1. Codex
Write-Host "Setting up project-specific Codex"
$codexDir = "$projectRoot\.Codex"
New-Item -ItemType Directory -Force -Path "$codexDir\skills" | Out-Null
Copy-Item -Path "$skillsSource\*" -Destination "$codexDir\skills" -Recurse -Force
$codexConfig = @"
[mcp_servers.gbrain]
command = "c:\\users\\siddharth\\.local\\bin\\gbrain.cmd"
args = ["serve"]
startup_timeout_sec = 20
tool_timeout_sec = 120
"@
Set-Content -Path "$codexDir\config.toml" -Value $codexConfig

# 2. OpenCode
Write-Host "Setting up project-specific OpenCode"
$opencodeDir = "$projectRoot\.opencode"
New-Item -ItemType Directory -Force -Path "$opencodeDir\skills" | Out-Null
Copy-Item -Path "$skillsSource\*" -Destination "$opencodeDir\skills" -Recurse -Force
$opencodeConfig = @"
[mcp_servers.gbrain]
command = "c:\\users\\siddharth\\.local\\bin\\gbrain.cmd"
args = ["serve"]
startup_timeout_sec = 20
tool_timeout_sec = 120
"@
Set-Content -Path "$opencodeDir\config.toml" -Value $opencodeConfig

# 3. Antigravity
Write-Host "Setting up project-specific Antigravity"
$agDir = "$projectRoot\.antigravity"
New-Item -ItemType Directory -Force -Path "$agDir\skills" | Out-Null
Copy-Item -Path "$skillsSource\*" -Destination "$agDir\skills" -Recurse -Force
$agConfig = @"
{
  "mcpServers": {
    "gbrain": {
      "command": "c:\\users\\siddharth\\.local\\bin\\gbrain.cmd",
      "args": ["serve"]
    }
  }
}
"@
Set-Content -Path "$agDir\config.json" -Value $agConfig

# 4. Claude Code
Write-Host "Setting up project-specific Claude Code"
$claudeConfig = @"
{
  "mcpServers": {
    "gbrain": {
      "command": "c:\\users\\siddharth\\.local\\bin\\gbrain.cmd",
      "args": ["serve"]
    }
  }
}
"@
Set-Content -Path "$projectRoot\.claude.json" -Value $claudeConfig

# 5. OpenClaw
Write-Host "Setting up project-specific OpenClaw"
$openclawDir = "$projectRoot\.agents"
$openclawConfig = @"
{
  "mcpServers": {
    "gbrain": {
      "command": "c:\\users\\siddharth\\.local\\bin\\gbrain.cmd",
      "args": ["serve"]
    }
  }
}
"@
Set-Content -Path "$openclawDir\config.json" -Value $openclawConfig

Write-Host "Done setting up project-specific configs."
