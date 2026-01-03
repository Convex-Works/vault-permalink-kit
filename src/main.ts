import {
  App,
  Menu,
  Modal,
  Notice,
  Plugin,
  TFile,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  VaultPermalinkSettingTab,
  VaultPermalinkSettings,
} from "./settings";

const LEGACY_FRONTMATTER_KEYS = ["persistent_id"];

export default class VaultPermalinkKitPlugin extends Plugin {
  settings: VaultPermalinkSettings = { ...DEFAULT_SETTINGS };

  async onload() {
    await this.loadSettings();
    this.registerFileMenu();
    this.registerProtocolHandler();
    this.addSettingTab(new VaultPermalinkSettingTab(this.app, this));
  }

  private async loadSettings() {
    const stored = (await this.loadData()) as
      | Partial<VaultPermalinkSettings>
      | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private registerFileMenu() {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") {
          return;
        }

        menu.addItem((item) => {
          item
            .setTitle("Copy persistent URL")
            .setIcon("link")
            .onClick(() => {
              void this.copyPersistentUrl(file);
            });
        });
      })
    );
  }

  private registerProtocolHandler() {
    this.registerObsidianProtocolHandler(
      "open-document",
      async (params) => {
        const id = typeof params?.id === "string" ? params.id.trim() : "";
        const vaultParam =
          typeof params?.vault === "string" ? params.vault.trim() : "";
        if (!id) {
          new Notice("Persistent URL is missing an ID.");
          return;
        }

        if (vaultParam && vaultParam !== this.app.vault.getName()) {
          new Notice(
            `Persistent link targets "${vaultParam}", open that vault first.`
          );
          return;
        }

        const modal = new ProgressModal(this.app, "Opening persistent link...");
        modal.open();
        try {
          const file = await this.findFileByPersistentId(id, (current, total) => {
            modal.updateProgress(current, total);
          });

          if (!file) {
            new Notice("No note matches that persistent ID.");
            return;
          }

          await this.app.workspace.getLeaf(false).openFile(file);
          new Notice(`Opened ${file.basename}`);
        } catch (error) {
          console.error(error);
          new Notice("Failed to open persistent link.");
        } finally {
          modal.close();
        }
      }
    );
  }

  private async copyPersistentUrl(file: TFile) {
    try {
      const id = await this.ensurePersistentId(file);
      const vaultName = this.app.vault.getName();
      const url = this.buildShareUrl({ id, vaultName });
      await this.copyToClipboard(url);
      new Notice("Persistent URL copied to clipboard.");
    } catch (error) {
      console.error(error);
      new Notice("Unable to create persistent URL.");
    }
  }

  private buildShareUrl({ id, vaultName }: { id: string; vaultName: string }) {
    const encodedId = encodeURIComponent(id);
    const encodedVault = encodeURIComponent(vaultName);
    if (!this.settings.publicShareUrl.trim()) {
      return `obsidian://open-document?vault=${encodedVault}&id=${encodedId}`;
    }

    const base = this.settings.publicShareUrl.trim();
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}vault=${encodedVault}&id=${encodedId}`;
  }

  private getFrontmatterKey() {
    return this.settings.frontmatterKey?.trim() || DEFAULT_SETTINGS.frontmatterKey;
  }

  private getFrontmatterKeysToCheck() {
    const keys = [this.getFrontmatterKey()];
    for (const legacy of LEGACY_FRONTMATTER_KEYS) {
      if (!keys.includes(legacy)) {
        keys.push(legacy);
      }
    }
    return keys;
  }

  private extractId(frontmatter?: Record<string, unknown> | null) {
    if (!frontmatter) {
      return null;
    }

    for (const key of this.getFrontmatterKeysToCheck()) {
      const value = frontmatter[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private async ensurePersistentId(file: TFile): Promise<string> {
    const activeKey = this.getFrontmatterKey();
    const cache = this.app.metadataCache.getFileCache(file);
    const cachedId = this.extractId(cache?.frontmatter);
    if (
      cachedId &&
      typeof cache?.frontmatter?.[activeKey] === "string" &&
      cache.frontmatter[activeKey].trim()
    ) {
      return cachedId;
    }

    const data = await this.app.vault.read(file);
    const parsed = this.parseFrontmatter(data);
    let id = this.extractId(parsed.frontmatter) ?? undefined;
    let needsWrite = false;

    if (!id) {
      id = this.generateId();
      needsWrite = true;
    }

    if (parsed.frontmatter[activeKey] !== id) {
      parsed.frontmatter[activeKey] = id;
      needsWrite = true;
    }

    if (needsWrite) {
      await this.writeFrontmatter(file, parsed);
    }

    return id;
  }

  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!match || typeof match[1] !== "string") {
      return { frontmatter: {}, body: content };
    }

    const rawData = parseYaml(match[1]) as unknown;
    const parsed =
      rawData && typeof rawData === "object" && !Array.isArray(rawData)
        ? (rawData as Record<string, unknown>)
        : {};
    const matchedText = typeof match[0] === "string" ? match[0] : "";
    const body = content.slice(matchedText.length);
    return { frontmatter: { ...parsed }, body };
  }

  private async writeFrontmatter(
    file: TFile,
    parsed: { frontmatter: Record<string, unknown>; body: string }
  ) {
    const fmBlock = stringifyYaml(parsed.frontmatter).trimEnd();
    let newContent = `---\n${fmBlock}\n---`;
    const body = parsed.body;
    if (body.length > 0 && !body.startsWith("\n")) {
      newContent += "\n";
    }
    if (body.length === 0) {
      newContent += "\n";
    }
    newContent += body;
    await this.app.vault.modify(file, newContent);
  }

  private generateId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const r = (Math.random() * 16) | 0;
      const v = char === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async copyToClipboard(value: string) {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("Clipboard API is unavailable.");
    }

    await navigator.clipboard.writeText(value);
  }

  private async findFileByPersistentId(
    id: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<TFile | null> {
    const files = this.app.vault.getMarkdownFiles();
    const total = files.length;

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (!file) {
        continue;
      }
      onProgress?.(index + 1, total);
      const cache = this.app.metadataCache.getFileCache(file);
      const candidate = this.extractId(cache?.frontmatter);
      if (candidate === id) {
        return file;
      }

      if (!cache?.frontmatter) {
        const data = await this.app.vault.cachedRead(file);
        const parsed = this.parseFrontmatter(data);
        const raw = this.extractId(parsed.frontmatter);
        if (raw === id) {
          return file;
        }
      }
    }

    return null;
  }
}

class ProgressModal extends Modal {
  private statusEl!: HTMLDivElement;

  constructor(app: App, private message: string) {
    super(app);
  }

  onOpen() {
    this.contentEl.addClass("persistent-progress");
    this.contentEl.createDiv({ cls: "persistent-progress-spinner" });
    this.statusEl = this.contentEl.createDiv({ text: this.message });
    this.statusEl.addClass("persistent-progress-label");
  }

  updateProgress(current: number, total: number) {
    if (!this.statusEl) {
      return;
    }

    if (!total) {
      this.statusEl.setText(this.message);
      return;
    }

    const percentage = Math.min(100, Math.round((current / total) * 100));
    this.statusEl.setText(`${this.message} (${percentage}%)`);
  }
}
