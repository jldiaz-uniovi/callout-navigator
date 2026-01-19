import { Plugin, ItemView, WorkspaceLeaf, MarkdownView, TFile, PluginSettingTab, App, Setting, Editor, Notice, setIcon } from 'obsidian';

// Constants
const VIEW_TYPE_CALLOUT_NAV = 'callout-navigator-view';
const VIEW_ICON = 'messages-square'; 

// --- Interfaces & Default Settings ---

// Definition of a single user configuration object
interface CalloutUserConfig {
    tag: string;
    color: string;
}

interface CalloutNavigatorSettings {
    authorName: string;
    // We now store an array of users instead of fixed user1/user2 fields
    users: CalloutUserConfig[];
    sortByTimestamp: boolean;
    flattenChronological: boolean;
    sortAscending: boolean;
}

const DEFAULT_SETTINGS: CalloutNavigatorSettings = {
    authorName: 'me',
    users: [
        { tag: 'tag1', color: '#007AFF' },
        { tag: 'tag2', color: '#FF9500' }
    ],
    sortByTimestamp: false,
    flattenChronological: true,
    sortAscending: true
}

interface CalloutComment {
    lineNumber: number;
    author: string;
    content: string;
    timestamp?: number;
    level: number;
    children: CalloutComment[];
}

// --- Main Plugin Class ---

export default class CalloutNavigatorPlugin extends Plugin {
    settings: CalloutNavigatorSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_CALLOUT_NAV,
            (leaf) => new CalloutNavigatorView(leaf, this)
        );

        this.addCommand({
            id: 'open-callout-navigator',
            name: 'Open Callout Navigator',
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'insert-comment-callout',
            name: 'Insert Comment Callout',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.insertCallout(editor);
            }
        });

        this.addRibbonIcon(VIEW_ICON, 'Open Callout Navigator', () => {
            this.activateView();
        });

        this.addSettingTab(new CalloutNavigatorSettingTab(this.app, this));
    }

    insertCallout(editor: Editor) {
        const selection = editor.getSelection();
        const author = this.settings.authorName;
        const timestamp = this.getFormattedDate();
        
        // Generic header format
        const header = `> [!${author}]- ${author} (${timestamp})`;

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

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        
        // Migration check (simple): If old settings exist (user1Tag), reset to avoid errors
        // or just let the default array take over if users property is missing.
        if (!this.settings.users) {
            this.settings.users = DEFAULT_SETTINGS.users;
        }
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

        // --- General Settings ---
        new Setting(containerEl)
            .setName('My Author Name')
            .setDesc('Name used when inserting new callouts.')
            .addText(text => text
                .setValue(this.plugin.settings.authorName)
                .onChange(async (value) => {
                    this.plugin.settings.authorName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Flatten Chronological List')
            .setDesc('If enabled, nested callouts will be flattened into a single list when sorting by timestamp.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.flattenChronological)
                .onChange(async (value) => {
                    this.plugin.settings.flattenChronological = value;
                    await this.plugin.saveSettings();
                }));

        // --- Dynamic User List ---
        containerEl.createEl('h3', { text: 'Tracked Users' });
        const helpText = containerEl.createEl('p', { text: 'Add the callout tags you want to track in the sidebar.' });
        helpText.style.color = 'var(--text-muted)';
        helpText.style.fontSize = '0.9em';

        this.plugin.settings.users.forEach((user, index) => {
            const setting = new Setting(containerEl)
            .setName('User Tag')
            .setDesc('Tag used in callouts to identify this user.');
            
            // 1. Input for Tag Name
            setting.addText(text => text
                .setPlaceholder('Tag (e.g. reviewer)')
                .setValue(user.tag)
                .onChange(async (value) => {
                    this.plugin.settings.users[index].tag = value;
                    await this.plugin.saveSettings();
                }));

            // 2. Color Picker
            setting.addColorPicker(color => color
                .setValue(user.color)
                .onChange(async (value) => {
                    this.plugin.settings.users[index].color = value;
                    await this.plugin.saveSettings();
                }));

            // 3. Remove Button
            setting.addExtraButton(btn => btn
                .setIcon('trash')
                .setTooltip('Remove User')
                .onClick(async () => {
                    this.plugin.settings.users.splice(index, 1);
                    await this.plugin.saveSettings();
                    // Reload the settings panel to reflect removal
                    this.display(); 
                }));
        });

        // Add New User Button
        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText('Add User')
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.users.push({
                        tag: 'new_user',
                        color: '#888888'
                    });
                    await this.plugin.saveSettings();
                    this.display(); // Reload panel
                }));
    }
}

// --- View Class ---

class CalloutNavigatorView extends ItemView {
    plugin: CalloutNavigatorPlugin;
    private lastUpdateId: number = 0;

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
        const updateId = ++this.lastUpdateId;
        const activeFile = this.app.workspace.getActiveFile();
        const container = this.contentEl;

        if (!activeFile || activeFile.extension !== 'md') {
            if (updateId === this.lastUpdateId) {
                container.empty();
                const msg = container.createEl('p', { 
                    text: 'No active markdown file.'
                });
                msg.style.color = 'var(--text-muted)';
                msg.style.padding = '10px';
            }
            return;
        }

        const content = await this.app.vault.read(activeFile);
        
        // If a newer update has started, discard this one
        if (updateId !== this.lastUpdateId) return;

        let comments = this.parseCallouts(content);
        container.empty();

        if (comments.length === 0) {
            const emptyState = container.createDiv({ cls: 'nav-empty-state' });
            const msg = emptyState.createEl('p', { 
                text: 'No tracked callouts found.'
            });
            msg.style.color = 'var(--text-muted)';
            msg.style.fontStyle = 'italic';
            msg.style.padding = '10px';
            return;
        }

        // Toolbar
        const toolbar = container.createDiv();
        toolbar.style.display = 'flex';
        toolbar.style.justifyContent = 'flex-end';
        toolbar.style.gap = '4px';
        toolbar.style.padding = '4px 10px';
        
        // 1. Sort type button (Line vs Chronological)
        const sortTypeBtn = toolbar.createEl('button', { 
            cls: 'clickable-icon',
            attr: { 'aria-label': this.plugin.settings.sortByTimestamp ? 'Switch to line order' : 'Switch to chronological order' }
        });
        setIcon(sortTypeBtn, this.plugin.settings.sortByTimestamp ? 'list-ordered' : 'clock');
        
        sortTypeBtn.addEventListener('click', async () => {
            this.plugin.settings.sortByTimestamp = !this.plugin.settings.sortByTimestamp;
            await this.plugin.saveSettings();
            this.updateView();
        });

        // 2. Direction button (Asc vs Desc)
        const directionBtn = toolbar.createEl('button', { 
            cls: 'clickable-icon',
            attr: { 'aria-label': this.plugin.settings.sortAscending ? 'Sort Descending' : 'Sort Ascending' }
        });
        setIcon(directionBtn, this.plugin.settings.sortAscending ? 'arrow-down' : 'arrow-up');
        
        directionBtn.addEventListener('click', async () => {
            this.plugin.settings.sortAscending = !this.plugin.settings.sortAscending;
            await this.plugin.saveSettings();
            this.updateView();
        });

        // Apply sorting and structure logic
        if (this.plugin.settings.sortByTimestamp) {
            // Chronological order (always flattened if configured)
            const getSortValue = (c: CalloutComment) => c.timestamp ?? 0;
            const direction = this.plugin.settings.sortAscending ? 1 : -1;
            comments.sort((a, b) => (getSortValue(a) - getSortValue(b)) * direction);

            if (!this.plugin.settings.flattenChronological) {
                comments = this.buildCommentTree(comments);
            }
        } else {
            // Line order - Always nested
            comments.sort((a, b) => a.lineNumber - b.lineNumber);
            comments = this.buildCommentTree(comments);
            if (!this.plugin.settings.sortAscending) {
                comments.reverse(); // Only reverse top-level
            }
        }

        this.renderCommentList(container, comments, activeFile);
    }

    parseCallouts(content: string): CalloutComment[] {
        const lines = content.split('\n');
        const comments: CalloutComment[] = [];
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // 1. Get all tags from settings
        const users = this.plugin.settings.users;
        
        // If no users configured, return empty
        if (users.length === 0) return [];

        // 2. Build Regex dynamically: (tag1|tag2|tag3)
        const tagsPattern = users.map(u => escapeRegExp(u.tag)).join('|');
        const regexStr = `^\\s*((?:\\s*>)+)\\s*\\[!(${tagsPattern})\\][-+]?\\s*(.*)`;
        const regex = new RegExp(regexStr, 'i');

        lines.forEach((line, index) => {
            const match = line.match(regex);
            if (match) {
                const levels = (match[1].match(/>/g) || []).length;
                const author = match[2].toLowerCase();
                const contentText = match[3].trim() || 'Untitled';
                
                // Extract timestamp from contentText if present, e.g. "jose (2024-01-01 10:00)"
                let timestamp: number | undefined;
                const tsMatch = contentText.match(/\((\d{4}-\d{2}-\d{2}\s\d{2}:\d{2})\)/);
                if (tsMatch) {
                    // Replace space with T for Date.parse compatibility
                    timestamp = Date.parse(tsMatch[1].replace(' ', 'T'));
                }

                comments.push({
                    lineNumber: index,
                    author: author,
                    content: contentText,
                    timestamp: timestamp,
                    level: levels,
                    children: []
                });
            }
        });

        return comments;
    }

    buildCommentTree(flatComments: CalloutComment[]): CalloutComment[] {
        const tree: CalloutComment[] = [];
        const stack: CalloutComment[] = [];

        flatComments.forEach(comment => {
            while (stack.length > 0 && stack[stack.length - 1].level >= comment.level) {
                stack.pop();
            }

            if (stack.length === 0) {
                tree.push(comment);
            } else {
                stack[stack.length - 1].children.push(comment);
            }
            stack.push(comment);
        });

        return tree;
    }

    renderCommentList(container: HTMLElement, comments: CalloutComment[], file: TFile) {
        const list = container.createEl('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '8px';
        list.style.padding = '10px';

        this.renderCommentsRecursive(list, comments, file);
    }

    renderCommentsRecursive(container: HTMLElement, comments: CalloutComment[], file: TFile) {
        comments.forEach(comment => {
            const card = container.createEl('div');
            
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.padding = '8px';
            card.style.borderRadius = '6px';
            card.style.border = '1px solid var(--background-modifier-border)';
            card.style.cursor = 'pointer';
            card.style.backgroundColor = 'var(--background-secondary)';
            card.style.transition = 'background-color 0.1s ease';
            card.style.marginBottom = '4px';

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
            badge.style.color = '#ffffff'; 

            const matchedUser = this.plugin.settings.users.find(u => u.tag.toLowerCase() === comment.author);
            badge.style.backgroundColor = matchedUser ? matchedUser.color : '#666666';

            const lineHint = header.createSpan({ text: `L:${comment.lineNumber + 1}` });
            lineHint.style.fontSize = '10px';
            lineHint.style.color = 'var(--text-muted)';

            const body = card.createDiv({ text: comment.content });
            body.style.fontSize = '12px';
            body.style.whiteSpace = 'nowrap';
            body.style.overflow = 'hidden';
            body.style.textOverflow = 'ellipsis';
            body.style.color = 'var(--text-normal)';

            card.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                card.style.backgroundColor = 'var(--background-modifier-hover)';
            });
            card.addEventListener('mouseleave', (e) => {
                e.stopPropagation();
                card.style.backgroundColor = 'var(--background-secondary)';
            });

            card.addEventListener('click', (e) => {
                e.stopPropagation();
                this.jumpToLine(file, comment.lineNumber);
            });

            // Render children inside the parent card
            if (comment.children.length > 0) {
                const childrenContainer = card.createDiv();
                childrenContainer.style.marginTop = '8px';
                childrenContainer.style.paddingLeft = '12px';
                childrenContainer.style.display = 'flex';
                childrenContainer.style.flexDirection = 'column';
                childrenContainer.style.gap = '8px';

                let childrenToRender = [...comment.children];
                if (this.plugin.settings.sortByTimestamp) {
                    const getSortValue = (c: CalloutComment) => c.timestamp ?? 0;
                    const direction = this.plugin.settings.sortAscending ? 1 : -1;
                    childrenToRender.sort((a, b) => (getSortValue(a) - getSortValue(b)) * direction);
                } else if (!this.plugin.settings.sortAscending) {
                    childrenToRender.reverse();
                }
                this.renderCommentsRecursive(childrenContainer, childrenToRender, file);
            }
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
            
            const targetLine = Math.max(0, lineNumber - 1);
            view.editor.setCursor({ line: targetLine, ch: 0 });
            view.editor.scrollIntoView(
                { from: { line: lineNumber, ch: 0 }, to: { line: lineNumber, ch: 0 } },
                true
            );
        } else {
             workspace.openLinkText(file.path, '', true);
        }
    }
}