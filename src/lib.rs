use zed_extension_api::{self as zed, LanguageServerId, Result};

// language server and its path
const PACKAGE: &str = "takatime-ls";
const SERVER_PATH: &str = "node_modules/takatime-ls/dist/server.js";

struct TakaTime {
    installed: bool,
}

// installation & setup
impl zed::Extension for TakaTime {
    // new installation, defaults to false
    fn new() -> Self {
        Self { installed: false }
    }

    // language server
    fn language_server_command(
        &mut self,
        id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // user override, mainly for local development
        let settings = zed::settings::LspSettings::for_worktree("takatime", worktree)?;
        if let Some(binary) = settings.binary {
            if let Some(path) = binary.path {
                return Ok(zed::Command {
                    command: path,
                    args: binary.arguments.unwrap_or_default(),
                    env: Default::default(),
                });
            }
        }

        // not installed or outdated, install latest from npm
        if !self.installed {
            // latest version
            let latest = zed::npm_package_latest_version(PACKAGE)?;

            if zed::npm_package_installed_version(PACKAGE)?.as_deref() != Some(latest.as_str()) {
                // set language server status
                zed::set_language_server_installation_status(
                    id,
                    &zed::LanguageServerInstallationStatus::Downloading,
                );

                // install latest version from npm
                zed::npm_install_package(PACKAGE, &latest)?;
            }

            // update installation status
            self.installed = true;
        }

        // language server
        let server = std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(SERVER_PATH);

        // zed -> stdio
        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![server.to_string_lossy().into(), "--stdio".into()],
            env: Default::default(),
        })
    }
}

// register extension
zed::register_extension!(TakaTime);
