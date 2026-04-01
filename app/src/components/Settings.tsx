import { createSignal, createEffect, Show, For, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "../lib/toast";

// --- Types ---

export type SettingsPanel = "permissions" | "general" | "hooks" | "mcp" | "claudemd";

interface HookEntry {
  type: string;
  command: string;
}

interface HookGroup {
  matcher: string;
  hooks: HookEntry[];
}

interface McpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
}

interface ClaudeMdFile {
  path: string;
  scope: string;
  exists: boolean;
}

interface PermissionProfile {
  name: string;
  allow: string[];
  deny: string[];
  defaultMode?: string;
}

interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
    defaultMode?: string;
  };
  hooks?: Record<string, HookGroup[]>;
  mcpServers?: Record<string, McpServer>;
  statusLine?: { type: string; command: string } | null;
  enabledPlugins?: Record<string, boolean>;
  alwaysThinkingEnabled?: boolean;
  effortLevel?: string;
  voiceEnabled?: boolean;
  skipDangerousModePermissionPrompt?: boolean;
  [key: string]: unknown;
}

type SettingsScope = "global" | "project";

// Module-level signal so plugin commands can switch panels
const [activePanel, setActivePanel] = createSignal<SettingsPanel>("permissions");

export function navigateToPanel(panel: SettingsPanel) {
  setActivePanel(panel);
}

// --- Component ---

export default function Settings() {
  const [scope] = createSignal<SettingsScope>("global");
  const [settings, setSettings] = createSignal<ClaudeSettings>({});
  const [loading, setLoading] = createSignal(true);
  const [dirty, setDirty] = createSignal(false);

  // Permissions panel state
  const [allowRules, setAllowRules] = createSignal<string[]>([]);
  const [denyRules, setDenyRules] = createSignal<string[]>([]);
  const [defaultMode, setDefaultMode] = createSignal("default");
  const [newAllowRule, setNewAllowRule] = createSignal("");
  const [newDenyRule, setNewDenyRule] = createSignal("");

  // General panel state
  const [thinkingEnabled, setThinkingEnabled] = createSignal(false);
  const [voiceEnabled, setVoiceEnabled] = createSignal(false);
  const [skipDangerousMode, setSkipDangerousMode] = createSignal(false);
  const [effortLevel, setEffortLevel] = createSignal("high");

  // Hooks panel state
  const [hooksData, setHooksData] = createSignal<Record<string, HookGroup[]>>({});

  // MCP panel state
  const [mcpServers, setMcpServers] = createSignal<Record<string, McpServer>>({});

  // CLAUDE.md panel state
  const [claudeMdFiles, setClaudeMdFiles] = createSignal<ClaudeMdFile[]>([]);
  const [selectedClaudeMd, setSelectedClaudeMd] = createSignal<string>("");
  const [claudeMdContent, setClaudeMdContent] = createSignal<string>("");
  const [claudeMdDirty, setClaudeMdDirty] = createSignal(false);

  // Permission profiles state
  const [permissionProfiles, setPermissionProfiles] = createSignal<PermissionProfile[]>([]);

  const navItems: { id: SettingsPanel; label: string; enabled: boolean }[] = [
    { id: "permissions", label: "Permissions", enabled: true },
    { id: "general", label: "General", enabled: true },
    { id: "hooks", label: "Hooks", enabled: true },
    { id: "mcp", label: "MCP Servers", enabled: true },
    { id: "claudemd", label: "CLAUDE.md", enabled: true },
  ];

  async function loadSettings() {
    setLoading(true);
    try {
      const raw = await invoke<string>("read_claude_settings");
      const parsed: ClaudeSettings = JSON.parse(raw);
      setSettings(parsed);
      syncFromSettings(parsed);
    } catch (e) {
      toast.error(`Failed to load settings: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  function syncFromSettings(s: ClaudeSettings) {
    // Permissions
    setAllowRules(s.permissions?.allow ?? []);
    setDenyRules(s.permissions?.deny ?? []);
    setDefaultMode(s.permissions?.defaultMode ?? "default");
    // General
    setThinkingEnabled(s.alwaysThinkingEnabled ?? false);
    setVoiceEnabled(s.voiceEnabled ?? false);
    setSkipDangerousMode(s.skipDangerousModePermissionPrompt ?? false);
    setEffortLevel(s.effortLevel ?? "high");
    // Hooks
    setHooksData((s.hooks as Record<string, HookGroup[]>) ?? {});
    // MCP
    setMcpServers((s.mcpServers as Record<string, McpServer>) ?? {});
    setDirty(false);
  }

  async function saveSettings() {
    const current = { ...settings() };
    // Merge permissions
    current.permissions = {
      ...current.permissions,
      allow: allowRules(),
      deny: denyRules(),
      defaultMode: defaultMode(),
    };
    // Merge general
    current.alwaysThinkingEnabled = thinkingEnabled();
    current.voiceEnabled = voiceEnabled();
    current.skipDangerousModePermissionPrompt = skipDangerousMode();
    current.effortLevel = effortLevel();
    // Merge hooks
    const h = hooksData();
    if (Object.keys(h).length > 0) {
      current.hooks = h;
    } else {
      delete current.hooks;
    }
    // Merge MCP
    const m = mcpServers();
    if (Object.keys(m).length > 0) {
      current.mcpServers = m;
    } else {
      delete current.mcpServers;
    }

    try {
      const json = JSON.stringify(current, null, 2);
      await invoke("write_claude_settings", { data: json });
      setSettings(current);
      setDirty(false);
      toast.info("Settings saved");
    } catch (e) {
      toast.error(`Failed to save settings: ${e}`);
    }
  }

  function markDirty() {
    setDirty(true);
  }

  // Permission helpers
  function addAllowRule() {
    const rule = newAllowRule().trim();
    if (!rule) return;
    if (allowRules().includes(rule)) {
      toast.warning("Rule already exists");
      return;
    }
    setAllowRules([...allowRules(), rule]);
    setNewAllowRule("");
    markDirty();
  }

  function removeAllowRule(idx: number) {
    setAllowRules(allowRules().filter((_, i) => i !== idx));
    markDirty();
  }

  function addDenyRule() {
    const rule = newDenyRule().trim();
    if (!rule) return;
    if (denyRules().includes(rule)) {
      toast.warning("Rule already exists");
      return;
    }
    setDenyRules([...denyRules(), rule]);
    setNewDenyRule("");
    markDirty();
  }

  function removeDenyRule(idx: number) {
    setDenyRules(denyRules().filter((_, i) => i !== idx));
    markDirty();
  }

  async function loadClaudeMdFiles() {
    try {
      const files = await invoke<ClaudeMdFile[]>("list_claude_md_files", { projectPath: null });
      setClaudeMdFiles(files);
      if (files.length > 0 && !selectedClaudeMd()) {
        setSelectedClaudeMd(files[0].path);
        await loadClaudeMdContent(files[0].path);
      }
    } catch (e) {
      toast.error(`Failed to discover CLAUDE.md files: ${e}`);
    }
  }

  async function loadClaudeMdContent(path: string) {
    try {
      const content = await invoke<string>("read_claude_md", { path });
      setClaudeMdContent(content);
      setClaudeMdDirty(false);
    } catch (e) {
      toast.error(`Failed to read CLAUDE.md: ${e}`);
    }
  }

  async function saveClaudeMd() {
    const path = selectedClaudeMd();
    if (!path) return;
    try {
      await invoke("write_claude_md", { path, content: claudeMdContent() });
      setClaudeMdDirty(false);
      toast.info("CLAUDE.md saved");
      // Refresh file list (file may have been created)
      await loadClaudeMdFiles();
    } catch (e) {
      toast.error(`Failed to save CLAUDE.md: ${e}`);
    }
  }

  async function loadPermissionProfiles() {
    try {
      const profiles = await invoke<PermissionProfile[]>("list_permission_profiles");
      setPermissionProfiles(profiles);
    } catch (e) {
      toast.error(`Failed to load permission profiles: ${e}`);
    }
  }

  async function savePermissionProfiles() {
    try {
      await invoke("save_permission_profiles", { profilesJson: JSON.stringify(permissionProfiles()) });
      toast.info("Permission profiles saved");
    } catch (e) {
      toast.error(`Failed to save permission profiles: ${e}`);
    }
  }

  async function applyPermissionProfile(name: string) {
    try {
      await invoke("apply_permission_profile", { profileName: name });
      toast.info(`Applied profile "${name}"`);
      await loadSettings();
    } catch (e) {
      toast.error(`Failed to apply profile: ${e}`);
    }
  }

  function saveCurrentAsProfile(profileName: string) {
    const profile: PermissionProfile = {
      name: profileName,
      allow: [...allowRules()],
      deny: [...denyRules()],
      defaultMode: defaultMode(),
    };
    const existing = permissionProfiles();
    const idx = existing.findIndex(p => p.name === profileName);
    if (idx >= 0) {
      const updated = [...existing];
      updated[idx] = profile;
      setPermissionProfiles(updated);
    } else {
      setPermissionProfiles([...existing, profile]);
    }
    savePermissionProfiles();
  }

  function deletePermissionProfile(name: string) {
    setPermissionProfiles(permissionProfiles().filter(p => p.name !== name));
    savePermissionProfiles();
  }

  onMount(() => {
    loadSettings();
    loadClaudeMdFiles();
    loadPermissionProfiles();
  });

  // Reload when scope changes
  createEffect(() => {
    void scope();
    loadSettings();
  });

  return (
    <div class="settings">
      <div class="settings-sidebar">
        <div class="settings-sidebar-title">Settings</div>
        <For each={navItems}>
          {(item) => (
            <button
              class={`settings-nav-item ${
                activePanel() === item.id ? "settings-nav-item-active" : ""
              } ${!item.enabled ? "settings-nav-item-disabled" : ""}`}
              onClick={() => item.enabled && setActivePanel(item.id)}
              disabled={!item.enabled}
            >
              {item.label}
              {!item.enabled && <span style={{ "font-size": "10px", "margin-left": "auto", color: "var(--text-muted)" }}>soon</span>}
            </button>
          )}
        </For>
      </div>

      <div class="settings-content">
        <Show when={!loading()} fallback={<div class="settings-empty">Loading settings...</div>}>
          {/* Permissions Panel */}
          <Show when={activePanel() === "permissions"}>
            <PermissionsPanel
              allowRules={allowRules()}
              denyRules={denyRules()}
              defaultMode={defaultMode()}
              newAllowRule={newAllowRule()}
              newDenyRule={newDenyRule()}
              dirty={dirty()}
              profiles={permissionProfiles()}
              onSetDefaultMode={(v) => { setDefaultMode(v); markDirty(); }}
              onSetNewAllowRule={setNewAllowRule}
              onSetNewDenyRule={setNewDenyRule}
              onAddAllowRule={addAllowRule}
              onRemoveAllowRule={removeAllowRule}
              onAddDenyRule={addDenyRule}
              onRemoveDenyRule={removeDenyRule}
              onSave={saveSettings}
              onApplyProfile={applyPermissionProfile}
              onSaveAsProfile={saveCurrentAsProfile}
              onDeleteProfile={deletePermissionProfile}
            />
          </Show>

          {/* General Panel */}
          <Show when={activePanel() === "general"}>
            <GeneralPanel
              thinkingEnabled={thinkingEnabled()}
              voiceEnabled={voiceEnabled()}
              skipDangerousMode={skipDangerousMode()}
              effortLevel={effortLevel()}
              statusLine={settings().statusLine}
              enabledPlugins={settings().enabledPlugins}
              dirty={dirty()}
              onToggleThinking={(v) => { setThinkingEnabled(v); markDirty(); }}
              onToggleVoice={(v) => { setVoiceEnabled(v); markDirty(); }}
              onToggleSkipDangerous={(v) => { setSkipDangerousMode(v); markDirty(); }}
              onSetEffortLevel={(v) => { setEffortLevel(v); markDirty(); }}
              onSave={saveSettings}
            />
          </Show>

          {/* Hooks Panel */}
          <Show when={activePanel() === "hooks"}>
            <HooksPanel
              hooksData={hooksData()}
              dirty={dirty()}
              onUpdate={(data) => { setHooksData(data); markDirty(); }}
              onSave={saveSettings}
            />
          </Show>

          {/* MCP Servers Panel */}
          <Show when={activePanel() === "mcp"}>
            <McpPanel
              servers={mcpServers()}
              dirty={dirty()}
              onUpdate={(data) => { setMcpServers(data); markDirty(); }}
              onSave={saveSettings}
            />
          </Show>

          {/* CLAUDE.md Panel */}
          <Show when={activePanel() === "claudemd"}>
            <ClaudeMdPanel
              files={claudeMdFiles()}
              selectedPath={selectedClaudeMd()}
              content={claudeMdContent()}
              dirty={claudeMdDirty()}
              onSelectFile={async (path) => {
                setSelectedClaudeMd(path);
                await loadClaudeMdContent(path);
              }}
              onUpdateContent={(c) => { setClaudeMdContent(c); setClaudeMdDirty(true); }}
              onSave={saveClaudeMd}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
}

// --- Permissions Sub-Panel ---

function PermissionsPanel(props: {
  allowRules: string[];
  denyRules: string[];
  defaultMode: string;
  newAllowRule: string;
  newDenyRule: string;
  dirty: boolean;
  profiles: PermissionProfile[];
  onSetDefaultMode: (v: string) => void;
  onSetNewAllowRule: (v: string) => void;
  onSetNewDenyRule: (v: string) => void;
  onAddAllowRule: () => void;
  onRemoveAllowRule: (idx: number) => void;
  onAddDenyRule: () => void;
  onRemoveDenyRule: (idx: number) => void;
  onSave: () => void;
  onApplyProfile: (name: string) => void;
  onSaveAsProfile: (name: string) => void;
  onDeleteProfile: (name: string) => void;
}) {
  const [newProfileName, setNewProfileName] = createSignal("");

  return (
    <>
      <div class="settings-panel-header">
        <span class="settings-panel-title">Permissions</span>
      </div>

      {/* Profiles Section */}
      <div class="settings-section">
        <div class="settings-section-title">Profiles</div>
        <div class="settings-section-description">
          Save and load permission configurations
        </div>
        <Show
          when={props.profiles.length > 0}
          fallback={<div class="settings-empty">No profiles saved</div>}
        >
          <div class="settings-profile-list">
            <For each={props.profiles}>
              {(profile) => (
                <div class="settings-profile-item">
                  <div class="settings-profile-info">
                    <span class="settings-profile-name">{profile.name}</span>
                    <span class="settings-profile-meta">
                      {profile.allow.length} allow, {profile.deny.length} deny
                      {profile.defaultMode ? `, ${profile.defaultMode}` : ""}
                    </span>
                  </div>
                  <div class="settings-profile-actions">
                    <button
                      class="settings-btn settings-btn-secondary"
                      onClick={() => props.onApplyProfile(profile.name)}
                    >
                      Apply
                    </button>
                    <button
                      class="settings-chip-remove"
                      onClick={() => props.onDeleteProfile(profile.name)}
                      title="Delete profile"
                    >
                      x
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
        <div class="settings-add-row">
          <input
            class="settings-input settings-input-sans"
            type="text"
            placeholder="Profile name"
            value={newProfileName()}
            onInput={(e) => setNewProfileName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newProfileName().trim()) {
                props.onSaveAsProfile(newProfileName().trim());
                setNewProfileName("");
              }
            }}
          />
          <button
            class="settings-btn settings-btn-secondary"
            onClick={() => {
              const name = newProfileName().trim();
              if (name) {
                props.onSaveAsProfile(name);
                setNewProfileName("");
              }
            }}
          >
            Save Current
          </button>
        </div>
      </div>

      {/* Default Mode */}
      <div class="settings-section">
        <div class="settings-section-title">Default Mode</div>
        <div class="settings-select-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-name">Permission mode</span>
            <span class="settings-toggle-hint">Controls how Claude handles tool permissions</span>
          </div>
          <select
            class="settings-select"
            value={props.defaultMode}
            onChange={(e) => props.onSetDefaultMode(e.currentTarget.value)}
          >
            <option value="default">default</option>
            <option value="allowAll">allowAll</option>
            <option value="denyAll">denyAll</option>
          </select>
        </div>
      </div>

      {/* Allow Rules */}
      <div class="settings-section">
        <div class="settings-section-title">Allow Rules</div>
        <div class="settings-section-description">
          Tools and patterns Claude can use without asking
        </div>
        <Show
          when={props.allowRules.length > 0}
          fallback={<div class="settings-empty">No allow rules configured</div>}
        >
          <div class="settings-chip-list">
            <For each={props.allowRules}>
              {(rule, idx) => (
                <span class="settings-chip">
                  {rule}
                  <button
                    class="settings-chip-remove"
                    onClick={() => props.onRemoveAllowRule(idx())}
                    title="Remove rule"
                  >
                    x
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
        <div class="settings-add-row">
          <input
            class="settings-input"
            type="text"
            placeholder='e.g. Bash(cargo test:*)'
            value={props.newAllowRule}
            onInput={(e) => props.onSetNewAllowRule(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && props.onAddAllowRule()}
          />
          <button class="settings-btn settings-btn-secondary" onClick={props.onAddAllowRule}>
            Add
          </button>
        </div>
      </div>

      {/* Deny Rules */}
      <div class="settings-section">
        <div class="settings-section-title">Deny Rules</div>
        <div class="settings-section-description">
          Tools and patterns Claude is not allowed to use
        </div>
        <Show
          when={props.denyRules.length > 0}
          fallback={<div class="settings-empty">No deny rules configured</div>}
        >
          <div class="settings-chip-list">
            <For each={props.denyRules}>
              {(rule, idx) => (
                <span class="settings-chip">
                  {rule}
                  <button
                    class="settings-chip-remove"
                    onClick={() => props.onRemoveDenyRule(idx())}
                    title="Remove rule"
                  >
                    x
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>
        <div class="settings-add-row">
          <input
            class="settings-input"
            type="text"
            placeholder='e.g. Bash(rm -rf:*)'
            value={props.newDenyRule}
            onInput={(e) => props.onSetNewDenyRule(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && props.onAddDenyRule()}
          />
          <button class="settings-btn settings-btn-secondary" onClick={props.onAddDenyRule}>
            Add
          </button>
        </div>
      </div>

      {/* Save */}
      <div class="settings-save-bar">
        <button class="settings-btn" onClick={props.onSave} disabled={!props.dirty}>
          Save Permissions
        </button>
        <Show when={props.dirty}>
          <span class="settings-save-status">Unsaved changes</span>
        </Show>
      </div>
    </>
  );
}

// --- General Sub-Panel ---

function GeneralPanel(props: {
  thinkingEnabled: boolean;
  voiceEnabled: boolean;
  skipDangerousMode: boolean;
  effortLevel: string;
  statusLine?: { type: string; command: string } | null;
  enabledPlugins?: Record<string, boolean>;
  dirty: boolean;
  onToggleThinking: (v: boolean) => void;
  onToggleVoice: (v: boolean) => void;
  onToggleSkipDangerous: (v: boolean) => void;
  onSetEffortLevel: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <>
      <div class="settings-panel-header">
        <span class="settings-panel-title">General</span>
      </div>

      {/* Toggles */}
      <div class="settings-section">
        <div class="settings-section-title">Behavior</div>

        <div class="settings-toggle-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-name">Always Thinking</span>
            <span class="settings-toggle-hint">Enable extended thinking for all prompts</span>
          </div>
          <label class="settings-toggle">
            <input
              type="checkbox"
              checked={props.thinkingEnabled}
              onChange={(e) => props.onToggleThinking(e.currentTarget.checked)}
            />
            <span class="settings-toggle-track" />
            <span class="settings-toggle-thumb" />
          </label>
        </div>

        <div class="settings-toggle-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-name">Voice</span>
            <span class="settings-toggle-hint">Enable voice input/output</span>
          </div>
          <label class="settings-toggle">
            <input
              type="checkbox"
              checked={props.voiceEnabled}
              onChange={(e) => props.onToggleVoice(e.currentTarget.checked)}
            />
            <span class="settings-toggle-track" />
            <span class="settings-toggle-thumb" />
          </label>
        </div>

        <div class="settings-toggle-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-name">Skip Dangerous Mode Prompt</span>
            <span class="settings-toggle-hint">Skip the confirmation when launching in dangerous mode</span>
          </div>
          <label class="settings-toggle">
            <input
              type="checkbox"
              checked={props.skipDangerousMode}
              onChange={(e) => props.onToggleSkipDangerous(e.currentTarget.checked)}
            />
            <span class="settings-toggle-track" />
            <span class="settings-toggle-thumb" />
          </label>
        </div>
      </div>

      {/* Effort Level */}
      <div class="settings-section">
        <div class="settings-section-title">Performance</div>
        <div class="settings-select-row">
          <div class="settings-toggle-label">
            <span class="settings-toggle-name">Effort Level</span>
            <span class="settings-toggle-hint">How hard Claude works on each response</span>
          </div>
          <select
            class="settings-select"
            value={props.effortLevel}
            onChange={(e) => props.onSetEffortLevel(e.currentTarget.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      {/* Status Line (read-only) */}
      <div class="settings-section">
        <div class="settings-section-title">Status Line</div>
        <Show
          when={props.statusLine}
          fallback={<div class="settings-empty">No status line configured</div>}
        >
          <div class="settings-readonly">{props.statusLine!.command}</div>
        </Show>
      </div>

      {/* Plugins (read-only list) */}
      <div class="settings-section">
        <div class="settings-section-title">Enabled Plugins</div>
        <Show
          when={props.enabledPlugins && Object.keys(props.enabledPlugins).length > 0}
          fallback={<div class="settings-empty">No plugins configured</div>}
        >
          <div class="settings-plugin-list">
            <For each={Object.entries(props.enabledPlugins ?? {})}>
              {([name, enabled]) => (
                <div class="settings-plugin-item">
                  <span class="settings-plugin-name">{name}</span>
                  <span
                    class={`settings-plugin-status ${
                      enabled ? "settings-plugin-status-enabled" : ""
                    }`}
                  >
                    {enabled ? "enabled" : "disabled"}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* Save */}
      <div class="settings-save-bar">
        <button class="settings-btn" onClick={props.onSave} disabled={!props.dirty}>
          Save General Settings
        </button>
        <Show when={props.dirty}>
          <span class="settings-save-status">Unsaved changes</span>
        </Show>
      </div>
    </>
  );
}

// --- Hooks Sub-Panel ---

const HOOK_EVENT_TYPES = [
  "UserPromptSubmit",
  "Stop",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "SubagentStop",
  "SubagentToolUse",
];

function HooksPanel(props: {
  hooksData: Record<string, HookGroup[]>;
  dirty: boolean;
  onUpdate: (data: Record<string, HookGroup[]>) => void;
  onSave: () => void;
}) {
  const [expandedEvents, setExpandedEvents] = createSignal<Set<string>>(new Set());
  const [addingEvent, setAddingEvent] = createSignal(false);
  const [newEventType, setNewEventType] = createSignal(HOOK_EVENT_TYPES[0]);
  const [newMatcher, setNewMatcher] = createSignal("");
  const [newCommand, setNewCommand] = createSignal("");

  function toggleEvent(event: string) {
    const s = new Set(expandedEvents());
    if (s.has(event)) s.delete(event); else s.add(event);
    setExpandedEvents(s);
  }

  function addHook() {
    const event = newEventType();
    const matcher = newMatcher();
    const command = newCommand().trim();
    if (!command) return;

    const data = { ...props.hooksData };
    const groups = data[event] ? [...data[event]] : [];

    // Find existing group with same matcher, or create new
    const groupIdx = groups.findIndex(g => g.matcher === matcher);
    if (groupIdx >= 0) {
      const group = { ...groups[groupIdx], hooks: [...groups[groupIdx].hooks, { type: "command", command }] };
      groups[groupIdx] = group;
    } else {
      groups.push({ matcher, hooks: [{ type: "command", command }] });
    }
    data[event] = groups;
    props.onUpdate(data);
    setNewCommand("");
    setAddingEvent(false);
    // Auto-expand the event
    const s = new Set(expandedEvents());
    s.add(event);
    setExpandedEvents(s);
  }

  function removeHook(event: string, groupIdx: number, hookIdx: number) {
    const data = { ...props.hooksData };
    const groups = [...data[event]];
    const group = { ...groups[groupIdx], hooks: groups[groupIdx].hooks.filter((_, i) => i !== hookIdx) };
    if (group.hooks.length === 0) {
      groups.splice(groupIdx, 1);
    } else {
      groups[groupIdx] = group;
    }
    if (groups.length === 0) {
      delete data[event];
    } else {
      data[event] = groups;
    }
    props.onUpdate(data);
  }

  function removeEventGroup(event: string) {
    const data = { ...props.hooksData };
    delete data[event];
    props.onUpdate(data);
  }

  return (
    <>
      <div class="settings-panel-header">
        <span class="settings-panel-title">Hooks</span>
      </div>

      <div class="settings-section">
        <div class="settings-section-description">
          Configure commands to run at lifecycle events
        </div>

        <Show
          when={Object.keys(props.hooksData).length > 0}
          fallback={<div class="settings-empty">No hooks configured</div>}
        >
          <div class="settings-hooks-list">
            <For each={Object.entries(props.hooksData)}>
              {([event, groups]) => (
                <div class="settings-hook-event">
                  <div
                    class={`settings-hook-event-header ${expandedEvents().has(event) ? "settings-hook-event-expanded" : ""}`}
                    onClick={() => toggleEvent(event)}
                  >
                    <span class="settings-hook-event-arrow">{expandedEvents().has(event) ? "\u25BE" : "\u25B8"}</span>
                    <span class="settings-hook-event-name">{event}</span>
                    <span class="settings-hook-event-count">{groups.reduce((n, g) => n + g.hooks.length, 0)}</span>
                    <button
                      class="settings-chip-remove"
                      onClick={(e) => { e.stopPropagation(); removeEventGroup(event); }}
                      title="Remove all hooks for this event"
                    >
                      x
                    </button>
                  </div>
                  <Show when={expandedEvents().has(event)}>
                    <div class="settings-hook-groups">
                      <For each={groups}>
                        {(group, gIdx) => (
                          <div class="settings-hook-group">
                            <Show when={group.matcher}>
                              <div class="settings-hook-matcher">
                                matcher: <code>{group.matcher}</code>
                              </div>
                            </Show>
                            <For each={group.hooks}>
                              {(hook, hIdx) => (
                                <div class="settings-hook-entry">
                                  <code class="settings-hook-command">{hook.command}</code>
                                  <button
                                    class="settings-chip-remove"
                                    onClick={() => removeHook(event, gIdx(), hIdx())}
                                    title="Remove hook"
                                  >
                                    x
                                  </button>
                                </div>
                              )}
                            </For>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={addingEvent()} fallback={
          <button class="settings-btn settings-btn-secondary" style={{ "margin-top": "8px" }} onClick={() => setAddingEvent(true)}>
            Add Hook
          </button>
        }>
          <div class="settings-hook-add-form">
            <div class="settings-add-row">
              <select
                class="settings-select"
                value={newEventType()}
                onChange={(e) => setNewEventType(e.currentTarget.value)}
              >
                <For each={HOOK_EVENT_TYPES}>
                  {(t) => <option value={t}>{t}</option>}
                </For>
              </select>
              <input
                class="settings-input settings-input-sans"
                type="text"
                placeholder="Matcher (optional)"
                value={newMatcher()}
                onInput={(e) => setNewMatcher(e.currentTarget.value)}
              />
            </div>
            <div class="settings-add-row" style={{ "margin-top": "6px" }}>
              <input
                class="settings-input"
                type="text"
                placeholder="Command to run"
                value={newCommand()}
                onInput={(e) => setNewCommand(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && addHook()}
              />
              <button class="settings-btn" onClick={addHook}>Add</button>
              <button class="settings-btn settings-btn-secondary" onClick={() => setAddingEvent(false)}>Cancel</button>
            </div>
          </div>
        </Show>
      </div>

      <div class="settings-save-bar">
        <button class="settings-btn" onClick={props.onSave} disabled={!props.dirty}>
          Save Hooks
        </button>
        <Show when={props.dirty}>
          <span class="settings-save-status">Unsaved changes</span>
        </Show>
      </div>
    </>
  );
}

// --- MCP Servers Sub-Panel ---

function McpPanel(props: {
  servers: Record<string, McpServer>;
  dirty: boolean;
  onUpdate: (data: Record<string, McpServer>) => void;
  onSave: () => void;
}) {
  const [adding, setAdding] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newCommand, setNewCommand] = createSignal("");
  const [newArgs, setNewArgs] = createSignal("");
  const [newEnvKey, setNewEnvKey] = createSignal("");
  const [newEnvVal, setNewEnvVal] = createSignal("");
  const [newEnvPairs, setNewEnvPairs] = createSignal<[string, string][]>([]);

  function addServer() {
    const name = newName().trim();
    const cmd = newCommand().trim();
    if (!name || !cmd) return;
    if (props.servers[name]) {
      toast.warning(`Server "${name}" already exists`);
      return;
    }
    const args = newArgs().trim() ? newArgs().split(",").map(a => a.trim()).filter(Boolean) : [];
    const env: Record<string, string> = {};
    for (const [k, v] of newEnvPairs()) {
      if (k.trim()) env[k.trim()] = v;
    }
    const server: McpServer = { command: cmd };
    if (args.length > 0) server.args = args;
    if (Object.keys(env).length > 0) server.env = env;

    props.onUpdate({ ...props.servers, [name]: server });
    setNewName("");
    setNewCommand("");
    setNewArgs("");
    setNewEnvPairs([]);
    setAdding(false);
  }

  function removeServer(name: string) {
    const data = { ...props.servers };
    delete data[name];
    props.onUpdate(data);
  }

  function toggleDisabled(name: string) {
    const data = { ...props.servers };
    const server = { ...data[name] };
    server.disabled = !server.disabled;
    data[name] = server;
    props.onUpdate(data);
  }

  function addEnvPair() {
    const key = newEnvKey().trim();
    if (!key) return;
    setNewEnvPairs([...newEnvPairs(), [key, newEnvVal()]]);
    setNewEnvKey("");
    setNewEnvVal("");
  }

  function removeEnvPair(idx: number) {
    setNewEnvPairs(newEnvPairs().filter((_, i) => i !== idx));
  }

  return (
    <>
      <div class="settings-panel-header">
        <span class="settings-panel-title">MCP Servers</span>
      </div>

      <div class="settings-section">
        <div class="settings-section-description">
          Configure Model Context Protocol servers
        </div>

        <Show
          when={Object.keys(props.servers).length > 0}
          fallback={<div class="settings-empty">No MCP servers configured</div>}
        >
          <div class="settings-mcp-list">
            <For each={Object.entries(props.servers)}>
              {([name, server]) => (
                <div class={`settings-mcp-card ${server.disabled ? "settings-mcp-card-disabled" : ""}`}>
                  <div class="settings-mcp-card-header">
                    <span class="settings-mcp-name">{name}</span>
                    <div class="settings-profile-actions">
                      <button
                        class="settings-btn settings-btn-secondary"
                        onClick={() => toggleDisabled(name)}
                      >
                        {server.disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        class="settings-chip-remove"
                        onClick={() => removeServer(name)}
                        title="Remove server"
                      >
                        x
                      </button>
                    </div>
                  </div>
                  <div class="settings-mcp-detail">
                    <span class="settings-mcp-label">command:</span>
                    <code>{server.command}</code>
                  </div>
                  <Show when={server.args && server.args.length > 0}>
                    <div class="settings-mcp-detail">
                      <span class="settings-mcp-label">args:</span>
                      <code>{server.args!.join(", ")}</code>
                    </div>
                  </Show>
                  <Show when={server.env && Object.keys(server.env).length > 0}>
                    <div class="settings-mcp-detail">
                      <span class="settings-mcp-label">env:</span>
                      <div class="settings-mcp-env">
                        <For each={Object.entries(server.env!)}>
                          {([k, v]) => <div><code>{k}</code>=<code>{v}</code></div>}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={adding()} fallback={
          <button class="settings-btn settings-btn-secondary" style={{ "margin-top": "8px" }} onClick={() => setAdding(true)}>
            Add Server
          </button>
        }>
          <div class="settings-mcp-add-form">
            <div class="settings-add-row">
              <input
                class="settings-input settings-input-sans"
                type="text"
                placeholder="Server name"
                value={newName()}
                onInput={(e) => setNewName(e.currentTarget.value)}
              />
              <input
                class="settings-input"
                type="text"
                placeholder="Command (e.g. npx)"
                value={newCommand()}
                onInput={(e) => setNewCommand(e.currentTarget.value)}
              />
            </div>
            <div class="settings-add-row" style={{ "margin-top": "6px" }}>
              <input
                class="settings-input"
                type="text"
                placeholder="Args (comma-separated)"
                value={newArgs()}
                onInput={(e) => setNewArgs(e.currentTarget.value)}
              />
            </div>
            <div class="settings-section-description" style={{ "margin-top": "8px", "margin-bottom": "4px" }}>
              Environment Variables
            </div>
            <Show when={newEnvPairs().length > 0}>
              <div class="settings-mcp-env-list">
                <For each={newEnvPairs()}>
                  {([k, v], idx) => (
                    <div class="settings-mcp-env-row">
                      <code>{k}={v}</code>
                      <button class="settings-chip-remove" onClick={() => removeEnvPair(idx())} title="Remove">x</button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <div class="settings-add-row" style={{ "margin-top": "4px" }}>
              <input
                class="settings-input settings-input-sans"
                type="text"
                placeholder="Key"
                value={newEnvKey()}
                onInput={(e) => setNewEnvKey(e.currentTarget.value)}
                style={{ "max-width": "120px" }}
              />
              <input
                class="settings-input settings-input-sans"
                type="text"
                placeholder="Value"
                value={newEnvVal()}
                onInput={(e) => setNewEnvVal(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && addEnvPair()}
              />
              <button class="settings-btn settings-btn-secondary" onClick={addEnvPair}>+</button>
            </div>
            <div class="settings-add-row" style={{ "margin-top": "8px" }}>
              <button class="settings-btn" onClick={addServer}>Add Server</button>
              <button class="settings-btn settings-btn-secondary" onClick={() => { setAdding(false); setNewEnvPairs([]); }}>Cancel</button>
            </div>
          </div>
        </Show>
      </div>

      <div class="settings-save-bar">
        <button class="settings-btn" onClick={props.onSave} disabled={!props.dirty}>
          Save MCP Servers
        </button>
        <Show when={props.dirty}>
          <span class="settings-save-status">Unsaved changes</span>
        </Show>
      </div>
    </>
  );
}

// --- CLAUDE.md Sub-Panel ---

function ClaudeMdPanel(props: {
  files: ClaudeMdFile[];
  selectedPath: string;
  content: string;
  dirty: boolean;
  onSelectFile: (path: string) => void;
  onUpdateContent: (content: string) => void;
  onSave: () => void;
}) {
  const selectedFile = () => props.files.find(f => f.path === props.selectedPath);

  function scopeLabel(scope: string): string {
    switch (scope) {
      case "global": return "Global (~/.claude/)";
      case "project": return "Project Root";
      case "project-dot-claude": return "Project .claude/";
      default: return scope;
    }
  }

  return (
    <>
      <div class="settings-panel-header">
        <span class="settings-panel-title">CLAUDE.md</span>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">File</div>
        <div class="settings-section-description">
          Select a CLAUDE.md file to view or edit
        </div>
        <select
          class="settings-select"
          style={{ width: "100%", "margin-bottom": "8px" }}
          value={props.selectedPath}
          onChange={(e) => props.onSelectFile(e.currentTarget.value)}
        >
          <For each={props.files}>
            {(file) => (
              <option value={file.path}>
                {scopeLabel(file.scope)} {file.exists ? "" : "(new)"}
              </option>
            )}
          </For>
        </select>
        <Show when={selectedFile()}>
          <div class="settings-claudemd-path">{selectedFile()!.path}</div>
        </Show>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">Content</div>
        <textarea
          class="settings-claudemd-editor"
          value={props.content}
          onInput={(e) => props.onUpdateContent(e.currentTarget.value)}
          placeholder="Enter CLAUDE.md content..."
          spellcheck={false}
        />
      </div>

      <div class="settings-save-bar">
        <button class="settings-btn" onClick={props.onSave} disabled={!props.dirty}>
          {selectedFile()?.exists ? "Save" : "Create"} CLAUDE.md
        </button>
        <Show when={props.dirty}>
          <span class="settings-save-status">Unsaved changes</span>
        </Show>
      </div>
    </>
  );
}
