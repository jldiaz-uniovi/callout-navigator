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
            name: 'Insert Comment Callout (Collapsed)',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.insertCallout(editor, true);
            }
        });

        this.addCommand({
            id: 'insert-comment-callout-expanded',
            name: 'Insert Comment Callout (Expanded)',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                this.insertCallout(editor, false);
            }
        });

        this.addRibbonIcon(VIEW_ICON, 'Open Callout Navigator', () => {
            this.activateView();
        });

        this.addSettingTab(new CalloutNavigatorSettingTab(this.app, this));
    }

    insertCallout(editor: Editor, collapsed: boolean) {
        const selection = editor.getSelection();
        const author = this.settings.authorName;
        const timestamp = this.getFormattedDate();

        // Generic header format: [!author]- for collapsed, [!author]+ for expanded
        const symbol = collapsed ? '-' : '+';
        const header = `> [!${author}]${symbol} ${author} (${timestamp})`;

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
    private highlightedLineNumber: number | null = null;
    private currentlyHoveredCalloutEl: HTMLElement | null = null;

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
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.updateView()));
        this.registerEvent(this.app.workspace.on('editor-change', () => this.updateView()));
        this.registerEvent(this.app.workspace.on('callout-navigator:settings-changed' as any, () => this.updateView()));

        this.registerDomEvent(document, 'mouseover', this.handleMouseOver.bind(this));
        this.registerDomEvent(document, 'mouseout', this.handleMouseOut.bind(this));
    }

    async updateView() {
        this.highlightedLineNumber = null;
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

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        let content = "";
        if (activeView && activeView.file?.path === activeFile.path) {
            content = activeView.editor.getValue();
        } else {
            content = await this.app.vault.read(activeFile);
        }

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

        if (this.currentlyHoveredCalloutEl) {
            this.refreshHoverHighlight();
        }
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
            card.dataset.lineNumber = String(comment.lineNumber);

            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.padding = '8px';
            card.style.borderRadius = '4px';
            card.style.border = '1px solid var(--background-modifier-border)';
            card.style.cursor = 'pointer';
            card.style.backgroundColor = 'var(--background-secondary)';
            card.style.transition = 'background-color 0.1s ease';
            card.style.marginBottom = '2px';
            card.style.gap = '2px';
            card.style.padding = '4px 6px'; // Reduced from original 8px

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
                childrenContainer.style.marginTop = '4px';
                childrenContainer.style.paddingLeft = '4px';
                childrenContainer.style.display = 'flex';
                childrenContainer.style.flexDirection = 'column';
                childrenContainer.style.gap = '4px';

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

            if (view.getMode() === 'source') {
                const targetLine = Math.max(0, lineNumber);
                view.editor.setCursor({ line: targetLine, ch: 0 });
                view.editor.scrollIntoView(
                    { from: { line: targetLine, ch: 0 }, to: { line: targetLine, ch: 0 } },
                    true
                );
            } else {
                // Reading mode
                // Note: Reading mode line numbers are 0-based in some contexts but 1-based in others.
                // Obsidian's setEphemeralState 'line' for Reading Mode highlights the nth block.
                leaf.setEphemeralState({ line: lineNumber });

                // Auto-expand callout if collapsed in Reading Mode
                // We use a MutationObserver or a slightly longer delay to ensure DOM is ready
                setTimeout(() => {
                    const viewEl = view.contentEl;
                    // Find the element that is highlighted (Obsidian adds a class or scrolls to it)
                    // We look for callouts that are currently in view and collapsed
                    const callouts = viewEl.querySelectorAll('.callout.is-collapsed');
                    callouts.forEach((callout: HTMLElement) => {
                        const rect = callout.getBoundingClientRect();
                        const winH = window.innerHeight;
                        // If it's roughly in the middle of the screen (where Obsidian scrolls to)
                        if (rect.top > winH * 0.1 && rect.top < winH * 0.8) {
                            const titleEl = callout.querySelector('.callout-title') as HTMLElement;
                            if (titleEl) titleEl.click(); // Simulate click to trigger Obsidian's internal toggle
                        }
                    });
                }, 150);
            }
        } else {
            workspace.openLinkText(file.path, '', true);
        }
    }

    getTrackedCalloutHeaderRegex(): RegExp | null {
        const users = this.plugin.settings.users;
        if (users.length === 0) return null;
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const tagsPattern = users.map(u => escapeRegExp(u.tag)).join('|');
        return new RegExp(`^\\s*((?:\\s*>)+)\\s*\\[!(${tagsPattern})\\][-+]?\\s*(.*)`, 'i');
    }

    handleMouseOver(e: MouseEvent) {
        const target = e.target as HTMLElement;
        const calloutEl = target.closest('.callout') as HTMLElement | null;
        if (!calloutEl) {
            this.currentlyHoveredCalloutEl = null;
            this.clearHighlight();
            return;
        }

        this.currentlyHoveredCalloutEl = calloutEl;

        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;
        const cm = (activeView.editor as any).cm;
        if (!cm) return;

        try {
            const pos = cm.posAtDOM(calloutEl);
            const line = cm.state.doc.lineAt(pos);
            const hoveredLine = line.number - 1; // 0-indexed

            const regex = this.getTrackedCalloutHeaderRegex();
            if (!regex) return;

            let currentLine = hoveredLine;
            while (currentLine >= 0) {
                const lineText = cm.state.doc.line(currentLine + 1).text;
                const match = lineText.match(regex);
                if (match) {
                    this.highlightCard(currentLine);
                    return;
                }
                // If we exit blockquote block, stop
                if (!/^\s*>/.test(lineText)) {
                    break;
                }
                currentLine--;
            }
            this.clearHighlight();
        } catch (err) {
            // Element not in editor/CodeMirror tree or other exception
        }
    }

    handleMouseOut(e: MouseEvent) {
        const target = e.relatedTarget as HTMLElement;
        if (!target || !target.closest('.callout')) {
            this.currentlyHoveredCalloutEl = null;
            this.clearHighlight();
        }
    }

    refreshHoverHighlight() {
        if (!this.currentlyHoveredCalloutEl) return;
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return;
        const cm = (activeView.editor as any).cm;
        if (!cm) return;

        try {
            const pos = cm.posAtDOM(this.currentlyHoveredCalloutEl);
            const line = cm.state.doc.lineAt(pos);
            const hoveredLine = line.number - 1;

            const regex = this.getTrackedCalloutHeaderRegex();
            if (!regex) return;

            let currentLine = hoveredLine;
            while (currentLine >= 0) {
                const lineText = cm.state.doc.line(currentLine + 1).text;
                const match = lineText.match(regex);
                if (match) {
                    this.highlightCard(currentLine);
                    return;
                }
                if (!/^\s*>/.test(lineText)) {
                    break;
                }
                currentLine--;
            }
            this.clearHighlight();
        } catch (err) {
            this.clearHighlight();
        }
    }

    highlightCard(lineNumber: number) {
        if (this.highlightedLineNumber === lineNumber) return;
        this.clearHighlight();

        const cards = this.contentEl.querySelectorAll(`[data-line-number="${lineNumber}"]`);
        cards.forEach((card: HTMLElement) => {
            card.style.borderColor = 'var(--interactive-accent)';
            card.style.boxShadow = '0 0 8px var(--interactive-accent)';
            card.style.transform = 'scale(1.02)';
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        this.highlightedLineNumber = lineNumber;
    }

    clearHighlight() {
        if (this.highlightedLineNumber === null) return;
        const cards = this.contentEl.querySelectorAll(`[data-line-number="${this.highlightedLineNumber}"]`);
        cards.forEach((card: HTMLElement) => {
            card.style.borderColor = 'var(--background-modifier-border)';
            card.style.boxShadow = 'none';
            card.style.transform = 'none';
        });
        this.highlightedLineNumber = null;
    }
}