$ErrorActionPreference = "Continue"

$gstackPath = "C:\Users\siddharth\.claude\skills\gstack"
Set-Location $gstackPath

Write-Host "Running bun gen:skill-docs --host opencode"
bun run gen:skill-docs --host opencode

Write-Host "Running bun gen:skill-docs --host antigravity"
bun run gen:skill-docs --host antigravity

# OpenCode setup
Write-Host "Setting up OpenCode"
$opencodePath = "C:\Users\siddharth\.opencode"
New-Item -ItemType Directory -Force -Path "$opencodePath\skills" | Out-Null
if (Test-Path "$gstackPath\.opencode\skills") {
    Copy-Item -Path "$gstackPath\.opencode\skills\*" -Destination "$opencodePath\skills" -Recurse -Force
}

$opencodeConfig = @"
[mcp_servers.gbrain]
command = "c:\\users\\siddharth\\.local\\bin\\gbrain.cmd"
args = ["serve"]
startup_timeout_sec = 20
tool_timeout_sec = 120
"@
Set-Content -Path "$opencodePath\config.toml" -Value $opencodeConfig

# Antigravity setup
Write-Host "Setting up Antigravity"
$antigravityPath = "C:\Users\siddharth\.antigravity"
New-Item -ItemType Directory -Force -Path "$antigravityPath\skills" | Out-Null
if (Test-Path "$gstackPath\.antigravity\skills") {
    Copy-Item -Path "$gstackPath\.antigravity\skills\*" -Destination "$antigravityPath\skills" -Recurse -Force
} elseif (Test-Path "$gstackPath\.agents\skills") {
    Write-Host "Falling back to .agents for Antigravity"
    Copy-Item -Path "$gstackPath\.agents\skills\*" -Destination "$antigravityPath\skills" -Recurse -Force
}

$antigravityConfig = @"
{
  "mcpServers": {
    "gbrain": {
      "command": "c:\\users\\siddharth\\.local\\bin\\gbrain.cmd",
      "args": ["serve"]
    }
  }
}
"@
Set-Content -Path "$antigravityPath\config.json" -Value $antigravityConfig

Write-Host "Done"
