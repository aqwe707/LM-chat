$settingsPath = "C:\Users\57392\.codex-session-delete\settings.json"
$settings = Get-Content $settingsPath -Raw | ConvertFrom-Json

$relayId = "relay-freellmapi"

$configContents = @"
model_provider = "custom"

notify = [ "C:\\Users\\57392\\AppData\\Local\\OpenAI\\Codex\\runtimes\\cua_node\\1b23c930bdf84ed6\\bin\\node_modules\\@oai\\sky\\bin\\windows\\codex-computer-use.exe", "turn-ended" ]
model = "auto"
model_reasoning_effort = "medium"
[model_providers.custom]
name = "custom"
wire_api = "responses"
requires_openai_auth = true
base_url = "http://127.0.0.1:57321/v1"

[mcp_servers]

[mcp_servers.node_repl]
args = []
command = 'C:\Users\57392\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_repl.exe'
startup_timeout_sec = 120

[mcp_servers.node_repl.env]
NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS = "1000"
NODE_REPL_NODE_MODULE_DIRS = 'C:\Users\57392\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node_modules'
NODE_REPL_NODE_PATH = 'C:\Users\57392\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin\node.exe'
NODE_REPL_TRUSTED_CODE_PATHS = 'C:\Users\57392\.codex'
CODEX_HOME = 'C:\Users\57392\.codex'
BROWSER_USE_AVAILABLE_BACKENDS = "chrome,iab"
BROWSER_USE_CODEX_APP_BUILD_FLAVOR = "prod"
BROWSER_USE_CODEX_APP_VERSION = "26.616.71553"
SKY_CUA_NATIVE_PIPE = "1"
CODEX_CLI_PATH = 'C:\Users\57392\AppData\Local\OpenAI\Codex\bin\38dff8711e296435\codex.exe'

[plugins]
[plugins."computer-use@openai-bundled"]
enabled = true
[plugins."browser@openai-bundled"]
enabled = true

[marketplaces]
[marketplaces.openai-curated]
source_type = "local"
source = '\\?\C:\Users\57392\.codex\.tmp\plugins'
[marketplaces.openai-bundled]
last_updated = "2026-06-23T15:06:06Z"
source_type = "local"
source = '\\?\C:\Users\57392\.codex\.tmp\bundled-marketplaces\openai-bundled'

[projects.'d:\desktop\codec']
trust_level = "trusted"

[windows]
sandbox = "elevated"
features.js_repl = false
"@

$authContents = @"
{
  "OPENAI_API_KEY": ""
}
"@

$newRelay = @{
    id = $relayId
    name = "FreeLLMAPI"
    upstreamBaseUrl = "http://localhost:3001"
    protocol = "chatCompletions"
    relayMode = "pureApi"
    officialMixApiKey = $false
    testModel = ""
    configContents = $configContents
    authContents = $authContents
    useCommonConfig = $true
    contextSelection = @{ mcpServers = @(); skills = @(); plugins = @() }
    contextSelectionInitialized = $true
    contextWindow = ""
    autoCompactLimit = ""
    modelInsertMode = "patch"
    modelList = "auto`ngpt-4o`nclaude-sonnet-4-20250514`ndeepseek-v4-flash`ndeepseek-v4-pro`ngemini-2.5-flash`nllama-4-scout-17b-16e-instruct"
}

$settings.relayProfiles += $newRelay
$settings.activeRelayId = $relayId

$settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
Write-Output "Done! FreeLLMAPI relay added and set as active."
