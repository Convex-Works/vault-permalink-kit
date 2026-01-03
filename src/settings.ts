import { App, PluginSettingTab, Setting } from "obsidian";
import VaultPermalinkKitPlugin from "./main";

export interface VaultPermalinkSettings {
  publicShareUrl: string;
  frontmatterKey: string;
}

export const DEFAULT_SETTINGS: VaultPermalinkSettings = {
  publicShareUrl: "",
  frontmatterKey: "permalink",
};

export class VaultPermalinkSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: VaultPermalinkKitPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Vault Permalink Kit" });

    const frontmatterDesc = document.createDocumentFragment();
    frontmatterDesc.append(
      "Frontmatter field used to store the persistent ID (default: \"permalink\" to align with Obsidian Publish). "
    );
    const warningEl = document.createElement("strong");
    warningEl.textContent =
      "Changing this after generating links may break older URLs until you re-copy them.";
    frontmatterDesc.append(warningEl);

    new Setting(containerEl)
      .setName("Frontmatter key")
      .setDesc(frontmatterDesc)
      .addText((text) =>
        text
          .setPlaceholder("permalink")
          .setValue(this.plugin.settings.frontmatterKey)
          .onChange(async (value) => {
            this.plugin.settings.frontmatterKey = value.trim() || "permalink";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Public share base URL")
      .setDesc(
        "Optional HTTPS endpoint that receives vault/id query params and redirects to the obsidian:// protocol."
      )
      .addText((text) =>
        text
          .setPlaceholder("https://share.example.com/redirect")
          .setValue(this.plugin.settings.publicShareUrl)
          .onChange(async (value) => {
            this.plugin.settings.publicShareUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
