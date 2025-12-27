import { Plugin, ItemView, WorkspaceLeaf, MarkdownView, TFile, PluginSettingTab, App, Setting, Editor } from 'obsidian';

// Constants
const VIEW_TYPE_CALLOUT_NAV = 'callout-navigator-view';
const VIEW_ICON = 'messages-square'; 

// --- Interfaces & Default Settings ---

interface CalloutNavigatorSettings {
    user1Tag: string;
    user1Color: string;
    user2Tag: string;
    user2Color: string;
    authorName: string; 
}

const DEFAULT_SETTINGS: CalloutNavigatorSettings = {
    user1Tag: 'Your Name',
    user1Color: '#007AFF', 
    user2Tag: 'Other Name',
    user2Color: '#FF9500',
    authorName: 'Your Name', 
}

interface CalloutComment {
    lineNumber: number;
    author: string;
    content: string;
}

// --- Main Plugin Class ---

export default class CalloutNavigatorPlugin extends Plugin {
    settings: CalloutNavigatorSettings;

    async onload() {
        await this.loadSettings();

        // 1. Register View
        this.registerView(
            VIEW_TYPE_CALLOUT_NAV,
            (leaf) => new CalloutNavigatorView(leaf, this)
        );

        // 2. Command: Open Sidebar
        this.addCommand({
            id: 'open-callout-navigator',
            name: 'Open Callout Navigator',
            callback: () => {
                this.activateView();
            }
        });

        // 3. Command: Insert Callout
        this.addCommand({
            id: 'insert-comment-callout',
            name: 'Insert Comment Callout',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.insertCallout(editor);
            }
        });

        // 4. Ribbon Icon
        this.addRibbonIcon(VIEW_ICON, 'Open Callout Navigator', () => {
            this.activateView();
        });

        // 5. Settings Tab
        this.addSettingTab(new CalloutNavigatorSettingTab(this.app, this));
    }

    // --- Helper Logic for Insertion ---
    
    insertCallout(editor: Editor) {
        const selection = editor.getSelection();
        const author = this.settings.authorName;
        const timestamp = this.getFormattedDate();
        
        const header = `> [!${author}]- Comentario ${author} (${timestamp})`;

        if (selection) {
            const lines = selection.split('\n');
            const quotedBody = lines.map(line => `> ${line}`).join('\n');
            editor.replaceSelection(`${header}\n${quotedBody}\n`);
        } else {
            editor.replaceSelection(`${header}\n> `);
        }
    }

    getFormattedDate(): string {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
    }

    // --- Standard Boilerplate ---

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.app.workspace.trigger('callout-navigator:settings-changed');
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CALLOUT_NAV);

        if (leaves.length > 0) {
            leaf = leaves[0];
            workspace.revealLeaf(leaf);
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: VIEW_TYPE_CALLOUT_NAV, active: true });
                workspace.revealLeaf(leaf);
            }
        }
    }
}

// --- Settings Tab ---

class CalloutNavigatorSettingTab extends PluginSettingTab {
    plugin: CalloutNavigatorPlugin;

    constructor(app: App, plugin: CalloutNavigatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Callout Navigator Settings' });

        // Author Settings
        containerEl.createEl('h3', { text: 'General' });
        new Setting(containerEl)
            .setName('My Author Name')
            .setDesc('The name used when inserting new callouts with the command.')
            .addText(text => text
                .setValue(this.plugin.settings.authorName)
                .onChange(async (value) => {
                    this.plugin.settings.authorName = value;
                    await this.plugin.saveSettings();
                }));

        // Sidebar Tags
        containerEl.createEl('h3', { text: 'Sidebar Tags Configuration' });
        
        // User 1
        new Setting(containerEl)
            .setName('User 1 Tag')
            .addText(text => text
                .setValue(this.plugin.settings.user1Tag)
                .onChange(async (value) => {
                    this.plugin.settings.user1Tag = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('User 1 Color')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.user1Color)
                .onChange(async (value) => {
                    this.plugin.settings.user1Color = value;
                    await this.plugin.saveSettings();
                }));

        // User 2
        new Setting(containerEl)
            .setName('User 2 Tag')
            .addText(text => text
                .setValue(this.plugin.settings.user2Tag)
                .onChange(async (value) => {
                    this.plugin.settings.user2Tag = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('User 2 Color')
            .addColorPicker(color => color
                .setValue(this.plugin.settings.user2Color)
                .onChange(async (value) => {
                    this.plugin.settings.user2Color = value;
                    await this.plugin.saveSettings();
                }));
    }
}

// --- View Class ---

class CalloutNavigatorView extends ItemView {
    plugin: CalloutNavigatorPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: CalloutNavigatorPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_CALLOUT_NAV;
    }

    getDisplayText() {
        return "Conversation Index";
    }

    getIcon() {
        return VIEW_ICON;
    }

    async onOpen() {
        this.updateView();
        this.registerEvent(this.app.workspace.on('file-open', () => this.updateView()));
        this.registerEvent(this.app.workspace.on('editor-change', () => this.updateView()));
        this.registerEvent(this.app.workspace.on('callout-navigator:settings-changed' as any, () => this.updateView()));
    }

    async updateView() {
        const activeFile = this.app.workspace.getActiveFile();
        const container = this.contentEl;

        if (!activeFile || activeFile.extension !== 'md') {
            container.empty();
            container.createEl('p', { 
                text: 'No active markdown file.', 
                style: 'color: var(--text-muted); padding: 10px;' 
            });
            return;
        }

        const content = await this.app.vault.read(activeFile);
        const comments = this.parseCallouts(content);

        container.empty();

        if (comments.length === 0) {
            const emptyState = container.createDiv({ cls: 'nav-empty-state' });
            emptyState.createEl('p', { 
                text: 'No conversation callouts found.', 
                style: 'color: var(--text-muted); font-style: italic; padding: 10px;' 
            });
            return;
        }

        this.renderCommentList(container, comments, activeFile);
    }

    parseCallouts(content: string): CalloutComment[] {
        const lines = content.split('\n');
        const comments: CalloutComment[] = [];
        
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tag1 = escapeRegExp(this.plugin.settings.user1Tag);
        const tag2 = escapeRegExp(this.plugin.settings.user2Tag);
        
        const regexStr = `>\\s*\\[!(${tag1}|${tag2})\\][-+]?\\s*(.*)`;
        const regex = new RegExp(regexStr, 'i');

        lines.forEach((line, index) => {
            const match = line.match(regex);
            if (match) {
                comments.push({
                    lineNumber: index,
                    author: match[1].toLowerCase(),
                    content: match[2].trim() || 'Untitled'
                });
            }
        });

        return comments;
    }

    renderCommentList(container: HTMLElement, comments: CalloutComment[], file: TFile) {
        const list = container.createEl('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '8px';
        list.style.padding = '10px';

        comments.forEach(comment => {
            const card = list.createEl('div');
            
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.padding = '8px';
            card.style.borderRadius = '6px';
            card.style.border = '1px solid var(--background-modifier-border)';
            card.style.cursor = 'pointer';
            card.style.backgroundColor = 'var(--background-secondary)';
            card.style.transition = 'background-color 0.1s ease';

            const header = card.createDiv();
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.marginBottom = '6px';

            const badge = header.createSpan({ text: comment.author.toUpperCase() });
            badge.style.fontSize = '10px';
            badge.style.fontWeight = 'bold';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '4px';
            badge.style.lineHeight = '1.2';
            
            const s = this.plugin.settings;
            if (comment.author === s.user1Tag.toLowerCase()) {
                badge.style.backgroundColor = s.user1Color;
            } else {
                badge.style.backgroundColor = s.user2Color;
            }
            badge.style.color = '#ffffff'; 

            const lineHint = header.createSpan({ text: `L:${comment.lineNumber + 1}` });
            lineHint.style.fontSize = '10px';
            lineHint.style.color = 'var(--text-muted)';

            const body = card.createDiv({ text: comment.content });
            body.style.fontSize = '12px';
            body.style.whiteSpace = 'nowrap';
            body.style.overflow = 'hidden';
            body.style.textOverflow = 'ellipsis';
            body.style.color = 'var(--text-normal)';

            card.addEventListener('mouseenter', () => {
                card.style.backgroundColor = 'var(--background-modifier-hover)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.backgroundColor = 'var(--background-secondary)';
            });

            card.addEventListener('click', () => {
                this.jumpToLine(file, comment.lineNumber);
            });
        });
    }

    jumpToLine(file: TFile, lineNumber: number) {
        const workspace = this.app.workspace;
        const leaf = workspace.getLeavesOfType('markdown').find(
            l => (l.view as MarkdownView).file?.path === file.path
        );

        if (leaf) {
            const view = leaf.view as MarkdownView;
            workspace.setActiveLeaf(leaf, { focus: true });
            
            // UPDATED LOGIC:
            // Calculate the line BEFORE the callout to avoid triggering Live Preview edit mode.
            // Math.max(0, ...) ensures we don't crash if the callout is on the very first line (index 0).
            const targetLine = Math.max(0, lineNumber - 1);

            view.editor.setCursor({ line: targetLine, ch: 0 });
            
            // Still scroll the ACTUAL callout (lineNumber) into the center of the view
            view.editor.scrollIntoView(
                { from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } },
                true
            );
        } else {
             workspace.openLinkText(file.path, '', true);
        }
    }
}