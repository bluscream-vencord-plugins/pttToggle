# PTTToggle

Adds a push-to-talk toggle checkbox to the microphone button context menu next to Input Profile.

## Features

- Quick toggle for push-to-talk mode directly from the microphone context menu
- Visual checkbox indicator showing current PTT state
- Instant mode switching without navigating to settings







## Installation 

### 🪄 Installation Wizard
The easiest way to install this plugin is to use the **[Plugin Installer Generator](https://bluscream-vencord-plugins.github.io)**. 
Simply select this plugin from the list and download your custom install script.

### 💻 Manual Installation (PowerShell)
Alternatively, you can run this snippet in your Equicord/Vencord source directory:
```powershell
$ErrorActionPreference = "Stop"
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS
npm install -g pnpm
git clone https://github.com/Equicord/Equicord Equicord
New-Item -ItemType Directory -Force -Path "Equicord\src\userplugins" | Out-Null
git clone https://github.com/bluscream-vencord-plugins/blu-pttToggle.git -b "main" "Equicord\src\userplugins\blu-pttToggle"
cd "Equicord"
npm install -g pnpm
pnpm install --frozen-lockfile
pnpm build
pnpm buildWeb
pnpm inject
```
