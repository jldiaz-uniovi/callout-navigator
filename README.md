# Callout Navigator for Obsidian

**Callout Navigator** is an Obsidian plugin designed to facilitate asynchronous communication and collaborative reviews within a vault. It creates a dedicated sidebar view that indexes specific callouts in your active document, allowing you to jump between comments, questions, or review notes instantly.

It is particularly useful for teams sharing a vault via Git, or for researchers and students conducting document reviews.

## Features

-   **Sidebar Index:** Lists all conversation/review callouts found in the current active file.
-   **Quick Navigation:** Clicking a comment in the sidebar scrolls the editor directly to that line (handling Live Preview correctly).
-   **Customizable Tags:** Define which callout types to track (e.g., `[!reviewer]`, `[!question]`, `[!todo]`).
-   **Visual Customization:** Assign specific colors to different authors or tag types for quick visual scanning.
-   **Quick Insert:** Command to wrap selected text in a timestamped comment block automatically.

## Installation

### Via BRAT (Recommended)

Since this plugin is not yet in the official Obsidian directory, the easiest way to install and update it is using **BRAT**.

1.  Install **BRAT** from the Obsidian Community Plugins (search for "Bitbucket/Github").
2.  Open the command palette (`Ctrl/Cmd + P`) and search for `BRAT: Add a beta plugin for testing`.
3.  Paste the URL of this repository:
    `https://github.com/jldiaz-uniovi/callout-navigator`
4.  Click **Add Plugin**.
5.  Enable "Callout Navigator" in your Community Plugins list.

### Manual Installation

1.  Download the latest release from the [Releases](https://github.com/jldiaz-uniovi/callout-navigator/releases) page (you need `main.js`, `manifest.json`, and `styles.css`).
2.  Create a folder named `callout-navigator` inside your vault's `.obsidian/plugins/` directory.
3.  Move the downloaded files into that folder.
4.  Reload Obsidian and enable the plugin.

## Usage

### 1. Configuration
Go to **Settings > Callout Navigator**.
* **Tags:** Define the callout types you want to index. For example, if you set User 1 to `reviewer`, the plugin will look for:
    ```markdown
    > [!reviewer]
    ```
* **Colors:** Pick a background color for the badges in the sidebar to distinguish between authors.
* **Author Name:** Set your own identifier (e.g., `me` or your name) for the insertion command.

### 2. Viewing Comments
Open the command palette and run **"Callout Navigator: Open Callout Navigator"**, or click the **Message Square** icon in the right ribbon. The sidebar will populate with any matching callouts found in your current note.

### 3. Inserting Comments
To quickly add a comment:
1.  Select the text you want to quote (optional).
2.  Run the command **"Callout Navigator: Insert Comment Callout"** (Tip: Assign a hotkey like `Ctrl+Shift+C`).
3.  The plugin will generate a block like this:

```markdown
> [!author]- Header (YYYY-MM-DD HH:MM)
> Your selected text here...
```

## Development
If you want to modify this plugin:

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start compilation in watch mode.

## License

MIT